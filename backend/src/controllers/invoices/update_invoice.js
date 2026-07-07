const { getInvoice: getInvoiceModel } = require("../../utils/damrSchemas");
const { denyIfFacilityMismatch } = require("../../utils/accessControl");

const EDITABLE_STATUSES = [
  "Unpaid",
  "Paid",
  "Partial",
  "Void",
  "Overdue",
  "Held",
];
const BREAKDOWN_FIELDS = [
  "waterCharge",
  "sewerageCharge",
  "techFee",
  "arrears",
  "penalty",
  "creditsApplied",
];

/**
 * PUT /invoices/:id
 *
 * Manual invoice edit — due date, status, an internal note, and (with a
 * mandatory reason, for audit purposes) the charge breakdown / total
 * amount. Every change is appended to `editHistory` rather than silently
 * overwritten, so "why does this invoice say KES 4,000 instead of what the
 * tariff engine computed" always has an answer later.
 */
const updateInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const { dueDate, status, notes, breakdown, totalAmount, reason } =
      req.body;

    const Invoice = getInvoiceModel();
    const invoice = await Invoice.findById(id);
    if (!invoice) return res.status(404).send({ error: "Invoice not found" });
    if (denyIfFacilityMismatch(req, res, invoice)) return;

    const touchesAmounts =
      (breakdown && Object.keys(breakdown).length > 0) ||
      totalAmount !== undefined;
    if (touchesAmounts && !reason?.trim()) {
      return res.status(400).send({
        error: "A reason is required when adjusting invoice amounts",
      });
    }

    const changes = [];

    if (dueDate !== undefined) {
      const newDue = dueDate ? new Date(dueDate) : null;
      const before = invoice.dueDate ? invoice.dueDate.toISOString() : null;
      const after = newDue ? newDue.toISOString() : null;
      if (before !== after) {
        changes.push({ field: "dueDate", before, after });
        invoice.dueDate = newDue;
      }
    }

    if (status !== undefined && status !== invoice.status) {
      if (!EDITABLE_STATUSES.includes(status)) {
        return res.status(400).send({ error: `Invalid status "${status}"` });
      }
      changes.push({ field: "status", before: invoice.status, after: status });
      invoice.status = status;
      if (status === "Paid") {
        invoice.amountPaid = invoice.totalAmount;
        invoice.balance = 0;
        if (!invoice.paidAt) invoice.paidAt = new Date();
      }
      if (status === "Void") {
        invoice.balance = 0;
      }
    }

    if (notes !== undefined && notes !== (invoice.notes || "")) {
      changes.push({
        field: "notes",
        before: invoice.notes || "",
        after: notes,
      });
      invoice.notes = notes || null;
    }

    if (breakdown && typeof breakdown === "object") {
      invoice.breakdown = invoice.breakdown || {};
      for (const key of BREAKDOWN_FIELDS) {
        if (breakdown[key] === undefined || breakdown[key] === "") continue;
        const val = Number(breakdown[key]);
        if (isNaN(val) || val < 0) {
          return res
            .status(400)
            .send({ error: `Invalid value for breakdown.${key}` });
        }
        const before = invoice.breakdown[key] ?? 0;
        if (before !== val) {
          changes.push({ field: `breakdown.${key}`, before, after: val });
          invoice.breakdown[key] = val;
        }
      }
    }

    if (totalAmount !== undefined && totalAmount !== "") {
      const val = Number(totalAmount);
      if (isNaN(val) || val < 0) {
        return res.status(400).send({ error: "Invalid totalAmount" });
      }
      if (invoice.totalAmount !== val) {
        changes.push({
          field: "totalAmount",
          before: invoice.totalAmount,
          after: val,
        });
        invoice.totalAmount = val;
      }
    }

    // Keep balance consistent whenever the total changed — unless status
    // was just manually forced to Paid/Void above, which already set it.
    if (!["Paid", "Void"].includes(invoice.status)) {
      invoice.balance = Math.max(
        invoice.totalAmount - (invoice.amountPaid || 0),
        0,
      );
    }

    if (changes.length === 0) {
      return res
        .status(200)
        .send({ message: "No changes to apply", invoice: invoice.toObject() });
    }

    invoice.editHistory = invoice.editHistory || [];
    invoice.editHistory.push({
      editedBy: req.user._id,
      editedAt: new Date(),
      changes,
      reason: reason?.trim() || null,
    });

    await invoice.save();

    return res
      .status(200)
      .send({ message: "Invoice updated", invoice: invoice.toObject() });
  } catch (err) {
    console.error("Error in updateInvoice:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = updateInvoice;
