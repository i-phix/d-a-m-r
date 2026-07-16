const db = require("../../utils/coreSchemas");
const { getMeter: getMeterModel } = require("../../utils/damrSchemas");
const { assignMeterToUnit } = require("../../services/meterAssignmentService");
const { denyIfFacilityMismatch } = require("../../utils/accessControl");

const assignMeter = async (req, res) => {
  try {
    const { unitId } = req.body;

    if (!unitId) {
      return res.status(400).send({ error: "unitId is required" });
    }

    const Meter = getMeterModel();
    const unit = await db.Unit.findById(unitId).lean();
    if (!unit) {
      return res.status(404).send({ error: "Unit not found" });
    }
    if (denyIfFacilityMismatch(req, res, unit)) return;

    const meter = await Meter.findById(req.params.id);
    if (!meter) {
      return res.status(404).send({ error: "Meter not found" });
    }
    if (denyIfFacilityMismatch(req, res, meter)) return;

    if (meter.status === "ASSIGNED") {
      return res
        .status(400)
        .send({ error: "Meter is already assigned. Unassign it first." });
    }

    await assignMeterToUnit(meter, unit, { logPrefix: "[assignMeter] " });

    return res
      .status(200)
      .send({ message: "Meter assigned successfully", meter });
  } catch (err) {
    console.error("Error in assignMeter:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = assignMeter;
