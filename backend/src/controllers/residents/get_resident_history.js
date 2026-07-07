const db = require("../../utils/coreSchemas");
const { getOccupancyHistory } = require("../../utils/damrSchemas");
const { denyIfFacilityMismatch } = require("../../utils/accessControl");
const getResidentHistory = async (req, res) => {
  try {
    const OccupancyHistory = getOccupancyHistory();
    const resident = await db.Resident.findById(req.params.id)
      .populate("unitId", "name unitNumber status")
      .populate("facilityId", "name")
      .lean();

    if (!resident) return res.status(404).send({ error: "Resident not found" });
    if (denyIfFacilityMismatch(req, res, resident)) return;

    if (req.isHistory) {
      const history = await OccupancyHistory.find({ residentId: req.params.id })
        .sort({ moveInDate: -1 })
        .populate("unitId", "name unitNumber")
        .populate("recordedBy", "fullName email")
        .lean();

      return res
        .status(200)
        .send({ message: "Occupancy history fetched successfully", history });
    }
    const latestOccupancy = await OccupancyHistory.findOne({
      residentId: req.params.id,
    })
      .sort({ moveInDate: -1 })
      .lean();

    return res.status(200).send({
      message: "Resident fetched successfully",
      resident,
      latestOccupancy: latestOccupancy || null,
    });
  } catch (err) {
    console.error("Error in getResidentHistory:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = getResidentHistory;
