const { getFlag: getFlagModel } = require("../../utils/damrSchemas");
const { denyIfFacilityMismatch } = require("../../utils/accessControl");
const updateFlagNotes = async (req, res) => {
  try {
    const { notes } = req.body;

    if (!notes) {
      return res.status(400).send({ error: "Notes are required" });
    }

    const Flag = getFlagModel();

    const existing = await Flag.findById(req.params.id).lean();
    if (!existing) return res.status(404).send({ error: "Flag not found" });
    if (denyIfFacilityMismatch(req, res, existing)) return;

    const flag = await Flag.findByIdAndUpdate(
      req.params.id,
      { notes },
      { new: true },
    )
      .populate("meterId", "serialNumber")
      .populate("resolvedBy", "fullName");

    return res
      .status(200)
      .send({ message: "Flag notes updated successfully", flag });
  } catch (err) {
    console.error("Error in updateFlagNotes:", err);
    return res.status(400).send({ error: err.message });
  }
};
module.exports = updateFlagNotes;
