const db = require("../../utils/coreSchemas");
const { getCredit } = require("../../utils/damrSchemas");
const { denyIfFacilityMismatch } = require("../../utils/accessControl");

const issueCredit = async (req, res) => {
  try {
    const { residentId, facilityId, amount, reason } = req.body;

    if (!residentId || !amount || amount <= 0) {
      return res
        .status(400)
        .send({ error: "residentId and a positive amount are required" });
    }

    // Resolve the resident's real facility rather than trusting whatever
    // facilityId (if any) was passed in the body — this is also what makes
    // the ownership check below meaningful, and what lets getCredits scope
    // by facility even for credits issued before this field was reliable.
    const resident = await db.Resident.findById(residentId).lean();
    if (!resident) return res.status(404).send({ error: "Resident not found" });
    if (denyIfFacilityMismatch(req, res, resident)) return;

    const Credit = getCredit();
    const credit = await Credit.create({
      residentId,
      facilityId: resident.facilityId || facilityId || null,
      amount,
      remainingAmount: amount,
      reason: reason || null,
      status: "open",
      issuedBy: req.user._id,
    });

    return res
      .status(200)
      .send({ message: "Credit issued successfully", credit });
  } catch (err) {
    console.error("Error in issueCredit:", err);
    return res.status(400).send({ error: err.message });
  }
};

const getCredits = async (req, res) => {
  try {
    const { residentId, status, facilityId } = req.query;
    const Credit = getCredit();
    const filter = {};
    if (residentId) filter.residentId = residentId;
    if (status) filter.status = status;

    // Previously entirely unscoped — any editor could list every
    // facility's issued credits (financial data) with no filter at all.
    if (req.user.role === "editor") {
      filter.facilityId = req.user.facilityId;
    } else if (facilityId) {
      filter.facilityId = facilityId;
    }

    const credits = await Credit.find(filter)
      .sort({ createdAt: -1 })
      .populate("residentId", "name")
      .lean();

    return res
      .status(200)
      .send({ message: "Credits fetched successfully", credits });
  } catch (err) {
    console.error("Error in getCredits:", err);
    return res.status(400).send({ error: err.message });
  }
};

const voidCredit = async (req, res) => {
  try {
    const { id } = req.params;
    const Credit = getCredit();

    const existing = await Credit.findById(id).lean();
    if (!existing) {
      return res.status(404).send({ error: "Credit not found" });
    }
    if (denyIfFacilityMismatch(req, res, existing)) return;

    const credit = await Credit.findOneAndUpdate(
      { _id: id, status: "open" },
      { status: "void", remainingAmount: 0 },
      { new: true },
    );
    if (!credit) {
      return res
        .status(404)
        .send({ error: "Open credit not found (already applied or void)" });
    }
    return res
      .status(200)
      .send({ message: "Credit voided successfully", credit });
  } catch (err) {
    console.error("Error in voidCredit:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = { issueCredit, getCredits, voidCredit };
