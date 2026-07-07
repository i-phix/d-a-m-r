import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { toastify } from "../../utils/toast";
import { backend_url } from "../../utils/urls";

// Roadmap Phase 3 — the "always-valid invoice link" a resident opens
// without logging in. Deliberately standalone: no Layout/sidebar, no
// makeAuthRequest (no token exists for an anonymous visitor), just plain
// axios calls against the public/unauthenticated backend routes.
const PUBLIC_BILL_URL = (token) => `${backend_url}/api/v1/damr/public/bill/${token}`;

function formatKenyanPhone(phone) {
  let cleaned = String(phone || "").replace(/\D/g, "");
  if (cleaned.startsWith("0")) cleaned = "254" + cleaned.slice(1);
  else if (!cleaned.startsWith("254")) cleaned = "254" + cleaned;
  return cleaned;
}
function isValidKenyanPhone(phone) {
  return /^254\d{9}$/.test(phone);
}

const formatKES = (amount) => `KES ${Number(amount || 0).toLocaleString()}`;

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

function PublicBillView() {
  const { token } = useParams();

  const [bill, setBill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);

  const [showStkForm, setShowStkForm] = useState(false);
  const [stkPhone, setStkPhone] = useState("");
  const [stkLoading, setStkLoading] = useState(false);
  const [stkStatus, setStkStatus] = useState(null);
  const pollIntervalRef = useRef(null);

  const fetchBill = async () => {
    try {
      setLoading(true);
      const res = await axios.get(PUBLIC_BILL_URL(token));
      setBill(res.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || "This bill link is invalid or has expired.");
    } finally {
      setLoading(false);
    }
  };

  const handleCheckPayment = async () => {
    try {
      setChecking(true);
      const res = await axios.post(`${PUBLIC_BILL_URL(token)}/check-payment`);
      toastify(res.data.message, res.data.updated ? "success" : "info");
      if (res.data.updated) fetchBill();
    } catch (err) {
      toastify(err.response?.data?.error || err.message, "error");
    } finally {
      setChecking(false);
    }
  };

  const stopStkPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  // Safaricom's callback is async and server-side only — poll our own
  // stk-status endpoint every few seconds until a final result (or give up
  // after ~60s, leaving "I've Paid — Check for Payment" as a fallback).
  const pollStkStatus = (checkoutRequestId) => {
    stopStkPolling();
    let attempts = 0;
    pollIntervalRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const res = await axios.get(
          `${PUBLIC_BILL_URL(token)}/stk-status`,
          { params: { checkoutRequestId } },
        );
        const { status, resultDesc } = res.data;
        if (status === "success") {
          stopStkPolling();
          setStkLoading(false);
          toastify("Payment received", "success");
          setShowStkForm(false);
          fetchBill();
          return;
        }
        if (status === "failed" || status === "cancelled") {
          stopStkPolling();
          setStkLoading(false);
          setStkStatus(resultDesc || "Payment failed");
          toastify(resultDesc || "Payment failed", "error");
          return;
        }
      } catch (err) {
        // Transient errors shouldn't kill the polling loop.
      }
      if (attempts >= 20) {
        stopStkPolling();
        setStkLoading(false);
        setStkStatus('Still waiting — tap "I\'ve Paid" once you\'ve completed the payment.');
      }
    }, 3000);
  };

  const handleInitiateStk = async () => {
    const formattedPhone = formatKenyanPhone(stkPhone);
    if (!isValidKenyanPhone(formattedPhone)) {
      toastify("Enter a valid Safaricom number (e.g., 0712345678)", "error");
      return;
    }
    try {
      setStkLoading(true);
      setStkStatus(null);
      const response = await axios.post(`${PUBLIC_BILL_URL(token)}/stk-push`, {
        phone: formattedPhone,
      });
      toastify(response.data.message || "STK push sent — check your phone to complete payment.", "success");
      pollStkStatus(response.data.checkoutRequestId);
    } catch (err) {
      const message = err.response?.data?.error || err.message || "STK push request failed";
      toastify(message, "error");
      setStkLoading(false);
    }
  };

  useEffect(() => {
    fetchBill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    return () => stopStkPolling();
  }, []);

  const pageWrapperStyle = {
    minHeight: "100vh",
    background: "#f5f7fa",
    padding: "24px 16px",
    fontFamily: "Arial, Helvetica, sans-serif",
  };
  const cardStyle = {
    maxWidth: "560px",
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
          <small>Water Bill</small>
        </div>

        <div className="p-4">
          <p className="mb-1">Dear {bill.residentName || "Resident"},</p>
          <p className="text-muted mb-3" style={{ fontSize: "14px" }}>
            {[bill.facilityName, bill.unitName ? `Unit ${bill.unitName}` : null]
              .filter(Boolean)
              .join(" — ")}
          </p>

          <div className="d-flex justify-content-between align-items-center mb-3">
            <span className="text-muted">Invoice {bill.invoiceRef}</span>
            <StatusBadge status={bill.status} />
          </div>

          <table className="table table-sm mb-3">
            <tbody>
              <tr>
                <td className="text-muted">Period</td>
                <td className="text-end">
                  {new Date(bill.periodStart).toLocaleDateString()} – {new Date(bill.periodEnd).toLocaleDateString()}
                </td>
              </tr>
              <tr>
                <td className="text-muted">Consumption</td>
                <td className="text-end">{bill.consumption} m³</td>
              </tr>
              <tr>
                <td className="text-muted">Rate / m³</td>
                <td className="text-end">{formatKES(bill.ratePerUnit)}</td>
              </tr>
              {bill.validationStatus && (
                <tr>
                  <td className="text-muted">AI Validation</td>
                  <td
                    className="text-end fw-bold"
                    style={{
                      color:
                        bill.validationStatus.status === "flagged"
                          ? "#c0392b"
                          : bill.validationStatus.status === "unavailable"
                          ? "#666"
                          : "#2e7d32",
                    }}
                  >
                    {bill.validationStatus.label}
                  </td>
                </tr>
              )}
              {bill.dueDate && (
                <tr>
                  <td className="text-muted">Due Date</td>
                  <td className="text-end">{new Date(bill.dueDate).toLocaleDateString()}</td>
                </tr>
              )}
              {bill.breakdown?.penalty > 0 && (
                <tr>
                  <td className="text-muted">Late Fee</td>
                  <td className="text-end">{formatKES(bill.breakdown.penalty)}</td>
                </tr>
              )}
              {bill.breakdown?.creditsApplied > 0 && (
                <tr>
                  <td className="text-muted">Credits Applied</td>
                  <td className="text-end">− {formatKES(bill.breakdown.creditsApplied)}</td>
                </tr>
              )}
              <tr>
                <td className="fw-bold">Total Payable</td>
                <td className="text-end fw-bold">{formatKES(bill.totalAmount)}</td>
              </tr>
              <tr>
                <td className="text-muted">Amount Paid</td>
                <td className="text-end">{formatKES(bill.amountPaid)}</td>
              </tr>
              <tr>
                <td className="fw-bold">Balance</td>
                <td className="text-end fw-bold text-danger">{formatKES(bill.balance)}</td>
              </tr>
            </tbody>
          </table>

          {bill.status !== "Paid" && (
            <>
              <div className="bg-light border rounded p-3 mb-3">
                <p className="mb-1 fw-bold" style={{ fontSize: "14px" }}>How to pay (M-Pesa Paybill)</p>
                {bill.paybillShortCode ? (
                  <>
                    <div className="d-flex justify-content-between">
                      <span className="text-muted">Paybill</span>
                      <strong>{bill.paybillShortCode}</strong>
                    </div>
                    <div className="d-flex justify-content-between">
                      <span className="text-muted">Account Number</span>
                      <strong>{bill.accountNumber}</strong>
                    </div>
                  </>
                ) : (
                  <p className="text-muted mb-0" style={{ fontSize: "13px" }}>
                    Payment details for this facility haven't been set up yet — please contact your facility manager.
                  </p>
                )}
              </div>

              <div className="d-grid gap-2 mb-2">
                {!showStkForm ? (
                  <button className="btn btn-primary" onClick={() => setShowStkForm(true)}>
                    <i className="ti ti-device-mobile me-1"></i>Pay Now (M-Pesa)
                  </button>
                ) : (
                  <div className="border rounded p-3">
                    <label className="form-label" style={{ fontSize: "13px" }}>M-Pesa Phone Number</label>
                    <input
                      type="tel"
                      className="form-control mb-2"
                      placeholder="0712345678"
                      value={stkPhone}
                      onChange={(e) => setStkPhone(e.target.value)}
                    />
                    {stkStatus && (
                      <p className="text-muted mb-2" style={{ fontSize: "13px" }}>{stkStatus}</p>
                    )}
                    <div className="d-flex gap-2">
                      <button
                        className="btn btn-primary flex-grow-1"
                        disabled={stkLoading}
                        onClick={handleInitiateStk}
                      >
                        {stkLoading ? "Sending..." : "Send STK Push"}
                      </button>
                      <button
                        className="btn btn-outline-secondary"
                        onClick={() => setShowStkForm(false)}
                        disabled={stkLoading}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                <button
                  className="btn btn-outline-primary"
                  disabled={checking}
                  onClick={handleCheckPayment}
                >
                  {checking ? "Checking..." : "I've Paid — Check for Payment"}
                </button>
              </div>
            </>
          )}

          <p className="text-muted text-center mt-3 mb-0" style={{ fontSize: "12px" }}>
            Private &amp; confidential — DAMR Automated Utility Billing
          </p>
        </div>
      </div>
    </div>
  );
}

export default PublicBillView;
