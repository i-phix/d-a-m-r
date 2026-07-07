import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { backend_url } from "../../utils/urls";

// Roadmap Phase 8, #3 — resident-level "statement of account". Same
// deliberately standalone pattern as public_bill_view.js (no Layout/
// sidebar, no makeAuthRequest — there's no session, the token itself is
// the credential) but lists every invoice the resident has ever had
// instead of just one, with a running outstanding balance. Read-only —
// paying a specific bill still happens via that bill's own link (sent in
// every invoice notification alongside this statement link), not from here.
const PUBLIC_STATEMENT_URL = (token) => `${backend_url}/api/v1/damr/public/statement/${token}`;

const formatKES = (amount) => `KES ${Number(amount || 0).toLocaleString()}`;
const formatDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");

const StatusBadge = ({ status }) => {
  const map = {
    Paid: "bg-success",
    Unpaid: "bg-warning",
    Partial: "bg-info",
    Overdue: "bg-danger",
    Void: "bg-secondary",
  };
  return <span className={`badge ${map[status] || "bg-secondary"}`}>{status}</span>;
};

function StatementView() {
  const { token } = useParams();

  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await axios.get(PUBLIC_STATEMENT_URL(token));
        setStatement(res.data);
        setError(null);
      } catch (err) {
        setError(err.response?.data?.error || "This statement link is invalid or has expired.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const pageWrapperStyle = {
    minHeight: "100vh",
    background: "#f5f7fa",
    padding: "24px 16px",
    fontFamily: "Arial, Helvetica, sans-serif",
  };
  const cardStyle = {
    maxWidth: "760px",
    margin: "0 auto",
    background: "#fff",
    borderRadius: "8px",
    overflow: "hidden",
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  };
  const headerStyle = {
    background: "#0d3b66",
    color: "#fff",
    padding: "20px 24px",
    textAlign: "center",
  };

  if (loading) {
    return (
      <div style={pageWrapperStyle}>
        <div style={cardStyle}>
          <div style={headerStyle}><h4 className="mb-0">DAMR — PayServe</h4></div>
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={pageWrapperStyle}>
        <div style={cardStyle}>
          <div style={headerStyle}><h4 className="mb-0">DAMR — PayServe</h4></div>
          <div className="p-4 text-center">
            <i className="ti ti-alert-triangle text-danger" style={{ fontSize: "40px" }}></i>
            <p className="mt-3 text-muted">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageWrapperStyle}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <h4 className="mb-0">DAMR — PayServe</h4>
          <small>Statement of Account</small>
        </div>

        <div className="p-4">
          <p className="mb-1">Dear {statement.residentName || "Resident"},</p>
          <p className="text-muted mb-3" style={{ fontSize: "14px" }}>
            {[statement.facilityName, statement.unitName ? `Unit ${statement.unitName}` : null]
              .filter(Boolean)
              .join(" — ")}
          </p>

          <div className="d-flex justify-content-between align-items-center bg-light border rounded p-3 mb-3">
            <span className="text-muted">Current Outstanding Balance</span>
            <strong className={statement.outstandingBalance > 0 ? "text-danger" : "text-success"}>
              {formatKES(statement.outstandingBalance)}
            </strong>
          </div>

          {!statement.invoices?.length ? (
            <p className="text-muted text-center py-4">No bills on record yet.</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm align-middle">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Invoice</th>
                    <th className="text-end">Consumption</th>
                    <th className="text-end">Total</th>
                    <th className="text-end">Paid</th>
                    <th className="text-end">Balance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.invoices.map((inv) => (
                    <tr key={inv.invoiceRef}>
                      <td style={{ fontSize: "13px" }}>
                        {formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}
                      </td>
                      <td style={{ fontSize: "13px" }}>{inv.invoiceRef}</td>
                      <td className="text-end">{inv.consumption} m³</td>
                      <td className="text-end">{formatKES(inv.totalAmount)}</td>
                      <td className="text-end">{formatKES(inv.amountPaid)}</td>
                      <td className="text-end">{formatKES(inv.balance)}</td>
                      <td><StatusBadge status={inv.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-muted mt-3 mb-0" style={{ fontSize: "13px" }}>
            To pay a specific bill, use the "View &amp; Pay" link sent with that bill's own
            notification (SMS/WhatsApp/email).
          </p>

          <p className="text-muted text-center mt-3 mb-0" style={{ fontSize: "12px" }}>
            Private &amp; confidential — DAMR Automated Utility Billing
          </p>
        </div>
      </div>
    </div>
  );
}

export default StatementView;
