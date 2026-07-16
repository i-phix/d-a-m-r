function extractFacilityId(value) {
  if (!value) return null;
  return value._id ? value._id : value;
}
function isFacilityMismatch(req, doc, facilityField = "facilityId") {
  if (!doc) return false;
  if (req.user?.role !== "editor") return false;
  const docFacilityId = extractFacilityId(doc[facilityField]);
  if (!docFacilityId) return false; // nothing to compare — don't false-deny
  return String(docFacilityId) !== String(req.user.facilityId);
}
function denyIfFacilityMismatch(req, res, doc, facilityField = "facilityId") {
  if (isFacilityMismatch(req, doc, facilityField)) {
    res.status(403).send({
      error: "You do not have access to this facility's data",
    });
    return true;
  }
  return false;
}

module.exports = {
  isFacilityMismatch,
  denyIfFacilityMismatch,
  extractFacilityId,
};
