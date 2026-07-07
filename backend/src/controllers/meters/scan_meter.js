const sharp = require("sharp");
const fs = require("fs");
const { isEnabled, callGeminiVision } = require("../../services/aiMessageService");

// This used to run generic Google Vision TEXT_DETECTION and then guess at
// serial number / manufacturer / model / meter type with regexes over the
// raw text blob (see git history). Same class of problem as the meter
// READING OCR bug: no spatial/contextual understanding of the label, so a
// serial number printed with a space in it (e.g. "SN 26 010012") or an
// unusual layout just fell through every pattern silently. Switched to a
// Gemini vision call, same pattern as ocrService.js, which also now reads
// the register value directly — so a brand-new meter's current reading
// gets captured at installation time instead of always defaulting to 0.
const NAMEPLATE_PROMPT = `You are extracting details from a photo of a utility meter (water, electricity, or gas) label/nameplate/body, for a property management system, at the moment a NEW meter is being installed and registered.

Extract these fields from the photo:
- serialNumber: the meter's unique serial number. Often printed near "SN", "Serial No.", "S/N", or stands alone as a distinct code stamped on the body. Do NOT confuse this with model codes, standards references (e.g. "AWWA C701", "NSF/ANSI/CAN61"), or pipe-size/temperature ratings.
- manufacturer: the brand/manufacturer name printed on the meter.
- model: the model number/code, often near "Model:" or similar.
- meterType: "analogue" if the reading is shown on mechanical dial(s) or rotating odometer wheels, "digital" if shown on an LCD/LED digital display.
- initialReading: the CURRENT numeric value shown on the meter's own register/odometer/dial/display right now — this is its starting point for billing. Read the actual register digits, not a serial number, date code, or spec-plate value. If the register shows black digits followed by red digits (fractional units), combine them as one decimal number (e.g. black "00000" + red "02" -> 0.02); otherwise just read the plain digits shown.

For any field you can't confidently determine, use null for that field (and "low" for its confidence).

Respond with ONLY a raw JSON object, no markdown code fences, no extra commentary, in exactly this shape:
{"serialNumber": "<string or null>", "manufacturer": "<string or null>", "model": "<string or null>", "meterType": "analogue" | "digital" | null, "initialReading": "<numeric string or null>", "confidence": {"serialNumber": "high" | "medium" | "low", "manufacturer": "high" | "medium" | "low", "model": "high" | "medium" | "low", "meterType": "high" | "medium" | "low", "initialReading": "high" | "medium" | "low"}}`;

async function preprocessImage(imagePath) {
  const meta = await sharp(imagePath).metadata();
  let pipeline = sharp(imagePath);
  if (meta.width > 1280 || meta.height > 1280) {
    pipeline = pipeline.resize({
      width: 1280,
      height: 1280,
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

// Gemini is asked for raw JSON but sometimes wraps it in a ```json fence
// anyway — strip that defensively before parsing, same as ocrService.js.
function parseGeminiNameplateResponse(text) {
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

const scanMeter = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send({ error: "No image file uploaded" });
    }
    if (!isEnabled()) {
      fs.unlink(req.file.path, () => {});
      return res.status(200).send({
        message:
          "Nameplate scanning isn't available right now (AI vision not enabled) — please fill in the details manually",
        extracted: null,
      });
    }

    const base64Image = await preprocessImage(req.file.path);
    const responseText = await callGeminiVision(
      NAMEPLATE_PROMPT,
      base64Image,
      "image/jpeg",
    );
    fs.unlink(req.file.path, () => {});

    const parsed = parseGeminiNameplateResponse(responseText);
    if (!parsed) {
      console.warn(
        `[scanMeter] Gemini response wasn't valid JSON: ${responseText?.slice(0, 300)}`,
      );
      return res.status(200).send({
        message: "Could not extract details — please fill in manually",
        extracted: null,
        rawText: responseText || "",
      });
    }

    const extracted = {
      serialNumber: parsed.serialNumber || null,
      manufacturer: parsed.manufacturer || null,
      model: parsed.model || null,
      meterType:
        parsed.meterType === "digital" || parsed.meterType === "analogue"
          ? parsed.meterType
          : null,
      initialReading:
        parsed.initialReading !== null &&
        parsed.initialReading !== undefined &&
        parsed.initialReading !== "" &&
        !isNaN(parseFloat(parsed.initialReading))
          ? parseFloat(parsed.initialReading)
          : null,
      rawText: responseText,
      confidence: parsed.confidence || {},
    };

    console.log(
      `[scanMeter] Gemini nameplate read: serial="${extracted.serialNumber}" mfr="${extracted.manufacturer}" model="${extracted.model}" type="${extracted.meterType}" initialReading="${extracted.initialReading}"`,
    );

    return res.status(200).send({
      message: "Meter nameplate scanned successfully",
      extracted,
    });
  } catch (err) {
    console.error("Error in scanMeter:", err);
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    return res.status(400).send({ error: err.message });
  }
};

module.exports = scanMeter;
