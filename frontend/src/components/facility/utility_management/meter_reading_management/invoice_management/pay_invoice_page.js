import React, { useState, useEffect, useRef } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import Layout from "../../../../layout/Layout";
import { makeAuthRequest } from "../../../../../utils/makeRequest";
import { toastify } from "../../../../../utils/toast";
import { getInvoicesURL } from "../../../../../utils/urls";

const formatKES = (amount) => `KES ${Number(amount || 0).toLocaleString()}`;

// Same synthetic invoice-number scheme as view_invoice.js/invoices.js —
// kept in sync so the number shown here matches everywhere else.
function buildInvoiceNo(invoice) {
  if (!invoice?._id) return "—";
  const created = new Date(invoice.createdAt || Date.now());
  const yy = String(created.getFullYear()).slice(-2);
  const mm = String(created.getMonth() + 1).padStart(2, "0");
  const dd = String(created.getDate()).padStart(2, "0");
  return `INV${yy}${mm}${dd}${invoice._id.slice(-4).toUpperCase()}`;
}

function formatKenyanPhone(phone) {
  let cleaned = String(phone || "").replace(/\D/g, "");
  if (cleaned.startsWith("0")) cleaned = "254" + cleaned.slice(1);
  else if (!cleaned.startsWith("254")) cleaned = "254" + cleaned;
  return cleaned;
}
function isValidKenyanPhone(phone) {
  return /^254\d{9}$/.test(phone);
}

// Standalone "Pay Invoice" page — was previously an always-visible card,
// then a modal, now its own route (/invoices/:id/pay) per request. Bundles
// the three payment paths: manual check against the C2B webhook, an
// explicit STK push to the resident's phone (polled for the result since
// there's no push channel of our own), and staff-recorded cash.
function PayInvoicePage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState(null);

  const [checking, setChecking] = useState(false);
  const [showStkForm, setShowStkForm] = useState(false);
  const [stkPhone, setStkPhone] = useState("");
  const [stkLoading, setStkLoading] = useState(false);
  const [stkStatus, setStkStatus] = useState(null);
  const [showCashForm, setShowCashForm] = useState(false);
  const [cashAmount, setCashAmount] = useState("");
  const [recordingCash, setRecordingCash] = useState(false);
  const pollIntervalRef = useRef(null);

  const fetchInvoice = async () => {
    try {
      setLoading(true);
      const res = await makeAuthRequest(`${getInvoicesURL}/${id}`, "GET");
      if (res.success) {
        setInvoice(res.data.invoice);
        setStkPhone((prev) => prev || res.data.invoice?.residentId?.phone || "");
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
      // Non-fatal — the page just shows "—" for account/paybill if this fails.
    }
  };

  useEffect(() => {
    fetchInvoice();
  }, [id]);

  useEffect(() => {
    if (invoice) fetchPaymentInfo();
  }, [invoice?._id]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const handleCheckPayment = async () => {
    try {
      setChecking(true);
      const res = await makeAuthRequest(
        `${getInvoicesURL}/${id}/check-payment`,
        "POST",
      );
      if (res.success) {
        toastify(res.data.message, res.data.updated ? "success" : "info");
        if (res.data.updated) fetchInvoice();
      } else {
        toastify(res.error, "error");
      }
    } catch (err) {
      toastify(err.message, "error");
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
  const pollStkStatus = (checkoutRequestId) => {
    stopStkPolling();
    let attempts = 0;
    pollIntervalRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const res = await makeAuthRequest(
          `${getInvoicesURL}/${id}/stk-status?checkoutRequestId=${checkoutRequestId}`,
          "GET",
        );
        if (res.success) {
          const { status, resultDesc, mpesaReceiptNumber, amount } = res.data;
          if (status === "success") {
            stopStkPolling();
            setStkLoading(false);
            setStkStatus({
              status,
              message: resultDesc || "Payment received",
              amount,
              receiptNumber: mpesaReceiptNumber,
            });
            toastify("Payment received", "success");
            fetchInvoice();
            return;
          }
          if (status === "failed" || status === "cancelled") {
            stopStkPolling();
            setStkLoading(false);
            setStkStatus({ status, message: resultDesc || "Payment failed" });
            toastify(resultDesc || "Payment failed", "error");
            return;
          }
        }
      } catch (err) {}
      if (attempts >= 20) {
        stopStkPolling();
        setStkLoading(false);
        setStkStatus({
          status: "pending",
          message:
            'Still waiting on the resident — use "Check for Payment" once they\'ve paid.',
        });
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
      const res = await makeAuthRequest(
        `${getInvoicesURL}/${id}/stk-push`,
        "POST",
        { phone: formattedPhone },
      );
      if (res.success) {
        setStkStatus({ status: "pending", message: res.data.message });
        toastify(res.data.message, "info");
        pollStkStatus(res.data.checkoutRequestId);
      } else {
        toastify(res.error, "error");
        setStkLoading(false);
      }
    } catch (err) {
      toastify(err.message || "STK push request failed", "error");
      setStkLoading(false);
    }
  };

  const handleRecordCashPayment = async () => {
    const amount = Number(cashAmount);
    if (!amount || amount <= 0) {
      toastify("Enter a positive amount", "error");
      return;
    }
    try {
      setRecordingCash(true);
      const res = await makeAuthRequest(
        `${getInvoicesURL}/${id}/cash-payment`,
        "POST",
        { amount },
      );
      if (res.success) {
        toastify(res.data.message, res.data.updated ? "success" : "info");
        if (res.data.updated) {
          setCashAmount("");
          setShowCashForm(false);
          fetchInvoice();
        }
      } else {
        toastify(res.error, "error");
      }
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setRecordingCash(false);
    }
  };

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
                <li className="breadcrumb-item">
                  <Link to={`/invoices/${id}`}>Invoice Details</Link>
                </li>
                <li className="breadcrumb-item active">Pay</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div
        className="card mb-3"
        style={{ borderRadius: 0 }}
      >
        <div className="card-header d-flex align-items-center justify-content-between">
          <Link to={`/invoices/${id}`}>
            <i className="ti ti-arrow-narrow-left me-1"></i>Back to Invoice
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status"></div>
        </div>
      ) : invoice ? (
        <div
          className="card"
          style={{ maxWidth: "820px", margin: "0 auto", borderRadius: 0 }}
        >
          <div className="card-header">
            <h5 className="card-title mb-0">
              <i className="ti ti-device-mobile me-2 text-success"></i>Pay
              Invoice {buildInvoiceNo(invoice)}
            </h5>
          </div>
          <div className="card-body">
            <p className="text-muted mb-3">
              Balance due:{" "}
              <strong>
                {formatKES(invoice.balance ?? invoice.totalAmount)}
              </strong>
            </p>

            {paymentInfo && (
              <table className="table table-sm mb-3">
                <tbody>
                  <tr>
                    <td className="text-muted">Paybill</td>
                    <td>
                      <strong>
                        {paymentInfo.paybillShortCode ||
                          "Not configured for this facility"}
                      </strong>
                    </td>
                  </tr>
                  <tr>
                    <td className="text-muted">Account Number</td>
                    <td>
                      <strong>{paymentInfo.accountNumber}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
            {paymentInfo && !paymentInfo.paybillShortCode && (
              <div className="alert alert-warning py-2 mb-3" style={{ borderRadius: 0 }}>
                <i className="ti ti-alert-triangle me-1"></i>
                This facility has no Paybill shortcode set — add one under
                Facilities → Edit → Tariff Plan.
              </div>
            )}

            <button
              className="btn btn-success w-100"
              style={{ borderRadius: 0 }}
              onClick={handleCheckPayment}
              disabled={checking}
            >
              {checking ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2"></span>
                  Checking...
                </>
              ) : (
                <>
                  <i className="ti ti-refresh me-2"></i>Check for Payment
                </>
              )}
            </button>

            <hr />
            {!showStkForm ? (
              <button
                className="btn btn-outline-success w-100"
                style={{ borderRadius: 0 }}
                onClick={() => setShowStkForm(true)}
              >
                <i className="ti ti-device-mobile me-2"></i>Pay Now (STK Push)
              </button>
            ) : (
              <div>
                <label className="form-label">Resident's M-Pesa Number</label>
                <input
                  type="tel"
                  className="form-control mb-2"
                  style={{ borderRadius: 0 }}
                  placeholder="e.g., 0712345678"
                  value={stkPhone}
                  onChange={(e) => setStkPhone(e.target.value)}
                  disabled={stkLoading || stkStatus?.status === "pending"}
                />
                {stkStatus && (
                  <div
                    className={`alert py-2 mb-2 ${
                      stkStatus.status === "success"
                        ? "alert-success"
                        : stkStatus.status === "pending"
                          ? "alert-warning"
                          : "alert-danger"
                    }`}
                    style={{ borderRadius: 0 }}
                  >
                    {stkStatus.message}
                  </div>
                )}
                <button
                  className="btn btn-success w-100"
                  style={{ borderRadius: 0 }}
                  onClick={handleInitiateStk}
                  disabled={stkLoading || stkStatus?.status === "pending"}
                >
                  {stkLoading || stkStatus?.status === "pending" ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2"></span>
                      Waiting for payment...
                    </>
                  ) : (
                    <>
                      <i className="ti ti-send me-2"></i>Send STK Push
                    </>
                  )}
                </button>
              </div>
            )}

            <hr />
            {!showCashForm ? (
              <button
                className="btn btn-outline-secondary w-100"
                style={{ borderRadius: 0 }}
                onClick={() => setShowCashForm(true)}
              >
                <i className="ti ti-cash-banknote me-2"></i>Record Cash
                Payment
              </button>
            ) : (
              <div>
                <label className="form-label">Amount Received (KES)</label>
                <input
                  type="number"
                  min="0"
                  className="form-control mb-2"
                  style={{ borderRadius: 0 }}
                  placeholder="e.g., 2500"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  disabled={recordingCash}
                />
                <button
                  className="btn btn-secondary w-100"
                  style={{ borderRadius: 0 }}
                  onClick={handleRecordCashPayment}
                  disabled={recordingCash}
                >
                  {recordingCash ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2"></span>
                      Recording...
                    </>
                  ) : (
                    <>
                      <i className="ti ti-check me-2"></i>Confirm Cash Payment
                    </>
                  )}
                </button>
              </div>
            )}

            {invoice.status === "Paid" && (
              <div className="alert alert-success mt-3" style={{ borderRadius: 0 }}>
                <i className="ti ti-circle-check me-2"></i>
                This invoice is already fully paid.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </Layout>
  );
}

export default PayInvoicePage;
