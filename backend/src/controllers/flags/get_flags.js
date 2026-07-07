const { getFlag: getFlagModel } = require("../../utils/damrSchemas");
const { denyIfFacilityMismatch } = require("../../utils/accessControl");
const getFlags = async (req, res) => {
  try {
    const Flag = getFlagModel();
    if (req.isSingle) {
      const flag = await Flag.findById(req.params.id)
        .populate("meterId", "serialNumber meterType")
        .populate("readingId", "value readingDate method")
        .populate("resolvedBy", "fullName email")
        .lean();

      if (!flag) return res.status(404).send({ error: "Flag not found" });
      if (denyIfFacilityMismatch(req, res, flag)) return;
      return res
        .status(200)
        .send({ message: "Flag fetched successfully", flag });
    }
    const {
      status,
      type,
      meterId,
      facilityId,
      page = 1,
      limit = 30,
    } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (type) filter.type = type;
    if (meterId) filter.meterId = meterId;

    if (req.user.role === "editor") {
      filter.facilityId = req.user.facilityId;
    } else if (req.user.role === "Staff") {
      filter.staffId = req.user._id;
    } else if (facilityId) {
      filter.facilityId = facilityId;
    }
    const [flags, total] = await Promise.all([
      Flag.find(filter)
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .populate("meterId", "serialNumber meterType")
        .populate("readingId", "value readingDate method")
        .populate("resolvedBy", "fullName email")
        .lean(),
      Flag.countDocuments(filter),
    ]);

    return res
      .status(200)
      .send({ message: "Flags fetched successfully", flags, total });
  } catch (err) {
    console.error("Error in getFlags:", err);
    return res.status(400).send({ error: err.message });
  }
};
module.exports = getFlags;
