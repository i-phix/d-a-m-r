const db = require("../../utils/coreSchemas");
const {
  getInvoice: getInvoiceModel,
  getTariffPlan: getTariffPlanModel,
} = require("../../utils/damrSchemas");
const {
  checkAndReconcileInvoice,
  provisionAccount,
  recordOfflinePayment,
  sendPaymentReceipt,
} = require("../../services/paymentsService");
const { denyIfFacilityMismatch } = require("../../utils/accessControl");

const checkPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const Invoice = getInvoiceModel();
    const existing = await Invoice.findById(id).lean();
    if (!existing) return res.status(404).send({ error: "Invoice not found" });
    if (denyIfFacilityMismatch(req, res, existing)) return;

    const result = await checkAndReconcileInvoice(id);

    if (result.updated) {
      await sendPaymentReceipt(result.invoice, result.newlyPaid);
    }

    return res.status(200).send({
      message: result.message,
      updated: result.updated,
      newlyPaid: result.newlyPaid,
      invoice: result.invoice,
    });
  } catch (err) {
    console.error("Error in checkPayment:", err);
    return res.status(400).send({ error: err.message });
  }
};

const recordCashPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;
    const parsedAmount = Number(amount);

    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).send({ error: "A positive amount is required" });
    }

    const Invoice = getInvoiceModel();
    const invoice = await Invoice.findById(id).lean();
    if (!invoice) return res.status(404).send({ error: "Invoice not found" });
    if (denyIfFacilityMismatch(req, res, invoice)) return;
    if (invoice.status === "Paid") {
      return res.status(400).send({ error: "Invoice is already fully paid" });
    }

    const account = await provisionAccount({
      residentId: invoice.residentId,
      facilityId: invoice.facilityId,
      unitId: invoice.unitId,
    });

    const resident = await db.Resident.findById(invoice.residentId).lean();
    const phone = resident?.phoneNumber || resident?.phone;

    await recordOfflinePayment({
      accountNumber: account.accountNumber,
      amount: parsedAmount,
      phone,
    });
    const result = await checkAndReconcileInvoice(id);

    if (result.updated) {
      await sendPaymentReceipt(result.invoice, result.newlyPaid);
    }

    return res.status(200).send({
      message: result.updated
        ? `Recorded cash payment of KES ${parsedAmount.toLocaleString()}`
        : "Payment recorded, but reconciliation found nothing new — please check manually",
      updated: result.updated,
      newlyPaid: result.newlyPaid,
      invoice: result.invoice,
    });
  } catch (err) {
    console.error("Error in recordCashPayment:", err);
    return res.status(400).send({ error: err.message });
  }
};
const getPaymentInfo = async (req, res) => {
  try {
    const Invoice = getInvoiceModel();
    const invoice = await Invoice.findById(req.params.id).lean();
    if (!invoice) return res.status(404).send({ error: "Invoice not found" });
    if (denyIfFacilityMismatch(req, res, invoice)) return;

    const account = await provisionAccount({
      residentId: invoice.residentId,
      facilityId: invoice.facilityId,
      unitId: invoice.unitId,
    });

    const TariffPlan = getTariffPlanModel();
    const plan = await TariffPlan.findOne({
      facilityId: invoice.facilityId,
      active: true,
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).send({
      message: "Payment info fetched successfully",
      paybillShortCode: plan?.paybillShortCode || null,
      accountNumber: account.accountNumber,
    });
  } catch (err) {
    console.error("Error in getPaymentInfo:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = {
  checkPayment,
  getPaymentInfo,
  recordCashPayment,
  sendPaymentReceipt,
};
