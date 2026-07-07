const { getLocation } = require("../../utils/damrSchemas");
const createLocation = async (req, res) => {
  try {
    const { name, county, town, address } = req.body;
    if (!name)
      return res.status(400).send({ error: "Location name is required" });

    const Location = getLocation();
    const existing = await Location.findOne({ name: name.trim() });
    if (existing)
      return res
        .status(400)
        .send({ error: `Location "${name}" already exists` });

    const location = await Location.create({
      name: name.trim(),
      county,
      town,
      address,
      createdBy: req.user._id,
    });
    return res
      .status(200)
      .send({ message: "Location created successfully", location });
  } catch (err) {
    console.error("Error in createLocation:", err);
    return res.status(400).send({ error: err.message });
  }
};

const getLocations = async (req, res) => {
  try {
    const Location = getLocation();
    const locations = await Location.find().sort({ name: 1 }).lean();
    return res
      .status(200)
      .send({ message: "Locations fetched successfully", locations });
  } catch (err) {
    console.error("Error in getLocations:", err);
    return res.status(400).send({ error: err.message });
  }
};

const updateLocation = async (req, res) => {
  try {
    const Location = getLocation();
    const location = await Location.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!location) return res.status(404).send({ error: "Location not found" });
    return res
      .status(200)
      .send({ message: "Location updated successfully", location });
  } catch (err) {
    console.error("Error in updateLocation:", err);
    return res.status(400).send({ error: err.message });
  }
};

const deleteLocation = async (req, res) => {
  try {
    const Location = getLocation();
    const location = await Location.findByIdAndDelete(req.params.id);
    if (!location) return res.status(404).send({ error: "Location not found" });
    return res.status(200).send({ message: "Location deleted successfully" });
  } catch (err) {
    console.error("Error in deleteLocation:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = {
  createLocation,
  getLocations,
  updateLocation,
  deleteLocation,
};
