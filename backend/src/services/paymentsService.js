const db = require("../utils/coreSchemas");
const {
  getInvoice: getInvoiceModel,
  getPaymentAccount: getPaymentAccountModel,
  getMpesaTransaction: getMpesaTransactionModel,
  getStkPushRequest: getStkPushRequestModel,
  getFacilitySettings: getFacilitySettingsModel,
} = require("../utils/damrSchemas");
const mpesaService = require("./mpesaService");
const {
  sendEmail,
  sendSMS,
  sendWhatsApp,
  receiptEmailHTML,
  receiptSmsText,
} = require("../utils/emailSmsService");

// ─────────────────────────────────────────────────────────────────────────
// DAMR's own M-Pesa business logic — built on top of mpesaService.js's raw
// Daraja client rather than PayServe's shared Payments microservice (this
// used to be a thin wrapper around that microservice's REST API; it now
// reads/writes DAMR's own MpesaTransaction/PaymentAccount/StkPushRequest
// collections directly, with no external service in the loop at all).
//
// Two payment models, same as before:
//   (1) Pull/Paybill — a resident tops up their Paybill sub-account
//       whenever via M-Pesa (or staff records cash), Safaricom's C2B
//       confirmation webhook lands the transaction in MpesaTransaction
//       (see mpesaService.recordC2BConfirmation), and reconciliation here
//       matches unclaimed transactions against open invoices.
//   (2) Push/STK — staff trigger a real prompt to the resident's phone for
//       one specific invoice; Safaricom's async callback is applied
//       directly to that invoice (applyStkCallback below), no polling of
//       a transactions list needed.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Builds the Paybill account number used as this resident's BillRefNumber.
 * Must be 3-20 alphanumeric characters — Safaricom's C2B simulate/paybill
 * flow silently truncates or rejects anything longer/with symbols.
 * Deterministic from residentId+facilityId so re-provisioning is idempotent
 * even if the local PaymentAccount record were ever lost, and doubles as
 * the only "lookup key" recordC2BConfirmation needs (no shortcode->facility
 * mapping required — the account number already encodes both ids).
 */
function generateAccountNumber(residentId, facilityId) {
  const r = String(residentId).slice(-12);
  const f = String(facilityId).slice(-6);
  return `D${r}${f}`.toUpperCase(); // 19 chars — safely under the 20 cap
}

/**
 * Idempotently ensures a resident has a Paybill sub-account for a facility.
 * Purely local now — there's no external service to register the account
 * with; any BillRefNumber a resident includes in a real M-Pesa Paybill
 * payment "just works" on Safaricom's side, so all this does is generate
 * and persist the deterministic account number the first time it's needed.
 */
async function provisionAccount({ residentId, facilityId, unitId }) {
  if (!residentId || !facilityId) {
    throw new Error("provisionAccount requires residentId and facilityId");
  }

  const PaymentAccount = getPaymentAccountModel();
  const existing = await PaymentAccount.findOne({ residentId, facilityId });
  if (existing) return existing;

  const accountNumber = generateAccountNumber(residentId, facilityId);
  try {
    return await PaymentAccount.create({
      residentId,
      facilityId,
      unitId: unitId || null,
      accountNumber,
    });
  } catch (err) {
    if (err.code === 11000) {
      // Race with a concurrent request that just created the same account.
      const raced = await PaymentAccount.findOne({ residentId, facilityId });
      if (raced) return raced;
    }
    throw err;
  }
}

/**
 * Records a cash (or other off-app) payment against a resident's Paybill
 * account as a native MpesaTransaction row (source: "cash"), so it flows
 * through the exact same checkAndReconcileInvoice() path as a real M-Pesa
 * receipt — no special-casing needed downstream. Admin/FM-triggered only.
 */
async function recordOfflinePayment({ accountNumber, amount, phone }) {
  if (!accountNumber || !amount || amount <= 0) {
    throw new Error("recordOfflinePayment requires accountNumber and a positive amount");
  }

  const MpesaTransaction = getMpesaTransactionModel();
  const transId = `CASH${Date.now()}`;
  const record = await MpesaTransaction.create({
    transId,
    accountNumber,
    amount,
    msisdn: phone || null,
    source: "cash",
  });
  return { transRef: record.transId };
}

function getTxnTimeMs(txn) {
  if (txn.transTime) {
    const s = String(txn.transTime);
    const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}`;
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  if (txn.createdAt) {
    const d = new Date(txn.createdAt);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return 0;
}

/** Every transaction ever received for a Paybill account, oldest first. */
async function fetchTransactions(accountNumber) {
  const MpesaTransaction = getMpesaTransactionModel();
  const txns = await MpesaTransaction.find({ accountNumber }).lean();
  return txns.sort((a, b) => getTxnTimeMs(a) - getTxnTimeMs(b));
}

/**
 * Checks a resident's Paybill account for any M-Pesa/cash transactions not
 * yet applied to ANY invoice on that account, and reconciles as many as it
 * takes to bring this invoice's balance to zero (oldest transaction first).
 * Transactions beyond what this invoice needs are left untouched — they'll
 * be picked up the next time another invoice on the same account is
 * checked, since they're only marked "applied" once actually used.
 *
 * "Already applied" is tracked at the PaymentAccount level, not just on
 * Invoice.appliedReceipts — a resident can have more than one Unpaid/Partial
 * invoice sharing the same Paybill account, and checking invoice-level
 * history alone would let the same receipt be pulled in twice.
 */
async function checkAndReconcileInvoice(invoiceId) {
  const Invoice = getInvoiceModel();
  const PaymentAccount = getPaymentAccountModel();
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new Error("Invoice not found");

  if (invoice.status === "Paid") {
    return {
      updated: false,
      invoice,
      newlyPaid: 0,
      message: "Invoice is already fully paid",
    };
  }

  const account = await provisionAccount({
    residentId: invoice.residentId,
    facilityId: invoice.facilityId,
    unitId: invoice.unitId,
  });

  const transactions = await fetchTransactions(account.accountNumber);

  const accountApplied = new Set(account.appliedReceipts || []);
  const newTxns = transactions.filter((t) => !accountApplied.has(String(t.transId)));

  if (!newTxns.length) {
    return {
      updated: false,
      invoice,
      newlyPaid: 0,
      message: "No new payments found on this Paybill account",
    };
  }

  let newlyPaid = 0;
  const justApplied = [];
  for (const txn of newTxns) {
    if ((invoice.balance ?? invoice.totalAmount) <= 0) break;

    const amount = Number(txn.amount) || 0;
    if (amount <= 0) continue;

    const receipt = String(txn.transId);
    invoice.amountPaid = (invoice.amountPaid || 0) + amount;
    invoice.balance = Math.max(0, (invoice.balance ?? invoice.totalAmount) - amount);
    invoice.appliedReceipts.push(receipt);
    invoice.mpesaCode = receipt;
    newlyPaid += amount;
    justApplied.push(receipt);
  }

  if (newlyPaid === 0) {
    return {
      updated: false,
      invoice,
      newlyPaid: 0,
      message: "No new payments found on this Paybill account",
    };
  }

  invoice.status = invoice.balance === 0 ? "Paid" : "Partial";
  if (invoice.status === "Paid") invoice.paidAt = new Date();

  await invoice.save();

  // Claim the receipts at the account level so a sibling invoice on this
  // same account never re-applies them.
  await PaymentAccount.updateOne(
    { _id: account._id },
    { $addToSet: { appliedReceipts: { $each: justApplied } } },
  );

  return {
    updated: true,
    invoice,
    newlyPaid,
    message: `Applied KES ${newlyPaid.toLocaleString()}`,
  };
}

/**
 * Reconciles every Unpaid/Partial/Overdue invoice for a single resident,
 * oldest period first, against their one shared Paybill account. A payment
 * that overshoots the oldest invoice naturally cascades to the next one,
 * since receipts are only marked "applied" (at the account level) once
 * actually consumed.
 */
async function reconcileResidentInvoices(residentId) {
  const Invoice = getInvoiceModel();
  const invoices = await Invoice.find({
    residentId,
    status: { $in: ["Unpaid", "Partial", "Overdue"] },
  })
    .sort({ periodStart: 1 })
    .lean();

  const results = [];
  for (const inv of invoices) {
    const result = await checkAndReconcileInvoice(inv._id);
    results.push(result);
  }
  return results;
}

/**
 * Best-effort payment-received receipt (SMS/WhatsApp/email) — a
 * notification failure never undoes the reconciliation that already
 * happened by the time this is called.
 */
async function sendPaymentReceipt(invoice, newlyPaid) {
  try {
    const resident = await db.Resident.findById(invoice.residentId).lean();
    if (!resident) return;

    const invoiceRef = invoice._id.toString().slice(-8).toUpperCase();
    const receiptData = {
      residentName: resident.name,
      invoiceId: invoiceRef,
      amountPaid: newlyPaid,
      mpesaCode: invoice.mpesaCode,
      balance: invoice.balance,
      status: invoice.status,
    };
    const phone = resident.phoneNumber || resident.phone;
    const smsText = receiptSmsText(receiptData);
    if (phone) {
      await Promise.allSettled([
        sendSMS(phone, smsText),
        sendWhatsApp(phone, smsText, {
          contactName: resident.name,
          source: "damr-paybill-receipt",
        }),
      ]);
    }
    if (resident.email) {
      await sendEmail(
        resident.email,
        `Payment Received — Invoice ${invoiceRef}`,
        receiptEmailHTML(receiptData),
      );
    }
  } catch (notifyErr) {
    console.error(
      `Receipt notification failed for invoice ${invoice._id}:`,
      notifyErr.message,
    );
  }
}

/**
 * One-time admin action per facility: stores its Daraja credentials in
 * DAMR's own FacilitySettings (no external system of record anymore) and
 * registers its C2B ValidationURL/ConfirmationURL with Safaricom so Paybill
 * top-ups on that shortcode start arriving at our own webhook.
 */
async function registerFacilityPaymentDetails({
  facilityId,
  shortCode,
  passkey,
  consumerKey,
  consumerSecret,
}) {
  if (!facilityId || !shortCode || !passkey || !consumerKey || !consumerSecret) {
    throw new Error(
      "registerFacilityPaymentDetails requires facilityId, shortCode, passkey, consumerKey and consumerSecret",
    );
  }

  const FacilitySettings = getFacilitySettingsModel();
  await FacilitySettings.updateOne(
    { facilityId },
    {
      $set: {
        mpesaShortCode: shortCode,
        mpesaConsumerKey: consumerKey,
        mpesaConsumerSecret: consumerSecret,
        mpesaPasskey: passkey,
      },
    },
    { upsert: true },
  );

  const result = await mpesaService.registerC2BUrls({ facilityId });
  return result;
}

/**
 * Staff-triggered "Pay Now" — sends a real STK push to the resident's phone
 * for exactly this invoice's outstanding balance.
 */
async function initiateInvoiceStkPush({ invoiceId, phone }) {
  const Invoice = getInvoiceModel();
  const invoice = await Invoice.findById(invoiceId).lean();
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "Paid") throw new Error("Invoice is already fully paid");

  const invoiceRef = invoice._id.toString().slice(-8).toUpperCase();
  const record = await mpesaService.initiateStkPush({
    facilityId: invoice.facilityId,
    invoiceId: invoice._id,
    residentId: invoice.residentId,
    phone,
    amount: invoice.balance ?? invoice.totalAmount,
    accountReference: invoiceRef,
    transactionDesc: `Invoice ${invoiceRef}`,
  });

  return record;
}

/**
 * Applies the result of an STK push callback to the invoice it was raised
 * against. Recording the callback (mpesaService.recordStkCallback) is
 * separate from applying it here so a duplicate/late callback delivery for
 * an invoice that's since been paid some other way doesn't double-apply —
 * checkAndReconcileInvoice-style logic isn't reused here since this is a
 * single specific receipt for a single specific invoice, not a pool of
 * unclaimed transactions to sweep.
 */
async function applyStkCallback(body) {
  const record = await mpesaService.recordStkCallback(body);
  if (!record || record.status !== "success") {
    return { updated: false, record };
  }

  const Invoice = getInvoiceModel();
  const invoice = await Invoice.findById(record.invoiceId);
  if (!invoice) return { updated: false, record };

  const receipt = record.mpesaReceiptNumber || String(record._id);
  if (invoice.appliedReceipts.includes(receipt)) {
    // Duplicate callback delivery — already applied.
    return { updated: false, record, invoice };
  }
  if (invoice.status === "Paid") {
    return { updated: false, record, invoice };
  }

  const amount = Number(record.amount) || 0;
  invoice.amountPaid = (invoice.amountPaid || 0) + amount;
  invoice.balance = Math.max(0, (invoice.balance ?? invoice.totalAmount) - amount);
  invoice.appliedReceipts.push(receipt);
  invoice.mpesaCode = receipt;
  invoice.status = invoice.balance === 0 ? "Paid" : "Partial";
  if (invoice.status === "Paid") invoice.paidAt = new Date();
  await invoice.save();

  await sendPaymentReceipt(invoice, amount);

  return { updated: true, record, invoice, newlyPaid: amount };
}

/**
 * Applies an inbound C2B confirmation (Paybill top-up) to whichever
 * resident it belongs to — resolved via PaymentAccount.accountNumber, which
 * already encodes both residentId and facilityId (see
 * generateAccountNumber above), so no shortcode/facility lookup is needed.
 */
async function applyC2BConfirmation(body) {
  const txn = await mpesaService.recordC2BConfirmation(body);

  const PaymentAccount = getPaymentAccountModel();
  const account = await PaymentAccount.findOne({ accountNumber: txn.accountNumber });
  if (!account) {
    // A payment came in for an account number DAMR never provisioned (e.g.
    // a mistyped account number, or a resident paying before their account
    // existed). The transaction is still safely stored in MpesaTransaction
    // and will be picked up automatically the moment that account exists
    // and gets checked.
    return { updated: false, txn, results: [] };
  }

  const results = await reconcileResidentInvoices(account.residentId);
  for (const result of results) {
    if (result.updated) await sendPaymentReceipt(result.invoice, result.newlyPaid);
  }

  return { updated: results.some((r) => r.updated), txn, results };
}

module.exports = {
  generateAccountNumber,
  provisionAccount,
  fetchTransactions,
  checkAndReconcileInvoice,
  reconcileResidentInvoices,
  registerFacilityPaymentDetails,
  recordOfflinePayment,
  sendPaymentReceipt,
  initiateInvoiceStkPush,
  applyStkCallback,
  applyC2BConfirmation,
};
