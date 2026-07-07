const {
  getMeter: getMeterModel,
  getReading: getReadingModel,
} = require("../../utils/damrSchemas");
const { runOCRPipeline } = require("../../services/ocrService");
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
      status: ocr.meetsThreshold ? "confirmed" : "pending",
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
    const duplicateFlag = await checkDuplicateSubmission(reading);

    return res.status(200).send({
      message: "Reading submitted successfully",
      reading,
      ocr: {
        confidence: ocr.confidence,
        meetsThreshold: ocr.meetsThreshold,
        rawText: ocr.rawText,
        meterType: ocr.meterType,
        usedFallback: ocr.usedFallback,
        error: ocr.error || null,
      },
      flag: flag || null,
      duplicateFlag: duplicateFlag || null,
    });
  } catch (err) {
    console.error("Error in uploadReading:", err);
    return res.status(400).send({ error: err.message });
  }
};
module.exports = uploadReading;
