import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import Layout from "../../../../layout/Layout";
import { makeAuthRequest } from "../../../../../utils/makeRequest";
import { toastify } from "../../../../../utils/toast";
import { getInvoicesURL } from "../../../../../utils/urls";

const UNITS_URL = "/api/v1/damr/facility/units";
const FACILITIES_URL = "/api/v1/damr/facility/facilities";

// One shared <style> block for every soft-styled table/search input on this
// page — a soft blue header, faint zebra striping, and a pill-shaped search
// box, instead of the default harsher Bootstrap table/input look.
const SoftTableStyles = () => (
  <style>{`
        .dmr-soft-table thead th {
            background: #eef3fc;
            color: #1f2a44;
        }
        .dmr-soft-table tbody td {
            padding: 14px 18px;
            font-size: 14px;
            color: #2b3350;
            vertical-align: middle;
            border-color: #eef1f7;
        }
        .dmr-soft-table tbody tr:nth-child(even) {
            background-color: #fafbff;
        }
        .dmr-soft-table tbody tr:hover {
            background-color: #f1f5fd;
        }
        .dmr-search-pill {
            border-radius: 999px;
            background: #f5f6fa;
            border: 1px solid #eceef3;
            padding: 10px 20px;
        }
        .dmr-search-pill:focus {
            background: #fff;
            border-color: #c7d2fe;
            box-shadow: 0 0 0 3px rgba(59, 91, 219, 0.1);
        }
    `}</style>
);

const pillBase = {
  display: "inline-block",
  padding: "4px 14px",
  borderRadius: "999px",
  fontSize: "13px",
  fontWeight: 600,
  lineHeight: 1.5,
};

const STATUS_COLORS = {
  Paid: { bg: "#e3f9e8", color: "#1f9254" },
  Unpaid: { bg: "#fff4de", color: "#b7791f" },
  Partial: { bg: "#e7f1ff", color: "#3b5bdb" },
  Overdue: { bg: "#fdeaea", color: "#c0392b" },
  Void: { bg: "#eef0f3", color: "#5c6470" },
  Held: { bg: "#e9ecef", color: "#343a40" },
};

const StatusBadge = ({ status }) => {
  const s = STATUS_COLORS[status] || { bg: "#eef0f3", color: "#5c6470" };
  return (
    <span style={{ ...pillBase, backgroundColor: s.bg, color: s.color }}>
      {status}
    </span>
  );
};

// Clickable column header — click once to sort ascending on that field,
// click again to flip to descending, click a different header to switch
// fields (always starting ascending on the new one).
const SortableHeader = ({ label, field, sortField, sortDir, onSort }) => {
  const active = sortField === field;
  const [hover, setHover] = useState(false);
  return (
    <th
      onClick={() => onSort(field)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
        padding: "14px 18px",
        fontSize: "15px",
        fontWeight: 600,
        backgroundColor: active ? "#dce6fb" : hover ? "#e4ecfa" : undefined,
        color: active ? "#3b5bdb" : "#1f2a44",
        transition: "background-color 0.15s ease",
      }}
    >
      <span
        style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
      >
        {label}
        <i
          className={`ti ${active ? (sortDir === "asc" ? "ti-sort-ascending" : "ti-sort-descending") : "ti-arrows-sort"}`}
          style={{
            fontSize: "18px",
            opacity: active ? 1 : 0.45,
            color: active ? "#3b5bdb" : "inherit",
          }}
        ></i>
      </span>
    </th>
  );
};

// Generic comparator driving every sortable column on the All Invoices
// table. "index" sorts by the order invoices were fetched in (# reflects
// position in that order — ascending = as-fetched, descending = reversed).
function sortInvoices(list, field, dir) {
  if (field === "index") {
    return dir === "asc" ? list : [...list].reverse();
  }
  const getValue = (inv) => {
    switch (field) {
      case "meter":
        return inv.meterId?.serialNumber || "";
      case "resident":
        return inv.residentId?.name || "";
      case "unit":
        return inv.unitId?.name || "";
      case "period":
        return new Date(inv.periodStart).getTime() || 0;
      case "consumption":
        return typeof inv.consumption === "number" ? inv.consumption : -Infinity;
      case "total":
        return typeof inv.totalAmount === "number" ? inv.totalAmount : -Infinity;
      case "paid":
        return typeof inv.amountPaid === "number" ? inv.amountPaid : -Infinity;
      case "status":
        return inv.status || "";
      default:
        return 0;
    }
  };
  return [...list].sort((a, b) => {
    const av = getValue(a);
    const bv = getValue(b);
    let cmp;
    if (typeof av === "string") cmp = av.localeCompare(bv);
    else cmp = av - bv;
    return dir === "asc" ? cmp : -cmp;
  });
}

const formatKES = (amount) => `KES ${Number(amount || 0).toLocaleString()}`;

// Same synthetic invoice-number scheme as view_invoice.js's buildInvoiceNo —
// kept in sync so the number shown on the list/export matches the detail
// page and downloaded PDF.
function buildInvoiceNo(invoice) {
  if (!invoice?._id) return "—";
  const created = new Date(invoice.createdAt || Date.now());
  const yy = String(created.getFullYear()).slice(-2);
  const mm = String(created.getMonth() + 1).padStart(2, "0");
  const dd = String(created.getDate()).padStart(2, "0");
  return `INV${yy}${mm}${dd}${invoice._id.slice(-4).toUpperCase()}`;
}

const EDIT_STATUSES = ["Unpaid", "Paid", "Partial", "Overdue", "Void", "Held"];

// Custom lightweight modal — no Bootstrap JS Modal instance to manage
// (nothing else in this app relies on data-bs-toggle), just a fixed
// backdrop + centered card driven entirely by React state.
function EditInvoiceModal({ invoice, onClose, onSaved }) {
  const b = invoice.breakdown || {};
  const [form, setForm] = useState({
    dueDate: invoice.dueDate ? invoice.dueDate.slice(0, 10) : "",
    status: invoice.status,
    notes: invoice.notes || "",
    waterCharge: b.waterCharge ?? "",
    sewerageCharge: b.sewerageCharge ?? "",
    techFee: b.techFee ?? "",
    arrears: b.arrears ?? "",
    penalty: b.penalty ?? "",
    creditsApplied: b.creditsApplied ?? "",
    totalAmount: invoice.totalAmount ?? "",
    reason: "",
  });
  const [saving, setSaving] = useState(false);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const amountsTouched =
    Number(form.waterCharge) !== (b.waterCharge ?? 0) ||
    Number(form.sewerageCharge) !== (b.sewerageCharge ?? 0) ||
    Number(form.techFee) !== (b.techFee ?? 0) ||
    Number(form.arrears) !== (b.arrears ?? 0) ||
    Number(form.penalty) !== (b.penalty ?? 0) ||
    Number(form.creditsApplied) !== (b.creditsApplied ?? 0) ||
    Number(form.totalAmount) !== (invoice.totalAmount ?? 0);

  const handleSubmit = async () => {
    if (amountsTouched && !form.reason.trim()) {
      toastify("A reason is required when adjusting amounts", "error");
      return;
    }
    const payload = {
      dueDate: form.dueDate || null,
      status: form.status,
      notes: form.notes,
    };
    if (amountsTouched) {
      payload.breakdown = {
        waterCharge: form.waterCharge,
        sewerageCharge: form.sewerageCharge,
        techFee: form.techFee,
        arrears: form.arrears,
        penalty: form.penalty,
        creditsApplied: form.creditsApplied,
      };
      payload.totalAmount = form.totalAmount;
      payload.reason = form.reason;
    }
    try {
      setSaving(true);
      const res = await makeAuthRequest(
        `${getInvoicesURL}/${invoice._id}`,
        "PUT",
        payload,
      );
      if (res.success) {
        toastify("Invoice updated", "success");
        onSaved();
      } else {
        toastify(res.error, "error");
      }
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20, 30, 55, 0.45)",
        zIndex: 1050,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: "560px", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-header d-flex align-items-center justify-content-between">
          <h5 className="card-title mb-0">
            <i className="ti ti-edit me-2 text-primary"></i>Edit Invoice
          </h5>
          <button className="btn btn-sm btn-outline-secondary" onClick={onClose}>
            <i className="ti ti-x"></i>
          </button>
        </div>
        <div className="card-body">
          <div className="row">
            <div className="col-md-6 mb-3">
              <label className="form-label">Due Date</label>
              <input
                type="date"
                name="dueDate"
                className="form-control"
                value={form.dueDate}
                onChange={handleChange}
              />
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label">Status</label>
              <select
                name="status"
                className="form-select"
                value={form.status}
                onChange={handleChange}
              >
                {EDIT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label">Internal Notes</label>
            <textarea
              name="notes"
              className="form-control"
              rows={2}
              placeholder="Not shown to the resident..."
              value={form.notes}
              onChange={handleChange}
            />
          </div>

          <hr />
          <p className="text-muted mb-2" style={{ fontSize: "13px" }}>
            <i className="ti ti-alert-triangle me-1"></i>
            Adjusting charges bypasses the tariff engine — a reason is
            required and the change is recorded on the invoice's edit
            history.
          </p>
          <div className="row">
            <div className="col-md-6 mb-3">
              <label className="form-label">Water Charge (KES)</label>
              <input
                type="number"
                min="0"
                name="waterCharge"
                className="form-control"
                value={form.waterCharge}
                onChange={handleChange}
              />
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label">Sewerage Charge (KES)</label>
              <input
                type="number"
                min="0"
                name="sewerageCharge"
                className="form-control"
                value={form.sewerageCharge}
                onChange={handleChange}
              />
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label">Tech Fee (KES)</label>
              <input
                type="number"
                min="0"
                name="techFee"
                className="form-control"
                value={form.techFee}
                onChange={handleChange}
              />
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label">Arrears (KES)</label>
              <input
                type="number"
                min="0"
                name="arrears"
                className="form-control"
                value={form.arrears}
                onChange={handleChange}
              />
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label">Late Fee / Penalty (KES)</label>
              <input
                type="number"
                min="0"
                name="penalty"
                className="form-control"
                value={form.penalty}
                onChange={handleChange}
              />
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label">Credits Applied (KES)</label>
              <input
                type="number"
                min="0"
                name="creditsApplied"
                className="form-control"
                value={form.creditsApplied}
                onChange={handleChange}
              />
            </div>
            <div className="col-md-12 mb-3">
              <label className="form-label">
                Total Amount (KES) — the figure actually billed
              </label>
              <input
                type="number"
                min="0"
                name="totalAmount"
                className="form-control"
                value={form.totalAmount}
                onChange={handleChange}
              />
            </div>
          </div>

          {amountsTouched && (
            <div className="mb-3">
              <label className="form-label">
                Reason for adjustment <span className="text-danger">*</span>
              </label>
              <textarea
                name="reason"
                className="form-control"
                rows={2}
                placeholder="e.g., goodwill discount agreed with resident, correcting a data entry error..."
                value={form.reason}
                onChange={handleChange}
              />
            </div>
          )}

          <button
            className="btn btn-primary w-100"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? (
              <>
                <span className="spinner-border spinner-border-sm me-2"></span>
                Saving...
              </>
            ) : (
              <>
                <i className="ti ti-check me-2"></i>Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");

// Export panel — filter the already-fetched invoice list by status/date
// range, preview the totals, then download as Excel/PDF/CSV. Mirrors
// app_main's ExportFilterPanel, scaled down to what DAMR tracks (no levy
// types/contracts/quarters here — just status + a period date range).
function ExportInvoicesModal({ invoices, onClose }) {
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = invoices.filter((inv) => {
    if (statusFilter && inv.status !== statusFilter) return false;
    const period = inv.periodStart ? new Date(inv.periodStart) : null;
    if (dateFrom && period && period < new Date(dateFrom)) return false;
    if (dateTo && period && period > new Date(dateTo)) return false;
    return true;
  });

  const totalBilled = filtered.reduce((s, i) => s + (i.totalAmount || 0), 0);
  const totalOutstanding = filtered.reduce(
    (s, i) => s + (i.balance ?? i.totalAmount - (i.amountPaid || 0)),
    0,
  );

  const rowsForExport = () =>
    filtered.map((inv) => ({
      "Invoice #": buildInvoiceNo(inv),
      Meter: inv.meterId?.serialNumber || "",
      Resident: inv.residentId?.name || "",
      Unit: inv.unitId?.name || "",
      "Period Start": fmtDate(inv.periodStart),
      "Period End": fmtDate(inv.periodEnd),
      "Consumption (m3)": inv.consumption,
      "Total Amount": inv.totalAmount,
      "Amount Paid": inv.amountPaid,
      Outstanding: inv.balance ?? inv.totalAmount - (inv.amountPaid || 0),
      Status: inv.status,
    }));

  const exportToExcel = () => {
    if (filtered.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(rowsForExport());
    const colWidths = Object.keys(rowsForExport()[0] || {}).map((key) => ({
      wch: Math.max(key.length, 14),
    }));
    ws["!cols"] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Invoices");
    XLSX.writeFile(wb, `invoices_${Date.now()}.xlsx`);
    toastify("Excel file downloaded", "success");
  };

  const exportToPDF = () => {
    if (filtered.length === 0) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Invoices Report", 14, 15);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Generated: ${new Date().toLocaleDateString()}  |  Total: ${filtered.length} invoices`,
      14,
      22,
    );
    doc.text(
      `Total Billed: ${formatKES(totalBilled)}   |   Outstanding: ${formatKES(totalOutstanding)}`,
      14,
      28,
    );
    autoTable(doc, {
      startY: 32,
      head: [
        [
          "Invoice #",
          "Meter",
          "Resident",
          "Unit",
          "Period",
          "Total",
          "Paid",
          "Outstanding",
          "Status",
        ],
      ],
      body: filtered.map((inv) => [
        buildInvoiceNo(inv),
        inv.meterId?.serialNumber || "",
        inv.residentId?.name || "",
        inv.unitId?.name || "",
        `${fmtDate(inv.periodStart)} - ${fmtDate(inv.periodEnd)}`,
        formatKES(inv.totalAmount),
        formatKES(inv.amountPaid),
        formatKES(inv.balance ?? inv.totalAmount - (inv.amountPaid || 0)),
        inv.status,
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });
    doc.save(`invoices_${Date.now()}.pdf`);
    toastify("PDF downloaded", "success");
  };

  const exportToCSV = () => {
    if (filtered.length === 0) return;
    const rows = rowsForExport();
    const headers = Object.keys(rows[0]);
    const csvRows = [
      headers.join(","),
      ...rows.map((r) =>
        headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","),
      ),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoices_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toastify("CSV downloaded", "success");
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20, 30, 55, 0.45)",
        zIndex: 1050,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: "560px", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-header d-flex align-items-center justify-content-between">
          <h5 className="card-title mb-0">
            <i className="ti ti-download me-2 text-success"></i>Export Invoices
          </h5>
          <button className="btn btn-sm btn-outline-secondary" onClick={onClose}>
            <i className="ti ti-x"></i>
          </button>
        </div>
        <div className="card-body">
          <div className="row">
            <div className="col-md-4 mb-3">
              <label className="form-label">Status</label>
              <select
                className="form-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                {["Unpaid", "Paid", "Partial", "Overdue", "Void", "Held"].map(
                  (s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div className="col-md-4 mb-3">
              <label className="form-label">Period From</label>
              <input
                type="date"
                className="form-control"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="col-md-4 mb-3">
              <label className="form-label">Period To</label>
              <input
                type="date"
                className="form-control"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          <div
            className="border rounded p-3 mb-3"
            style={{ background: filtered.length > 0 ? "#f0f9ff" : "#fff8f0" }}
          >
            {filtered.length === 0 ? (
              <div className="text-center text-muted py-2">
                <i className="ti ti-inbox me-2" />
                No invoices match the selected filters
              </div>
            ) : (
              <div className="row g-2 text-center">
                <div className="col-4">
                  <div className="fw-bold text-primary fs-5">{filtered.length}</div>
                  <small className="text-muted">Invoices</small>
                </div>
                <div className="col-4">
                  <div className="fw-bold text-success" style={{ fontSize: "0.95rem" }}>
                    {formatKES(totalBilled)}
                  </div>
                  <small className="text-muted">Total Billed</small>
                </div>
                <div className="col-4">
                  <div className="fw-bold text-warning" style={{ fontSize: "0.95rem" }}>
                    {formatKES(totalOutstanding)}
                  </div>
                  <small className="text-muted">Outstanding</small>
                </div>
              </div>
            )}
          </div>

          {filtered.length > 0 && (
            <div className="row g-2">
              <div className="col-4">
                <button className="btn btn-success w-100" onClick={exportToExcel}>
                  <i className="ti ti-file-spreadsheet me-1"></i> Excel
                </button>
              </div>
              <div className="col-4">
                <button className="btn btn-danger w-100" onClick={exportToPDF}>
                  <i className="ti ti-file-type-pdf me-1"></i> PDF
                </button>
              </div>
              <div className="col-4">
                <button className="btn btn-secondary w-100" onClick={exportToCSV}>
                  <i className="ti ti-file-text me-1"></i> CSV
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AllInvoicesTab() {
  const navigate = useNavigate();
  const userRole = useSelector((state) => state.damrReducer.user?.role);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortField, setSortField] = useState("index");
  const [sortDir, setSortDir] = useState("asc");
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [showExport, setShowExport] = useState(false);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      let url = `${getInvoicesURL}?limit=100`;
      if (statusFilter) url += `&status=${statusFilter}`;
      const res = await makeAuthRequest(url, "GET");
      if (res.success) setInvoices(res.data.invoices || []);
      else toastify(res.error, "error");
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [statusFilter]);

  const filtered = invoices.filter(
    (inv) =>
      inv.meterId?.serialNumber?.toLowerCase().includes(search.toLowerCase()) ||
      inv.residentId?.name?.toLowerCase().includes(search.toLowerCase()) ||
      inv.unitId?.name?.toLowerCase().includes(search.toLowerCase()),
  );
  const sorted = sortInvoices(filtered, sortField, sortDir);

  // Stats computed over every invoice currently fetched (not just the
  // filtered/sorted view) — mirrors app_main's InvoiceManagement.js summary
  // cards (total billed / collected / outstanding), adapted to what DAMR
  // actually tracks (no separate "units with active levy" concept here).
  const nonVoid = invoices.filter((inv) => inv.status !== "Void");
  const stats = {
    total: invoices.length,
    billed: nonVoid.reduce((s, inv) => s + (inv.totalAmount || 0), 0),
    collected: nonVoid.reduce((s, inv) => s + (inv.amountPaid || 0), 0),
    outstanding: nonVoid.reduce(
      (s, inv) => s + (inv.balance ?? inv.totalAmount - (inv.amountPaid || 0)),
      0,
    ),
  };

  return (
    <div className="card-body">
      <SoftTableStyles />

      <div className="row mb-4">
        {[
          ["ti-receipt", "text-primary", stats.total, "Total Invoices"],
          ["ti-cash", "text-info", formatKES(stats.billed), "Total Billed"],
          [
            "ti-circle-check",
            "text-success",
            formatKES(stats.collected),
            "Collected",
          ],
          [
            "ti-alert-triangle",
            "text-warning",
            formatKES(stats.outstanding),
            "Outstanding",
          ],
        ].map(([icon, color, val, label], i) => (
          <div key={i} className="col-md-3 col-6 mb-2">
            <div className="text-center p-3 border rounded bg-light">
              <i className={`ti ${icon} ${color} f-24 mb-2`}></i>
              <h6 className={`mb-0 ${color}`}>{val}</h6>
              <small className="text-muted">{label}</small>
            </div>
          </div>
        ))}
      </div>

      <div className="row mb-3">
        <div className="col-md-5">
          <input
            className="form-control dmr-search-pill"
            placeholder="Search by meter, resident or unit..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="col-md-3">
          <select
            className="form-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="Unpaid">Unpaid</option>
            <option value="Paid">Paid</option>
            <option value="Partial">Partial</option>
            <option value="Overdue">Overdue</option>
            <option value="Void">Void</option>
          </select>
        </div>
        <div className="col-md-4 text-end">
          <button
            className="btn btn-success btn-sm me-2"
            onClick={() => setShowExport(true)}
          >
            <i className="ti ti-download me-1"></i> Export
          </button>
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={fetchInvoices}
          >
            <i className="ti ti-refresh me-1"></i> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status"></div>
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-5">
          <i
            className="ti ti-receipt-off text-muted"
            style={{ fontSize: "48px" }}
          ></i>
          <p className="text-muted mt-2">No invoices found</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover dmr-soft-table">
            <thead>
              <tr>
                <SortableHeader label="#" field="index" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Meter" field="meter" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Resident" field="resident" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Unit" field="unit" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Period" field="period" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Consumption" field="consumption" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Total" field="total" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Paid" field="paid" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <th style={{ padding: "14px 18px", fontSize: "15px", fontWeight: 600, color: "#1f2a44" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((inv, i) => (
                <tr key={inv._id}>
                  <td>
                    {sortField === "index" && sortDir === "desc"
                      ? sorted.length - i
                      : i + 1}
                  </td>
                  <td>
                    <strong>{inv.meterId?.serialNumber || "—"}</strong>
                  </td>
                  <td>{inv.residentId?.name || "—"}</td>
                  <td>{inv.unitId?.name || "—"}</td>
                  <td>
                    <small>
                      {new Date(inv.periodStart).toLocaleDateString()} —{" "}
                      {new Date(inv.periodEnd).toLocaleDateString()}
                    </small>
                  </td>
                  <td>{inv.consumption} m³</td>
                  <td>
                    <strong>{formatKES(inv.totalAmount)}</strong>
                  </td>
                  <td>{formatKES(inv.amountPaid)}</td>
                  <td>
                    <StatusBadge status={inv.status} />
                  </td>
                  <td>
                    <div className="d-flex gap-1">
                      <button
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => navigate(`/invoices/${inv._id}`)}
                      >
                        <i className="ti ti-eye me-1"></i> View
                      </button>
                      {userRole !== "Staff" && (
                        <button
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => setEditingInvoice(inv)}
                        >
                          <i className="ti ti-edit me-1"></i> Edit
                        </button>
                      )}
                      {userRole !== "Staff" &&
                        ["Unpaid", "Overdue", "Partial"].includes(
                          inv.status,
                        ) && (
                          <button
                            className="btn btn-sm btn-outline-success"
                            onClick={() =>
                              navigate(`/invoices/${inv._id}/pay`)
                            }
                            title="Opens the dedicated Pay Invoice page"
                          >
                            <i className="ti ti-device-mobile me-1"></i> Pay
                          </button>
                        )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingInvoice && (
        <EditInvoiceModal
          invoice={editingInvoice}
          onClose={() => setEditingInvoice(null)}
          onSaved={() => {
            setEditingInvoice(null);
            fetchInvoices();
          }}
        />
      )}

      {showExport && (
        <ExportInvoicesModal
          invoices={invoices}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}

function GenerateInvoiceTab({ onSuccess }) {
  const [form, setForm] = useState({
    unitId: "",
    periodStart: "",
    periodEnd: "",
  });
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unitInfo, setUnitInfo] = useState(null);

  useEffect(() => {
    makeAuthRequest(`${UNITS_URL}?status=OCCUPIED`, "GET").then((res) => {
      if (res.success) setUnits(res.data.units || []);
      else toastify(res.error, "error");
    });
  }, []);

  const handleUnitChange = (e) => {
    const id = e.target.value;
    setForm((prev) => ({ ...prev, unitId: id }));
    const found = units.find((u) => u._id === id);
    setUnitInfo(found || null);
  };

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.unitId || !form.periodStart || !form.periodEnd) {
      toastify("Unit, period start and period end are required", "error");
      return;
    }
    try {
      setLoading(true);
      const res = await makeAuthRequest(
        `${getInvoicesURL}/generate`,
        "POST",
        form,
      );
      if (res.success) {
        toastify("Invoice generated successfully", "success");
        setForm({ unitId: "", periodStart: "", periodEnd: "" });
        setUnitInfo(null);
        if (onSuccess) onSuccess();
      } else {
        toastify(res.error, "error");
      }
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card-body">
      <div className="row justify-content-center">
        <div className="col-md-7">
          <div className="mb-3">
            <label className="form-label">
              Unit <span className="text-danger">*</span>
            </label>
            <select
              className="form-select"
              value={form.unitId}
              onChange={handleUnitChange}
            >
              <option value="">Select occupied unit...</option>
              {units.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name}
                  {u.division ? ` — ${u.division}` : ""}
                  {u.facilityId?.name ? ` (${u.facilityId.name})` : ""}
                </option>
              ))}
            </select>
            {units.length === 0 && (
              <small className="text-warning">No occupied units found.</small>
            )}
          </div>

          {unitInfo && (
            <div className="alert alert-info py-2 mb-3">
              <strong>{unitInfo.name}</strong>
              <span className="ms-2 text-muted">
                {unitInfo.facilityId?.name || ""} — billed using this
                facility's configured tariff plan (see Facilities → Edit to
                view/change it).
              </span>
            </div>
          )}

          <div className="row">
            <div className="col-md-6 mb-3">
              <label className="form-label">
                Period Start <span className="text-danger">*</span>
              </label>
              <input
                name="periodStart"
                type="date"
                className="form-control"
                value={form.periodStart}
                onChange={handleChange}
              />
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label">
                Period End <span className="text-danger">*</span>
              </label>
              <input
                name="periodEnd"
                type="date"
                className="form-control"
                value={form.periodEnd}
                onChange={handleChange}
              />
            </div>
          </div>
          <button
            className="btn btn-primary w-100"
            onClick={handleSubmit}
            disabled={loading || !form.unitId}
          >
            {loading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2"></span>
                Generating...
              </>
            ) : (
              <>
                <i className="ti ti-file-invoice me-2"></i>Generate Invoice
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkGenerateTab({ onSuccess }) {
  const [form, setForm] = useState({
    facilityId: "",
    periodStart: "",
    periodEnd: "",
  });
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    makeAuthRequest(FACILITIES_URL, "GET").then((res) => {
      if (res.success) setFacilities(res.data.facilities || []);
      else toastify(res.error, "error");
    });
  }, []);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.facilityId || !form.periodStart || !form.periodEnd) {
      toastify("All fields are required", "error");
      return;
    }
    try {
      setLoading(true);
      const res = await makeAuthRequest(`${getInvoicesURL}/bulk`, "POST", form);
      if (res.success) {
        setResult(res.data);
        toastify(`Generated ${res.data.generated} invoices`, "success");
        if (onSuccess) onSuccess();
      } else {
        toastify(res.error, "error");
      }
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card-body">
      <div className="row justify-content-center">
        <div className="col-md-7">
          <div className="alert alert-info mb-3">
            <i className="ti ti-info-circle me-2"></i>
            Generates invoices for <strong>all occupied units</strong> with an
            assigned meter in the selected facility.
          </div>

          <div className="mb-3">
            <label className="form-label">
              Facility <span className="text-danger">*</span>
            </label>
            <select
              name="facilityId"
              className="form-select"
              value={form.facilityId}
              onChange={handleChange}
            >
              <option value="">Select facility...</option>
              {facilities.map((f) => (
                <option key={f._id} value={f._id}>
                  {f.name}
                </option>
              ))}
            </select>
            {facilities.length === 0 && (
              <small className="text-warning">
                No facilities found. Add facilities first.
              </small>
            )}
          </div>

          <div className="row">
            <div className="col-md-6 mb-3">
              <label className="form-label">
                Period Start <span className="text-danger">*</span>
              </label>
              <input
                name="periodStart"
                type="date"
                className="form-control"
                value={form.periodStart}
                onChange={handleChange}
              />
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label">
                Period End <span className="text-danger">*</span>
              </label>
              <input
                name="periodEnd"
                type="date"
                className="form-control"
                value={form.periodEnd}
                onChange={handleChange}
              />
            </div>
          </div>

          <button
            className="btn btn-warning w-100"
            onClick={handleSubmit}
            disabled={loading || !form.facilityId}
          >
            {loading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2"></span>
                Running...
              </>
            ) : (
              <>
                <i className="ti ti-stack me-2"></i>Run Bulk Generate
              </>
            )}
          </button>

          {result && (
            <div className="mt-3">
              <div className="row text-center">
                <div className="col-4">
                  <div className="card bg-light-success">
                    <div className="card-body py-2">
                      <h4 className="text-success mb-0">{result.generated}</h4>
                      <small>Generated</small>
                    </div>
                  </div>
                </div>
                <div className="col-4">
                  <div className="card bg-light-warning">
                    <div className="card-body py-2">
                      <h4 className="text-warning mb-0">{result.skipped}</h4>
                      <small>Skipped</small>
                    </div>
                  </div>
                </div>
                <div className="col-4">
                  <div className="card bg-light-danger">
                    <div className="card-body py-2">
                      <h4 className="text-danger mb-0">{result.errors}</h4>
                      <small>Errors</small>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Invoices() {
  const location = useLocation();
  const userRole = useSelector((state) => state.damrReducer.user?.role);
  const [activeTab, setActiveTab] = useState(
    location.state?.activeTab || "all",
  );

  const tabs = [
    {
      key: "all",
      label: "All Invoices",
      icon: "ti ti-receipt",
      roles: ["admin", "editor"],
    },
    {
      key: "generate",
      label: "Generate",
      icon: "ti ti-file-invoice",
      roles: ["admin", "editor"],
    },
    {
      key: "bulk",
      label: "Bulk Generate",
      icon: "ti ti-stack",
      roles: ["admin"],
    },
  ];

  const visibleTabs = tabs.filter((t) => t.roles.includes(userRole));

  return (
    <Layout>
      <div className="page-header">
        <div className="page-block">
          <div className="row align-items-center">
            <div className="col-md-12">
              <ul className="breadcrumb mb-3">
                <li className="breadcrumb-item">
                  <Link to="/">Dashboard</Link>
                </li>
                <li className="breadcrumb-item active">Invoice Management</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="col-sm-12">
          <div className="card">
            <div className="card-body py-0">
              <ul className="nav nav-tabs profile-tabs" role="tablist">
                {visibleTabs.map((tab) => (
                  <li className="nav-item" key={tab.key}>
                    <button
                      className={`nav-link ${activeTab === tab.key ? "active" : ""}`}
                      onClick={() => setActiveTab(tab.key)}
                      type="button"
                    >
                      <i className={`${tab.icon} me-2`}></i>
                      {tab.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {activeTab === "all" && <AllInvoicesTab />}
            {activeTab === "generate" && (
              <GenerateInvoiceTab onSuccess={() => setActiveTab("all")} />
            )}
            {activeTab === "bulk" && userRole === "admin" && (
              <BulkGenerateTab onSuccess={() => setActiveTab("all")} />
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default Invoices;
