const {
  getMeter: getMeterModel,
  getReading: getReadingModel,
  getFlag: getFlagModel,
} = require("../../utils/damrSchemas");
const {
  detectAnomalies,
  checkDuplicateSubmission,
} = require("../../services/anomalyService");
const { runOCRPipeline } = require("../../services/ocrService");
const { denyIfFacilityMismatch } = require("../../utils/accessControl");

const OCR_MISMATCH_ABS_TOLERANCE = 1;
const OCR_MISMATCH_REL_TOLERANCE = 0.02;

const manualReading = async (req, res) => {
  try {
    const { meterId, value, readingDate, notes } = req.body;

    if (!meterId) return res.status(400).send({ error: "meterId is required" });
    if (value === undefined || value === null || value === "") {
      return res.status(400).send({ error: "Reading value is required" });
    }

    const parsedValue = parseFloat(value);
    if (isNaN(parsedValue) || parsedValue < 0) {
      return res
        .status(400)
        .send({ error: "Reading value must be a non-negative number" });
    }

    const Meter = getMeterModel();
    const Reading = getReadingModel();
    const Flag = getFlagModel();

    const meter = await Meter.findById(meterId);
    if (!meter) return res.status(404).send({ error: "Meter not found" });
    if (denyIfFacilityMismatch(req, res, meter)) return;
    if (meter.status === "UNASSIGNED") {
      return res.status(400).send({ error: "Meter is not assigned to a unit" });
    }

    const previous = await Reading.findOne({ meterId })
      .sort({ readingDate: -1 })
      .lean();
    const previousValue = previous?.value ?? meter.initialReading ?? 0;
    const isMeterReset = parsedValue < previousValue;
    const consumption = isMeterReset
      ? parsedValue
      : Math.max(0, parsedValue - previousValue);
    let ocrResult = null;
    if (req.file) {
      ocrResult = await runOCRPipeline(req.file.path);
    }

    const reading = await Reading.create({
      meterId,
      unitId: meter.unitId || null,
      facilityId: meter.facilityId || null,
      readingDate: readingDate ? new Date(readingDate) : new Date(),
      value: parsedValue,
      previousValue,
      consumption,
      method: "manual",
      imageUrl: req.file ? `/uploads/${req.file.filename}` : null,
      ocrRawValue: ocrResult?.rawText || null,
      ocrConfidence: ocrResult?.confidence || null,
      status: "confirmed",
      submittedBy: req.user._id,
      notes: notes || (isMeterReset ? "Meter reset detected" : ""),
    });
    await Meter.findByIdAndUpdate(meterId, {
      lastReadingValue: reading.value,
      lastReadingDate: reading.readingDate,
      lastReadingBy: req.user._id,
    });

    let flag = null;

    if (isMeterReset) {
      flag = await Flag.create({
        type: "manual_review",
        meterId,
        readingId: reading._id,
        facilityId: meter.facilityId || null,
        status: "open",
        description: `Meter reset detected — previous reading: ${previousValue} m³, new reading: ${parsedValue} m³. Please verify.`,
      });
      await Meter.findByIdAndUpdate(meterId, { $inc: { openFlagCount: 1 } });
    } else {
      flag = await detectAnomalies(reading);
      if (flag) await reading.updateOne({ flagId: flag._id });
    }
    let ocrMismatchFlag = null;
    if (
      ocrResult?.value !== null &&
      ocrResult?.value !== undefined &&
      ocrResult.meetsThreshold
    ) {
      const tolerance = Math.max(
        OCR_MISMATCH_ABS_TOLERANCE,
        parsedValue * OCR_MISMATCH_REL_TOLERANCE,
      );
      if (Math.abs(ocrResult.value - parsedValue) > tolerance) {
        ocrMismatchFlag = await Flag.create({
          type: "ocr_mismatch",
          meterId,
          readingId: reading._id,
          facilityId: meter.facilityId || null,
          status: "open",
          description: `Keyed value ${parsedValue} m³ differs from the OCR-read value ${ocrResult.value} m³ on the attached photo — please verify.`,
        });
        await Meter.findByIdAndUpdate(meterId, { $inc: { openFlagCount: 1 } });
      }
    }
    const duplicateFlag = await checkDuplicateSubmission(reading);

    return res.status(200).send({
      message: isMeterReset
        ? "Reading recorded. Meter reset detected — a review flag has been raised."
        : "Manual reading submitted successfully",
      reading,
      flag: flag || null,
      ocrCheck: req.file
        ? {
            performed: true,
            value: ocrResult?.value ?? null,
            confidence: ocrResult?.confidence ?? null,
            mismatch: !!ocrMismatchFlag,
          }
        : { performed: false },
      ocrMismatchFlag: ocrMismatchFlag || null,
      duplicateFlag: duplicateFlag || null,
      isMeterReset,
    });
  } catch (err) {
    console.error("Error in manualReading:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = manualReading;
