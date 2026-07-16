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
function generateAccountNumber(residentId, facilityId) {
  const r = String(residentId).slice(-12);
  const f = String(facilityId).slice(-6);
  return `D${r}${f}`.toUpperCase(); // 19 chars — safely under the 20 cap
}
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

async function recordOfflinePayment({ accountNumber, amount, phone }) {
  if (!accountNumber || !amount || amount <= 0) {
    throw new Error(
      "recordOfflinePayment requires accountNumber and a positive amount",
    );
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
  const newTxns = transactions.filter(
    (t) => !accountApplied.has(String(t.transId)),
  );

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
    invoice.balance = Math.max(
      0,
      (invoice.balance ?? invoice.totalAmount) - amount,
    );
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
async function registerFacilityPaymentDetails({
  facilityId,
  shortCode,
  passkey,
  consumerKey,
  consumerSecret,
}) {
  if (
    !facilityId ||
    !shortCode ||
    !passkey ||
    !consumerKey ||
    !consumerSecret
  ) {
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
async function initiateInvoiceStkPush({ invoiceId, phone }) {
  const Invoice = getInvoiceModel();
  const invoice = await Invoice.findById(invoiceId).lean();
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "Paid")
    throw new Error("Invoice is already fully paid");

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
  invoice.balance = Math.max(
    0,
    (invoice.balance ?? invoice.totalAmount) - amount,
  );
  invoice.appliedReceipts.push(receipt);
  invoice.mpesaCode = receipt;
  invoice.status = invoice.balance === 0 ? "Paid" : "Partial";
  if (invoice.status === "Paid") invoice.paidAt = new Date();
  await invoice.save();

  await sendPaymentReceipt(invoice, amount);

  return { updated: true, record, invoice, newlyPaid: amount };
}

async function applyC2BConfirmation(body) {
  const txn = await mpesaService.recordC2BConfirmation(body);

  const PaymentAccount = getPaymentAccountModel();
  const account = await PaymentAccount.findOne({
    accountNumber: txn.accountNumber,
  });
  if (!account) {
    return { updated: false, txn, results: [] };
  }

  const results = await reconcileResidentInvoices(account.residentId);
  for (const result of results) {
    if (result.updated)
      await sendPaymentReceipt(result.invoice, result.newlyPaid);
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
