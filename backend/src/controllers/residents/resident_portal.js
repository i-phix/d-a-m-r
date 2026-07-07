const db = require("../../utils/coreSchemas");
const {
  getMeter: getMeterModel,
  getReading: getReadingModel,
  getInvoice: getInvoiceModel,
} = require("../../utils/damrSchemas");
const { ensurePublicToken } = require("../invoices/public_bill");
const {
  getValidationStatusesForReadings,
} = require("../../services/validationStatusService");
async function getMyResidentDocs(req) {
  return db.Resident.find({ email: req.user.email })
    .populate("unitId", "name status")
    .populate("facilityId", "name")
    .lean();
}
const getMyResidencies = async (req, res) => {
  try {
    const residents = await getMyResidentDocs(req);
    if (!residents.length) {
      return res
        .status(200)
        .send({ message: "No residencies found", residencies: [] });
    }

    const Meter = getMeterModel();
    const meters = await Meter.find({
      currentResident: { $in: residents.map((r) => r._id) },
    })
      .select("serialNumber status lastReadingValue lastReadingDate unitId")
      .lean();
    const meterByUnit = new Map(meters.map((m) => [String(m.unitId), m]));

    const residencies = residents.map((r) => ({
      residentDocId: r._id,
      status: r.status,
      unit: r.unitId
        ? { _id: r.unitId._id, name: r.unitId.name, status: r.unitId.status }
        : null,
      facility: r.facilityId
        ? { _id: r.facilityId._id, name: r.facilityId.name }
        : null,
      meter: meterByUnit.get(String(r.unitId?._id)) || null,
    }));

    return res
      .status(200)
      .send({ message: "Residencies fetched successfully", residencies });
  } catch (err) {
    console.error("Error in getMyResidencies:", err);
    return res.status(400).send({ error: err.message });
  }
};
const getMyReadings = async (req, res) => {
  try {
    const residents = await getMyResidentDocs(req);
    if (!residents.length) {
      return res
        .status(200)
        .send({ message: "No readings", readings: [], total: 0 });
    }
    const unitIds = residents.map((r) => r.unitId?._id).filter(Boolean);

    const { unitId, page = 1, limit = 30 } = req.query;
    let scopedUnitIds = unitIds;
    if (unitId) {
      if (!unitIds.some((u) => String(u) === String(unitId))) {
        return res
          .status(403)
          .send({ error: "That unit isn't linked to your account" });
      }
      scopedUnitIds = [unitId];
    }

    const Meter = getMeterModel();
    const Reading = getReadingModel();
    const meters = await Meter.find({ unitId: { $in: scopedUnitIds } })
      .select("_id")
      .lean();
    const meterIds = meters.map((m) => m._id);

    const filter = { meterId: { $in: meterIds } };
    const [readings, total] = await Promise.all([
      Reading.find(filter)
        .sort({ readingDate: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .populate("meterId", "serialNumber")
        .lean(),
      Reading.countDocuments(filter),
    ]);

    return res
      .status(200)
      .send({ message: "Readings fetched successfully", readings, total });
  } catch (err) {
    console.error("Error in getMyReadings:", err);
    return res.status(400).send({ error: err.message });
  }
};
const getMyInvoices = async (req, res) => {
  try {
    const residents = await getMyResidentDocs(req);
    if (!residents.length) {
      return res
        .status(200)
        .send({
          message: "No invoices",
          invoices: [],
          total: 0,
          outstandingBalance: 0,
        });
    }
    const residentIds = residents.map((r) => r._id);

    const Invoice = getInvoiceModel();
    const { status, page = 1, limit = 30 } = req.query;
    const filter = { residentId: { $in: residentIds } };
    if (status) filter.status = status;

    const [invoices, total, balanceAgg] = await Promise.all([
      Invoice.find(filter)
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .populate("unitId", "name")
        .populate("facilityId", "name")
        .populate("meterId", "serialNumber")
        .lean(),
      Invoice.countDocuments(filter),
      Invoice.aggregate([
        {
          $match: { residentId: { $in: residentIds }, status: { $ne: "Paid" } },
        },
        {
          $group: {
            _id: null,
            total: { $sum: { $ifNull: ["$balance", "$totalAmount"] } },
          },
        },
      ]),
    ]);
    const statusMap = await getValidationStatusesForReadings(
      invoices.map((inv) => inv.readingId),
    );
    const invoicesWithValidation = invoices.map((inv) => ({
      ...inv,
      validationStatus: inv.readingId
        ? statusMap.get(String(inv.readingId))
        : { status: "unavailable", label: "Not available for this bill" },
    }));

    return res.status(200).send({
      message: "Invoices fetched successfully",
      invoices: invoicesWithValidation,
      total,
      outstandingBalance: balanceAgg[0]?.total || 0,
    });
  } catch (err) {
    console.error("Error in getMyInvoices:", err);
    return res.status(400).send({ error: err.message });
  }
};
const getMyInvoiceBillLink = async (req, res) => {
  try {
    const residents = await getMyResidentDocs(req);
    const residentIds = residents.map((r) => String(r._id));

    const Invoice = getInvoiceModel();
    const invoice = await Invoice.findById(req.params.id).lean();
    if (!invoice) return res.status(404).send({ error: "Invoice not found" });
    if (!residentIds.includes(String(invoice.residentId))) {
      return res
        .status(403)
        .send({ error: "This bill doesn't belong to your account" });
    }

    const token = await ensurePublicToken(invoice, Invoice);
    return res.status(200).send({ message: "Bill link ready", token });
  } catch (err) {
    console.error("Error in getMyInvoiceBillLink:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = {
  getMyResidencies,
  getMyReadings,
  getMyInvoices,
  getMyInvoiceBillLink,
};
