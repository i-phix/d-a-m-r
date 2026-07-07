const fs = require("fs");
const { runOCRPipeline } = require("../../services/ocrService");

// Runs OCR only — no Reading is created, no Meter fields are touched, no
// anomaly detection or notifications fire. This backs the "Scan" step of
// the Upload Reading flow: the admin gets to see (and correct, if needed)
// the value Gemini read off the photo before anything is actually
// submitted. The real Reading gets created afterwards by the "Submit"
// step, which posts to /readings/manual with whatever value is on screen
// at that point (OCR's own value, or the admin's correction).
const scanReading = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send({ error: "No image file uploaded" });
    }

    const ocr = await runOCRPipeline(req.file.path);

    // Scan-only — this file isn't linked to any Reading yet, so don't keep
    // it around. If the admin goes on to Submit, that request uploads the
    // photo again and it gets saved properly at that point.
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
      },
    });
  } catch (err) {
    console.error("Error in scanReading:", err);
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    return res.status(400).send({ error: err.message });
  }
};

module.exports = scanReading;
