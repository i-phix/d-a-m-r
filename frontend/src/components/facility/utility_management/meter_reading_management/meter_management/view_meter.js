import React, { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import Layout from "../../../../layout/Layout";
import { makeAuthRequest } from "../../../../../utils/makeRequest";
import { toastify } from "../../../../../utils/toast";
import {
  getMetersURL,
  getReadingsURL,
  getFlagsURL,
} from "../../../../../utils/urls";

// Note: the nav section this used to live under was renamed "Hierarchy" →
// "Facilities", and the backend route is registered at /facility/units
// (see backend/src/routes/index.js) — this was previously pointed at the
// stale /hierarchy/units path, which 404'd and silently left the assign
// dropdown empty regardless of what units actually existed.
const UNITS_URL = "/api/v1/damr/facility/units";

// ── Helpers ────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const map = {
    ASSIGNED: "bg-success",
    UNASSIGNED: "bg-secondary",
    FAULTY: "bg-danger",
  };
  return (
    <span className={`badge ${map[status] || "bg-secondary"}`}>{status}</span>
  );
};

const InfoRow = ({ label, value }) => (
  <div className="row mb-2">
    <div className="col-5 text-muted">{label}</div>
    <div className="col-7">
      <strong>{value || "—"}</strong>
    </div>
  </div>
);

// ══════════════════════════════════════════════════════════════════════
// TAB: Meter Info
// ══════════════════════════════════════════════════════════════════════
function MeterInfoTab({ meter, onRefresh, userRole }) {
  const [assignUnitId, setAssignUnitId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [availableUnits, setAvailableUnits] = useState([]);

  // Fetch units with no meter yet — a unit can be VACANT or already
  // OCCUPIED (meters can be assigned to occupied units too; the backend
  // binds to the existing resident automatically in that case).
  useEffect(() => {
    if (userRole !== "Staff" && meter.status === "UNASSIGNED") {
      makeAuthRequest(`${UNITS_URL}?noMeter=true`, "GET").then((res) => {
        if (res.success) setAvailableUnits(res.data.units || []);
      });
    }
  }, [meter.status, userRole]);

  const handleAssign = async () => {
    if (!assignUnitId) {
      toastify("Please select a unit", "error");
      return;
    }
    try {
      setAssigning(true);
      const response = await makeAuthRequest(
        `${getMetersURL}/${meter._id}/assign`,
        "PATCH",
        { unitId: assignUnitId },
      );
      if (response.success) {
        toastify("Meter assigned successfully", "success");
        setAssignUnitId("");
        onRefresh();
      } else {
        toastify(response.error, "error");
      }
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="row">
      {/* Left — meter details */}
      <div className="col-md-6">
        <div className="card">
          <div className="card-header">
            <h5 className="card-title mb-0">
              <i className="ti ti-cpu-charge me-2 text-primary"></i>Meter
              Details
            </h5>
          </div>
          <div className="card-body">
            <InfoRow label="Serial Number" value={meter.serialNumber} />
            <InfoRow label="Type" value={meter.meterType} />
            <InfoRow label="Manufacturer" value={meter.manufacturer} />
            <InfoRow label="Model" value={meter.model} />
            <InfoRow label="Condition" value={meter.condition} />
            <InfoRow
              label="Initial Reading"
              value={
                meter.initialReading != null
                  ? `${meter.initialReading} m³`
                  : null
              }
            />
            <InfoRow
              label="Installation Date"
              value={
                meter.installationDate
                  ? new Date(meter.installationDate).toLocaleDateString()
                  : null
              }
            />
            <div className="row mb-2">
              <div className="col-5 text-muted">Status</div>
              <div className="col-7">
                <StatusBadge status={meter.status} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right — assignment info + last reading + assign form */}
      <div className="col-md-6">
        <div className="card">
          <div className="card-header">
            <h5 className="card-title mb-0">
              <i className="ti ti-map-pin me-2 text-success"></i>Assignment
            </h5>
          </div>
          <div className="card-body">
            <InfoRow label="Unit" value={meter.unitId?.name} />
            <InfoRow label="Block" value={meter.blockId?.name} />
            <InfoRow label="Facility" value={meter.facilityId?.name} />
            <InfoRow
              label="Location"
              value={meter.locationId?.name || meter.facilityId?.location}
            />
            <InfoRow label="Resident" value={meter.currentResident?.name} />
            <InfoRow label="Open Flags" value={meter.openFlagCount} />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h5 className="card-title mb-0">
              <i className="ti ti-graph me-2 text-info"></i>Last Reading
            </h5>
          </div>
          <div className="card-body">
            <InfoRow
              label="Value"
              value={
                meter.lastReadingValue != null
                  ? `${meter.lastReadingValue} m³`
                  : null
              }
            />
            <InfoRow
              label="Date"
              value={
                meter.lastReadingDate
                  ? new Date(meter.lastReadingDate).toLocaleDateString()
                  : null
              }
            />
            <InfoRow label="Read By" value={meter.lastReadingBy?.fullName} />
          </div>
        </div>

        {/* Assign meter — admin/editor only, only if UNASSIGNED */}
        {userRole !== "Staff" && meter.status === "UNASSIGNED" && (
          <div className="card">
            <div className="card-header">
              <h5 className="card-title mb-0">
                <i className="ti ti-link me-2 text-warning"></i>Assign to Unit
              </h5>
            </div>
            <div className="card-body">
              <div className="mb-3">
                <label className="form-label">Select Unit</label>
                <select
                  className="form-select"
                  value={assignUnitId}
                  onChange={(e) => setAssignUnitId(e.target.value)}
                >
                  <option value="">Select a unit...</option>
                  {availableUnits.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.name}
                      {u.division ? ` — ${u.division}` : ""}
                      {u.facilityId?.name ? ` (${u.facilityId.name})` : ""}
                      {" — "}
                      {u.status === "OCCUPIED" ? "Occupied" : "Vacant"}
                    </option>
                  ))}
                </select>
                {availableUnits.length === 0 && (
                  <small className="text-warning">
                    No units without a meter found. Add units under
                    Facilities &gt; Units first.
                  </small>
                )}
                <small className="text-muted d-block mt-1">
                  Units without a meter yet are listed — both vacant and
                  already-occupied units can be assigned. If occupied, the
                  meter binds to the current resident automatically.
                </small>
              </div>
              <button
                className="btn btn-warning w-100"
                disabled={assigning || !assignUnitId}
                onClick={handleAssign}
              >
                {assigning ? "Assigning..." : "Assign Meter"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// TAB: Reading History
// ══════════════════════════════════════════════════════════════════════
function ReadingHistoryTab({ meterId }) {
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(false);

  const statusBadge = (status) => {
    const map = {
      confirmed: "bg-success",
      pending: "bg-warning",
      rejected: "bg-danger",
    };
    return (
      <span className={`badge ${map[status] || "bg-secondary"}`}>{status}</span>
    );
  };

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        const res = await makeAuthRequest(
          `${getReadingsURL}?meterId=${meterId}`,
          "GET",
        );
        if (res.success) setReadings(res.data.readings || []);
        else toastify(res.error, "error");
      } catch (err) {
        toastify(err.message, "error");
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [meterId]);

  return loading ? (
    <div className="text-center py-5">
      <div className="spinner-border text-primary" role="status"></div>
    </div>
  ) : readings.length === 0 ? (
    <div className="text-center py-5">
      <i className="ti ti-inbox text-muted" style={{ fontSize: "48px" }}></i>
      <p className="text-muted mt-2">No readings recorded for this meter</p>
    </div>
  ) : (
    <div className="table-responsive">
      <table className="table table-hover">
        <thead>
          <tr>
            <th>#</th>
            <th>Date</th>
            <th>Value (m³)</th>
            <th>Consumption</th>
            <th>Method</th>
            <th>Submitted By</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {readings.map((r, i) => (
            <tr key={r._id}>
              <td>{i + 1}</td>
              <td>{new Date(r.readingDate).toLocaleDateString()}</td>
              <td>
                <strong>{r.value}</strong>
              </td>
              <td>{r.consumption != null ? `${r.consumption} m³` : "—"}</td>
              <td className="text-capitalize">{r.method}</td>
              <td>{r.submittedBy?.fullName || "—"}</td>
              <td>{statusBadge(r.status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// TAB: Flags
// ══════════════════════════════════════════════════════════════════════
function FlagsTab({ meterId }) {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(false);

  const typeBadge = (type) => {
    const map = {
      high_consumption: "bg-danger",
      ocr_mismatch: "bg-warning",
      missing_reading: "bg-secondary",
      manual_review: "bg-info",
      SPIKE: "bg-danger",
      CRITICAL: "bg-danger",
      OVERNIGHT_LEAK: "bg-warning",
      ZERO_FLOW: "bg-secondary",
      ERRATIC: "bg-info",
    };
    return (
      <span className={`badge ${map[type] || "bg-secondary"}`}>
        {type?.replace(/_/g, " ")}
      </span>
    );
  };

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        const res = await makeAuthRequest(
          `${getFlagsURL}?meterId=${meterId}`,
          "GET",
        );
        if (res.success) setFlags(res.data.flags || []);
        else toastify(res.error, "error");
      } catch (err) {
        toastify(err.message, "error");
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [meterId]);

  return loading ? (
    <div className="text-center py-5">
      <div className="spinner-border text-warning" role="status"></div>
    </div>
  ) : flags.length === 0 ? (
    <div className="text-center py-5">
      <i className="ti ti-flag-off text-muted" style={{ fontSize: "48px" }}></i>
      <p className="text-muted mt-2">No flags raised for this meter</p>
    </div>
  ) : (
    <div className="table-responsive">
      <table className="table table-hover">
        <thead>
          <tr>
            <th>#</th>
            <th>Type</th>
            <th>Description</th>
            <th>Status</th>
            <th>Raised On</th>
            <th>Resolved By</th>
          </tr>
        </thead>
        <tbody>
          {flags.map((f, i) => (
            <tr key={f._id}>
              <td>{i + 1}</td>
              <td>{typeBadge(f.type)}</td>
              <td>{f.description || "—"}</td>
              <td>
                <span
                  className={`badge ${f.status === "resolved" ? "bg-success" : "bg-warning"}`}
                >
                  {f.status}
                </span>
              </td>
              <td>{new Date(f.createdAt).toLocaleDateString()}</td>
              <td>{f.resolvedBy?.fullName || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════
function ViewMeter() {
  const { id } = useParams();
  const navigate = useNavigate();
  const userRole = useSelector((state) => state.damrReducer.user?.role);
  const [activeTab, setActiveTab] = useState("meter-info");
  const [meter, setMeter] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchMeter = async () => {
    try {
      setLoading(true);
      const res = await makeAuthRequest(`${getMetersURL}/${id}`, "GET");
      if (res.success) {
        setMeter(res.data.meter);
      } else {
        toastify(res.error, "error");
        navigate("/meters");
      }
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeter();
  }, [id]);

  const tabs = [
    { key: "meter-info", label: "Meter Info", icon: "ti ti-cpu-charge" },
    { key: "readings", label: "Reading History", icon: "ti ti-list-numbers" },
    { key: "flags", label: "Flags", icon: "ti ti-flag" },
  ];

  return (
    <Layout>
      {/* Breadcrumb */}
      <div className="page-header">
        <div className="page-block">
          <div className="row align-items-center">
            <div className="col-md-12">
              <ul className="breadcrumb mb-3">
                <li className="breadcrumb-item">
                  <Link to="/">Dashboard</Link>
                </li>
                <li className="breadcrumb-item">
                  <Link to="/meters">Meter Management</Link>
                </li>
                <li className="breadcrumb-item active">
                  {meter?.serialNumber || "Meter Details"}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Back button */}
      <div className="card mb-3">
        <div className="card-header d-flex align-items-center justify-content-between">
          <Link to="/meters">
            <i className="ti ti-arrow-narrow-left me-1"></i> Back to Meters
          </Link>
          {meter && (
            <span className="ms-3">
              <strong>{meter.serialNumber}</strong>
              <span className="ms-2">
                <StatusBadge status={meter.status} />
              </span>
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status"></div>
        </div>
      ) : meter ? (
        <div className="card">
          {/* Tabs */}
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

          {/* Tab content */}
          <div className="card-body">
            {activeTab === "meter-info" && (
              <MeterInfoTab
                meter={meter}
                onRefresh={fetchMeter}
                userRole={userRole}
              />
            )}
            {activeTab === "readings" && <ReadingHistoryTab meterId={id} />}
            {activeTab === "flags" && <FlagsTab meterId={id} />}
          </div>
        </div>
      ) : null}
    </Layout>
  );
}

export default ViewMeter;
