const db = require("../../utils/coreSchemas");
const { getLocation, getFacilitySettings } = require("../../utils/damrSchemas");
const { createBlockGroups } = require("../../services/hierarchyService");
const syncLocation = async ({ location, county, town, address, userId }) => {
  if (!location) return;
  try {
    const Location = getLocation();
    const update = { name: location.trim(), createdBy: userId };
    if (county !== undefined) update.county = county;
    if (town !== undefined) update.town = town;
    if (address !== undefined) update.address = address;

    await Location.findOneAndUpdate({ name: location.trim() }, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
  } catch (err) {
    console.error("Error syncing location for facility:", err);
  }
};
const createFacility = async (req, res) => {
  try {
    const {
      name,
      location,
      subDivision,
      county,
      town,
      address,
      blockGroups,
      blockLabel,
    } = req.body;

    if (!name || !location || !subDivision) {
      return res
        .status(400)
        .send({ error: "Name, location and subDivision are required" });
    }
    if (!Array.isArray(blockGroups)) {
      return res.status(400).send({
        error:
          "blockGroups is required (send an empty array if this facility has no blocks/courts/towers)",
      });
    }
    for (const group of blockGroups) {
      const count = Number(group.count);
      if (!Number.isInteger(count) || count < 1) {
        return res.status(400).send({
          error: `Each block group needs a count of at least 1 (got "${group.type || "Block"}")`,
        });
      }
    }

    const dbName =
      name.toLowerCase().replace(/[^a-z0-9]/g, "_") + "_" + Date.now();

    const facility = await db.Facility.create({
      name: name.trim(),
      location: location.trim(),
      subDivision: subDivision.trim(),
      isEnabled: true,
      dbName,
      accountNumber: dbName,
      modules: {
        utility: true,
      },
    });

    await syncLocation({
      location,
      county,
      town,
      address,
      userId: req.user._id,
    });

    const FacilitySettings = getFacilitySettings();
    const settings = await FacilitySettings.create({
      facilityId: facility._id,
      blockLabel: (blockLabel || "Block").trim(),
    });

    const blocks = await createBlockGroups({
      facilityId: facility._id,
      groups: blockGroups,
      userId: req.user._id,
    });

    return res.status(200).send({
      message: "Facility created successfully",
      facility,
      blockLabel: settings.blockLabel,
      blocks,
    });
  } catch (err) {
    console.error("Error in createFacility:", err);
    return res.status(400).send({ error: err.message });
  }
};

const getFacilities = async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === "editor") {
      filter._id = req.user.facilityId;
    }
    const facilities = await db.Facility.find(filter).sort({ name: 1 }).lean();
    const FacilitySettings = getFacilitySettings();
    const settingsRows = await FacilitySettings.find({
      facilityId: { $in: facilities.map((f) => f._id) },
    }).lean();
    const settingsByFacility = new Map(
      settingsRows.map((s) => [String(s.facilityId), s]),
    );
    const facilitiesWithLabel = facilities.map((f) => ({
      ...f,
      blockLabel: settingsByFacility.get(String(f._id))?.blockLabel || "Block",
    }));

    return res.status(200).send({
      message: "Facilities fetched successfully",
      facilities: facilitiesWithLabel,
    });
  } catch (err) {
    console.error("Error in getFacilities:", err);
    return res.status(400).send({ error: err.message });
  }
};
const getFacilitySettingsForFacility = async (req, res) => {
  try {
    const { facilityId } = req.query;
    if (!facilityId) {
      return res.status(400).send({ error: "facilityId is required" });
    }
    const FacilitySettings = getFacilitySettings();
    const settings = await FacilitySettings.findOne({ facilityId }).lean();
    return res.status(200).send({
      message: "Facility settings fetched successfully",
      settings: settings || { facilityId, blockLabel: "Block" },
    });
  } catch (err) {
    console.error("Error in getFacilitySettingsForFacility:", err);
    return res.status(400).send({ error: err.message });
  }
};

const updateFacilitySettings = async (req, res) => {
  try {
    const { facilityId, blockLabel } = req.body;
    if (!facilityId || !blockLabel || !blockLabel.trim()) {
      return res
        .status(400)
        .send({ error: "facilityId and a non-empty blockLabel are required" });
    }
    const FacilitySettings = getFacilitySettings();
    const settings = await FacilitySettings.findOneAndUpdate(
      { facilityId },
      { $set: { blockLabel: blockLabel.trim() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    return res
      .status(200)
      .send({ message: "Facility settings updated successfully", settings });
  } catch (err) {
    console.error("Error in updateFacilitySettings:", err);
    return res.status(400).send({ error: err.message });
  }
};

const updateFacility = async (req, res) => {
  try {
    const { county, town, address } = req.body;

    const facility = await db.Facility.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true },
    );
    if (!facility) return res.status(404).send({ error: "Facility not found" });

    await syncLocation({
      location: facility.location,
      county,
      town,
      address,
      userId: req.user._id,
    });

    return res
      .status(200)
      .send({ message: "Facility updated successfully", facility });
  } catch (err) {
    console.error("Error in updateFacility:", err);
    return res.status(400).send({ error: err.message });
  }
};

const deleteFacility = async (req, res) => {
  try {
    const facility = await db.Facility.findByIdAndDelete(req.params.id);
    if (!facility) return res.status(404).send({ error: "Facility not found" });
    return res.status(200).send({ message: "Facility deleted successfully" });
  } catch (err) {
    console.error("Error in deleteFacility:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = {
  createFacility,
  getFacilities,
  updateFacility,
  deleteFacility,
  getFacilitySettingsForFacility,
  updateFacilitySettings,
};
