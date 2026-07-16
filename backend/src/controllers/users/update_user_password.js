const bcrypt = require("bcryptjs");
const db = require("../../utils/coreSchemas");
const updateUserPassword = async (req, res) => {
  try {
    const { newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 8) {
      return res
        .status(400)
        .send({ error: "New password must be at least 8 characters" });
    }

    const user = await db.User.findById(req.params.id);
    if (!user) return res.status(404).send({ error: "User not found" });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.status(200).send({ message: "Password updated" });
  } catch (err) {
    console.error("Error in updateUserPassword:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = updateUserPassword;
