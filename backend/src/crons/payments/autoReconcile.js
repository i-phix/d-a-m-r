const { getInvoice: getInvoiceModel } = require("../../utils/damrSchemas");
const {
  reconcileResidentInvoices,
  sendPaymentReceipt,
} = require("../../services/paymentsService");
async function autoReconcile() {
  console.log(
    "[CRON] Auto payment reconciliation started:",
    new Date().toISOString(),
  );

  const Invoice = getInvoiceModel();
  const stats = {
    residentsChecked: 0,
    invoicesChecked: 0,
    invoicesUpdated: 0,
    totalApplied: 0,
    notified: 0,
    errors: 0,
  };

  try {
    const openInvoices = await Invoice.find({
      status: { $in: ["Unpaid", "Partial", "Overdue"] },
    })
      .select("_id residentId")
      .lean();
    const residentIds = [
      ...new Set(openInvoices.map((inv) => String(inv.residentId))),
    ];

    for (const residentId of residentIds) {
      stats.residentsChecked++;
      try {
        const results = await reconcileResidentInvoices(residentId);
        for (const result of results) {
          stats.invoicesChecked++;
          if (result.updated) {
            stats.invoicesUpdated++;
            stats.totalApplied += result.newlyPaid;
            await sendPaymentReceipt(result.invoice, result.newlyPaid);
            stats.notified++;
          }
        }
      } catch (err) {
        console.error(
          `[CRON] autoReconcile error for resident ${residentId}:`,
          err.message,
        );
        stats.errors++;
      }
    }
  } catch (err) {
    console.error("[CRON] autoReconcile fatal error:", err.message);
  }

  console.log(
    `[CRON] Auto reconciliation done — Residents: ${stats.residentsChecked} | Invoices checked: ${stats.invoicesChecked} | Updated: ${stats.invoicesUpdated} | Applied: KES ${stats.totalApplied} | Errors: ${stats.errors}`,
  );

  return stats;
}

module.exports = autoReconcile;
