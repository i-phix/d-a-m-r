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
      // "location" here is the facility's own free-text location field
      // (set on the Facility form) — this is what the "Location" display
      // on the meter page uses, rather than the separate Location
      // collection/Block.locationId chain, which requires a manual
      // per-block assignment step that's easy to leave unset.
      .populate("facilityId", "name location")
      .populate("locationId", "name")
      .populate("blockId", "name")
      // Resident schema (coreSchemas.js) uses `name`/`phone`, not
      // `fullName`/`phoneNumber` — populating the wrong field names here
      // silently returned an empty object, which is why "Resident" always
      // showed blank even when a resident really was bound to the meter.
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
