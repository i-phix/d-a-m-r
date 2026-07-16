const {
  getMeter: getMeterModel,
  getReading: getReadingModel,
  getFlag: getFlagModel,
} = require("../../utils/damrSchemas");
const { runOCRPipeline, verifySerial } = require("../../services/ocrService");
const {
  detectAnomalies,
  checkDuplicateSubmission,
} = require("../../services/anomalyService");
const { denyIfFacilityMismatch } = require("../../utils/accessControl");
const uploadReading = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send({ error: "No image file uploaded" });
    }

    const { meterId, notes } = req.body;

    if (!meterId) {
      return res.status(400).send({ error: "meterId is required" });
    }

    const Meter = getMeterModel();
    const Reading = getReadingModel();

    const meter = await Meter.findById(meterId);
    if (!meter) return res.status(404).send({ error: "Meter not found" });
    if (denyIfFacilityMismatch(req, res, meter)) return;
    if (meter.status === "UNASSIGNED") {
      return res.status(400).send({ error: "Meter is not assigned to a unit" });
    }
    const ocr = await runOCRPipeline(req.file.path);
    const previous = await Reading.findOne({ meterId })
      .sort({ readingDate: -1 })
      .lean();
    const previousValue = previous?.value ?? meter.initialReading ?? 0;
    const readingValue = ocr.value ?? 0;
    const consumption =
      ocr.value !== null ? Math.max(0, readingValue - previousValue) : null;

    // Same serial cross-check as manual_reading.js/bulk_create_readings.js
    // — this endpoint always has a photo (required above), so this always
    // runs. Both "mismatch" and "unverified" hold the reading pending even
    // if the register-reading OCR itself was otherwise high-confidence.
    const serialStatus = verifySerial(ocr, meter.serialNumber);
    const serialNeedsReview = serialStatus === "mismatch" || serialStatus === "unverified";

    const reading = await Reading.create({
      meterId,
      unitId: meter.unitId || null,
      facilityId: meter.facilityId || null,
      readingDate: new Date(),
      value: readingValue,
      previousValue,
      consumption,
      method: "ocr",
      imageUrl: `/uploads/${req.file.filename}`,
      ocrRawValue: ocr.rawText || null,
      ocrConfidence: ocr.confidence || null,
      status: ocr.meetsThreshold && !serialNeedsReview ? "confirmed" : "pending",
      submittedBy: req.user._id,
      notes: notes || "",
    });
    await Meter.findByIdAndUpdate(meterId, {
      lastReadingValue: reading.value,
      lastReadingDate: reading.readingDate,
      lastReadingBy: req.user._id,
    });
    const flag = await detectAnomalies(reading);
    if (flag) {
      await reading.updateOne({ flagId: flag._id });
    }
    let serialFlag = null;
    if (serialStatus === "mismatch" || serialStatus === "unverified") {
      const Flag = getFlagModel();
      serialFlag = await Flag.create({
        type: serialStatus === "mismatch" ? "serial_mismatch" : "serial_unverified",
        meterId,
        readingId: reading._id,
        facilityId: meter.facilityId || null,
        status: "open",
        description:
          serialStatus === "mismatch"
            ? `Attached photo's visible serial number ("${ocr.serialNumber}") doesn't match this meter's registered serial number ("${meter.serialNumber}") — reading held as pending until verified.`
            : `Could not confidently read a serial number from the attached photo — reading held as pending until someone verifies it's for meter ${meter.serialNumber}.`,
      });
      await Meter.findByIdAndUpdate(meterId, { $inc: { openFlagCount: 1 } });
    }
    const duplicateFlag = await checkDuplicateSubmission(reading);

    return res.status(200).send({
      message: serialNeedsReview
        ? serialStatus === "mismatch"
          ? "Reading recorded but held as pending — the attached photo's serial number doesn't match this meter."
          : "Reading recorded but held as pending — could not confirm the meter's serial number from the attached photo."
        : "Reading submitted successfully",
      reading,
      ocr: {
        confidence: ocr.confidence,
        meetsThreshold: ocr.meetsThreshold,
        rawText: ocr.rawText,
        meterType: ocr.meterType,
        usedFallback: ocr.usedFallback,
        error: ocr.error || null,
        serialNumber: ocr.serialNumber || null,
        serialStatus,
      },
      flag: flag || null,
      serialFlag: serialFlag || null,
      duplicateFlag: duplicateFlag || null,
    });
  } catch (err) {
    console.error("Error in uploadReading:", err);
    return res.status(400).send({ error: err.message });
  }
};
module.exports = uploadReading;
