const db = require("../../utils/coreSchemas");
const {
  getInvoice: getInvoiceModel,
  getReading: getReadingModel,
  getMeter: getMeterModel,
} = require("../../utils/damrSchemas");
const {
  calcInvoice,
  applyCreditsToInvoice,
} = require("../../services/billingService");
const { getBlockingFlag } = require("../../services/anomalyService");
const {
  sendInvoiceCreatedNotification,
} = require("../../services/invoiceNotificationService");

async function monthlyInvoices() {
  console.log(
    "[CRON] Monthly invoice generation started:",
    new Date().toISOString(),
  );

  const Invoice = getInvoiceModel();
  const Reading = getReadingModel();
  const Meter = getMeterModel();
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const periodEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    0,
    23,
    59,
    59,
    999,
  );

  const stats = { generated: 0, held: 0, skipped: 0, errors: 0 };

  try {
    const units = await db.Unit.find({
      status: "OCCUPIED",
      residentId: { $ne: null },
    }).lean();

    for (const unit of units) {
      try {
        const activeResidentId = unit.residentId || unit.activeResident;
        if (!activeResidentId) {
          console.log(
            `[CRON] Unit ${unit._id} skipped: no resident linked despite OCCUPIED status`,
          );
          stats.skipped++;
          continue;
        }

        const duplicate = await Invoice.findOne({
          unitId: unit._id,
          periodStart,
          periodEnd,
        });
        if (duplicate) {
          console.log(
            `[CRON] Unit ${unit._id} skipped: invoice ${duplicate._id} already exists for this period`,
          );
          stats.skipped++;
          continue;
        }

        const meter = await Meter.findOne({
          unitId: unit._id,
          status: "ASSIGNED",
        });
        if (!meter) {
          console.log(
            `[CRON] Unit ${unit._id} skipped: no ASSIGNED meter found`,
          );
          stats.skipped++;
          continue;
        }
        const readings = await Reading.find({
          meterId: meter._id,
          readingDate: { $gte: periodStart, $lte: periodEnd },
        })
          .sort({ readingDate: 1 })
          .lean();

        if (!readings.length) {
          console.log(
            `[CRON] Unit ${unit._id} skipped: no readings for meter ${meter._id} between ` +
              `${periodStart.toISOString().slice(0, 10)} and ${periodEnd.toISOString().slice(0, 10)}`,
          );
          stats.skipped++;
          continue;
        }

        const lastReadingDoc = readings[readings.length - 1];
        const currentReading = lastReadingDoc.value;
        const prevDoc = await Reading.findOne({
          meterId: meter._id,
          readingDate: { $lt: periodStart },
        })
          .sort({ readingDate: -1 })
          .lean();
        const previousReading = prevDoc?.value ?? meter.initialReading ?? 0;
        const consumption = Math.max(0, currentReading - previousReading);

        const {
          ratePerUnit,
          totalAmount,
          dueDate,
          tariffPlanId,
          creditsApplied,
          breakdown,
        } = await calcInvoice({
          facilityId: unit.facilityId,
          residentId: activeResidentId,
          consumption,
          periodEnd,
          Invoice,
          unitId: unit._id,
          unitType: unit.unitType,
        });
        const blockingFlag = await getBlockingFlag(lastReadingDoc._id);

        const invoice = await Invoice.create({
          meterId: meter._id,
          readingId: lastReadingDoc._id,
          residentId: activeResidentId,
          unitId: unit._id,
          facilityId: unit.facilityId || null,
          periodStart,
          periodEnd,
          consumption,
          ratePerUnit,
          totalAmount,
          amountPaid: 0,
          balance: totalAmount,
          status: blockingFlag ? "Held" : "Unpaid",
          heldReason: blockingFlag
            ? `${blockingFlag.type}: flag ${blockingFlag._id}`
            : null,
          dueDate,
          tariffPlanId,
          breakdown,
        });

        if (creditsApplied > 0) {
          await applyCreditsToInvoice(
            activeResidentId,
            invoice._id,
            creditsApplied,
          );
        }

        if (blockingFlag) {
          stats.held++;
          console.log(
            `[CRON] Unit ${unit._id} invoice ${invoice._id} held for review — unresolved ${blockingFlag.type} flag on the billed reading`,
          );
        } else {
          stats.generated++;
          await sendInvoiceCreatedNotification(invoice, {
            logPrefix: "[CRON] ",
          });
        }
      } catch (err) {
        console.error(`[CRON] Error for unit ${unit._id}:`, err.message);
        stats.errors++;
      }
    }
  } catch (err) {
    console.error("[CRON] monthlyInvoices fatal error:", err.message);
  }

  console.log(
    `[CRON] Monthly invoices done — Generated: ${stats.generated} | Held: ${stats.held} | Skipped: ${stats.skipped} | Errors: ${stats.errors}`,
  );

  return stats;
}

module.exports = monthlyInvoices;
