const {
  getBulkMeter: getBulkMeterModel,
  getBulkReading: getBulkReadingModel,
  getReading: getReadingModel,
} = require("../../utils/damrSchemas");
const { denyIfFacilityMismatch } = require("../../utils/accessControl");
const createBulkMeter = async (req, res) => {
  try {
    const { facilityId, serialNumber, initialReading, installationDate } =
      req.body;
    if (!facilityId) {
      return res.status(400).send({ error: "facilityId is required" });
    }

    const BulkMeter = getBulkMeterModel();
    const existing = await BulkMeter.findOne({ facilityId });
    if (existing) {
      return res
        .status(400)
        .send({ error: "This facility already has a bulk meter registered" });
    }

    const bulkMeter = await BulkMeter.create({
      facilityId,
      serialNumber: serialNumber || null,
      initialReading: initialReading || 0,
      installationDate: installationDate
        ? new Date(installationDate)
        : new Date(),
      createdBy: req.user._id,
    });

    return res
      .status(200)
      .send({ message: "Bulk meter registered successfully", bulkMeter });
  } catch (err) {
    console.error("Error in createBulkMeter:", err);
    return res.status(400).send({ error: err.message });
  }
};
const getBulkMeters = async (req, res) => {
  try {
    const BulkMeter = getBulkMeterModel();
    const filter = {};
    if (req.user.role === "editor") {
      filter.facilityId = req.user.facilityId;
    } else if (req.query.facilityId) {
      filter.facilityId = req.query.facilityId;
    }

    const bulkMeters = await BulkMeter.find(filter)
      .populate("facilityId", "name")
      .lean();
    return res
      .status(200)
      .send({ message: "Bulk meters fetched successfully", bulkMeters });
  } catch (err) {
    console.error("Error in getBulkMeters:", err);
    return res.status(400).send({ error: err.message });
  }
};
const submitBulkReading = async (req, res) => {
  try {
    const { value, readingDate, notes } = req.body;
    if (value === undefined || value === null || value === "") {
      return res.status(400).send({ error: "Reading value is required" });
    }
    const parsedValue = parseFloat(value);
    if (isNaN(parsedValue) || parsedValue < 0) {
      return res
        .status(400)
        .send({ error: "Reading value must be a non-negative number" });
    }

    const BulkMeter = getBulkMeterModel();
    const BulkReading = getBulkReadingModel();

    const bulkMeter = await BulkMeter.findById(req.params.id);
    if (!bulkMeter)
      return res.status(404).send({ error: "Bulk meter not found" });
    if (denyIfFacilityMismatch(req, res, bulkMeter)) return;

    const previous = await BulkReading.findOne({ bulkMeterId: bulkMeter._id })
      .sort({ readingDate: -1 })
      .lean();
    const previousValue = previous?.value ?? bulkMeter.initialReading ?? 0;
    const consumption = Math.max(0, parsedValue - previousValue);

    const reading = await BulkReading.create({
      bulkMeterId: bulkMeter._id,
      facilityId: bulkMeter.facilityId,
      readingDate: readingDate ? new Date(readingDate) : new Date(),
      value: parsedValue,
      previousValue,
      consumption,
      submittedBy: req.user._id,
      notes: notes || "",
    });

    await BulkMeter.findByIdAndUpdate(bulkMeter._id, {
      lastReadingValue: reading.value,
      lastReadingDate: reading.readingDate,
    });

    return res
      .status(200)
      .send({ message: "Bulk reading recorded successfully", reading });
  } catch (err) {
    console.error("Error in submitBulkReading:", err);
    return res.status(400).send({ error: err.message });
  }
};

const getNRWReport = async (req, res) => {
  try {
    const { facilityId } = req.query;
    if (!facilityId && req.user.role !== "editor") {
      return res.status(400).send({ error: "facilityId is required" });
    }
    const scopedFacilityId =
      req.user.role === "editor" ? req.user.facilityId : facilityId;

    let { periodStart, periodEnd } = req.query;
    if (!periodStart || !periodEnd) {
      const now = new Date();
      const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      periodStart = new Date(
        firstOfThisMonth.getFullYear(),
        firstOfThisMonth.getMonth() - 1,
        1,
      );
      periodEnd = new Date(firstOfThisMonth.getTime() - 1); // end of previous month
    } else {
      periodStart = new Date(periodStart);
      periodEnd = new Date(periodEnd);
    }

    const BulkMeter = getBulkMeterModel();
    const BulkReading = getBulkReadingModel();
    const Reading = getReadingModel();

    const bulkMeter = await BulkMeter.findOne({
      facilityId: scopedFacilityId,
    }).lean();
    if (!bulkMeter) {
      return res.status(404).send({
        error:
          "No bulk meter registered for this facility yet — register one before running an NRW report.",
      });
    }

    const [bulkAgg, unitAgg] = await Promise.all([
      BulkReading.aggregate([
        {
          $match: {
            bulkMeterId: bulkMeter._id,
            readingDate: { $gte: periodStart, $lte: periodEnd },
          },
        },
        { $group: { _id: null, total: { $sum: "$consumption" } } },
      ]),
      Reading.aggregate([
        {
          $match: {
            facilityId: bulkMeter.facilityId,
            readingDate: { $gte: periodStart, $lte: periodEnd },
            consumption: { $ne: null, $gte: 0 },
          },
        },
        { $group: { _id: null, total: { $sum: "$consumption" } } },
      ]),
    ]);

    const bulkSupplied = bulkAgg[0]?.total || 0;
    const billedConsumption = unitAgg[0]?.total || 0;
    const loss = Math.max(0, bulkSupplied - billedConsumption);
    const lossPct =
      bulkSupplied > 0
        ? Number(((loss / bulkSupplied) * 100).toFixed(1))
        : null;

    return res.status(200).send({
      message: "NRW report generated successfully",
      periodStart,
      periodEnd,
      bulkSupplied,
      billedConsumption,
      loss,
      lossPct,
      hasBulkReadings: !!bulkAgg[0],
    });
  } catch (err) {
    console.error("Error in getNRWReport:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = {
  createBulkMeter,
  getBulkMeters,
  submitBulkReading,
  getNRWReport,
};
