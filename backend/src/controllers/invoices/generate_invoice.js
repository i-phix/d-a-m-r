const db = require("../../utils/coreSchemas");
const {
  getInvoice: getInvoiceModel,
  getReading: getReadingModel,
  getMeter: getMeterModel,
} = require("../../utils/damrSchemas");
const { calcInvoice, applyCreditsToInvoice } = require("../../services/billingService");
const { getBlockingFlag } = require("../../services/anomalyService");
const { sendInvoiceCreatedNotification } = require("../../services/invoiceNotificationService");
const { denyIfFacilityMismatch } = require("../../utils/accessControl");

function endOfDay(dateStr) {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d;
}

const generateInvoice = async (req, res) => {
  try {
    const { unitId, periodStart, periodEnd } = req.body;

    if (!unitId || !periodStart || !periodEnd) {
      return res
        .status(400)
        .send({ error: "unitId, periodStart and periodEnd are required" });
    }

    const Invoice = getInvoiceModel();
    const Reading = getReadingModel();
    const Meter = getMeterModel();

    const unit = await db.Unit.findById(unitId).lean();
    if (!unit) return res.status(404).send({ error: "Unit not found" });
    if (denyIfFacilityMismatch(req, res, unit)) return;

    const activeResidentId = unit.residentId || unit.activeResident;
    if (!activeResidentId) {
      return res.status(400).send({ error: "Unit has no active resident" });
    }

    const meter = await Meter.findOne({
      unitId: unit._id,
      status: "ASSIGNED",
    });
    if (!meter) {
      return res.status(400).send({ error: "Unit has no meter assigned" });
    }

    const duplicate = await Invoice.findOne({
      unitId,
      periodStart: new Date(periodStart),
      periodEnd: endOfDay(periodEnd),
    });
    if (duplicate) {
      return res.status(409).send({
        error: "Invoice already exists for this unit and period",
        invoiceId: duplicate._id,
      });
    }

    const from = new Date(periodStart);
    const to = endOfDay(periodEnd);

    const readings = await Reading.find({
      meterId: meter._id,
      readingDate: { $gte: from, $lte: to },
    })
      .sort({ readingDate: 1 })
      .lean();

    if (!readings.length) {
      return res
        .status(400)
        .send({ error: "No readings found for this period" });
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

    // Roadmap Phase 8, #1 — same hold-on-unresolved-high-severity-flag gate
    // as the monthly cron and bulk generation, so a staff member manually
    // generating one invoice can't route around the same trust concern.
    const blockingFlag = await getBlockingFlag(lastReadingDoc._id);

    const invoice = await Invoice.create({
      meterId: meter._id,
      readingId: lastReadingDoc._id,
      residentId: activeResidentId,
      unitId: unit._id,
      facilityId: unit.facilityId || null,
      periodStart: from,
      periodEnd: to,
      consumption,
      ratePerUnit,
      totalAmount,
      amountPaid: 0,
      balance: totalAmount,
      status: blockingFlag ? "Held" : "Unpaid",
      heldReason: blockingFlag ? `${blockingFlag.type}: flag ${blockingFlag._id}` : null,
      generatedBy: req.user._id,
      dueDate,
      tariffPlanId,
      breakdown,
    });

    if (creditsApplied > 0) {
      await applyCreditsToInvoice(activeResidentId, invoice._id, creditsApplied);
    }

    if (blockingFlag) {
      console.log(
        `[generateInvoice] Invoice ${invoice._id} held for review — unresolved ${blockingFlag.type} flag on the billed reading`,
      );
    } else {
      await sendInvoiceCreatedNotification(invoice, { logPrefix: "[generateInvoice] " });
    }

    return res.status(200).send({
      message: blockingFlag
        ? "Invoice generated but held for review — an unresolved anomaly flag is blocking notification until it's resolved"
        : "Invoice generated successfully",
      invoice,
      breakdown,
      held: !!blockingFlag,
    });
  } catch (err) {
    console.error("Error in generateInvoice:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = generateInvoice;
