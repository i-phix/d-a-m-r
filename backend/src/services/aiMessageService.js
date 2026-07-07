const { GoogleGenAI, createPartFromBase64 } = require("@google/genai");
const {
  GEMINI_MODEL,
  AI_MESSAGES_ENABLED,
  GOOGLE_GENAI_USE_VERTEXAI,
  GOOGLE_CLOUD_PROJECT,
  GOOGLE_CLOUD_LOCATION,
} = process.env;

// Gemini runs through Vertex AI now (standard GCP Cloud Billing), not a
// Gemini Developer API key — so there's no secret string to split/store
// here anymore. Auth is handled entirely by Application Default
// Credentials: locally that's the file `gcloud auth application-default
// login` writes; on a real server it should instead be a service-account
// JSON key referenced via the GOOGLE_APPLICATION_CREDENTIALS env var. No
// fallback — if project/location/the Vertex flag aren't all present,
// isEnabled() below is false and message generation is unavailable.
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

const MODEL = GEMINI_MODEL || "gemini-2.5-flash"; // gemini-2.0-flash was decommissioned June 1, 2026
const MIN_WORDS = 25;
const REQUEST_TIMEOUT_MS = 12000;
// Image analysis (e.g. meter OCR) runs slower than plain text: the base64
// photo itself has to upload, and Vertex AI's us-central1 region is a long
// round-trip from Kenya. 20s was cutting it too close — the last few real
// requests (thinking now disabled, so this is pure network + inference
// time) took 15-25s themselves within a larger ~15-25s total request time,
// so leave real headroom above that instead of nudging it up by inches.
const VISION_REQUEST_TIMEOUT_MS = 45000;

function isEnabled() {
  return AI_MESSAGES_ENABLED === "true" && VERTEX_READY;
}

function wordCount(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}
function stripEmDashes(text) {
  return String(text || "")
    .replace(/\s*—\s*/g, ", ")
    .replace(/,\s*,/g, ",");
}

async function callGemini(prompt) {
  if (!isEnabled()) {
    throw new Error(
      "AI message generation not enabled — set AI_MESSAGES_ENABLED=true and GOOGLE_GENAI_USE_VERTEXAI/GOOGLE_CLOUD_PROJECT/GOOGLE_CLOUD_LOCATION in .env",
    );
  }

  // Promise.race timeout instead of an SDK-specific abort option — @google/genai's
  // request-cancellation API isn't something to guess at, and this works regardless.
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
          // gemini-2.5-flash "thinks" by default, and those thinking tokens
          // are drawn from the SAME maxOutputTokens budget as the actual
          // answer — with dynamic thinking on, it could burn through most
          // or all of the 500 tokens above before writing a single word of
          // the real message, which is exactly why these were coming back
          // "too short" and falling back to the template. Disabling
          // thinking here reserves the full budget for the message itself
          // (this is plain templated prose generation, not a task that
          // benefits from step-by-step reasoning anyway).
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
    // @google/genai throws ApiError with .status/.message for API-side failures.
    const status = err?.status ? ` ${err.status}` : "";
    throw new Error(`Gemini API error${status}: ${err.message}`);
  }
}

// Same as callGemini, but for multimodal (image + text) prompts — used by
// ocrService.js to read meter photos. `imageBase64` is a base64-encoded
// image (no data: URL prefix), `mimeType` e.g. "image/jpeg".
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
          temperature: 0.1, // low temperature — this is extraction, not creative writing
          maxOutputTokens: 500,
          // Same reasoning-token-eats-the-budget issue as callGemini above —
          // disable thinking so the JSON answer doesn't get cut off mid-string.
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

// Welcome / onboarding message
async function generateWelcomeMessage({
  residentName,
  facilityName,
  blockName,
  unitName,
  meterSerial,
  initialReading,
}) {
  const location =
    [facilityName, blockName].filter(Boolean).join(", ") || "the facility";
  const meterDetail = meterSerial
    ? `They have already been assigned water meter number ${meterSerial}, with an initial reading of ${initialReading ?? 0} cubic meters recorded as their starting point (this reading just marks day one — nothing for them to act on).`
    : `A water meter has not been assigned to their unit yet, so mention it will follow shortly and they'll be notified when it happens.`;

  const prompt = `Write a warm, welcoming, friendly onboarding message for a new resident moving into a water-metered residential facility managed by DAMR/PayServe.

Details to weave in naturally:
- Resident name: ${residentName || "Resident"}
- Facility/location: ${location}
- Unit number: ${unitName || "—"}
- ${meterDetail}

Requirements:
- At least 30 words but no more than about 50, written as flowing prose (a short paragraph or two).
- Warm, welcoming, genuinely friendly tone, like a caring property team, not corporate or robotic.
- Naturally mention that future water bills and payment reminders will come through the same channel (SMS/email).
- Invite them to reach out to their facility management team with any questions.
- Do NOT use markdown formatting (no asterisks, no headers, no bullet points), plain prose only.
- Do NOT use em dashes (the "—" character) anywhere; use a comma, period, or parentheses instead.
- Do NOT include a subject line, greeting salutation like "Subject:", or sign-off/signature block.
- Start directly with "Dear ${residentName || "Resident"},"`;

  const text = stripEmDashes(await callGemini(prompt));
  if (wordCount(text) < MIN_WORDS) {
    throw new Error(
      `Gemini welcome message too short (${wordCount(text)} words)`,
    );
  }
  return text;
}

//Meter-assigned message
async function generateMeterAssignedMessage({
  residentName,
  meterSerial,
  initialReading,
}) {
  const prompt = `Write a warm, friendly message to a resident letting them know a water meter has just been assigned to their unit, from DAMR/PayServe, a water-utility billing service.

Details to weave in naturally:
- Resident name: ${residentName || "Resident"}
- Meter number: ${meterSerial}
- Initial reading: ${initialReading ?? 0} cubic meters (this is just their starting point/day one — no usage before this counts)

Requirements:
- At least 30 words but no more than about 50, written as flowing prose (a short paragraph or two).
- Warm, friendly, reassuring tone.
- Explain briefly that future bills will be based on actual readings from this meter, so it's transparent and easy to track.
- Encourage them to reach out to their facility team if they ever notice anything unusual, like a sudden spike or a possible leak.
- Do NOT use markdown formatting (no asterisks, no headers, no bullet points), plain prose only.
- Do NOT use em dashes (the "—" character) anywhere; use a comma, period, or parentheses instead.
- Do NOT include a subject line or sign-off/signature block.
- Start directly with "Dear ${residentName || "Resident"},"`;

  const text = stripEmDashes(await callGemini(prompt));
  if (wordCount(text) < MIN_WORDS) {
    throw new Error(
      `Gemini meter-assigned message too short (${wordCount(text)} words)`,
    );
  }
  return text;
}

// ── Deterministic block/floor naming (no AI involved) ──────────────────
// Block/floor naming used to be routed through Gemini with a free-text
// "description" field it would interpret. That's been removed entirely —
// naming is now driven only by explicit fields (count, an optional name
// prefix, an optional number of basements), so the result is always
// predictable and never depends on an external API being up.

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
    // No basements — "ground then ascending" is the standard convention.
    if (count === 1) return ["G"];
    return ["G", ...Array.from({ length: count - 1 }, (_, i) => String(i + 1))];
  }

  // block/court/wing/division/etc — respect the facility's own label if
  // one was supplied, so a "Wing"-labelled facility gets "Wing A", not
  // "Block A".
  const prefix = (label || "Block").trim();
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (count <= letters.length) {
    return Array.from({ length: count }, (_, i) => `${prefix} ${letters[i]}`);
  }
  return Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`);
}

// Continuation naming for floors added to a block that already has some —
// e.g. raising "Number of Floors" on an existing block via Edit. Always
// continues straight up from the highest existing plain-numbered floor
// (new floors are added on top, so basement numbering doesn't apply here).
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
  generateWelcomeMessage,
  generateMeterAssignedMessage,
  buildFallbackNames,
  buildFallbackAdditionalFloorNames,
  callGeminiVision,
};
