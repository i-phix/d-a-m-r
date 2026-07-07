const { getInvoice: getInvoiceModel } = require("../../utils/damrSchemas");
const { denyIfFacilityMismatch } = require("../../utils/accessControl");
const {
  getValidationStatus,
} = require("../../services/validationStatusService");

const getInvoices = async (req, res) => {
  try {
    const Invoice = getInvoiceModel();

    if (req.params.id) {
      const invoice = await Invoice.findById(req.params.id)
        .populate("meterId", "serialNumber meterType")
        .populate(
          "readingId",
          "imageUrl method value readingDate ocrConfidence",
        )
        .populate("residentId", "name phone email")
        .populate("unitId", "name")
        .populate("facilityId", "name location")
        .populate("generatedBy", "fullName email")
        .populate("editHistory.editedBy", "fullName")
        .lean();

      if (!invoice) return res.status(404).send({ error: "Invoice not found" });
      if (denyIfFacilityMismatch(req, res, invoice)) return;
      const validationStatus = await getValidationStatus(
        invoice.readingId?._id || invoice.readingId,
      );

      return res
        .status(200)
        .send({
          message: "Invoice fetched successfully",
          invoice,
          validationStatus,
        });
    }

    const { status, facilityId, residentId, page = 1, limit = 30 } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (residentId) filter.residentId = residentId;
    await Invoice.updateMany(
      {
        status: "Unpaid",
        $or: [
          { dueDate: { $ne: null, $lt: new Date() } },
          { dueDate: null, periodEnd: { $lt: new Date() } },
        ],
      },
      { $set: { status: "Overdue" } },
    );

    if (req.user.role === "editor") {
      filter.facilityId = req.user.facilityId;
    } else if (facilityId) {
      filter.facilityId = facilityId;
    }

    const [invoices, total] = await Promise.all([
      Invoice.find(filter)
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .populate("meterId", "serialNumber")
        .populate("residentId", "name phone")
        .populate("unitId", "name")
        .lean(),
      Invoice.countDocuments(filter),
    ]);

    return res
      .status(200)
      .send({ message: "Invoices fetched successfully", invoices, total });
  } catch (err) {
    console.error("Error in getInvoices:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = getInvoices;
