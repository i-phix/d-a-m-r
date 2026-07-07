const {
  getInvoice: getInvoiceModel,
  getStkPushRequest: getStkPushRequestModel,
} = require("../../utils/damrSchemas");
const { initiateInvoiceStkPush } = require("../../services/paymentsService");
const { denyIfFacilityMismatch } = require("../../utils/accessControl");

// ─────────────────────────────────────────────────────────────────────────
// Native "Pay Now" (STK Push) — replaces the frontend calling PayServe's
// Payments microservice's /v1/stkpush directly over Socket.IO. There's no
// push notification channel of our own, so the frontend polls
// getStkStatus() every few seconds after initiating instead; Safaricom's
// callback (mpesa_callback.js -> paymentsService.applyStkCallback) is what
// actually updates the StkPushRequest/Invoice in the background.
// ─────────────────────────────────────────────────────────────────────────

/**
 * POST /invoices/:id/stk-push (protect, adminOrFM)
 * Body: { phone }
 */
const stkPushInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const { phone } = req.body;
    if (!phone) return res.status(400).send({ error: "phone is required" });

    const Invoice = getInvoiceModel();
    const invoice = await Invoice.findById(id).lean();
    if (!invoice) return res.status(404).send({ error: "Invoice not found" });
    if (denyIfFacilityMismatch(req, res, invoice)) return;

    const record = await initiateInvoiceStkPush({ invoiceId: id, phone });
    return res.status(200).send({
      message:
        "STK push sent — waiting for the resident to complete it on their phone",
      checkoutRequestId: record.checkoutRequestId,
    });
  } catch (err) {
    console.error("Error in stkPushInvoice:", err);
    return res.status(400).send({ error: err.message });
  }
};
const getStkStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { checkoutRequestId } = req.query;
    if (!checkoutRequestId) {
      return res.status(400).send({ error: "checkoutRequestId is required" });
    }

    const Invoice = getInvoiceModel();
    const invoice = await Invoice.findById(id).lean();
    if (!invoice) return res.status(404).send({ error: "Invoice not found" });
    if (denyIfFacilityMismatch(req, res, invoice)) return;

    const StkPushRequest = getStkPushRequestModel();
    const record = await StkPushRequest.findOne({
      checkoutRequestId,
      invoiceId: id,
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
    console.error("Error in getStkStatus:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = { stkPushInvoice, getStkStatus };
