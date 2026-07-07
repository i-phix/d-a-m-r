const db = require("../../utils/coreSchemas");
const getResidents = async (req, res) => {
  try {
    const { facilityId, unitId, status, page = 1, limit = 30 } = req.query;
    const filter = {};

    if (unitId) filter.unitId = unitId;
    if (status) filter.status = status;

    if (req.user.role === "editor") {
      filter.facilityId = req.user.facilityId;
    } else if (facilityId) {
      filter.facilityId = facilityId;
    }

    const [residents, total] = await Promise.all([
      db.Resident.find(filter)
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .populate("unitId", "name unitNumber")
        .populate("facilityId", "name")
        .lean(),
      db.Resident.countDocuments(filter),
    ]);

    return res
      .status(200)
      .send({ message: "Residents fetched successfully", residents, total });
  } catch (err) {
    console.error("Error in getResidents:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = getResidents;
