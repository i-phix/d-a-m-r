const fs = require("fs");
const { runOCRPipeline, verifySerial } = require("../../services/ocrService");
const { getMeter: getMeterModel } = require("../../utils/damrSchemas");

const scanReading = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send({ error: "No image file uploaded" });
    }

    const ocr = await runOCRPipeline(req.file.path);

    let serialStatus = null;
    if (req.body.meterId) {
      const Meter = getMeterModel();
      const meter = await Meter.findById(req.body.meterId).lean();
      if (meter) {
        serialStatus = verifySerial(ocr, meter.serialNumber);
      }
    }
    fs.unlink(req.file.path, () => {});

    return res.status(200).send({
      message: "Scan complete",
      ocr: {
        value: ocr.value,
        confidence: ocr.confidence,
        meetsThreshold: ocr.meetsThreshold,
        rawText: ocr.rawText,
        notes: ocr.notes,
        error: ocr.error || null,
        serialNumber: ocr.serialNumber || null,
        serialStatus,
      },
    });
  } catch (err) {
    console.error("Error in scanReading:", err);
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    return res.status(400).send({ error: err.message });
  }
};

module.exports = scanReading;
