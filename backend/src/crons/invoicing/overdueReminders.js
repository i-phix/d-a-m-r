// Not used directly here, but required so the User/Facility/Unit/Resident
// models are registered before Invoice.find(...).populate("residentId", ...)
// below runs (mirrors why this file used to require("payservedb") without
// ever referencing it directly either).
require("../../utils/coreSchemas");
const { getInvoice: getInvoiceModel } = require("../../utils/damrSchemas");
const {
  sendEmail,
  sendSMS,
  sendWhatsApp,
  overdueEmailHTML,
  paymentInstructionsSmsText,
} = require("../../utils/emailSmsService");
const {
  calcLateFee,
  getActiveTariffPlan,
} = require("../../services/billingService");
const { provisionAccount } = require("../../services/paymentsService");

async function overdueReminders() {
  console.log("[CRON] Overdue reminders started:", new Date().toISOString());

  const Invoice = getInvoiceModel();
  const now = new Date();
  const stats = { marked: 0, notified: 0, penalized: 0, errors: 0 };

  try {
    const markResult = await Invoice.updateMany(
      {
        status: "Unpaid",
        $or: [
          { dueDate: { $ne: null, $lt: now } },
          { dueDate: null, periodEnd: { $lt: now } },
        ],
      },
      { $set: { status: "Overdue" } },
    );
    stats.marked = markResult.modifiedCount;
    const overdueInvoices = await Invoice.find({ status: "Overdue" })
      .populate("residentId", "name email phone")
      .lean();

    for (const invoice of overdueInvoices) {
      try {
        const resident = invoice.residentId;
        if (!resident) continue;
        const lateFee = await calcLateFee(invoice);
        if (lateFee) {
          await Invoice.findByIdAndUpdate(invoice._id, lateFee.update);
          invoice.totalAmount = lateFee.update.totalAmount;
          invoice.balance = lateFee.update.balance;
          stats.penalized++;
        }

        const referenceDate = invoice.dueDate || invoice.periodEnd;
        const daysOverdue = Math.floor(
          (now - new Date(referenceDate)) / (1000 * 60 * 60 * 24),
        );
        const invoiceRef = invoice._id.toString().slice(-8).toUpperCase();
        const amountDue = invoice.balance ?? invoice.totalAmount;
        let paybillShortCode = null;
        let accountNumber = null;
        try {
          const [plan, account] = await Promise.all([
            getActiveTariffPlan(invoice.facilityId),
            provisionAccount({
              residentId: resident._id,
              facilityId: invoice.facilityId,
              unitId: invoice.unitId,
            }),
          ]);
          paybillShortCode = plan.paybillShortCode || null;
          accountNumber = account.accountNumber;
        } catch (payErr) {
          console.error(
            `[CRON] Payment info lookup failed for invoice ${invoice._id}:`,
            payErr.message,
          );
        }

        if (resident.email) {
          await sendEmail(
            resident.email,
            `⚠️ Overdue Water Bill — Invoice ${invoiceRef}`,
            overdueEmailHTML({
              residentName: resident.name,
              invoiceId: invoiceRef,
              totalAmount: amountDue,
              daysOverdue,
              paybillShortCode,
              accountNumber,
            }),
          );
        }

        if (resident.phone) {
          const smsText = `DAMR Alert: Your water bill (Inv ${invoiceRef}) of KES ${Number(amountDue).toLocaleString()} is ${daysOverdue} day(s) overdue.${lateFee ? ` A late fee of KES ${Number(lateFee.penalty).toLocaleString()} has been applied.` : ""} Please pay immediately.${paymentInstructionsSmsText({ paybillShortCode, accountNumber })}`;
          // WhatsApp is best-effort via backend_main's internal bridge and
          // never blocks the SMS reminder if it fails.
          await Promise.allSettled([
            sendSMS(resident.phone, smsText),
            sendWhatsApp(resident.phone, smsText, {
              contactName: resident.name,
              source: "damr-overdue-reminder",
            }),
          ]);
        }

        stats.notified++;
      } catch (err) {
        console.error(
          `[CRON] Reminder error for invoice ${invoice._id}:`,
          err.message,
        );
        stats.errors++;
      }
    }
  } catch (err) {
    console.error("[CRON] overdueReminders fatal error:", err.message);
  }

  console.log(
    `[CRON] Overdue reminders done — Marked: ${stats.marked} | Notified: ${stats.notified} | Penalized: ${stats.penalized} | Errors: ${stats.errors}`,
  );

  return stats;
}

module.exports = overdueReminders;
