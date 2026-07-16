const db = require("../../utils/coreSchemas");
const getUsers = async (req, res) => {
  try {
    if (req.params.id) {
      const user = await db.User.findById(req.params.id)
        .select("-password")
        .populate("facilityId", "name")
        .lean();
      if (!user) return res.status(404).send({ error: "User not found" });
      return res.status(200).send({ user });
    }

    const users = await db.User.find({
      role: { $in: ["admin", "editor", "Staff"] },
    })
      .select("-password")
      .populate("facilityId", "name")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).send({ users });
  } catch (err) {
    console.error("Error in getUsers:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = getUsers;
