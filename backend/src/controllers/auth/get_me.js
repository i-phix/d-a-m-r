const db = require("../../utils/coreSchemas");
const getMe = async (req, res) => {
  try {
    const user = await db.User.findById(req.user._id)
      .select("-password")
      .lean();
    if (!user) {
      return res.status(404).send({ error: "User not found" });
    }
    return res.status(200).send({ user });
  } catch (err) {
    console.error("Error in getMe:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = getMe;
