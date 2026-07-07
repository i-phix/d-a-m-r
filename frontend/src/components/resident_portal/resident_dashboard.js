import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import Layout from "../layout/Layout";
import { makeAuthRequest } from "../../utils/makeRequest";
import { toastify } from "../../utils/toast";
import { myResidenciesURL, myInvoicesURL } from "../../utils/urls";

const formatCurrency = (amount) => `KES ${Number(amount || 0).toLocaleString()}`;

function ResidentDashboard() {
  const navigate = useNavigate();
  const user = useSelector((state) => state.damrReducer.user);

  const [loading, setLoading] = useState(false);
  const [residencies, setResidencies] = useState([]);
  const [outstandingBalance, setOutstandingBalance] = useState(0);
  const [invoiceCount, setInvoiceCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [resRes, invRes] = await Promise.all([
          makeAuthRequest(myResidenciesURL, "GET"),
          makeAuthRequest(myInvoicesURL, "GET"),
        ]);
        if (resRes.success) setResidencies(resRes.data.residencies || []);
        else toastify(resRes.error, "error");

        if (invRes.success) {
          setOutstandingBalance(invRes.data.outstandingBalance || 0);
          setInvoiceCount(invRes.data.total || 0);
        }
      } catch (err) {
        toastify(err.message, "error");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <Layout>
      <div className="row">
        <div className="col-md-12">
          <div className="card mb-3">
            <div className="card-body">
              <h5 className="mb-0">
                Welcome, <strong>{user?.fullName || user?.email}</strong>
              </h5>
              <p className="text-muted mb-0">Here's what's happening on your account.</p>
            </div>
          </div>

          <div className="row mb-4">
            <div className="col-md-4 col-sm-6 mb-3">
              <div className="card h-100">
                <div className="card-body">
                  <p className="text-muted mb-1">Units Linked to You</p>
                  <h3 className="mb-0">{residencies.length}</h3>
                </div>
              </div>
            </div>
            <div className="col-md-4 col-sm-6 mb-3">
              <div
                className="card h-100"
                style={{ cursor: "pointer" }}
                onClick={() => navigate("/resident/bills")}
              >
                <div className="card-body">
                  <p className="text-muted mb-1">Outstanding Balance</p>
                  <h3 className={`mb-0 ${outstandingBalance > 0 ? "text-danger" : "text-success"}`}>
                    {formatCurrency(outstandingBalance)}
                  </h3>
                </div>
              </div>
            </div>
            <div className="col-md-4 col-sm-6 mb-3">
              <div
                className="card h-100"
                style={{ cursor: "pointer" }}
                onClick={() => navigate("/resident/bills")}
              >
                <div className="card-body">
                  <p className="text-muted mb-1">Total Bills</p>
                  <h3 className="mb-0">{invoiceCount}</h3>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h5 className="card-title mb-0">
                <i className="ti ti-home me-2 text-primary"></i>My Unit{residencies.length !== 1 ? "s" : ""}
              </h5>
            </div>
            <div className="card-body">
              {loading ? (
                <div className="text-center py-4">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                </div>
              ) : residencies.length === 0 ? (
                <div className="text-center py-4">
                  <i className="ti ti-building-off text-muted" style={{ fontSize: 48 }}></i>
                  <p className="text-muted mt-2">
                    No units linked to your account yet. Contact your facility manager if this looks wrong.
                  </p>
                </div>
              ) : (
                <div className="row">
                  {residencies.map((r) => (
                    <div className="col-md-6 mb-3" key={r.residentDocId}>
                      <div className="card border h-100">
                        <div className="card-body">
                          <h6 className="mb-1">
                            {r.unit?.name || "Unit"}{" "}
                            {r.status !== "Active" && (
                              <span className="badge bg-light-secondary ms-1">{r.status}</span>
                            )}
                          </h6>
                          <p className="text-muted mb-2" style={{ fontSize: 13 }}>
                            {r.facility?.name || "—"}
                          </p>
                          {r.meter ? (
                            <small className="text-muted d-block">
                              Meter <strong>{r.meter.serialNumber}</strong> — last reading{" "}
                              <strong>{r.meter.lastReadingValue ?? "N/A"} m³</strong>
                              {r.meter.lastReadingDate
                                ? ` on ${new Date(r.meter.lastReadingDate).toLocaleDateString()}`
                                : ""}
                            </small>
                          ) : (
                            <small className="text-muted">No meter assigned yet.</small>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default ResidentDashboard;
