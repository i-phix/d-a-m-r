// Roadmap Phase 8 — audit fix. List endpoints (getMeters, getInvoices,
// getFlags, etc.) already scope an "editor" (FM) role to their own facility
// via `filter.facilityId = req.user.facilityId`. But every single-item
// fetch-by-:id endpoint skipped that check entirely — an FM who knew or
// guessed another facility's meter/invoice/flag/resident ID could fetch (or
// in a few cases, mutate) it directly. This is a small shared helper so the
// same check doesn't get re-implemented slightly differently in each file.

/**
 * Returns the facilityId to compare against, whether `doc.facilityId` is a
 * raw ObjectId or a populated `{ _id, name }` sub-document.
 */
function extractFacilityId(value) {
  if (!value) return null;
  return value._id ? value._id : value;
}

/**
 * True if this request should be denied — only ever true for the "editor"
 * (FM) role, and only when the document's facility doesn't match theirs.
 * Admin and Staff are unaffected (Staff has its own, separate scoping via
 * staffId elsewhere; admin sees everything by design).
 */
function isFacilityMismatch(req, doc, facilityField = "facilityId") {
  if (!doc) return false;
  if (req.user?.role !== "editor") return false;
  const docFacilityId = extractFacilityId(doc[facilityField]);
  if (!docFacilityId) return false; // nothing to compare — don't false-deny
  return String(docFacilityId) !== String(req.user.facilityId);
}

/**
 * Convenience wrapper for controllers: checks the mismatch and, if denied,
 * sends the 403 itself and returns true so the caller can `if (...) return;`.
 * Returns false (and sends nothing) when access is fine.
 */
function denyIfFacilityMismatch(req, res, doc, facilityField = "facilityId") {
  if (isFacilityMismatch(req, doc, facilityField)) {
    res.status(403).send({
      error: "You do not have access to this facility's data",
    });
    return true;
  }
  return false;
}

module.exports = { isFacilityMismatch, denyIfFacilityMismatch, extractFacilityId };
