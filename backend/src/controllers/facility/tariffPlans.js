const { getTariffPlan } = require("../../utils/damrSchemas");

function validateBands(bands) {
  if (!Array.isArray(bands) || bands.length === 0) {
    return "At least one tariff band is required";
  }
  const last = bands[bands.length - 1];
  if (last.upTo !== null && last.upTo !== undefined) {
    return "The last band must be unbounded (upTo: null)";
  }
  for (const band of bands) {
    if (typeof band.rate !== "number" || band.rate < 0) {
      return "Every band needs a non-negative numeric rate";
    }
  }
  return null;
}

const createTariffPlan = async (req, res) => {
  try {
    const {
      name,
      facilityId,
      blockId,
      unitType,
      bands,
      minimumCharge,
      sewerageRate,
      techFee,
      penaltyEnabled,
      penaltyType,
      penaltyValue,
      dueDateOffsetDays,
      reminderDaysBefore,
      paybillShortCode,
    } = req.body;

    if (!name || !facilityId) {
      return res
        .status(400)
        .send({ error: "name and facilityId are required" });
    }
    if (blockId && unitType) {
      return res.status(400).send({
        error:
          "A tariff plan can be scoped to a block OR a unit category, not both",
      });
    }

    const bandError = validateBands(bands);
    if (bandError) return res.status(400).send({ error: bandError });

    const TariffPlan = getTariffPlan();
    const scopeFilter = {
      facilityId,
      active: true,
      blockId: blockId || null,
      unitType: unitType || null,
    };
    await TariffPlan.updateMany(scopeFilter, { $set: { active: false } });

    const plan = await TariffPlan.create({
      name: name.trim(),
      facilityId,
      blockId: blockId || null,
      unitType: unitType || null,
      bands,
      minimumCharge,
      sewerageRate,
      techFee,
      penaltyEnabled,
      penaltyType,
      penaltyValue,
      dueDateOffsetDays,
      reminderDaysBefore,
      paybillShortCode: paybillShortCode || null,
      active: true,
      createdBy: req.user._id,
    });

    return res
      .status(200)
      .send({ message: "Tariff plan created successfully", plan });
  } catch (err) {
    console.error("Error in createTariffPlan:", err);
    return res.status(400).send({ error: err.message });
  }
};

const getTariffPlans = async (req, res) => {
  try {
    const { facilityId, blockId, unitType } = req.query;
    const TariffPlan = getTariffPlan();
    const filter = {};

    if (req.user.role === "editor") {
      filter.facilityId = req.user.facilityId;
    } else if (facilityId) {
      filter.facilityId = facilityId;
    }
    if (blockId) filter.blockId = blockId;
    if (unitType) filter.unitType = unitType;

    const plans = await TariffPlan.find(filter)
      .sort({ createdAt: -1 })
      .populate("facilityId", "name")
      .populate("blockId", "name")
      .lean();

    return res
      .status(200)
      .send({ message: "Tariff plans fetched successfully", plans });
  } catch (err) {
    console.error("Error in getTariffPlans:", err);
    return res.status(400).send({ error: err.message });
  }
};

const updateTariffPlan = async (req, res) => {
  try {
    const { id } = req.params;
    const update = { ...req.body };
    delete update.facilityId; // plan can't be reassigned to another facility

    if (update.bands) {
      const bandError = validateBands(update.bands);
      if (bandError) return res.status(400).send({ error: bandError });
    }

    const TariffPlan = getTariffPlan();
    const existing = await TariffPlan.findById(id).lean();
    if (!existing)
      return res.status(404).send({ error: "Tariff plan not found" });

    const nextBlockId =
      update.blockId !== undefined ? update.blockId : existing.blockId;
    const nextUnitType =
      update.unitType !== undefined ? update.unitType : existing.unitType;
    if (nextBlockId && nextUnitType) {
      return res.status(400).send({
        error:
          "A tariff plan can be scoped to a block OR a unit category, not both",
      });
    }

    // If this update changes scope (or (re)activates the plan), deactivate
    // any sibling plan that already occupies the new scope first — same
    // invariant createTariffPlan enforces, so a scope change here can't
    // leave two active plans resolving to the same query.
    const scopeChanged =
      String(nextBlockId || "") !== String(existing.blockId || "") ||
      String(nextUnitType || "") !== String(existing.unitType || "");
    const willBeActive =
      update.active !== undefined ? update.active : existing.active;
    if (willBeActive && (scopeChanged || update.active === true)) {
      await TariffPlan.updateMany(
        {
          _id: { $ne: id },
          facilityId: existing.facilityId,
          active: true,
          blockId: nextBlockId || null,
          unitType: nextUnitType || null,
        },
        { $set: { active: false } },
      );
    }

    const plan = await TariffPlan.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });

    return res
      .status(200)
      .send({ message: "Tariff plan updated successfully", plan });
  } catch (err) {
    console.error("Error in updateTariffPlan:", err);
    return res.status(400).send({ error: err.message });
  }
};

const deleteTariffPlan = async (req, res) => {
  try {
    const { id } = req.params;
    const TariffPlan = getTariffPlan();
    // Soft-delete only — invoices already reference this plan by id for
    // audit purposes, so it shouldn't disappear from history.
    const plan = await TariffPlan.findByIdAndUpdate(
      id,
      { active: false },
      { new: true },
    );
    if (!plan) return res.status(404).send({ error: "Tariff plan not found" });

    return res
      .status(200)
      .send({ message: "Tariff plan deactivated successfully", plan });
  } catch (err) {
    console.error("Error in deleteTariffPlan:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = {
  createTariffPlan,
  getTariffPlans,
  updateTariffPlan,
  deleteTariffPlan,
};
