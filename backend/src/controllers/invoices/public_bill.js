const crypto = require("crypto");
const {
  getInvoice: getInvoiceModel,
  getTariffPlan: getTariffPlanModel,
  getStkPushRequest: getStkPushRequestModel,
} = require("../../utils/damrSchemas");
const {
  checkAndReconcileInvoice,
  provisionAccount,
  initiateInvoiceStkPush,
} = require("../../services/paymentsService");
const {
  getValidationStatus,
} = require("../../services/validationStatusService");
const { sendPaymentReceipt } = require("./check_payment");
const { denyIfFacilityMismatch } = require("../../utils/accessControl");
const TOKEN_TTL_DAYS = 90;

async function ensurePublicToken(invoice, Invoice) {
  const now = new Date();
  if (
    invoice.publicToken &&
    invoice.publicTokenExpiresAt &&
    invoice.publicTokenExpiresAt > now
  ) {
    return invoice.publicToken;
  }
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(
    now.getTime() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
  await Invoice.findByIdAndUpdate(invoice._id, {
    publicToken: token,
    publicTokenExpiresAt: expiresAt,
  });
  return token;
}
const getPublicLink = async (req, res) => {
  try {
    const Invoice = getInvoiceModel();
    const invoice = await Invoice.findById(req.params.id).lean();
    if (!invoice) return res.status(404).send({ error: "Invoice not found" });
    if (denyIfFacilityMismatch(req, res, invoice)) return;

    const token = await ensurePublicToken(invoice, Invoice);
    return res.status(200).send({ message: "Public link ready", token });
  } catch (err) {
    console.error("Error in getPublicLink:", err);
    return res.status(400).send({ error: err.message });
  }
};
const getPublicBill = async (req, res) => {
  try {
    const Invoice = getInvoiceModel();
    const invoice = await Invoice.findOne({ publicToken: req.params.token })
      .populate("residentId", "name")
      .populate("unitId", "name")
      .populate("facilityId", "name")
      .populate("meterId", "serialNumber")
      .lean();

    if (!invoice) return res.status(404).send({ error: "Bill link not found" });
    if (
      invoice.publicTokenExpiresAt &&
      invoice.publicTokenExpiresAt < new Date()
    ) {
      return res.status(410).send({
        error:
          "This bill link has expired. Please contact your facility manager for a new one.",
      });
    }

    const account = await provisionAccount({
      residentId: invoice.residentId?._id,
      facilityId: invoice.facilityId?._id,
      unitId: invoice.unitId?._id,
    });

    const TariffPlan = getTariffPlanModel();
    const plan = await TariffPlan.findOne({
      facilityId: invoice.facilityId?._id,
      active: true,
    })
      .sort({ createdAt: -1 })
      .lean();

    const invoiceRef = invoice._id.toString().slice(-8).toUpperCase();
    const validationStatus = await getValidationStatus(invoice.readingId);

    return res.status(200).send({
      message: "Bill fetched successfully",
      invoiceRef,
      validationStatus,
      residentName: invoice.residentId?.name || null,
      facilityName: invoice.facilityId?.name || null,
      unitName: invoice.unitId?.name || null,
      meterSerial: invoice.meterId?.serialNumber || null,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      dueDate: invoice.dueDate,
      consumption: invoice.consumption,
      ratePerUnit: invoice.ratePerUnit,
      totalAmount: invoice.totalAmount,
      amountPaid: invoice.amountPaid,
      balance: invoice.balance,
      status: invoice.status,
      breakdown: invoice.breakdown,
      paybillShortCode: plan?.paybillShortCode || null,
      accountNumber: account.accountNumber,
    });
  } catch (err) {
    console.error("Error in getPublicBill:", err);
    return res.status(400).send({ error: err.message });
  }
};
const publicCheckPayment = async (req, res) => {
  try {
    const Invoice = getInvoiceModel();
    const invoice = await Invoice.findOne({
      publicToken: req.params.token,
    }).lean();
    if (!invoice) return res.status(404).send({ error: "Bill link not found" });
    if (
      invoice.publicTokenExpiresAt &&
      invoice.publicTokenExpiresAt < new Date()
    ) {
      return res.status(410).send({ error: "This bill link has expired." });
    }

    const result = await checkAndReconcileInvoice(String(invoice._id));
    if (result.updated) {
      await sendPaymentReceipt(result.invoice, result.newlyPaid);
    }

    return res.status(200).send({
      message: result.message,
      updated: result.updated,
      newlyPaid: result.newlyPaid,
      status: result.invoice.status,
      balance: result.invoice.balance,
      amountPaid: result.invoice.amountPaid,
    });
  } catch (err) {
    console.error("Error in publicCheckPayment:", err);
    return res.status(400).send({ error: err.message });
  }
};
const publicStkPush = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).send({ error: "phone is required" });

    const Invoice = getInvoiceModel();
    const invoice = await Invoice.findOne({
      publicToken: req.params.token,
    }).lean();
    if (!invoice) return res.status(404).send({ error: "Bill link not found" });
    if (
      invoice.publicTokenExpiresAt &&
      invoice.publicTokenExpiresAt < new Date()
    ) {
      return res.status(410).send({ error: "This bill link has expired." });
    }

    const record = await initiateInvoiceStkPush({
      invoiceId: invoice._id,
      phone,
    });
    return res.status(200).send({
      message: "STK push sent — check your phone to complete payment.",
      checkoutRequestId: record.checkoutRequestId,
    });
  } catch (err) {
    console.error("Error in publicStkPush:", err);
    return res.status(400).send({ error: err.message });
  }
};
const publicGetStkStatus = async (req, res) => {
  try {
    const { checkoutRequestId } = req.query;
    if (!checkoutRequestId) {
      return res.status(400).send({ error: "checkoutRequestId is required" });
    }

    const Invoice = getInvoiceModel();
    const invoice = await Invoice.findOne({
      publicToken: req.params.token,
    }).lean();
    if (!invoice) return res.status(404).send({ error: "Bill link not found" });

    const StkPushRequest = getStkPushRequestModel();
    const record = await StkPushRequest.findOne({
      checkoutRequestId,
      invoiceId: invoice._id,
    }).lean();
    if (!record)
      return res.status(404).send({ error: "STK push request not found" });

    return res.status(200).send({
      status: record.status,
      resultDesc: record.resultDesc,
      mpesaReceiptNumber: record.mpesaReceiptNumber,
      amount: record.amount,
    });
  } catch (err) {
    console.error("Error in publicGetStkStatus:", err);
    return res.status(400).send({ error: err.message });
  }
};
module.exports = {
  getPublicLink,
  getPublicBill,
  publicCheckPayment,
  publicStkPush,
  publicGetStkStatus,
  ensurePublicToken,
};
