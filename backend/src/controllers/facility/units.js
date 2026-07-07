const db = require("../../utils/coreSchemas");
const { denyIfFacilityMismatch } = require("../../utils/accessControl");
const {
  getUnitMeta: getUnitMetaModel,
  getMeter: getMeterModel,
} = require("../../utils/damrSchemas");
async function attachUnitMeta(units) {
  const UnitMeta = getUnitMetaModel();
  const metas = await UnitMeta.find({
    unitId: { $in: units.map((u) => u._id) },
  })
    .populate("blockId", "name")
    .populate("floorId", "name")
    .lean();
  const metaByUnit = new Map(metas.map((m) => [String(m.unitId), m]));
  return units.map((u) => {
    const meta = metaByUnit.get(String(u._id));
    return {
      ...u,
      blockId: meta?.blockId?._id || null,
      blockName: meta?.blockId?.name || null,
      floorId: meta?.floorId?._id || null,
      floorName: meta?.floorId?.name || null,
      floor: meta?.floor ?? null,
    };
  });
}

async function upsertUnitMeta(unitId, { blockId, floorId, floor }) {
  const UnitMeta = getUnitMetaModel();
  const hasNothing =
    !blockId &&
    !floorId &&
    (floor === undefined || floor === null || floor === "");
  if (hasNothing) {
    await UnitMeta.deleteOne({ unitId });
    return { blockId: null, floorId: null, floor: null };
  }
  const meta = await UnitMeta.findOneAndUpdate(
    { unitId },
    {
      $set: {
        blockId: blockId || null,
        floorId: floorId || null,
        floor: floor === "" || floor == null ? null : String(floor),
      },
    },
    { upsert: true, new: true },
  ).lean();
  return {
    blockId: meta.blockId || null,
    floorId: meta.floorId || null,
    floor: meta.floor ?? null,
  };
}

const createUnit = async (req, res) => {
  try {
    const {
      name,
      facilityId,
      blockId,
      floorId,
      unitType,
      division,
      floorUnitNo,
      waterRate,
      floor,
    } = req.body;

    if (!name || !facilityId || !unitType || !division || !floorUnitNo) {
      return res.status(400).send({
        error:
          "Name, facility, unit type, division and floor/unit number are required",
      });
    }

    const unit = await db.Unit.create({
      name: name.trim(),
      facilityId,
      unitType: unitType.trim(),
      division: division.trim(),
      floorUnitNo: floorUnitNo.trim(),
      status: "VACANT",
      waterRate: waterRate || 80,
    });

    const meta = await upsertUnitMeta(unit._id, { blockId, floorId, floor });

    return res.status(200).send({
      message: "Unit created successfully",
      unit: { ...unit.toObject(), ...meta },
    });
  } catch (err) {
    console.error("Error in createUnit:", err);
    return res.status(400).send({ error: err.message });
  }
};

const getUnits = async (req, res) => {
  try {
    const { facilityId, blockId, floorId, status, noMeter } = req.query;
    const filter = {};
    if (blockId || floorId) {
      const UnitMeta = getUnitMetaModel();
      const metaFilter = {};
      if (blockId) metaFilter.blockId = blockId;
      if (floorId) metaFilter.floorId = floorId;
      const metas = await UnitMeta.find(metaFilter).select("unitId").lean();
      filter._id = { $in: metas.map((m) => m.unitId) };
    }
    if (status) filter.status = status;
    if (noMeter === "true") filter.meterId = null;

    if (req.user.role === "editor") {
      filter.facilityId = req.user.facilityId;
    } else if (facilityId) {
      filter.facilityId = facilityId;
    }

    const units = await db.Unit.find(filter)
      .sort({ name: 1 })
      .populate("facilityId", "name")
      .lean();

    const unitsWithMeta = await attachUnitMeta(units);

    return res
      .status(200)
      .send({ message: "Units fetched successfully", units: unitsWithMeta });
  } catch (err) {
    console.error("Error in getUnits:", err);
    return res.status(400).send({ error: err.message });
  }
};

const getUnit = async (req, res) => {
  try {
    const unit = await db.Unit.findById(req.params.id)
      .populate("facilityId", "name")
      .lean();

    if (!unit) return res.status(404).send({ error: "Unit not found" });
    if (denyIfFacilityMismatch(req, res, unit)) return;

    const [unitWithMeta] = await attachUnitMeta([unit]);
    return res
      .status(200)
      .send({ message: "Unit fetched successfully", unit: unitWithMeta });
  } catch (err) {
    console.error("Error in getUnit:", err);
    return res.status(400).send({ error: err.message });
  }
};

const updateUnit = async (req, res) => {
  try {
    const existing = await db.Unit.findById(req.params.id).lean();
    if (!existing) return res.status(404).send({ error: "Unit not found" });
    if (denyIfFacilityMismatch(req, res, existing)) return;
    const { blockId, floorId, floor, ...unitUpdate } = req.body;
    const unit = await db.Unit.findByIdAndUpdate(req.params.id, unitUpdate, {
      new: true,
    });

    let meta;
    if (blockId !== undefined || floorId !== undefined || floor !== undefined) {
      const [current] = await attachUnitMeta([unit.toObject()]);
      meta = await upsertUnitMeta(req.params.id, {
        blockId: blockId !== undefined ? blockId : current.blockId,
        floorId: floorId !== undefined ? floorId : current.floorId,
        floor: floor !== undefined ? floor : current.floor,
      });
    } else {
      const [unitWithMeta] = await attachUnitMeta([unit.toObject()]);
      meta = {
        blockId: unitWithMeta.blockId,
        floorId: unitWithMeta.floorId,
        floor: unitWithMeta.floor,
      };
    }

    return res.status(200).send({
      message: "Unit updated successfully",
      unit: { ...unit.toObject(), ...meta },
    });
  } catch (err) {
    console.error("Error in updateUnit:", err);
    return res.status(400).send({ error: err.message });
  }
};

const deleteUnit = async (req, res) => {
  try {
    const unit = await db.Unit.findById(req.params.id);
    if (!unit) return res.status(404).send({ error: "Unit not found" });
    if (denyIfFacilityMismatch(req, res, unit)) return;

    if (unit.status === "OCCUPIED" || unit.residentId) {
      return res.status(400).send({
        error:
          "Cannot delete an occupied unit — move the resident out first.",
      });
    }

    const Meter = getMeterModel();
    const meter = await Meter.findOne({ unitId: unit._id }).lean();
    if (meter) {
      return res.status(400).send({
        error: `Cannot delete — meter ${meter.serialNumber} is still assigned to this unit. Unassign it first.`,
      });
    }

    const UnitMeta = getUnitMetaModel();
    await UnitMeta.deleteOne({ unitId: unit._id });
    await db.Unit.findByIdAndDelete(unit._id);

    return res.status(200).send({ message: "Unit deleted successfully" });
  } catch (err) {
    console.error("Error in deleteUnit:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = { createUnit, getUnits, getUnit, updateUnit, deleteUnit };
