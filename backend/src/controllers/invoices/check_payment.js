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

/**
 * POST /invoices/:id/check-payment
 *
 * Manual reconciliation trigger. Most Paybill top-ups on a facility with
 * C2B URLs registered (see facility/payment-details) are already applied
 * automatically the moment Safaricom's confirmation webhook lands (see
 * mpesa_callback.js -> paymentsService.applyC2BConfirmation) — this exists
 * as a fallback/manual "I've paid, please check" action for facilities
 * without C2B registered yet, or in case a webhook delivery was ever missed.
 */
const checkPayment = async (req, res) => {
  try {
    const { id } = req.params;

    // Ownership must be checked BEFORE reconciling, not after — otherwise
    // an FM from another facility could trigger reconciliation (and see the
    // resulting invoice/payment data) on a bill that isn't theirs.
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

/**
 * POST /invoices/:id/cash-payment
 *
 * Admin/FM-triggered: staff record an amount actually received in cash (or
 * any other off-app method). This creates a native MpesaTransaction row
 * (source: "cash") against the resident's Paybill account, then immediately
 * reconciles it against this invoice via the normal check-payment path —
 * same as a real M-Pesa receipt. Body: { amount }.
 */
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

    const resident = await db.Resident.findById(
      invoice.residentId,
    ).lean();
    const phone = resident?.phoneNumber || resident?.phone;

    await recordOfflinePayment({
      accountNumber: account.accountNumber,
      amount: parsedAmount,
      phone,
    });

    // The offline callback just recorded a real transaction on the Payments
    // microservice — pull it in the same way "Check for Payment" would.
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

/**
 * GET /invoices/:id/payment-info
 *
 * Returns the Paybill shortcode + resident's account number so the
 * frontend can show "How to pay" instructions — provisions the account on
 * first request if one doesn't exist yet.
 */
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
