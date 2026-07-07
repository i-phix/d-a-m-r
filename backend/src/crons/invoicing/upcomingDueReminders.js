const { getInvoice: getInvoiceModel } = require("../../utils/damrSchemas");
const {
  sendEmail,
  sendSMS,
  sendWhatsApp,
  upcomingDueEmailHTML,
  upcomingDueSmsText,
} = require("../../utils/emailSmsService");
const { getActiveTariffPlan } = require("../../services/billingService");
const { provisionAccount } = require("../../services/paymentsService");
async function upcomingDueReminders() {
  console.log(
    "[CRON] Upcoming-due reminders started:",
    new Date().toISOString(),
  );

  const Invoice = getInvoiceModel();
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  );
  const endOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  );

  const stats = { upcomingSent: 0, dueTodaySent: 0, errors: 0 };

  try {
    const candidates = await Invoice.find({
      status: { $in: ["Unpaid", "Partial"] },
      dueDate: { $ne: null },
      $or: [
        { "remindersSent.upcoming": { $ne: true } },
        { "remindersSent.dueToday": { $ne: true } },
      ],
    })
      .populate("residentId", "name email phone")
      .lean();

    for (const invoice of candidates) {
      try {
        const resident = invoice.residentId;
        if (!resident) continue;

        const dueDate = new Date(invoice.dueDate);
        const invoiceRef = invoice._id.toString().slice(-8).toUpperCase();
        const amountDue = invoice.balance ?? invoice.totalAmount;
        const isDueToday = dueDate >= startOfToday && dueDate <= endOfToday;
        const plan = await getActiveTariffPlan(invoice.facilityId);
        const leadDays = plan.reminderDaysBefore ?? 3;
        const leadDate = new Date(startOfToday);
        leadDate.setDate(leadDate.getDate() + leadDays);
        const isUpcoming =
          !isDueToday &&
          dueDate >= leadDate &&
          dueDate <=
            new Date(
              leadDate.getFullYear(),
              leadDate.getMonth(),
              leadDate.getDate(),
              23,
              59,
              59,
              999,
            );

        const shouldSendUpcoming =
          isUpcoming && !invoice.remindersSent?.upcoming;
        const shouldSendDueToday =
          isDueToday && !invoice.remindersSent?.dueToday;

        if (!shouldSendUpcoming && !shouldSendDueToday) continue;

        let paybillShortCode = null;
        let accountNumber = null;
        try {
          const account = await provisionAccount({
            residentId: resident._id,
            facilityId: invoice.facilityId,
            unitId: invoice.unitId,
          });
          paybillShortCode = plan.paybillShortCode || null;
          accountNumber = account.accountNumber;
        } catch (payErr) {
          console.error(
            `[CRON] Payment info lookup failed for invoice ${invoice._id}:`,
            payErr.message,
          );
        }

        const daysUntilDue = shouldSendDueToday
          ? 0
          : Math.max(0, Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24)));

        const templateData = {
          residentName: resident.name,
          invoiceId: invoiceRef,
          totalAmount: amountDue,
          dueDate: dueDate.toLocaleDateString(),
          daysUntilDue,
          paybillShortCode,
          accountNumber,
        };

        if (resident.email) {
          await sendEmail(
            resident.email,
            daysUntilDue <= 0
              ? `Water Bill Due Today — Invoice ${invoiceRef}`
              : `Water Bill Due in ${daysUntilDue} Day(s) — Invoice ${invoiceRef}`,
            upcomingDueEmailHTML(templateData),
          );
        }

        if (resident.phone) {
          const smsText = upcomingDueSmsText(templateData);
          await Promise.allSettled([
            sendSMS(resident.phone, smsText),
            sendWhatsApp(resident.phone, smsText, {
              contactName: resident.name,
              source: "damr-upcoming-due-reminder",
            }),
          ]);
        }

        const update = {};
        if (shouldSendUpcoming) {
          update["remindersSent.upcoming"] = true;
          stats.upcomingSent++;
        }
        if (shouldSendDueToday) {
          update["remindersSent.dueToday"] = true;
          stats.dueTodaySent++;
        }
        await Invoice.findByIdAndUpdate(invoice._id, update);
      } catch (err) {
        console.error(
          `[CRON] Upcoming-due reminder error for invoice ${invoice._id}:`,
          err.message,
        );
        stats.errors++;
      }
    }
  } catch (err) {
    console.error("[CRON] upcomingDueReminders fatal error:", err.message);
  }

  console.log(
    `[CRON] Upcoming-due reminders done — Upcoming: ${stats.upcomingSent} | Due today: ${stats.dueTodaySent} | Errors: ${stats.errors}`,
  );
}

module.exports = upcomingDueReminders;
