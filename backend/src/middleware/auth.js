const jwt = require("jsonwebtoken");
const db = require("../utils/coreSchemas");
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

    if (!token) {
      return res
        .status(401)
        .send({ error: "Not authorized, no token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await db.User.findById(decoded.id).select("-password").lean();
    if (!user) {
      return res
        .status(401)
        .send({ error: "Not authorized, user no longer exists" });
    }
    if (user.isEnabled === false) {
      return res
        .status(401)
        .send({ error: "Not authorized, this account has been disabled" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("Auth error:", err.message);
    return res
      .status(401)
      .send({ error: "Not authorized, invalid or expired token" });
  }
};
const allowRoles =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res
        .status(403)
        .send({ error: "Forbidden: insufficient permissions" });
    }
    next();
  };

const adminOnly = allowRoles("admin");
const adminOrFM = allowRoles("admin", "editor");
const fieldStaff = allowRoles("admin", "editor", "Staff");
const canManage = allowRoles("admin", "editor");
const residentOnly = (req, res, next) => {
  if (!req.user || req.user.role !== "user" || req.user.type !== "Resident") {
    return res
      .status(403)
      .send({ error: "Forbidden: resident account required" });
  }
  next();
};

module.exports = {
  protect,
  adminOnly,
  adminOrFM,
  fieldStaff,
  canManage,
  residentOnly,
  allowRoles,
};
