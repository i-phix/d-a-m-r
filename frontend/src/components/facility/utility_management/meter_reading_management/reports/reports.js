import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import Layout from "../../../../layout/Layout";
import { makeAuthRequest } from "../../../../../utils/makeRequest";
import { toastify } from "../../../../../utils/toast";
import {
  arrearsAgeingURL,
  defaultersURL,
  consumptionTrendsURL,
  bulkMetersURL,
  nrwReportURL,
} from "../../../../../utils/urls";

const FACILITIES_URL = "/api/v1/damr/facility/facilities";

const formatCurrency = (amount) => `KES ${Number(amount || 0).toLocaleString()}`;

// ── Shared facility filter dropdown ─────────────────────────────────────
function useFacilities() {
  const [facilities, setFacilities] = useState([]);
  useEffect(() => {
    makeAuthRequest(FACILITIES_URL, "GET").then((res) => {
      if (res.success) setFacilities(res.data.facilities || []);
    });
  }, []);
  return facilities;
}

function FacilitySelect({ value, onChange, facilities, includeAll = true }) {
  return (
    <select
      className="form-select form-select-sm"
      style={{ maxWidth: 260 }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {includeAll && <option value="">All facilities</option>}
      {!includeAll && <option value="">Select facility...</option>}
      {facilities.map((f) => (
        <option key={f._id} value={f._id}>
          {f.name}
        </option>
      ))}
    </select>
  );
}

// ══════════════════════════════════════════════════════════════════════
// TAB 1 — Arrears Ageing
// ══════════════════════════════════════════════════════════════════════
function ArrearsAgeingTab() {
  const facilities = useFacilities();
  const [facilityId, setFacilityId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const url = facilityId
        ? `${arrearsAgeingURL}?facilityId=${facilityId}`
        : arrearsAgeingURL;
      const res = await makeAuthRequest(url, "GET");
      if (res.success) setData(res.data);
      else toastify(res.error, "error");
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [facilityId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const bucketColors = { "0-30": "#e58a00", "31-60": "#e5670b", "61-90": "#dc3545", "90+": "#8b0000" };

  return (
    <div className="card-body">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <p className="text-muted mb-0">
          Outstanding balances on overdue invoices, grouped by how many days past due.
        </p>
        <FacilitySelect value={facilityId} onChange={setFacilityId} facilities={facilities} />
      </div>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : !data ? null : (
        <>
          <div className="row mb-4">
            {data.buckets.map((b) => (
              <div className="col-md-3 col-sm-6 mb-3" key={b.label}>
                <div className="card h-100" style={{ borderLeft: `4px solid ${bucketColors[b.label]}` }}>
                  <div className="card-body">
                    <h6 className="text-muted mb-1">{b.label} days</h6>
                    <h4 className="mb-0">{formatCurrency(b.amount)}</h4>
                    <small className="text-muted">{b.count} invoice{b.count === 1 ? "" : "s"}</small>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="alert alert-secondary d-flex justify-content-between align-items-center">
            <strong>Total outstanding</strong>
            <span className="fs-5">{formatCurrency(data.totalOutstanding)}</span>
          </div>

          {data.byFacility.length > 0 && (
            <div className="table-responsive mt-3">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Facility</th>
                    {data.buckets.map((b) => (
                      <th key={b.label} className="text-end">{b.label}</th>
                    ))}
                    <th className="text-end">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byFacility.map((f) => (
                    <tr key={f.facilityId || "unassigned"}>
                      <td>{f.facilityName}</td>
                      {f.buckets.map((b) => (
                        <td key={b.label} className="text-end">
                          {b.amount ? formatCurrency(b.amount) : "—"}
                        </td>
                      ))}
                      <td className="text-end">
                        <strong>{formatCurrency(f.totalOutstanding)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.byFacility.length === 0 && (
            <div className="text-center py-4">
              <i className="ti ti-mood-smile text-success" style={{ fontSize: 48 }}></i>
              <p className="text-muted mt-2">No overdue balances right now.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// TAB 2 — Defaulters
// ══════════════════════════════════════════════════════════════════════
function DefaultersTab() {
  const facilities = useFacilities();
  const [facilityId, setFacilityId] = useState("");
  const [sortBy, setSortBy] = useState("amount");
  const [order, setOrder] = useState("desc");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ sortBy, order });
      if (facilityId) params.set("facilityId", facilityId);
      const res = await makeAuthRequest(`${defaultersURL}?${params.toString()}`, "GET");
      if (res.success) setData(res.data);
      else toastify(res.error, "error");
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [facilityId, sortBy, order]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleSort = (field) => {
    if (sortBy === field) {
      setOrder((o) => (o === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(field);
      setOrder("desc");
    }
  };

  const sortIcon = (field) =>
    sortBy === field ? (order === "desc" ? "ti ti-sort-descending" : "ti ti-sort-ascending") : "ti ti-selector";

  return (
    <div className="card-body">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <p className="text-muted mb-0">
          Residents with at least one overdue invoice, sortable by amount owed or days overdue.
        </p>
        <FacilitySelect value={facilityId} onChange={setFacilityId} facilities={facilities} />
      </div>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : !data || data.defaulters.length === 0 ? (
        <div className="text-center py-4">
          <i className="ti ti-mood-smile text-success" style={{ fontSize: 48 }}></i>
          <p className="text-muted mt-2">No defaulters right now.</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover">
            <thead>
              <tr>
                <th>Resident</th>
                <th>Unit</th>
                <th>Facility</th>
                <th style={{ cursor: "pointer" }} onClick={() => toggleSort("amount")}>
                  Amount Due <i className={sortIcon("amount")}></i>
                </th>
                <th style={{ cursor: "pointer" }} onClick={() => toggleSort("days")}>
                  Days Overdue <i className={sortIcon("days")}></i>
                </th>
                <th>Invoices</th>
              </tr>
            </thead>
            <tbody>
              {data.defaulters.map((d) => (
                <tr key={d.residentId}>
                  <td>
                    <Link to={`/residents/${d.residentId}`}>{d.residentName}</Link>
                    <br />
                    <small className="text-muted">{d.phone}</small>
                  </td>
                  <td>{d.unitName || "—"}</td>
                  <td>{d.facilityName || "—"}</td>
                  <td className="text-danger">
                    <strong>{formatCurrency(d.totalDue)}</strong>
                  </td>
                  <td>
                    <span className="badge bg-light-danger">{d.maxDaysOverdue} days</span>
                  </td>
                  <td>{d.invoiceCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// TAB 3 — Consumption Trends
// ══════════════════════════════════════════════════════════════════════
function ConsumptionTrendsTab() {
  const facilities = useFacilities();
  const [facilityId, setFacilityId] = useState("");
  const [months, setMonths] = useState(6);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ months });
      if (facilityId) params.set("facilityId", facilityId);
      const res = await makeAuthRequest(`${consumptionTrendsURL}?${params.toString()}`, "GET");
      if (res.success) setData(res.data);
      else toastify(res.error, "error");
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [facilityId, months]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="card-body">
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <p className="text-muted mb-0">
          Consumption trend beyond the dashboard's single readings-count chart — actual m³ billed, by unit.
        </p>
        <div className="d-flex gap-2">
          <select
            className="form-select form-select-sm"
            style={{ maxWidth: 140 }}
            value={months}
            onChange={(e) => setMonths(e.target.value)}
          >
            <option value={3}>Last 3 months</option>
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
          </select>
          <FacilitySelect value={facilityId} onChange={setFacilityId} facilities={facilities} />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : !data ? null : (
        <>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.facilityMonthly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip
                formatter={(value, name, props) => [
                  `${value} m³${props.payload.deltaPct != null ? ` (${props.payload.deltaPct > 0 ? "+" : ""}${props.payload.deltaPct}% vs prior month)` : ""}`,
                  "Consumption",
                ]}
              />
              <Legend />
              <Bar dataKey="consumption" name="Consumption (m³)" fill="#4680ff" />
            </BarChart>
          </ResponsiveContainer>

          <h6 className="mt-4 mb-2">Units with the biggest month-over-month change</h6>
          {data.byUnit.length === 0 ? (
            <p className="text-muted">No consumption data in this window.</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th className="text-end">Latest month (m³)</th>
                    <th className="text-end">Change vs prior month</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byUnit.slice(0, 15).map((u) => (
                    <tr key={u.unitId || "unassigned"}>
                      <td>{u.unitName}</td>
                      <td className="text-end">{u.latestConsumption}</td>
                      <td className="text-end">
                        {u.deltaPct == null ? (
                          "—"
                        ) : (
                          <span className={u.deltaPct >= 0 ? "text-danger" : "text-success"}>
                            <i className={`ti ${u.deltaPct >= 0 ? "ti-trending-up" : "ti-trending-down"} me-1`}></i>
                            {u.deltaPct > 0 ? "+" : ""}
                            {u.deltaPct}%
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// TAB 4 — Non-Revenue Water (NRW)
// ══════════════════════════════════════════════════════════════════════
function NRWTab() {
  const facilities = useFacilities();
  const [facilityId, setFacilityId] = useState("");
  const [bulkMeter, setBulkMeter] = useState(undefined); // undefined = not checked yet, null = none registered
  const [loadingMeter, setLoadingMeter] = useState(false);
  const [regForm, setRegForm] = useState({ serialNumber: "", initialReading: "" });
  const [readingForm, setReadingForm] = useState({ value: "", readingDate: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [report, setReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [period, setPeriod] = useState({ periodStart: "", periodEnd: "" });

  const fetchBulkMeter = useCallback(async () => {
    if (!facilityId) {
      setBulkMeter(undefined);
      return;
    }
    try {
      setLoadingMeter(true);
      const res = await makeAuthRequest(`${bulkMetersURL}?facilityId=${facilityId}`, "GET");
      if (res.success) {
        setBulkMeter(res.data.bulkMeters?.[0] || null);
      }
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setLoadingMeter(false);
    }
  }, [facilityId]);

  useEffect(() => {
    fetchBulkMeter();
    setReport(null);
  }, [fetchBulkMeter]);

  const handleRegister = async () => {
    if (!facilityId) {
      toastify("Select a facility first", "error");
      return;
    }
    try {
      setSubmitting(true);
      const res = await makeAuthRequest(bulkMetersURL, "POST", {
        facilityId,
        serialNumber: regForm.serialNumber || undefined,
        initialReading: regForm.initialReading || 0,
      });
      if (res.success) {
        toastify("Bulk meter registered", "success");
        setBulkMeter(res.data.bulkMeter);
      } else {
        toastify(res.error, "error");
      }
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReading = async () => {
    if (!readingForm.value) {
      toastify("Reading value is required", "error");
      return;
    }
    try {
      setSubmitting(true);
      const res = await makeAuthRequest(`${bulkMetersURL}/${bulkMeter._id}/readings`, "POST", {
        value: readingForm.value,
        readingDate: readingForm.readingDate || undefined,
        notes: readingForm.notes || undefined,
      });
      if (res.success) {
        toastify("Bulk reading recorded", "success");
        setReadingForm({ value: "", readingDate: "", notes: "" });
        fetchBulkMeter();
      } else {
        toastify(res.error, "error");
      }
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!facilityId) {
      toastify("Select a facility first", "error");
      return;
    }
    try {
      setLoadingReport(true);
      const params = new URLSearchParams({ facilityId });
      if (period.periodStart) params.set("periodStart", period.periodStart);
      if (period.periodEnd) params.set("periodEnd", period.periodEnd);
      const res = await makeAuthRequest(`${nrwReportURL}?${params.toString()}`, "GET");
      if (res.success) setReport(res.data);
      else toastify(res.error, "error");
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setLoadingReport(false);
    }
  };

  return (
    <div className="card-body">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <p className="text-muted mb-0">
          Compares the facility's bulk/supplier meter against total billed unit consumption to surface losses.
        </p>
        <FacilitySelect
          value={facilityId}
          onChange={setFacilityId}
          facilities={facilities}
          includeAll={false}
        />
      </div>

      {!facilityId ? (
        <div className="text-center py-4">
          <i className="ti ti-droplet text-muted" style={{ fontSize: 48 }}></i>
          <p className="text-muted mt-2">Select a facility to get started.</p>
        </div>
      ) : loadingMeter ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : !bulkMeter ? (
        <div className="card bg-light-secondary">
          <div className="card-body">
            <h6>No bulk meter registered for this facility yet</h6>
            <div className="row g-2 mt-1">
              <div className="col-md-4">
                <input
                  className="form-control"
                  placeholder="Serial number (optional)"
                  value={regForm.serialNumber}
                  onChange={(e) => setRegForm((p) => ({ ...p, serialNumber: e.target.value }))}
                />
              </div>
              <div className="col-md-4">
                <input
                  className="form-control"
                  type="number"
                  placeholder="Initial reading (m³)"
                  value={regForm.initialReading}
                  onChange={(e) => setRegForm((p) => ({ ...p, initialReading: e.target.value }))}
                />
              </div>
              <div className="col-md-4">
                <button className="btn btn-primary w-100" disabled={submitting} onClick={handleRegister}>
                  Register Bulk Meter
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="alert alert-light d-flex justify-content-between align-items-center">
            <span>
              <strong>Bulk meter:</strong> {bulkMeter.serialNumber || "(no serial)"} — last reading{" "}
              {bulkMeter.lastReadingValue ?? "N/A"} m³
              {bulkMeter.lastReadingDate ? ` on ${new Date(bulkMeter.lastReadingDate).toLocaleDateString()}` : ""}
            </span>
          </div>

          <div className="row g-2 mb-4">
            <div className="col-md-3">
              <input
                className="form-control"
                type="number"
                step="0.01"
                placeholder="New reading (m³)"
                value={readingForm.value}
                onChange={(e) => setReadingForm((p) => ({ ...p, value: e.target.value }))}
              />
            </div>
            <div className="col-md-3">
              <input
                className="form-control"
                type="date"
                value={readingForm.readingDate}
                onChange={(e) => setReadingForm((p) => ({ ...p, readingDate: e.target.value }))}
                max={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div className="col-md-4">
              <input
                className="form-control"
                placeholder="Notes (optional)"
                value={readingForm.notes}
                onChange={(e) => setReadingForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
            <div className="col-md-2">
              <button className="btn btn-outline-primary w-100" disabled={submitting} onClick={handleSubmitReading}>
                Submit Reading
              </button>
            </div>
          </div>

          <h6 className="mb-2">Loss Report</h6>
          <div className="row g-2 mb-3">
            <div className="col-md-3">
              <label className="form-label small text-muted">Period start</label>
              <input
                className="form-control"
                type="date"
                value={period.periodStart}
                onChange={(e) => setPeriod((p) => ({ ...p, periodStart: e.target.value }))}
              />
            </div>
            <div className="col-md-3">
              <label className="form-label small text-muted">Period end</label>
              <input
                className="form-control"
                type="date"
                value={period.periodEnd}
                onChange={(e) => setPeriod((p) => ({ ...p, periodEnd: e.target.value }))}
              />
            </div>
            <div className="col-md-3 d-flex align-items-end">
              <button className="btn btn-primary w-100" disabled={loadingReport} onClick={handleGenerateReport}>
                {loadingReport ? "Generating..." : "Generate Report"}
              </button>
            </div>
          </div>
          <small className="text-muted d-block mb-3">
            Leave dates blank to default to last full calendar month.
          </small>

          {report && (
            <div className="row">
              <div className="col-md-4">
                <div className="card">
                  <div className="card-body">
                    <p className="text-muted mb-1">Bulk Supplied</p>
                    <h4>{report.bulkSupplied} m³</h4>
                  </div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="card">
                  <div className="card-body">
                    <p className="text-muted mb-1">Billed to Units</p>
                    <h4>{report.billedConsumption} m³</h4>
                  </div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="card border-danger">
                  <div className="card-body">
                    <p className="text-muted mb-1">Non-Revenue Water Loss</p>
                    <h4 className="text-danger">
                      {report.loss} m³ {report.lossPct != null && `(${report.lossPct}%)`}
                    </h4>
                  </div>
                </div>
              </div>
              {!report.hasBulkReadings && (
                <div className="col-md-12 mt-2">
                  <small className="text-warning">
                    No bulk meter readings found in this period — figures may be incomplete.
                  </small>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════
function Reports() {
  const [activeTab, setActiveTab] = useState("arrears");

  const tabs = [
    { key: "arrears", label: "Arrears Ageing", icon: "ti ti-clock-exclamation" },
    { key: "defaulters", label: "Defaulters", icon: "ti ti-user-exclamation" },
    { key: "consumption", label: "Consumption Trends", icon: "ti ti-chart-line" },
    { key: "nrw", label: "Non-Revenue Water", icon: "ti ti-droplet" },
  ];

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
                <li className="breadcrumb-item active">Reports</li>
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
                {tabs.map((tab) => (
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

            {activeTab === "arrears" && <ArrearsAgeingTab />}
            {activeTab === "defaulters" && <DefaultersTab />}
            {activeTab === "consumption" && <ConsumptionTrendsTab />}
            {activeTab === "nrw" && <NRWTab />}
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default Reports;
