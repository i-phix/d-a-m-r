import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../layout/Layout";
import { makeAuthRequest } from "../../utils/makeRequest";
import { toastify } from "../../utils/toast";
import { myInvoicesURL } from "../../utils/urls";

const formatCurrency = (amount) => `KES ${Number(amount || 0).toLocaleString()}`;

const STATUS_COLORS = {
  Paid: "bg-light-success",
  Unpaid: "bg-light-warning",
  Partial: "bg-light-info",
  Overdue: "bg-light-danger",
  Void: "bg-light-secondary",
};

const VALIDATION_COLORS = { passed: "#2e7d32", cleared: "#2e7d32", flagged: "#c0392b", unavailable: "#666" };

function ResidentBills() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [outstandingBalance, setOutstandingBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [payingId, setPayingId] = useState(null);

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      const res = await makeAuthRequest(myInvoicesURL, "GET");
      if (res.success) {
        setInvoices(res.data.invoices || []);
        setOutstandingBalance(res.data.outstandingBalance || 0);
      } else {
        toastify(res.error, "error");
      }
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Reuses the same tokenized public-bill page (and its Pay Now / STK push
  // flow) staff already generate links from — nothing new to build here.
  const handlePayNow = async (invoiceId) => {
    try {
      setPayingId(invoiceId);
      const res = await makeAuthRequest(`${myInvoicesURL}/${invoiceId}/bill-link`, "GET");
      if (res.success) {
        navigate(`/bill/${res.data.token}`);
      } else {
        toastify(res.error, "error");
      }
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setPayingId(null);
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
                  <Link to="/">My Unit</Link>
                </li>
                <li className="breadcrumb-item active">My Bills</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="alert alert-secondary d-flex justify-content-between align-items-center mb-3">
        <strong>Outstanding balance</strong>
        <span className={`fs-5 ${outstandingBalance > 0 ? "text-danger" : "text-success"}`}>
          {formatCurrency(outstandingBalance)}
        </span>
      </div>

      <div className="card">
        <div className="card-header">
          <h5 className="card-title mb-0">
            <i className="ti ti-note me-2 text-primary"></i>Bill History
          </h5>
        </div>
        <div className="card-body">
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-4">
              <i className="ti ti-inbox text-muted" style={{ fontSize: 48 }}></i>
              <p className="text-muted mt-2">No bills yet.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Unit</th>
                    <th className="text-end">Consumption</th>
                    <th className="text-end">Total</th>
                    <th className="text-end">Balance</th>
                    <th>Status</th>
                    <th>AI Validation</th>
                    <th>Due</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv._id}>
                      <td>
                        {new Date(inv.periodStart).toLocaleDateString()} –{" "}
                        {new Date(inv.periodEnd).toLocaleDateString()}
                      </td>
                      <td>{inv.unitId?.name || "—"}</td>
                      <td className="text-end">{inv.consumption} m³</td>
                      <td className="text-end">{formatCurrency(inv.totalAmount)}</td>
                      <td className="text-end">
                        {formatCurrency(inv.balance ?? inv.totalAmount)}
                      </td>
                      <td>
                        <span className={`badge ${STATUS_COLORS[inv.status] || "bg-light-secondary"}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td>
                        {inv.validationStatus && (
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: "bold",
                              color: VALIDATION_COLORS[inv.validationStatus.status] || "#666",
                            }}
                          >
                            {inv.validationStatus.label}
                          </span>
                        )}
                      </td>
                      <td>{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "—"}</td>
                      <td>
                        {inv.status !== "Paid" && inv.status !== "Void" && (
                          <button
                            className="btn btn-sm btn-primary"
                            disabled={payingId === inv._id}
                            onClick={() => handlePayNow(inv._id)}
                          >
                            {payingId === inv._id ? "Loading..." : "Pay Now"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

export default ResidentBills;
