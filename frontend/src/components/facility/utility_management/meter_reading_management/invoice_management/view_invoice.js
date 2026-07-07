import React, { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import Layout from "../../../../layout/Layout";
import { makeAuthRequest } from "../../../../../utils/makeRequest";
import { toastify } from "../../../../../utils/toast";
import { getInvoicesURL } from "../../../../../utils/urls";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const StatusBadge = ({ status }) => {
  const map = {
    Paid: "bg-success",
    Unpaid: "bg-warning",
    Partial: "bg-info",
    Overdue: "bg-danger",
    Void: "bg-secondary",
    Held: "bg-dark",
  };
  return (
    <span className={`badge ${map[status] || "bg-secondary"}`}>{status}</span>
  );
};

const formatKES = (amount) => `KES ${Number(amount || 0).toLocaleString()}`;

// ── Invoice document (PayServe-style bill) ─────────────────────────────
// This is now the whole view — the old two-column "Invoice Details /
// Charge Breakdown / Meter / Billing Summary / Resident / Pay via M-Pesa"
// cards were removed (they duplicated everything this document already
// shows). Payment actions (STK push, cash payment, check-for-payment) were
// removed along with them per request — if that functionality needs to
// come back, it should live inside this document rather than as a
// separate row of cards.
const RIBBON_COLORS = {
  Paid: "#2e9e4f",
  Unpaid: "#d6127d",
  Overdue: "#c0392b",
  Partial: "#2f6fd1",
  Void: "#6c757d",
  Held: "#495057",
};

function formatOrdinalDate(date) {
  if (!date) return "—";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "—";
  const day = d.getDate();
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";
  const month = d.toLocaleDateString("en-US", { month: "short" });
  return `${day}${suffix} ${month} ${d.getFullYear()}`;
}

function buildInvoiceNo(invoice) {
  if (!invoice?._id) return "—";
  const created = new Date(invoice.createdAt || Date.now());
  const yy = String(created.getFullYear()).slice(-2);
  const mm = String(created.getMonth() + 1).padStart(2, "0");
  const dd = String(created.getDate()).padStart(2, "0");
  return `INV${yy}${mm}${dd}${invoice._id.slice(-4).toUpperCase()}`;
}

const InvoiceDocStyles = () => (
  <style>{`
    .dmr-invoice-doc {
      max-width: 820px;
      margin: 0 auto;
      overflow: hidden;
      border: 1px solid #e3e8f0;
      background: #fff;
      box-shadow: 0 2px 14px rgba(20, 40, 90, 0.08);
    }
    .dmr-invoice-doc__header {
      position: relative;
      overflow: hidden;
      background: linear-gradient(135deg, #2f7cf6, #1c5fd8);
      color: #fff;
      padding: 40px 40px 36px;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 16px;
    }
    .dmr-invoice-doc__ribbon {
      position: absolute;
      top: 22px;
      left: -46px;
      width: 180px;
      transform: rotate(-45deg);
      text-align: center;
      padding: 7px 0;
      font-weight: 700;
      font-size: 12px;
      letter-spacing: 2px;
      color: #fff;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
    }
    .dmr-invoice-doc__title {
      font-size: 30px;
      font-weight: 700;
      letter-spacing: 1.5px;
      margin: 0 0 0 28px;
    }
    .dmr-invoice-doc__meta {
      text-align: right;
      font-size: 13px;
      line-height: 2.1;
    }
    .dmr-invoice-doc__meta > div {
      white-space: nowrap;
    }
    .dmr-invoice-doc__meta b {
      letter-spacing: 0.5px;
      opacity: 0.8;
      font-weight: 600;
      margin-right: 14px;
    }
    .dmr-invoice-doc__body {
      padding: 36px 40px;
    }
    .dmr-invoice-doc__parties {
      display: flex;
      flex-wrap: wrap;
      gap: 24px;
      justify-content: space-between;
      border-bottom: 2px solid #1c5fd8;
      padding-bottom: 28px;
      margin-bottom: 28px;
    }
    .dmr-invoice-doc__parties > div {
      line-height: 1.7;
    }
    .dmr-invoice-doc__label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.8px;
      color: #8a93a6;
      margin-bottom: 10px;
    }
    .dmr-invoice-doc__total-due {
      font-size: 30px;
      font-weight: 700;
      color: #1c5fd8;
    }
    table.dmr-invoice-doc__items {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    table.dmr-invoice-doc__items thead th {
      text-align: left;
      font-size: 11px;
      letter-spacing: 0.6px;
      color: #1c5fd8;
      font-weight: 700;
      border-bottom: 2px solid #eef1f6;
      padding: 10px 6px 14px;
    }
    table.dmr-invoice-doc__items td {
      padding: 14px 6px;
      font-size: 14px;
      border-bottom: 1px solid #f4f6fa;
    }
    .dmr-invoice-doc__totals {
      margin-left: auto;
      width: 100%;
      max-width: 360px;
      padding-top: 8px;
    }
    .dmr-invoice-doc__totals-row {
      display: flex;
      justify-content: space-between;
      padding: 9px 6px;
      font-size: 14px;
    }
    .dmr-invoice-doc__totals-row.strong {
      font-weight: 700;
      color: #1c5fd8;
      border-top: 1px solid #eef1f6;
      margin-top: 8px;
      padding-top: 16px;
    }
    .dmr-invoice-doc__totals-row.due {
      font-weight: 700;
      color: #c0392b;
      font-size: 18px;
      border-top: 2px solid #1c5fd8;
      border-bottom: 2px solid #1c5fd8;
      margin-top: 10px;
      padding-top: 18px;
      padding-bottom: 18px;
    }
    .dmr-invoice-doc__footer {
      background: #f8fafd;
      border-top: 1px solid #eef1f6;
      padding: 24px 40px 28px;
    }
    .dmr-invoice-doc__footer-title {
      text-align: center;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 1px;
      color: #1f2a44;
      margin-bottom: 18px;
    }
    .dmr-invoice-doc__footer-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 24px;
      justify-content: space-between;
      align-items: center;
    }
    .dmr-invoice-doc__footer-col {
      font-size: 13px;
      color: #4a5468;
      line-height: 2;
    }
    .dmr-invoice-doc__footer-col b {
      color: #1f2a44;
    }
    .dmr-invoice-doc__signature {
      text-align: center;
      font-size: 12px;
      color: #8a93a6;
    }
    .dmr-invoice-doc__signature-line {
      width: 180px;
      border-top: 1px solid #c7ceda;
      margin: 32px auto 6px;
    }
  `}</style>
);


function ViewInvoice() {
  const { id } = useParams();
  const navigate = useNavigate();
  const userRole = useSelector((state) => state.damrReducer.user?.role);

  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [publicLink, setPublicLink] = useState(null);
  const [loadingPublicLink, setLoadingPublicLink] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const fetchInvoice = async () => {
    try {
      setLoading(true);
      const res = await makeAuthRequest(`${getInvoicesURL}/${id}`, "GET");
      if (res.success) {
        setInvoice(res.data.invoice);
      } else {
        toastify(res.error, "error");
        navigate("/invoices");
      }
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchPaymentInfo = async () => {
    try {
      const res = await makeAuthRequest(
        `${getInvoicesURL}/${id}/payment-info`,
        "GET",
      );
      if (res.success) setPaymentInfo(res.data);
    } catch (err) {
      // Non-fatal — the invoice document just shows "—" for account/paybill
      // fields if this fails, so no toast needed here.
    }
  };

  const handleGetPublicLink = async () => {
    try {
      setLoadingPublicLink(true);
      const res = await makeAuthRequest(
        `${getInvoicesURL}/${id}/public-link`,
        "GET",
      );
      if (res.success) {
        const url = `${window.location.origin}/bill/${res.data.token}`;
        setPublicLink(url);
        if (navigator.clipboard) {
          navigator.clipboard.writeText(url).then(
            () => toastify("Bill link copied to clipboard", "success"),
            () => toastify("Bill link ready — copy it below", "info"),
          );
        } else {
          toastify("Bill link ready — copy it below", "info");
        }
      } else {
        toastify(res.error, "error");
      }
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setLoadingPublicLink(false);
    }
  };

  // Client-side render of the invoice document to PDF — mirrors app_main's
  // InvoicePage.js handleDownloadPDF (html2canvas snapshot -> jsPDF pages),
  // targeting the same "printable-invoice" element id.
  const handleDownloadPDF = async () => {
    const element = document.getElementById("printable-invoice");
    if (!element) {
      toastify("Nothing to download yet — invoice hasn't loaded", "error");
      return;
    }
    try {
      setDownloadingPdf(true);
      toastify("Generating PDF...", "info");

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/jpeg", 1.0);
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let position = 0;

      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, "", "FAST");

      let heightLeft = imgHeight - pageHeight;
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, "", "FAST");
        heightLeft -= pageHeight;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      pdf.save(`Invoice_${buildInvoiceNo(invoice)}_${timestamp}.pdf`);
      toastify("PDF downloaded successfully!", "success");
    } catch (err) {
      console.error("PDF generation error:", err);
      toastify("Failed to generate PDF. Please try again.", "error");
    } finally {
      setDownloadingPdf(false);
    }
  };

  useEffect(() => {
    fetchInvoice();
  }, [id]);

  useEffect(() => {
    // Powers the ACCOUNT NO. field in the header and the PAYMENT DETAILS
    // footer (Paybill/account) — fetched regardless of invoice status.
    if (invoice) fetchPaymentInfo();
  }, [invoice?._id]);

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
                <li className="breadcrumb-item">
                  <Link to="/invoices">Invoice Management</Link>
                </li>
                <li className="breadcrumb-item active">Invoice Details</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-header d-flex align-items-center justify-content-between">
          <Link to="/invoices">
            <i className="ti ti-arrow-narrow-left me-1"></i>Back to Invoices
          </Link>
          <div className="d-flex align-items-center gap-2">
            {invoice && (
              <div className="dropdown">
                <button
                  className="btn btn-sm btn-outline-secondary dropdown-toggle"
                  type="button"
                  data-bs-toggle="dropdown"
                  aria-expanded="false"
                  style={{ borderRadius: 0 }}
                >
                  <i className="ti ti-dots-vertical me-1"></i>Invoice Action
                </button>
                <ul className="dropdown-menu dropdown-menu-end">
                  {userRole !== "Staff" && (
                    <li>
                      <button
                        className="dropdown-item"
                        disabled={loadingPublicLink}
                        onClick={handleGetPublicLink}
                      >
                        <i className="ti ti-link me-2"></i>
                        {loadingPublicLink ? "Generating..." : "Share Link"}
                      </button>
                    </li>
                  )}
                  <li>
                    <button
                      className="dropdown-item"
                      disabled={downloadingPdf}
                      onClick={handleDownloadPDF}
                    >
                      <i className="ti ti-download me-2"></i>
                      {downloadingPdf ? "Generating..." : "Download Invoice"}
                    </button>
                  </li>
                </ul>
              </div>
            )}
            {invoice &&
              userRole !== "Staff" &&
              ["Unpaid", "Overdue", "Partial"].includes(invoice.status) && (
                <button
                  className="btn btn-sm btn-success"
                  style={{ borderRadius: 0 }}
                  onClick={() => navigate(`/invoices/${id}/pay`)}
                >
                  <i className="ti ti-device-mobile me-1"></i>Pay
                </button>
              )}
            {invoice && <StatusBadge status={invoice.status} />}
          </div>
        </div>
        {publicLink && (
          <div className="card-body py-2">
            <small className="text-muted d-block mb-1">
              No-login bill link (valid 90 days) — send this to the resident
              directly:
            </small>
            <div className="input-group input-group-sm">
              <input
                type="text"
                className="form-control"
                value={publicLink}
                readOnly
              />
              <button
                className="btn btn-outline-primary"
                onClick={() => {
                  if (navigator.clipboard)
                    navigator.clipboard.writeText(publicLink);
                  toastify("Copied", "success");
                }}
              >
                Copy
              </button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status"></div>
        </div>
      ) : invoice ? (
        <>
          <InvoiceDocStyles />
          <div className="dmr-invoice-doc mb-4" id="printable-invoice">
            <div className="dmr-invoice-doc__header">
              <span
                className="dmr-invoice-doc__ribbon"
                style={{
                  background: RIBBON_COLORS[invoice.status] || "#6c757d",
                }}
              >
                {invoice.status?.toUpperCase()}
              </span>
              <h3 className="dmr-invoice-doc__title">INVOICE</h3>
              <div className="dmr-invoice-doc__meta">
                <div>
                  <b>INVOICE NO.</b>
                  {buildInvoiceNo(invoice)}
                </div>
                <div>
                  <b>ACCOUNT NO.</b>
                  {paymentInfo?.accountNumber || "—"}
                </div>
                <div>
                  <b>INVOICE DATE</b>
                  {formatOrdinalDate(invoice.createdAt)}
                </div>
                <div>
                  <b>DUE DATE</b>
                  {formatOrdinalDate(invoice.dueDate)}
                </div>
              </div>
            </div>

            <div className="dmr-invoice-doc__body">
              <div className="dmr-invoice-doc__parties">
                <div>
                  <div className="dmr-invoice-doc__label">FROM</div>
                  <div>
                    <strong>{invoice.facilityId?.name || "Facility"}</strong>
                  </div>
                  {invoice.facilityId?.location && (
                    <div className="text-muted">
                      {invoice.facilityId.location}
                    </div>
                  )}
                </div>
                <div>
                  <div className="dmr-invoice-doc__label">BILL TO</div>
                  <div>
                    <strong>{invoice.residentId?.name || "—"}</strong>
                  </div>
                  <div className="text-muted">
                    Unit: {invoice.unitId?.name || "—"}
                  </div>
                </div>
                <div>
                  <div className="dmr-invoice-doc__label">TOTAL DUE</div>
                  <div className="dmr-invoice-doc__total-due">
                    {formatKES(invoice.balance ?? invoice.totalAmount)}
                  </div>
                </div>
              </div>

              <table className="dmr-invoice-doc__items">
                <thead>
                  <tr>
                    <th>DESCRIPTION</th>
                    <th className="text-end">UNIT PRICE</th>
                    <th className="text-end">QTY</th>
                    <th className="text-end">AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      Water Charge — {invoice.periodStart &&
                        new Date(invoice.periodStart).toLocaleDateString(
                          "en-US",
                          { month: "long", year: "numeric" },
                        )}
                    </td>
                    <td className="text-end">
                      {invoice.breakdown?.bands?.length > 1
                        ? "—"
                        : formatKES(invoice.ratePerUnit)}
                    </td>
                    <td className="text-end">{invoice.consumption} m³</td>
                    <td className="text-end">
                      {formatKES(invoice.breakdown?.waterCharge)}
                    </td>
                  </tr>
                  {invoice.breakdown?.sewerageCharge > 0 && (
                    <tr>
                      <td>Sewerage Charge</td>
                      <td className="text-end">—</td>
                      <td className="text-end">—</td>
                      <td className="text-end">
                        {formatKES(invoice.breakdown.sewerageCharge)}
                      </td>
                    </tr>
                  )}
                  {invoice.breakdown?.techFee > 0 && (
                    <tr>
                      <td>Tech Fee</td>
                      <td className="text-end">—</td>
                      <td className="text-end">1</td>
                      <td className="text-end">
                        {formatKES(invoice.breakdown.techFee)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="dmr-invoice-doc__totals">
                <div className="dmr-invoice-doc__totals-row">
                  <span>SUBTOTAL</span>
                  <span>
                    {formatKES(
                      (invoice.breakdown?.waterCharge || 0) +
                        (invoice.breakdown?.sewerageCharge || 0) +
                        (invoice.breakdown?.techFee || 0),
                    )}
                  </span>
                </div>
                <div className="dmr-invoice-doc__totals-row strong">
                  <span>INVOICE TOTAL</span>
                  <span>
                    {formatKES(
                      (invoice.breakdown?.waterCharge || 0) +
                        (invoice.breakdown?.sewerageCharge || 0) +
                        (invoice.breakdown?.techFee || 0),
                    )}
                  </span>
                </div>
                {invoice.breakdown?.arrears > 0 && (
                  <div className="dmr-invoice-doc__totals-row">
                    <span>BALANCE B/FORWARD</span>
                    <span>{formatKES(invoice.breakdown.arrears)}</span>
                  </div>
                )}
                {invoice.breakdown?.penalty > 0 && (
                  <div className="dmr-invoice-doc__totals-row">
                    <span>LATE FEE</span>
                    <span>{formatKES(invoice.breakdown.penalty)}</span>
                  </div>
                )}
                {invoice.breakdown?.creditsApplied > 0 && (
                  <div className="dmr-invoice-doc__totals-row">
                    <span>CREDITS APPLIED</span>
                    <span>
                      − {formatKES(invoice.breakdown.creditsApplied)}
                    </span>
                  </div>
                )}
                <div className="dmr-invoice-doc__totals-row strong">
                  <span>AMOUNT PAYABLE</span>
                  <span>{formatKES(invoice.totalAmount)}</span>
                </div>
                <div className="dmr-invoice-doc__totals-row">
                  <span>PAYMENT</span>
                  <span>{formatKES(invoice.amountPaid)}</span>
                </div>
                <div className="dmr-invoice-doc__totals-row due">
                  <span>TOTAL DUE</span>
                  <span>
                    {formatKES(invoice.balance ?? invoice.totalAmount)}
                  </span>
                </div>
              </div>
            </div>

            {paymentInfo?.paybillShortCode && (
              <div className="dmr-invoice-doc__footer">
                <div className="dmr-invoice-doc__footer-title">
                  PAYMENT DETAILS
                </div>
                <div className="dmr-invoice-doc__footer-grid">
                  <div className="dmr-invoice-doc__footer-col">
                    <div>
                      <b>Pay via:</b> M-Pesa Paybill
                    </div>
                    <div>
                      <b>Paybill No.:</b> {paymentInfo.paybillShortCode}
                    </div>
                    <div>
                      <b>Account No.:</b> {paymentInfo.accountNumber}
                    </div>
                    {invoice.mpesaCode && (
                      <div>
                        <b>M-Pesa Receipt:</b> {invoice.mpesaCode}
                      </div>
                    )}
                  </div>
                  <div className="dmr-invoice-doc__signature">
                    <div className="dmr-invoice-doc__signature-line"></div>
                    Authorized Signature
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      ) : null}
    </Layout>
  );
}

export default ViewInvoice;
