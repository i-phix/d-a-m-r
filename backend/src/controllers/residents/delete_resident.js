const db = require("../../utils/coreSchemas");
const {
  getMeter: getMeterModel,
  getMeterBinding,
  getOccupancyHistory,
} = require("../../utils/damrSchemas");
const { denyIfFacilityMismatch } = require("../../utils/accessControl");

const deleteResident = async (req, res) => {
  try {
    const { moveOutReason } = req.body || {};

    const resident = await db.Resident.findById(req.params.id);
    if (!resident) return res.status(404).send({ error: "Resident not found" });
    if (denyIfFacilityMismatch(req, res, resident)) return;
    if (resident.status === "Inactive")
      return res.status(400).send({ error: "Resident is already inactive" });

    const Meter = getMeterModel();
    const MeterBinding = getMeterBinding();
    const OccupancyHistory = getOccupancyHistory();

    await db.Resident.findByIdAndUpdate(resident._id, {
      status: "Inactive",
    });

    await OccupancyHistory.findOneAndUpdate(
      { residentId: resident._id, moveOutDate: null },
      {
        moveOutDate: new Date(),
        moveOutReason: moveOutReason || "other",
        recordedBy: req.user._id,
      },
    );

    // Vacate unit — clear residentId (payservedb field)
    await db.Unit.findByIdAndUpdate(resident.unitId, {
      status: "VACANT",
      residentId: null,
    });

    const meter = await Meter.findOne({ unitId: resident.unitId });
    if (meter) {
      await Meter.findByIdAndUpdate(meter._id, {
        currentResident: null,
      });
      await MeterBinding.findOneAndUpdate(
        { residentId: resident._id, active: true },
        { active: false, unbindDate: new Date() },
      );
    }
    const linkedUser = await db.User.findOne({ email: resident.email });
    if (linkedUser) {
      await db.User.findByIdAndUpdate(linkedUser._id, {
        isEnabled: false,
      });
    }

    return res.status(200).send({ message: "Resident moved out successfully" });
  } catch (err) {
    console.error("Error in deleteResident:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = deleteResident;
