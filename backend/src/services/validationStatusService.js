const { getFlag: getFlagModel } = require("../utils/damrSchemas");
const { FLAG_TYPE_LABELS } = require("../utils/emailSmsService");

function statusFromFlag(flag) {
  if (!flag) {
    return { status: "passed", label: "Passed — within normal range" };
  }
  const flagLabel = FLAG_TYPE_LABELS[flag.type] || flag.type;
  if (flag.status === "resolved") {
    return { status: "cleared", label: `Reviewed & Cleared (${flagLabel})` };
  }
  return { status: "flagged", label: `Flagged: ${flagLabel}` };
}

/**
 * @param {string|ObjectId|null} readingId - Invoice.readingId
 * @returns {Promise<{status: "passed"|"flagged"|"cleared"|"unavailable", label: string}>}
 */
async function getValidationStatus(readingId) {
  if (!readingId) {
    return { status: "unavailable", label: "Not available for this bill" };
  }

  const Flag = getFlagModel();
  // Most recent flag on this reading, if more than one was ever raised
  // (e.g. an OCR mismatch followed later by a manual review flag).
  const flag = await Flag.findOne({ readingId }).sort({ createdAt: -1 }).lean();
  return statusFromFlag(flag);
}

/**
 * Batch version for list views (e.g. a resident's full bill history) — one
 * query for every reading instead of one query per invoice.
 * @param {Array<string|ObjectId|null>} readingIds
 * @returns {Promise<Map<string, {status, label}>>} keyed by String(readingId)
 */
async function getValidationStatusesForReadings(readingIds) {
  const ids = [...new Set((readingIds || []).filter(Boolean).map(String))];
  const result = new Map();
  if (!ids.length) return result;

  const Flag = getFlagModel();
  const flags = await Flag.find({ readingId: { $in: ids } })
    .sort({ createdAt: -1 })
    .lean();

  const flagByReading = new Map();
  for (const f of flags) {
    const key = String(f.readingId);
    if (!flagByReading.has(key)) flagByReading.set(key, f);
  }

  for (const id of ids) {
    result.set(id, statusFromFlag(flagByReading.get(id)));
  }
  return result;
}

module.exports = { getValidationStatus, getValidationStatusesForReadings };
