const { getMeter } = require("../../utils/damrSchemas");
const getMeters = async (req, res) => {
  try {
    const { status, facilityId, page = 1, limit = 50 } = req.query;
    const Meter = getMeter();
    const filter = {};

    if (status) filter.status = status;
    if (req.user.role === "editor") {
      filter.facilityId = req.user.facilityId;
    } else if (facilityId) {
      filter.facilityId = facilityId;
    }

    const [meters, total] = await Promise.all([
      Meter.find(filter)
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .populate("unitId", "name")
        .populate("facilityId", "name")
        .populate("currentResident", "fullName phoneNumber")
        .lean(),
      Meter.countDocuments(filter),
    ]);

    return res
      .status(200)
      .send({ message: "Meters fetched successfully", meters, total });
  } catch (err) {
    console.error("Error in getMeters:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = getMeters;
