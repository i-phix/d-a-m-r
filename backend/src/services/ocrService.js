const sharp = require("sharp");
const fs = require("fs");
const { isEnabled, callGeminiVision } = require("./aiMessageService");

const CONFIDENCE_THRESHOLD = 0.75;
const MAX_IMAGE_WIDTH = 1280;
const MAX_IMAGE_HEIGHT = 1280;
const CONFIDENCE_MAP = { high: 0.95, medium: 0.75, low: 0.4 };
const METER_READING_PROMPT = `You are reading a physical utility meter (water, electricity, or gas) from a photo, for a residential billing system.

The photo may contain SEVERAL different numbers — you must tell them apart:
- The cumulative consumption reading, shown on the meter's own register: either a row of mechanical odometer/dial wheels, or a digital LCD/LED display. This is the PRIMARY number to report.
- The meter's serial number, ONLY if it happens to be legibly visible somewhere in this same photo — often printed near "SN", "Serial No.", "S/N", or stamped as a distinct code on the meter body. This is a separate, optional field used only to double check this photo is of the right meter — do not guess at it, and do not confuse it with the register reading.
- Do NOT use: model/type codes, manufacture or calibration dates, barcode digits, QR code, or any spec-plate values (e.g. Qmax, Qmin, Qt, Pmax, Vc, accuracy class) as either the reading or the serial number.
- Mechanical registers often show black digits (whole units) followed by red digits or a red-highlighted section (fractional units, e.g. liters). If so, combine them into one decimal number: black digits as the integer part, red digits as the decimal part (e.g. black "00038", red "16" -> 38.16).

Respond with ONLY a raw JSON object, no markdown code fences, no extra commentary, in exactly this shape:
{"reading": "<the numeric reading as a plain decimal string, or null if you cannot confidently identify the register>", "confidence": "high" | "medium" | "low", "serialNumber": "<the meter's serial number as printed, or null if not visible/legible in this photo>", "serialConfidence": "high" | "medium" | "low", "notes": "<one short sentence on which digits you used and why>"}`;

async function preprocessImage(imagePath) {
  const meta = await sharp(imagePath).metadata();
  let pipeline = sharp(imagePath);

  if (meta.width > MAX_IMAGE_WIDTH || meta.height > MAX_IMAGE_HEIGHT) {
    pipeline = pipeline.resize({
      width: MAX_IMAGE_WIDTH,
      height: MAX_IMAGE_HEIGHT,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const buffer = await pipeline
    .normalise({ lower: 2, upper: 98 })
    .jpeg({ quality: 92 })
    .toBuffer();

  return buffer.toString("base64");
}

function parseGeminiOcrResponse(text) {
  if (!text) return null;
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}
function normalizeSerial(s) {
  return String(s || "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function buildSerialFields(serialNumber, serialConfidenceLabel) {
  const cleanSerial =
    serialNumber && String(serialNumber).trim()
      ? String(serialNumber).trim()
      : null;
  const serialConfidence =
    CONFIDENCE_MAP[String(serialConfidenceLabel || "").toLowerCase()] ?? 0;
  return {
    serialNumber: cleanSerial,
    serialConfidence,
    serialMeetsThreshold:
      cleanSerial !== null && serialConfidence >= CONFIDENCE_THRESHOLD,
  };
}

function buildResult({
  reading,
  confidenceLabel,
  notes,
  rawText,
  error,
  serialNumber,
  serialConfidenceLabel,
}) {
  const serialFields = buildSerialFields(serialNumber, serialConfidenceLabel);

  if (error) {
    return {
      value: null,
      confidence: 0,
      meetsThreshold: false,
      digits: [],
      rawText: rawText || "",
      meterType: "unknown",
      notes: notes || "",
      source: "gemini_vision",
      error,
      ...serialFields,
    };
  }

  const value =
    reading !== null && reading !== undefined && reading !== ""
      ? parseFloat(reading)
      : NaN;
  const validValue = !isNaN(value) && value >= 0 ? value : null;

  if (validValue === null) {
    return {
      value: null,
      confidence: 0,
      meetsThreshold: false,
      digits: [],
      rawText: rawText || "",
      meterType: "unknown",
      notes:
        notes || "Gemini could not confidently identify the register reading",
      source: "gemini_vision",
      error: null,
      ...serialFields,
    };
  }

  const confidence =
    CONFIDENCE_MAP[String(confidenceLabel || "").toLowerCase()] ?? 0;

  return {
    value: validValue,
    confidence,
    meetsThreshold: confidence >= CONFIDENCE_THRESHOLD,
    digits: String(validValue)
      .replace(/[^0-9]/g, "")
      .split("")
      .filter(Boolean),
    rawText: rawText || String(reading),
    meterType: "unknown",
    notes: notes || "",
    source: "gemini_vision",
    error: null,
    ...serialFields,
  };
}

async function runOCRPipeline(imagePath) {
  try {
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image not found: ${imagePath}`);
    }
    if (!isEnabled()) {
      throw new Error(
        "Meter-reading OCR is not enabled — Gemini vision (AI_MESSAGES_ENABLED + Vertex AI env vars) is required to read meter photos",
      );
    }

    const base64Image = await preprocessImage(imagePath);
    const responseText = await callGeminiVision(
      METER_READING_PROMPT,
      base64Image,
      "image/jpeg",
    );
    const parsed = parseGeminiOcrResponse(responseText);

    if (!parsed) {
      console.warn(
        `[OCR] Gemini response wasn't valid JSON: ${responseText?.slice(0, 300)}`,
      );
      return buildResult({
        reading: null,
        notes: "Gemini response could not be parsed",
        rawText: responseText,
      });
    }

    console.log(
      `[OCR] Gemini read: "${parsed.reading ?? "none"}" | confidence: ${parsed.confidence ?? "?"} | serial: "${parsed.serialNumber ?? "none"}" (${parsed.serialConfidence ?? "?"}) | ${parsed.notes ?? ""}`,
    );

    return buildResult({
      reading: parsed.reading,
      confidenceLabel: parsed.confidence,
      notes: parsed.notes,
      rawText: responseText,
      serialNumber: parsed.serialNumber,
      serialConfidenceLabel: parsed.serialConfidence,
    });
  } catch (err) {
    console.error("[OCR] pipeline error:", err.message);
    return {
      value: null,
      confidence: 0,
      meetsThreshold: false,
      digits: [],
      rawText: "",
      meterType: "unknown",
      notes: "",
      source: "gemini_vision",
      error: err.message,
      serialNumber: null,
      serialConfidence: 0,
      serialMeetsThreshold: false,
    };
  }
}

function verifySerial(ocrResult, registeredSerial) {
  if (!registeredSerial) return "unverified"; // nothing to compare against
  if (!ocrResult?.serialNumber || !ocrResult.serialMeetsThreshold)
    return "unverified";
  return normalizeSerial(ocrResult.serialNumber) ===
    normalizeSerial(registeredSerial)
    ? "matched"
    : "mismatch";
}

module.exports = {
  runOCRPipeline,
  extractReading: runOCRPipeline,
  verifySerial,
  normalizeSerial,
};
