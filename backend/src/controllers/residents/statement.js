const db = require("../../utils/coreSchemas");
const crypto = require("crypto");
const { getInvoice: getInvoiceModel } = require("../../utils/damrSchemas");
const {
  getValidationStatusesForReadings,
} = require("../../services/validationStatusService");

const TOKEN_TTL_DAYS = 90;

async function ensureResidentPublicToken(resident) {
  const now = new Date();
  if (
    resident.publicToken &&
    resident.publicTokenExpiresAt &&
    resident.publicTokenExpiresAt > now
  ) {
    return resident.publicToken;
  }
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(
    now.getTime() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
  await db.Resident.findByIdAndUpdate(resident._id, {
    publicToken: token,
    publicTokenExpiresAt: expiresAt,
  });
  return token;
}

const getPublicStatement = async (req, res) => {
  try {
    const resident = await db.Resident.findOne({
      publicToken: req.params.token,
    })
      .populate("unitId", "name")
      .populate("facilityId", "name")
      .lean();

    if (!resident)
      return res.status(404).send({ error: "Statement link not found" });
    if (
      resident.publicTokenExpiresAt &&
      resident.publicTokenExpiresAt < new Date()
    ) {
      return res.status(410).send({
        error:
          "This statement link has expired. Please contact your facility manager for a new one.",
      });
    }

    const Invoice = getInvoiceModel();
    const [invoices, balanceAgg] = await Promise.all([
      Invoice.find({ residentId: resident._id })
        .sort({ periodStart: -1 })
        .populate("unitId", "name")
        .populate("meterId", "serialNumber")
        .lean(),
      Invoice.aggregate([
        {
          $match: {
            residentId: resident._id,
            status: { $nin: ["Paid", "Void", "Held"] },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: { $ifNull: ["$balance", "$totalAmount"] } },
          },
        },
      ]),
    ]);

    const visibleInvoices = invoices.filter((inv) => inv.status !== "Held");

    const statusMap = await getValidationStatusesForReadings(
      visibleInvoices.map((inv) => inv.readingId),
    );
    const invoicesWithValidation = visibleInvoices.map((inv) => ({
      invoiceRef: inv._id.toString().slice(-8).toUpperCase(),
      unitName: inv.unitId?.name || null,
      meterSerial: inv.meterId?.serialNumber || null,
      periodStart: inv.periodStart,
      periodEnd: inv.periodEnd,
      dueDate: inv.dueDate,
      consumption: inv.consumption,
      totalAmount: inv.totalAmount,
      amountPaid: inv.amountPaid,
      balance: inv.balance,
      status: inv.status,
      mpesaCode: inv.mpesaCode,
      paidAt: inv.paidAt,
      validationStatus: inv.readingId
        ? statusMap.get(String(inv.readingId))
        : { status: "unavailable", label: "Not available for this bill" },
    }));

    return res.status(200).send({
      message: "Statement fetched successfully",
      residentName: resident.name || null,
      facilityName: resident.facilityId?.name || null,
      unitName: resident.unitId?.name || null,
      outstandingBalance: balanceAgg[0]?.total || 0,
      invoices: invoicesWithValidation,
    });
  } catch (err) {
    console.error("Error in getPublicStatement:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = { ensureResidentPublicToken, getPublicStatement };
