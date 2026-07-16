const {
  getFlag: getFlagModel,
  getMeter: getMeterModel,
  getInvoice: getInvoiceModel,
} = require("../../utils/damrSchemas");
const {
  getBlockingFlag,
  BLOCKING_FLAG_TYPES,
} = require("../../services/anomalyService");
const {
  sendInvoiceCreatedNotification,
} = require("../../services/invoiceNotificationService");
const { denyIfFacilityMismatch } = require("../../utils/accessControl");
async function releaseHeldInvoiceIfAny(flag) {
  if (!flag.readingId || !BLOCKING_FLAG_TYPES.includes(flag.type)) return;

  const stillBlocked = await getBlockingFlag(flag.readingId);
  if (stillBlocked) return; // another open blocking flag remains on this reading

  const Invoice = getInvoiceModel();
  const invoice = await Invoice.findOne({
    readingId: flag.readingId,
    status: "Held",
  });
  if (!invoice) return;

  const now = new Date();
  invoice.status =
    invoice.dueDate && invoice.dueDate < now ? "Overdue" : "Unpaid";
  invoice.heldReason = null;
  await invoice.save();

  await sendInvoiceCreatedNotification(invoice, {
    logPrefix: "[resolveFlag] ",
  });
}

const resolveFlag = async (req, res) => {
  try {
    const { notes } = req.body;
    const Flag = getFlagModel();
    const Meter = getMeterModel();

    const flag = await Flag.findById(req.params.id);
    if (!flag) return res.status(404).send({ error: "Flag not found" });
    if (denyIfFacilityMismatch(req, res, flag)) return;

    if (flag.status === "resolved") {
      return res.status(400).send({ error: "Flag is already resolved" });
    }
    flag.status = "resolved";
    flag.resolvedBy = req.user._id;
    flag.resolvedAt = new Date();
    if (notes) flag.notes = notes;
    await flag.save();
    await Meter.findByIdAndUpdate(flag.meterId, {
      $inc: { openFlagCount: -1 },
    });

    try {
      await releaseHeldInvoiceIfAny(flag);
    } catch (releaseErr) {
      console.error(
        `Failed to release held invoice for resolved flag ${flag._id}:`,
        releaseErr.message,
      );
    }

    return res
      .status(200)
      .send({ message: "Flag resolved successfully", flag });
  } catch (err) {
    console.error("Error in resolveFlag:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = resolveFlag;
