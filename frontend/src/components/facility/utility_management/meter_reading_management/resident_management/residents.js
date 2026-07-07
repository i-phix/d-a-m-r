import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import Layout from "../../../../layout/Layout";
import { makeAuthRequest } from "../../../../../utils/makeRequest";
import { toastify } from "../../../../../utils/toast";
import { getResidentsURL } from "../../../../../utils/urls";

const UNITS_URL = "/api/v1/damr/facility/units";

// Local (not UTC) YYYY-MM-DD — matches what an <input type="date"> expects,
// and avoids the classic toISOString() off-by-one-day bug near midnight.
function todayDateString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

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
  Active: { bg: "#e3f9e8", color: "#1f9254" },
  Inactive: { bg: "#eef0f3", color: "#5c6470" },
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

// Generic comparator driving every sortable column on the All Residents
// table. "index" sorts by the order residents were fetched in (# reflects
// position in that order — ascending = as-fetched, descending = reversed).
function sortResidents(list, field, dir) {
  if (field === "index") {
    return dir === "asc" ? list : [...list].reverse();
  }
  const getValue = (r) => {
    switch (field) {
      case "name":
        return r.name || "";
      case "phone":
        return r.phone || "";
      case "email":
        return r.email || "";
      case "nationalId":
        return r.nationalId || "";
      case "unit":
        return r.unitId?.name || r.unitName || "";
      case "facility":
        return r.facilityId?.name || "";
      case "status":
        return r.status || "";
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

// ══════════════════════════════════════════════════════════════════════
// TAB: All Residents
// ══════════════════════════════════════════════════════════════════════
function AllResidentsTab() {
  const navigate = useNavigate();
  const [residents, setResidents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Active");
  const [sortField, setSortField] = useState("index");
  const [sortDir, setSortDir] = useState("asc");

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const fetchResidents = async () => {
    try {
      setLoading(true);
      let url = `${getResidentsURL}?limit=100`;
      if (statusFilter) url += `&status=${statusFilter}`;
      const res = await makeAuthRequest(url, "GET");
      if (res.success) setResidents(res.data.residents || []);
      else toastify(res.error, "error");
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResidents();
  }, [statusFilter]);

  const filtered = residents.filter(
    (r) =>
      r.name?.toLowerCase().includes(search.toLowerCase()) ||
      r.phone?.includes(search) ||
      r.email?.toLowerCase().includes(search.toLowerCase()) ||
      r.nationalId?.includes(search) ||
      r.unitId?.name?.toLowerCase().includes(search.toLowerCase()),
  );
  const sorted = sortResidents(filtered, sortField, sortDir);

  return (
    <div className="card-body">
      <SoftTableStyles />
      <div className="row mb-3">
        <div className="col-md-5">
          <input
            className="form-control dmr-search-pill"
            placeholder="Search by name, phone, email, ID or unit..."
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
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
        <div className="col-md-4 text-end">
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={fetchResidents}
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
            className="ti ti-users-minus text-muted"
            style={{ fontSize: "48px" }}
          ></i>
          <p className="text-muted mt-2">No residents found</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover dmr-soft-table">
            <thead>
              <tr>
                <SortableHeader label="#" field="index" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Name" field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Phone" field="phone" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Email" field="email" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="National ID" field="nationalId" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Unit" field="unit" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Facility" field="facility" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <th style={{ padding: "14px 18px", fontSize: "15px", fontWeight: 600, color: "#1f2a44" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r._id}>
                  <td>
                    {sortField === "index" && sortDir === "desc"
                      ? sorted.length - i
                      : i + 1}
                  </td>
                  <td>
                    <strong>{r.name}</strong>
                  </td>
                  <td>{r.phone}</td>
                  <td>{r.email}</td>
                  <td>{r.nationalId}</td>
                  <td>{r.unitId?.name || r.unitName || "—"}</td>
                  <td>{r.facilityId?.name || "—"}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td>
                    <button
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => navigate(`/residents/${r._id}`)}
                    >
                      <i className="ti ti-eye me-1"></i> View
                    </button>
                  </td>
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
// TAB: Add Resident
// ══════════════════════════════════════════════════════════════════════
function AddResidentTab({ onSuccess }) {
  const [form, setForm] = useState({
    unitId: "",
    fullName: "",
    nationalId: "",
    phone: "",
    email: "",
    // Every date defaults to today (still editable) — except Lease End,
    // which has no natural "now" default and is left blank.
    moveInDate: todayDateString(),
    leaseStart: todayDateString(),
    leaseEnd: "",
    contactName: "",
    contactPhone: "",
    contactRelation: "",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [units, setUnits] = useState([]);

  // Fetch available units for dropdown
  useEffect(() => {
    makeAuthRequest(UNITS_URL, "GET").then((res) => {
      if (res.success) setUnits(res.data.units || []);
    });
  }, []);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async () => {
    const { unitId, fullName, nationalId, phone, email } = form;
    if (!unitId || !fullName || !nationalId || !phone || !email) {
      toastify(
        "Unit, name, national ID, phone and email are required",
        "error",
      );
      return;
    }
    try {
      setLoading(true);
      const res = await makeAuthRequest(getResidentsURL, "POST", form);
      if (res.success) {
        setResult(res.data);
        toastify("Resident added successfully", "success");
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

  const clearForm = () => {
    setForm({
      unitId: "",
      fullName: "",
      nationalId: "",
      phone: "",
      email: "",
      moveInDate: todayDateString(),
      leaseStart: todayDateString(),
      leaseEnd: "",
      contactName: "",
      contactPhone: "",
      contactRelation: "",
    });
    setResult(null);
  };

  return (
    <div className="card-body">
      <div className="row justify-content-center">
        <div className="col-md-9">
          {result && (
            <div className="alert alert-success mb-4">
              <i className="ti ti-circle-check me-2"></i>
              <strong>Resident added.</strong> Login credentials:
              <br />
              <strong>Email:</strong> {result.credentials?.email} &nbsp;|&nbsp;
              <strong>Password:</strong> {result.credentials?.password}
              <br />
              <small className="text-muted">{result.credentials?.note}</small>
            </div>
          )}

          <div className="row">
            {/* Unit dropdown — shows unit names, sends _id */}
            <div className="col-md-12 mb-3">
              <label className="form-label">
                Unit <span className="text-danger">*</span>
              </label>
              <select
                name="unitId"
                className="form-select"
                value={form.unitId}
                onChange={handleChange}
              >
                <option value="">Select unit...</option>
                {units.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name}
                    {u.blockId?.name ? ` — ${u.blockId.name}` : ""}
                    {` (${u.status})`}
                  </option>
                ))}
              </select>
              {units.length === 0 && (
                <small className="text-warning">
                  No units found. Add units under facility first.
                </small>
              )}
            </div>

            <div className="col-md-6 mb-3">
              <label className="form-label">
                Full Name <span className="text-danger">*</span>
              </label>
              <input
                name="fullName"
                className="form-control"
                placeholder="e.g. John Doe"
                value={form.fullName}
                onChange={handleChange}
              />
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label">
                National ID <span className="text-danger">*</span>
              </label>
              <input
                name="nationalId"
                className="form-control"
                placeholder="e.g. 12345678"
                value={form.nationalId}
                onChange={handleChange}
              />
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label">
                Phone <span className="text-danger">*</span>
              </label>
              <input
                name="phone"
                className="form-control"
                placeholder="e.g. 0712345678"
                value={form.phone}
                onChange={handleChange}
              />
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label">
                Email <span className="text-danger">*</span>
              </label>
              <input
                name="email"
                type="email"
                className="form-control"
                placeholder="resident@email.com"
                value={form.email}
                onChange={handleChange}
              />
            </div>
            <div className="col-md-4 mb-3">
              <label className="form-label">Move-in Date</label>
              <input
                name="moveInDate"
                type="date"
                className="form-control"
                value={form.moveInDate}
                onChange={handleChange}
              />
            </div>
            <div className="col-md-4 mb-3">
              <label className="form-label">Lease Start</label>
              <input
                name="leaseStart"
                type="date"
                className="form-control"
                value={form.leaseStart}
                onChange={handleChange}
              />
            </div>
            <div className="col-md-4 mb-3">
              <label className="form-label">Lease End</label>
              <input
                name="leaseEnd"
                type="date"
                className="form-control"
                value={form.leaseEnd}
                onChange={handleChange}
              />
            </div>
          </div>

          <hr />
          <h6 className="mb-3 text-muted">Emergency Contact (optional)</h6>
          <div className="row">
            <div className="col-md-4 mb-3">
              <label className="form-label">Contact Name</label>
              <input
                name="contactName"
                className="form-control"
                value={form.contactName}
                onChange={handleChange}
              />
            </div>
            <div className="col-md-4 mb-3">
              <label className="form-label">Contact Phone</label>
              <input
                name="contactPhone"
                className="form-control"
                value={form.contactPhone}
                onChange={handleChange}
              />
            </div>
            <div className="col-md-4 mb-3">
              <label className="form-label">Relation</label>
              <input
                name="contactRelation"
                className="form-control"
                placeholder="e.g. Spouse, Parent"
                value={form.contactRelation}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="text-end mt-2">
            <button className="btn btn-secondary me-2" onClick={clearForm}>
              Clear
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2"></span>
                  Adding...
                </>
              ) : (
                <>
                  <i className="ti ti-user-plus me-2"></i>Add Resident
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════
function Residents() {
  const location = useLocation();
  const userRole = useSelector((state) => state.damrReducer.user?.role);
  const [activeTab, setActiveTab] = useState(
    location.state?.activeTab || "all",
  );

  const tabs = [
    { key: "all", label: "All Residents", icon: "ti ti-users" },
    { key: "add", label: "Add Resident", icon: "ti ti-user-plus" },
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
                <li className="breadcrumb-item active">Resident Management</li>
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

            {activeTab === "all" && <AllResidentsTab />}
            {activeTab === "add" && (
              <AddResidentTab onSuccess={() => setActiveTab("all")} />
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default Residents;
