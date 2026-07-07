const db = require("../../utils/coreSchemas");

const deleteUser = async (req, res) => {
  try {
    const user = await db.User.findById(req.params.id);
    if (!user) return res.status(404).send({ error: "User not found" });

    if (String(user._id) === String(req.user._id)) {
      return res
        .status(400)
        .send({ error: "You cannot delete your own account" });
    }

    if (user.role === "admin") {
      const adminCount = await db.User.countDocuments({ role: "admin" });
      if (adminCount <= 1) {
        return res
          .status(400)
          .send({ error: "Cannot delete the only remaining admin account" });
      }
    }

    await db.User.findByIdAndDelete(user._id);
    return res.status(200).send({ message: "User deleted" });
  } catch (err) {
    console.error("Error in deleteUser:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = deleteUser;
