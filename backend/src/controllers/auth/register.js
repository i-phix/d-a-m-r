const bcrypt = require("bcryptjs");
const db = require("../../utils/coreSchemas");
const register = async (req, res) => {
  try {
    const { userType, fullName, email, phone, password, facilityId } = req.body;
    const requestingRole = req.user.role;

    if (!userType || !fullName || !email || !phone || !password) {
      return res.status(400).send({
        error: "userType, fullName, email, phone and password are required",
      });
    }

    if (!["fm", "staff"].includes(userType)) {
      return res
        .status(400)
        .send({ error: 'userType must be "fm" or "staff"' });
    }
    if (requestingRole === "editor" && userType === "fm") {
      return res.status(403).send({
        error: "Facility managers cannot create other facility managers",
      });
    }
    const resolvedFacilityId =
      requestingRole === "editor" ? req.user.facilityId : facilityId || null;

    const existing = await db.User.findOne({
      email: email.toLowerCase().trim(),
    });
    if (existing)
      return res
        .status(400)
        .send({ error: "A user with this email already exists" });

    const existingPhone = await db.User.findOne({ phoneNumber: phone });
    if (existingPhone)
      return res
        .status(400)
        .send({ error: "A user with this phone number already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const roleMap = {
      fm: { role: "editor", type: "Project Manager" },
      staff: { role: "Staff", type: "Universal" },
    };
    const { role, type } = roleMap[userType];

    const user = await db.User.create({
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      phoneNumber: phone,
      password: hashedPassword,
      role,
      type,
      facilityId: resolvedFacilityId,
    });

    const label = userType === "fm" ? "Facility manager" : "Field staff";
    return res.status(200).send({
      message: `${label} account created successfully`,
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        type: user.type,
        facilityId: user.facilityId,
      },
    });
  } catch (err) {
    console.error("Error in register:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = register;
