const db = require("../../utils/coreSchemas");

// Admin-only directory of staff accounts (admin / facility manager / field
// staff) — deliberately excludes resident portal accounts (role "user",
// type "Resident"), which are managed from the Residents page instead and
// whose "password" is just their national ID, not a real credential.
// Never returns the password field — see update_user_password.js for why.
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
