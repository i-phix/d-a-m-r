import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import Layout from "../../../../layout/Layout";
import { makeAuthRequest } from "../../../../../utils/makeRequest";
import { toastify } from "../../../../../utils/toast";
import { getFlagsURL } from "../../../../../utils/urls";

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

const TYPE_COLORS = {
  SPIKE: { bg: "#fdeaea", color: "#c0392b" },
  CRITICAL: { bg: "#fdeaea", color: "#c0392b" },
  OVERNIGHT_LEAK: { bg: "#fff4de", color: "#b7791f" },
  ZERO_FLOW: { bg: "#eef0f3", color: "#5c6470" },
  ERRATIC: { bg: "#e7f1ff", color: "#3b5bdb" },
  high_consumption: { bg: "#fdeaea", color: "#c0392b" },
  ocr_mismatch: { bg: "#fff4de", color: "#b7791f" },
  missing_reading: { bg: "#eef0f3", color: "#5c6470" },
  manual_review: { bg: "#e7f1ff", color: "#3b5bdb" },
  serial_mismatch: { bg: "#fdeaea", color: "#c0392b" },
  serial_unverified: { bg: "#fff4de", color: "#b7791f" },
};

const TypeBadge = ({ type }) => {
  const s = TYPE_COLORS[type] || { bg: "#eef0f3", color: "#5c6470" };
  return (
    <span style={{ ...pillBase, backgroundColor: s.bg, color: s.color }}>
      {type?.replace(/_/g, " ")}
    </span>
  );
};

const StatusBadge = ({ status }) => {
  const s =
    status === "resolved"
      ? { bg: "#e3f9e8", color: "#1f9254" }
      : { bg: "#fff4de", color: "#b7791f" };
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

// Generic comparator driving every sortable column on the All Flags table.
// "index" sorts by the order flags were fetched in (# reflects position in
// that order — ascending = as-fetched, descending = reversed).
function sortFlags(list, field, dir) {
  if (field === "index") {
    return dir === "asc" ? list : [...list].reverse();
  }
  const getValue = (f) => {
    switch (field) {
      case "meter":
        return f.meterId?.serialNumber || "";
      case "type":
        return f.type || "";
      case "description":
        return f.description || "";
      case "status":
        return f.status || "";
      case "raisedOn":
        return new Date(f.createdAt).getTime() || 0;
      case "resolvedBy":
        return f.resolvedBy?.fullName || "";
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
function AllFlagsTab() {
  const navigate = useNavigate();
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [typeFilter, setTypeFilter] = useState("");
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

  const fetchFlags = async () => {
    try {
      setLoading(true);
      let url = `${getFlagsURL}?limit=100`;
      if (statusFilter) url += `&status=${statusFilter}`;
      if (typeFilter) url += `&type=${typeFilter}`;
      const res = await makeAuthRequest(url, "GET");
      if (res.success) setFlags(res.data.flags || []);
      else toastify(res.error, "error");
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlags();
  }, [statusFilter, typeFilter]);

  const filtered = flags.filter(
    (f) =>
      f.meterId?.serialNumber?.toLowerCase().includes(search.toLowerCase()) ||
      f.description?.toLowerCase().includes(search.toLowerCase()),
  );
  const sorted = sortFlags(filtered, sortField, sortDir);

  return (
    <div className="card-body">
      <SoftTableStyles />
      {/* Filters */}
      <div className="row mb-3">
        <div className="col-md-4">
          <input
            className="form-control dmr-search-pill"
            placeholder="Search by meter serial or description..."
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
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
        <div className="col-md-3">
          <select
            className="form-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All Types</option>
            <option value="SPIKE">Spike</option>
            <option value="ZERO_FLOW">Zero Flow</option>
            <option value="OVERNIGHT_LEAK">Overnight Leak</option>
            <option value="ERRATIC">Erratic</option>
            <option value="CRITICAL">Critical</option>
            <option value="high_consumption">High Consumption</option>
            <option value="ocr_mismatch">OCR Mismatch</option>
            <option value="serial_mismatch">Serial Mismatch</option>
            <option value="serial_unverified">Serial Unverified</option>
            <option value="missing_reading">Missing Reading</option>
            <option value="manual_review">Manual Review</option>
          </select>
        </div>
        <div className="col-md-2 text-end">
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={fetchFlags}
          >
            <i className="ti ti-refresh me-1"></i> Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-warning" role="status"></div>
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-5">
          <i
            className="ti ti-flag-off text-muted"
            style={{ fontSize: "48px" }}
          ></i>
          <p className="text-muted mt-2">No flags found</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover dmr-soft-table">
            <thead>
              <tr>
                <SortableHeader label="#" field="index" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Meter" field="meter" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Type" field="type" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Description" field="description" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Raised On" field="raisedOn" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Resolved By" field="resolvedBy" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <th style={{ padding: "14px 18px", fontSize: "15px", fontWeight: 600, color: "#1f2a44" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((f, i) => (
                <tr key={f._id}>
                  <td>
                    {sortField === "index" && sortDir === "desc"
                      ? sorted.length - i
                      : i + 1}
                  </td>
                  <td>
                    <strong>{f.meterId?.serialNumber || "—"}</strong>
                  </td>
                  <td>
                    <TypeBadge type={f.type} />
                  </td>
                  <td
                    style={{
                      maxWidth: 250,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {f.description || "—"}
                  </td>
                  <td>
                    <StatusBadge status={f.status} />
                  </td>
                  <td>{new Date(f.createdAt).toLocaleDateString()}</td>
                  <td>{f.resolvedBy?.fullName || "—"}</td>
                  <td>
                    <button
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => navigate(`/flags/${f._id}`)}
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
function MyFlagsTab() {
  const navigate = useNavigate();
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        const res = await makeAuthRequest(`${getFlagsURL}?limit=100`, "GET");
        if (res.success) setFlags(res.data.flags || []);
        else toastify(res.error, "error");
      } catch (err) {
        toastify(err.message, "error");
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  return (
    <div className="card-body">
      <SoftTableStyles />
      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-warning" role="status"></div>
        </div>
      ) : flags.length === 0 ? (
        <div className="text-center py-5">
          <i
            className="ti ti-flag-off text-muted"
            style={{ fontSize: "48px" }}
          ></i>
          <p className="text-muted mt-2">No flags assigned to you</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover dmr-soft-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Meter</th>
                <th>Type</th>
                <th>Description</th>
                <th>Status</th>
                <th>Raised On</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((f, i) => (
                <tr key={f._id}>
                  <td>{i + 1}</td>
                  <td>
                    <strong>{f.meterId?.serialNumber || "—"}</strong>
                  </td>
                  <td>
                    <TypeBadge type={f.type} />
                  </td>
                  <td
                    style={{
                      maxWidth: 220,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {f.description || "—"}
                  </td>
                  <td>
                    <StatusBadge status={f.status} />
                  </td>
                  <td>{new Date(f.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => navigate(`/flags/${f._id}`)}
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
function Flags() {
  const location = useLocation();
  const userRole = useSelector((state) => state.damrReducer.user?.role);
  const [activeTab, setActiveTab] = useState(
    location.state?.activeTab || (userRole === "Staff" ? "mine" : "all"),
  );

  const tabs = [
    {
      key: "all",
      label: "All Flags",
      icon: "ti ti-flag",
      roles: ["admin", "editor"],
    },
    {
      key: "mine",
      label: "My Flags",
      icon: "ti ti-user-check",
      roles: ["admin", "editor", "Staff"],
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
                <li className="breadcrumb-item active">Flag Management</li>
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

            {activeTab === "all" && <AllFlagsTab />}
            {activeTab === "mine" && <MyFlagsTab />}
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default Flags;
