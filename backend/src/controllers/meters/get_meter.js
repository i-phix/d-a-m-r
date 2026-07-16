const {
  getMeter: getMeterModel,
  getLocation,
  getBlock,
} = require("../../utils/damrSchemas");
const { denyIfFacilityMismatch } = require("../../utils/accessControl");
const getMeter = async (req, res) => {
  try {
    getLocation();
    getBlock();
    const Meter = getMeterModel();

    const meter = await Meter.findById(req.params.id)
      .populate("unitId", "name status")
      .populate("facilityId", "name location")
      .populate("locationId", "name")
      .populate("blockId", "name")
      .populate("currentResident", "name phone email")
      .populate("lastReadingBy", "fullName email")
      .lean();

    if (!meter) {
      return res.status(404).send({ error: "Meter not found" });
    }
    if (denyIfFacilityMismatch(req, res, meter)) return;

    return res
      .status(200)
      .send({ message: "Meter fetched successfully", meter });
  } catch (err) {
    console.error("Error in getMeter:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = getMeter;
