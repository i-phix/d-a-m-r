const db = require("../utils/coreSchemas");
const {
  getInvoice: getInvoiceModel,
  getTariffPlan: getTariffPlanModel,
} = require("../utils/damrSchemas");
const { provisionAccount } = require("./paymentsService");
const { getValidationStatus } = require("./validationStatusService");
const { ensurePublicToken } = require("../controllers/invoices/public_bill");
const { ensureResidentPublicToken } = require("../controllers/residents/statement");
const {
  sendEmail,
  sendSMS,
  sendWhatsApp,
  invoiceEmailHTML,
  invoiceSmsText,
} = require("../utils/emailSmsService");

// ─────────────────────────────────────────────────────────────────────────
// Shared "tell the resident about this bill" logic — previously copy-pasted
// (with small drifts) across monthlyInvoices.js, generate_invoice.js and
// bulk_generate.js. Consolidated here for two reasons: (1) the usual
// reason — one bug fix instead of three; (2) Roadmap Phase 8, #1
// (anomaly-gated billing) needs this exact same notification to fire a
// SECOND time, later, when a held invoice is released on flag resolution
// (see resolve_flag.js) — without a shared function that would have meant
// a fourth copy-paste, this time with no test coverage of its own.
// ─────────────────────────────────────────────────────────────────────────

/** The exact tariff plan resolved for this invoice at creation time. */
async function resolvePaybillShortCode(tariffPlanId) {
  if (!tariffPlanId) return null;
  const TariffPlan = getTariffPlanModel();
  const plan = await TariffPlan.findById(tariffPlanId).lean();
  return plan?.paybillShortCode || null;
}

/**
 * Sends the "you have a new water bill" notification (email + SMS +
 * WhatsApp, whichever the resident has on file) for an already-created,
 * already-billable invoice. Never throws — a notification failure must
 * never undo or block the invoice that's already been persisted by the
 * time this runs. `logPrefix` just tags console output so cron vs.
 * request-triggered vs. flag-release calls are distinguishable in logs.
 */
async function sendInvoiceCreatedNotification(invoice, { logPrefix = "" } = {}) {
  try {
    const resident = await db.Resident.findById(invoice.residentId).lean();
    if (!resident) return;

    let accountNumber = null;
    try {
      const account = await provisionAccount({
        residentId: invoice.residentId,
        facilityId: invoice.facilityId,
        unitId: invoice.unitId,
      });
      accountNumber = account.accountNumber;
    } catch (payErr) {
      console.error(`${logPrefix}Payment account provisioning failed:`, payErr.message);
    }

    const paybillShortCode = await resolvePaybillShortCode(invoice.tariffPlanId);
    const invoiceRef = invoice._id.toString().slice(-8).toUpperCase();
    const dueDateStr = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "";

    // Eagerly generate the public bill link so it can go out in this very
    // first notification, rather than only existing once staff click
    // "Share Bill Link" later.
    let billLink = null;
    try {
      const Invoice = getInvoiceModel();
      const token = await ensurePublicToken(invoice, Invoice);
      billLink = `${process.env.FRONTEND_BASE_URL || ""}/bill/${token}`;
    } catch (linkErr) {
      console.error(`${logPrefix}Public bill link generation failed:`, linkErr.message);
    }

    // Roadmap Phase 8, #3 — resident-level statement of account, attached
    // to every bill notification the same way the per-invoice bill link is.
    let statementLink = null;
    try {
      const statementToken = await ensureResidentPublicToken(resident);
      statementLink = `${process.env.FRONTEND_BASE_URL || ""}/statement/${statementToken}`;
    } catch (statementErr) {
      console.error(`${logPrefix}Statement link generation failed:`, statementErr.message);
    }

    let validationStatus = null;
    try {
      validationStatus = await getValidationStatus(invoice.readingId);
    } catch (valErr) {
      console.error(`${logPrefix}Validation status lookup failed:`, valErr.message);
    }

    const phone = resident.phoneNumber || resident.phone;
    const smsText = invoiceSmsText({
      invoiceId: invoiceRef,
      totalAmount: invoice.totalAmount,
      dueDate: dueDateStr,
      paybillShortCode,
      accountNumber,
      billLink,
      validationStatus,
      statementLink,
    });

    // All three channels fire via one Promise.allSettled so a failure in
    // one (e.g. communications endpoint unreachable) can't skip the others
    // or throw out of this function — the invoice has already been created
    // successfully by the time this runs regardless.
    const results = await Promise.allSettled([
      resident.email
        ? sendEmail(
            resident.email,
            `Your Water Bill for ${new Date(invoice.periodStart).toLocaleString("default", { month: "long", year: "numeric" })}`,
            invoiceEmailHTML({
              residentName: resident.name,
              invoiceId: invoiceRef,
              periodStart: new Date(invoice.periodStart).toLocaleDateString(),
              periodEnd: new Date(invoice.periodEnd).toLocaleDateString(),
              totalAmount: invoice.totalAmount,
              consumption: invoice.consumption,
              dueDate: dueDateStr,
              paybillShortCode,
              accountNumber,
              billLink,
              validationStatus,
              statementLink,
            }),
          )
        : Promise.resolve({ skipped: "no email on file" }),
      phone
        ? sendSMS(phone, smsText)
        : Promise.resolve({ skipped: "no phone on file" }),
      phone
        ? sendWhatsApp(phone, smsText, {
            contactName: resident.name,
            source: "damr-invoice-notice",
          })
        : Promise.resolve({ skipped: "no phone on file" }),
    ]);

    const [emailResult, smsResult, waResult] = results;
    console.log(
      `${logPrefix}Invoice ${invoiceRef} notification results → ` +
        `email=${emailResult.status}${emailResult.status === "rejected" ? ` (${emailResult.reason?.message})` : ""}, ` +
        `sms=${smsResult.status}${smsResult.status === "rejected" ? ` (${smsResult.reason?.message})` : ""}, ` +
        `whatsapp=${waResult.status}${waResult.status === "rejected" ? ` (${waResult.reason?.message})` : ""}`,
    );
  } catch (notifyErr) {
    console.error(`${logPrefix}Invoice notification failed for invoice ${invoice._id}:`, notifyErr.message);
  }
}

module.exports = { sendInvoiceCreatedNotification };
