const db = require("../../utils/coreSchemas");
const {
  getBlock,
  getFloor,
  getFacilitySettings,
  getUnitMeta,
  getMeter,
} = require("../../utils/damrSchemas");
const { createBlockGroup } = require("../../services/hierarchyService");
const { buildFallbackAdditionalFloorNames } = require("../../services/aiMessageService");
const { denyIfFacilityMismatch } = require("../../utils/accessControl");
const createBlock = async (req, res) => {
  try {
    const {
      name,
      facilityId,
      locationId,
      type,
      count,
      numFloors,
      numBasements,
    } = req.body;
    if (!facilityId) {
      return res.status(400).send({ error: "facilityId is required" });
    }

    let resolvedType = type;
    if (!resolvedType) {
      const FacilitySettings = getFacilitySettings();
      const settings = await FacilitySettings.findOne({ facilityId }).lean();
      resolvedType = settings?.blockLabel || "Block";
    }

    const created = await createBlockGroup({
      facilityId,
      type: resolvedType,
      count: count || 1,
      numFloors,
      numBasements,
      singleName: name,
      userId: req.user._id,
    });
    if (locationId) {
      const Block = getBlock();
      await Block.updateMany(
        { _id: { $in: created.map((b) => b._id) } },
        { $set: { locationId } },
      );
    }

    return res.status(200).send({
      message: `${created.length > 1 ? `${created.length} ${resolvedType}s` : resolvedType} created successfully`,
      blocks: created,
      block: created[0],
      floors: created[0]?.floors || [],
    });
  } catch (err) {
    console.error("Error in createBlock:", err);
    return res.status(400).send({ error: err.message });
  }
};

const getBlocks = async (req, res) => {
  try {
    const { facilityId } = req.query;
    const Block = getBlock();
    const filter = {};

    if (req.user.role === "editor") {
      filter.facilityId = req.user.facilityId;
    } else if (facilityId) {
      filter.facilityId = facilityId;
    }

    const blocks = await Block.find(filter)
      .sort({ type: 1, name: 1 })
      .populate("facilityId", "name")
      .lean();
    const Floor = getFloor();
    const floorCounts = await Floor.aggregate([
      { $match: { blockId: { $in: blocks.map((b) => b._id) } } },
      { $group: { _id: "$blockId", count: { $sum: 1 } } },
    ]);
    const countByBlock = new Map(
      floorCounts.map((f) => [String(f._id), f.count]),
    );

    const FacilitySettings = getFacilitySettings();
    const settingsRows = await FacilitySettings.find({
      facilityId: { $in: blocks.map((b) => b.facilityId?._id || b.facilityId) },
    }).lean();
    const labelByFacility = new Map(
      settingsRows.map((s) => [String(s.facilityId), s.blockLabel]),
    );
    const blockIds = blocks.map((b) => b._id);
    const UnitMeta = getUnitMeta();
    const unitMetas = await UnitMeta.find({ blockId: { $in: blockIds } })
      .select("blockId unitId")
      .lean();
    const unitIdsByBlock = new Map();
    for (const m of unitMetas) {
      const key = String(m.blockId);
      if (!unitIdsByBlock.has(key)) unitIdsByBlock.set(key, []);
      unitIdsByBlock.get(key).push(m.unitId);
    }
    const allUnitIds = unitMetas.map((m) => m.unitId);
    const units = await db.Unit.find({ _id: { $in: allUnitIds } })
      .select("status")
      .lean();
    const statusByUnit = new Map(units.map((u) => [String(u._id), u.status]));

    const Meter = getMeter();
    const meterCounts = await Meter.aggregate([
      { $match: { blockId: { $in: blockIds }, status: "ASSIGNED" } },
      { $group: { _id: "$blockId", count: { $sum: 1 } } },
    ]);
    const meterCountByBlock = new Map(
      meterCounts.map((m) => [String(m._id), m.count]),
    );

    const blocksWithFloorCount = blocks.map((b) => {
      const unitIds = unitIdsByBlock.get(String(b._id)) || [];
      const occupiedCount = unitIds.filter(
        (id) => statusByUnit.get(String(id)) === "OCCUPIED",
      ).length;
      return {
        ...b,
        floorCount: countByBlock.get(String(b._id)) || 0,
        type:
          b.type ||
          labelByFacility.get(String(b.facilityId?._id || b.facilityId)) ||
          "Block",
        unitsCount: unitIds.length,
        occupiedCount,
        unoccupiedCount: unitIds.length - occupiedCount,
        metersInstalled: meterCountByBlock.get(String(b._id)) || 0,
      };
    });

    return res.status(200).send({
      message: "Blocks fetched successfully",
      blocks: blocksWithFloorCount,
    });
  } catch (err) {
    console.error("Error in getBlocks:", err);
    return res.status(400).send({ error: err.message });
  }
};
async function adjustFloorCount(block, targetNumFloors, userId) {
  const Floor = getFloor();
  const existing = await Floor.find({ blockId: block._id }).sort({ order: 1 });
  const currentCount = existing.length;

  if (targetNumFloors === currentCount) {
    return { floorCount: currentCount, floorsAdded: 0, floorsRemoved: 0 };
  }

  if (targetNumFloors > currentCount) {
    const toAdd = targetNumFloors - currentCount;
    const startOrder = currentCount;
    // Deterministic continuation only — new floors are added on top of the
    // existing ones, continuing the plain ascending-number convention.
    const names = buildFallbackAdditionalFloorNames(
      toAdd,
      existing.map((f) => f.name),
    );
    const newFloors = names.map((name, i) => ({
      name,
      blockId: block._id,
      facilityId: block.facilityId,
      order: startOrder + i,
      createdBy: userId,
    }));
    await Floor.insertMany(newFloors);
    return {
      floorCount: targetNumFloors,
      floorsAdded: toAdd,
      floorsRemoved: 0,
    };
  }

  const toRemove = existing.slice(targetNumFloors);
  const removeIds = toRemove.map((f) => f._id);
  const UnitMeta = getUnitMeta();
  await UnitMeta.updateMany(
    { floorId: { $in: removeIds } },
    { $set: { floorId: null } },
  );
  await Floor.deleteMany({ _id: { $in: removeIds } });
  return {
    floorCount: targetNumFloors,
    floorsAdded: 0,
    floorsRemoved: removeIds.length,
  };
}
async function adjustUnitCount(block, targetNumUnits, userId) {
  const UnitMeta = getUnitMeta();
  const metas = await UnitMeta.find({ blockId: block._id }).lean();
  const currentCount = metas.length;

  if (targetNumUnits === currentCount) {
    return {
      unitsCount: currentCount,
      unitsAdded: 0,
      unitsRemoved: 0,
      unitsShortfall: 0,
    };
  }

  if (targetNumUnits > currentCount) {
    const toAdd = targetNumUnits - currentCount;
    for (let i = 0; i < toAdd; i++) {
      const seq = currentCount + i + 1;
      const unit = await db.Unit.create({
        name: `${block.name} Unit ${seq}`,
        facilityId: block.facilityId,
        unitType: "Residential",
        division: block.name,
        floorUnitNo: `TBD-${seq}`,
        status: "VACANT",
        waterRate: 80,
      });
      await UnitMeta.create({
        unitId: unit._id,
        blockId: block._id,
        createdBy: userId,
      });
    }
    return {
      unitsCount: targetNumUnits,
      unitsAdded: toAdd,
      unitsRemoved: 0,
      unitsShortfall: 0,
    };
  }
  const toRemoveCount = currentCount - targetNumUnits;
  const unitIds = metas.map((m) => m.unitId);
  const vacantUnits = await db.Unit.find({
    _id: { $in: unitIds },
    status: "VACANT",
  })
    .select("_id createdAt")
    .sort({ createdAt: -1 })
    .lean();

  const Meter = getMeter();
  const metered = await Meter.find({
    unitId: { $in: vacantUnits.map((u) => u._id) },
  })
    .select("unitId")
    .lean();
  const meteredIds = new Set(metered.map((m) => String(m.unitId)));
  const eligible = vacantUnits.filter((u) => !meteredIds.has(String(u._id)));
  const toRemove = eligible.slice(0, toRemoveCount);
  const removeIds = toRemove.map((u) => u._id);

  if (removeIds.length) {
    await UnitMeta.deleteMany({ unitId: { $in: removeIds } });
    await db.Unit.deleteMany({ _id: { $in: removeIds } });
  }

  return {
    unitsCount: currentCount - removeIds.length,
    unitsAdded: 0,
    unitsRemoved: removeIds.length,
    unitsShortfall: toRemoveCount - removeIds.length,
  };
}
const updateBlock = async (req, res) => {
  try {
    const { name, type, numFloors, numUnits, locationId } = req.body;
    const Block = getBlock();
    const block = await Block.findById(req.params.id);
    if (!block) {
      return res.status(404).send({ error: "Complex not found" });
    }

    const update = {};
    if (locationId !== undefined) {
      update.locationId = locationId || null;
    }
    if (name !== undefined) {
      const trimmedName = String(name).trim();
      if (!trimmedName) {
        return res.status(400).send({ error: "Name cannot be empty" });
      }
      if (trimmedName.toLowerCase() !== block.name.toLowerCase()) {
        const escaped = trimmedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const clash = await Block.findOne({
          _id: { $ne: block._id },
          facilityId: block.facilityId,
          name: new RegExp(`^${escaped}$`, "i"),
        }).lean();
        if (clash) {
          return res.status(400).send({
            error: `"${trimmedName}" already exists in this facility — choose a different name.`,
          });
        }
      }
      update.name = trimmedName;
    }
    if (type !== undefined) {
      const trimmedType = String(type).trim();
      if (!trimmedType) {
        return res.status(400).send({ error: "Type cannot be empty" });
      }
      update.type = trimmedType;
    }

    let targetNumFloors;
    if (numFloors !== undefined) {
      targetNumFloors = Number(numFloors);
      if (!Number.isInteger(targetNumFloors) || targetNumFloors < 1) {
        return res
          .status(400)
          .send({ error: "Number of floors must be a whole number >= 1" });
      }
    }

    let targetNumUnits;
    if (numUnits !== undefined) {
      targetNumUnits = Number(numUnits);
      if (!Number.isInteger(targetNumUnits) || targetNumUnits < 0) {
        return res
          .status(400)
          .send({ error: "Number of units must be a whole number >= 0" });
      }
    }

    if (
      Object.keys(update).length === 0 &&
      targetNumFloors === undefined &&
      targetNumUnits === undefined
    ) {
      return res.status(400).send({
        error:
          "Nothing to update — provide a name, type, number of floors, and/or number of units",
      });
    }

    if (Object.keys(update).length > 0) {
      Object.assign(block, update);
      await block.save();
    }

    // Meters already assigned in this block store a locationId snapshot
    // (see assign_meter.js) rather than resolving it live — keep that
    // snapshot in sync whenever the block's own location changes, so
    // existing meters don't go stale/blank.
    if (locationId !== undefined) {
      const Meter = getMeter();
      await Meter.updateMany(
        { blockId: block._id },
        { $set: { locationId: locationId || null } },
      );
    }

    let floorResult = null;
    if (targetNumFloors !== undefined) {
      floorResult = await adjustFloorCount(block, targetNumFloors, req.user._id);
    }

    let unitResult = null;
    if (targetNumUnits !== undefined) {
      unitResult = await adjustUnitCount(block, targetNumUnits, req.user._id);
    }

    const messageParts = ["Complex updated successfully"];
    if (floorResult?.floorsAdded)
      messageParts.push(`${floorResult.floorsAdded} floor(s) added`);
    if (floorResult?.floorsRemoved)
      messageParts.push(`${floorResult.floorsRemoved} floor(s) removed`);
    if (unitResult?.unitsAdded)
      messageParts.push(`${unitResult.unitsAdded} unit(s) added`);
    if (unitResult?.unitsRemoved)
      messageParts.push(`${unitResult.unitsRemoved} unit(s) removed`);
    if (unitResult?.unitsShortfall) {
      messageParts.push(
        `${unitResult.unitsShortfall} unit(s) could not be removed (occupied or metered)`,
      );
    }

    return res.status(200).send({
      message: messageParts.join(" — "),
      block: block.toObject(),
      floorCount: floorResult?.floorCount,
      unitsCount: unitResult?.unitsCount,
    });
  } catch (err) {
    console.error("Error in updateBlock:", err);
    return res.status(400).send({ error: err.message });
  }
};

const getFloors = async (req, res) => {
  try {
    const { blockId, facilityId } = req.query;
    if (!blockId && !facilityId) {
      return res
        .status(400)
        .send({ error: "blockId or facilityId is required" });
    }
    const Floor = getFloor();
    const filter = {};
    if (blockId) filter.blockId = blockId;
    if (facilityId) filter.facilityId = facilityId;
    if (req.user.role === "editor") {
      filter.facilityId = req.user.facilityId;
    }

    const floors = await Floor.find(filter).sort({ order: 1, name: 1 }).lean();

    return res
      .status(200)
      .send({ message: "Floors fetched successfully", floors });
  } catch (err) {
    console.error("Error in getFloors:", err);
    return res.status(400).send({ error: err.message });
  }
};

const deleteBlock = async (req, res) => {
  try {
    const Block = getBlock();
    const block = await Block.findById(req.params.id);
    if (!block) return res.status(404).send({ error: "Complex not found" });
    if (denyIfFacilityMismatch(req, res, block)) return;

    const UnitMeta = getUnitMeta();
    const unitCount = await UnitMeta.countDocuments({ blockId: block._id });
    if (unitCount > 0) {
      return res.status(400).send({
        error: `Cannot delete — ${unitCount} unit(s) are still assigned to this complex. Lower "Number of Units" to 0 via Edit, or reassign them to another complex, first.`,
      });
    }

    const Floor = getFloor();
    await Floor.deleteMany({ blockId: block._id });
    await Block.findByIdAndDelete(block._id);

    return res.status(200).send({ message: "Complex deleted successfully" });
  } catch (err) {
    console.error("Error in deleteBlock:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = {
  createBlock,
  getBlocks,
  updateBlock,
  getFloors,
  deleteBlock,
};
