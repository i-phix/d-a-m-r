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

function endOfDay(dateStr) {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d;
}

const bulkGenerate = async (req, res) => {
  try {
    const { facilityId, periodStart, periodEnd } = req.body;

    if (!facilityId || !periodStart || !periodEnd) {
      return res
        .status(400)
        .send({ error: "facilityId, periodStart and periodEnd are required" });
    }
    const Invoice = getInvoiceModel();
    const Reading = getReadingModel();
    const Meter = getMeterModel();
    const units = await db.Unit.find({
      facilityId,
      status: "OCCUPIED",
      residentId: { $ne: null },
    }).lean();

    if (!units.length) {
      return res
        .status(400)
        .send({ error: "No eligible units found in this facility" });
    }

    const from = new Date(periodStart);
    const to = endOfDay(periodEnd);
    const results = [];

    for (const unit of units) {
      try {
        const activeResidentId = unit.residentId || unit.activeResident;
        if (!activeResidentId) {
          results.push({
            unitId: unit._id,
            status: "skipped",
            message: "No active resident",
          });
          continue;
        }

        const duplicate = await Invoice.findOne({
          unitId: unit._id,
          periodStart: from,
          periodEnd: to,
        });
        if (duplicate) {
          results.push({
            unitId: unit._id,
            status: "skipped",
            message: "Invoice already exists",
            invoiceId: duplicate._id,
          });
          continue;
        }

        const meter = await Meter.findOne({
          unitId: unit._id,
          status: { $in: ["ASSIGNED", "UNOCCUPIED"] },
        });
        if (!meter) {
          results.push({
            unitId: unit._id,
            status: "skipped",
            message: "Meter not found",
          });
          continue;
        }

        const readings = await Reading.find({
          meterId: meter._id,
          readingDate: { $gte: from, $lte: to },
        })
          .sort({ readingDate: 1 })
          .lean();

        if (!readings.length) {
          results.push({
            unitId: unit._id,
            status: "skipped",
            message: "No readings in period",
          });
          continue;
        }

        const lastReadingDoc = readings[readings.length - 1];
        const currentReading = lastReadingDoc.value;
        const prevDoc = await Reading.findOne({
          meterId: meter._id,
          readingDate: { $lt: from },
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
          periodEnd: to,
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
          facilityId: unit.facilityId,
          periodStart: from,
          periodEnd: to,
          consumption,
          ratePerUnit,
          totalAmount,
          amountPaid: 0,
          balance: totalAmount,
          status: blockingFlag ? "Held" : "Unpaid",
          heldReason: blockingFlag
            ? `${blockingFlag.type}: flag ${blockingFlag._id}`
            : null,
          generatedBy: req.user._id,
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
          console.log(
            `[bulkGenerate] Invoice ${invoice._id} held for review — unresolved ${blockingFlag.type} flag on the billed reading`,
          );
        } else {
          await sendInvoiceCreatedNotification(invoice, {
            logPrefix: "[bulkGenerate] ",
          });
        }

        results.push({
          unitId: unit._id,
          invoiceId: invoice._id,
          status: blockingFlag ? "held" : "created",
        });
      } catch (err) {
        results.push({
          unitId: unit._id,
          status: "error",
          message: err.message,
        });
      }
    }

    return res.status(200).send({
      message: "Bulk generation complete",
      generated: results.filter((r) => r.status === "created").length,
      held: results.filter((r) => r.status === "held").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      errors: results.filter((r) => r.status === "error").length,
      results,
    });
  } catch (err) {
    console.error("Error in bulkGenerate:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = bulkGenerate;
