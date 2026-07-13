const { GoogleGenAI, createPartFromBase64 } = require("@google/genai");
const {
  GEMINI_MODEL,
  AI_MESSAGES_ENABLED,
  GOOGLE_GENAI_USE_VERTEXAI,
  GOOGLE_CLOUD_PROJECT,
  GOOGLE_CLOUD_LOCATION,
} = process.env;
const VERTEX_READY =
  GOOGLE_GENAI_USE_VERTEXAI === "true" &&
  !!GOOGLE_CLOUD_PROJECT &&
  !!GOOGLE_CLOUD_LOCATION;

const ai = VERTEX_READY
  ? new GoogleGenAI({
      vertexai: true,
      project: GOOGLE_CLOUD_PROJECT,
      location: GOOGLE_CLOUD_LOCATION,
    })
  : null;

const MODEL = GEMINI_MODEL || "gemini-2.5-flash";
const MAX_CHARS = 141;
const MIN_CHARS = 20;
const REQUEST_TIMEOUT_MS = 12000;
const VISION_REQUEST_TIMEOUT_MS = 45000;

function isEnabled() {
  return AI_MESSAGES_ENABLED === "true" && VERTEX_READY;
}

function stripEmDashes(text) {
  return String(text || "")
    .replace(/\s*—\s*/g, ", ")
    .replace(/,\s*,/g, ",");
}

function truncateToLimit(text, max) {
  const trimmed = String(text || "").trim();
  if (trimmed.length <= max) return trimmed;
  let cut = trimmed.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > max * 0.6) cut = cut.slice(0, lastSpace);
  return cut.trim();
}

async function callGemini(prompt) {
  if (!isEnabled()) {
    throw new Error(
      "AI message generation not enabled — set AI_MESSAGES_ENABLED=true and GOOGLE_GENAI_USE_VERTEXAI/GOOGLE_CLOUD_PROJECT/GOOGLE_CLOUD_LOCATION in .env",
    );
  }
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error("Gemini request timed out")),
      REQUEST_TIMEOUT_MS,
    ),
  );

  try {
    const response = await Promise.race([
      ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          temperature: 0.9,
          maxOutputTokens: 500,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      timeoutPromise,
    ]);

    const text = response?.text;
    if (!text) {
      throw new Error(
        "Gemini API returned no text (possibly blocked by safety filters)",
      );
    }
    return text.trim();
  } catch (err) {
    const status = err?.status ? ` ${err.status}` : "";
    throw new Error(`Gemini API error${status}: ${err.message}`);
  }
}
async function callGeminiVision(prompt, imageBase64, mimeType) {
  if (!isEnabled()) {
    throw new Error(
      "AI vision not enabled — set AI_MESSAGES_ENABLED=true and GOOGLE_GENAI_USE_VERTEXAI/GOOGLE_CLOUD_PROJECT/GOOGLE_CLOUD_LOCATION in .env",
    );
  }

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error("Gemini vision request timed out")),
      VISION_REQUEST_TIMEOUT_MS,
    ),
  );

  try {
    const response = await Promise.race([
      ai.models.generateContent({
        model: MODEL,
        contents: [prompt, createPartFromBase64(imageBase64, mimeType)],
        config: {
          temperature: 0.1,
          maxOutputTokens: 500,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      timeoutPromise,
    ]);

    const text = response?.text;
    if (!text) {
      throw new Error(
        "Gemini API returned no text (possibly blocked by safety filters)",
      );
    }
    return text.trim();
  } catch (err) {
    const status = err?.status ? ` ${err.status}` : "";
    throw new Error(`Gemini API error${status}: ${err.message}`);
  }
}

function buildResidentMessagePrompt({
  residentName,
  facilityName,
  blockName,
  unitName,
  meterSerial,
  initialReading,
  isNewResident,
}) {
  const name = residentName || "Resident";

  if (isNewResident) {
    const location = [facilityName, blockName].filter(Boolean).join(", ");
    const meterLine = meterSerial
      ? `Water meter ${meterSerial} is already assigned (starting reading ${initialReading ?? 0} m³, day one, nothing to act on).`
      : `A water meter will be assigned shortly, they'll be notified when it happens.`;

    return `Write a warm, welcoming onboarding message for a new resident moving into a water-metered facility managed by DAMR/PayServe.

Resident: ${name}
Location: ${location || "the facility"}${unitName ? `, Unit ${unitName}` : ""}
${meterLine}

Requirements:
- The ENTIRE message must be 141 characters or fewer, including spaces and punctuation. This is a hard limit, count carefully before answering.
- One short, warm sentence (a second only if strictly necessary to fit).
- Briefly convey that bills/reminders come through this same channel.
- No markdown, no em dashes, no subject line, no sign-off.
- Start directly with "Dear ${name},"`;
  }

  return `Write a warm, brief message telling a resident a water meter was just assigned to their unit, from DAMR/PayServe, a water-utility billing service.

Resident: ${name}
Meter: ${meterSerial}
Starting reading: ${initialReading ?? 0} m³ (day one, nothing to act on)

Requirements:
- The ENTIRE message must be 141 characters or fewer, including spaces and punctuation. This is a hard limit, count carefully before answering.
- One short, warm, reassuring sentence (a second only if strictly necessary to fit).
- If it fits, briefly note future bills are based on this meter's readings.
- No markdown, no em dashes, no subject line, no sign-off.
- Start directly with "Dear ${name},"`;
}

async function generateResidentMessage({
  residentName,
  facilityName,
  blockName,
  unitName,
  meterSerial,
  initialReading,
  isNewResident = false,
}) {
  const params = {
    residentName,
    facilityName,
    blockName,
    unitName,
    meterSerial,
    initialReading,
    isNewResident,
  };
  const prompt = buildResidentMessagePrompt(params);

  let text = stripEmDashes(await callGemini(prompt));

  if (text.length > MAX_CHARS) {
    const retryPrompt = `${prompt}\n\nYour previous attempt was ${text.length} characters, too long: "${text}"\nRewrite so the ENTIRE message is 141 characters or fewer.`;
    try {
      const retryText = stripEmDashes(await callGemini(retryPrompt));
      if (retryText.length <= MAX_CHARS) text = retryText;
    } catch {}
  }

  if (text.length > MAX_CHARS) {
    text = truncateToLimit(text, MAX_CHARS);
  }

  if (text.length < MIN_CHARS) {
    throw new Error(
      `Gemini ${isNewResident ? "welcome" : "meter-assigned"} message too short (${text.length} chars)`,
    );
  }

  return text;
}

function buildFallbackNames(kind, count, label, numBasements) {
  if (!count || count <= 0) return [];

  if (kind === "floor") {
    let basementCount = Number.isInteger(numBasements) ? numBasements : 0;
    if (basementCount < 0) basementCount = 0;
    if (basementCount + 1 > count) basementCount = 0; // doesn't fit — degrade gracefully

    if (basementCount > 0) {
      const basements = Array.from(
        { length: basementCount },
        (_, i) => `B${basementCount - i}`, // B2, B1, ... (closest to ground last)
      );
      const remaining = count - basementCount - 1;
      return [
        ...basements,
        "G",
        ...Array.from({ length: remaining }, (_, i) => String(i + 1)),
      ];
    }
    if (count === 1) return ["G"];
    return ["G", ...Array.from({ length: count - 1 }, (_, i) => String(i + 1))];
  }

  const prefix = (label || "Block").trim();
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (count <= letters.length) {
    return Array.from({ length: count }, (_, i) => `${prefix} ${letters[i]}`);
  }
  return Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`);
}

function buildFallbackAdditionalFloorNames(count, existingNames) {
  let maxNum = null;
  for (const raw of existingNames || []) {
    const trimmed = String(raw).trim();
    if (/^\d+$/.test(trimmed)) {
      const n = parseInt(trimmed, 10);
      if (maxNum === null || n > maxNum) maxNum = n;
    }
  }
  const start = maxNum !== null ? maxNum + 1 : (existingNames || []).length;
  return Array.from({ length: count }, (_, i) => String(start + i));
}

module.exports = {
  isEnabled,
  generateResidentMessage,
  buildFallbackNames,
  buildFallbackAdditionalFloorNames,
  callGeminiVision,
};
