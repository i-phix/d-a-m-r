const db = require("../utils/coreSchemas");
const {
  getInvoice: getInvoiceModel,
  getTariffPlan: getTariffPlanModel,
} = require("../utils/damrSchemas");
const { provisionAccount } = require("./paymentsService");
const { getValidationStatus } = require("./validationStatusService");
const { ensurePublicToken } = require("../controllers/invoices/public_bill");
const {
  ensureResidentPublicToken,
} = require("../controllers/residents/statement");
const {
  sendEmail,
  sendSMS,
  sendWhatsApp,
  invoiceEmailHTML,
  invoiceSmsText,
} = require("../utils/emailSmsService");

async function resolvePaybillShortCode(tariffPlanId) {
  if (!tariffPlanId) return null;
  const TariffPlan = getTariffPlanModel();
  const plan = await TariffPlan.findById(tariffPlanId).lean();
  return plan?.paybillShortCode || null;
}

async function sendInvoiceCreatedNotification(
  invoice,
  { logPrefix = "" } = {},
) {
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
      console.error(
        `${logPrefix}Payment account provisioning failed:`,
        payErr.message,
      );
    }

    const paybillShortCode = await resolvePaybillShortCode(
      invoice.tariffPlanId,
    );
    const invoiceRef = invoice._id.toString().slice(-8).toUpperCase();
    const dueDateStr = invoice.dueDate
      ? new Date(invoice.dueDate).toLocaleDateString()
      : "";
    let billLink = null;
    try {
      const Invoice = getInvoiceModel();
      const token = await ensurePublicToken(invoice, Invoice);
      billLink = `${process.env.FRONTEND_BASE_URL || ""}/bill/${token}`;
    } catch (linkErr) {
      console.error(
        `${logPrefix}Public bill link generation failed:`,
        linkErr.message,
      );
    }
    let statementLink = null;
    try {
      const statementToken = await ensureResidentPublicToken(resident);
      statementLink = `${process.env.FRONTEND_BASE_URL || ""}/statement/${statementToken}`;
    } catch (statementErr) {
      console.error(
        `${logPrefix}Statement link generation failed:`,
        statementErr.message,
      );
    }

    let validationStatus = null;
    try {
      validationStatus = await getValidationStatus(invoice.readingId);
    } catch (valErr) {
      console.error(
        `${logPrefix}Validation status lookup failed:`,
        valErr.message,
      );
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
    console.error(
      `${logPrefix}Invoice notification failed for invoice ${invoice._id}:`,
      notifyErr.message,
    );
  }
}

module.exports = { sendInvoiceCreatedNotification };
