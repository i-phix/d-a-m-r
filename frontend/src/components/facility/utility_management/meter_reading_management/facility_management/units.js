import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../../../../layout/Layout";
import { makeAuthRequest } from "../../../../../utils/makeRequest";
import { toastify } from "../../../../../utils/toast";

const UNITS_URL = "/api/v1/damr/facility/units";
const FACILITIES_URL = "/api/v1/damr/facility/facilities";
const BLOCKS_URL = "/api/v1/damr/facility/blocks";
const FLOORS_URL = "/api/v1/damr/facility/floors";

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
  OCCUPIED: { bg: "#e3f9e8", color: "#1f9254" },
  VACANT: { bg: "#eef0f3", color: "#5c6470" },
  MAINTENANCE: { bg: "#fff4e0", color: "#b5750a" },
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

// Generic comparator driving every sortable column on the All Units table.
// "index" sorts by the order units were fetched in.
function sortUnits(list, field, dir) {
  if (field === "index") {
    return dir === "asc" ? list : [...list].reverse();
  }
  const getValue = (u) => {
    switch (field) {
      case "name":
        return u.name || "";
      case "unitType":
        return u.unitType || "";
      case "block":
        return u.blockName || "";
      case "floor":
        return u.floorName || u.floor || "";
      case "division":
        return u.division || "";
      case "floorUnitNo":
        return u.floorUnitNo || "";
      case "facility":
        return u.facilityId?.name || "";
      case "status":
        return u.status || "";
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

function AllUnitsTab() {
  const navigate = useNavigate();
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deletingId, setDeletingId] = useState(null);
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

  const handleDelete = async (u) => {
    if (
      !window.confirm(
        `Delete unit "${u.name}"? This cannot be undone. It must be vacant with no meter assigned — otherwise the request will be rejected.`,
      )
    )
      return;
    try {
      setDeletingId(u._id);
      const res = await makeAuthRequest(`${UNITS_URL}/${u._id}`, "DELETE");
      if (res.success) {
        toastify(res.data.message || "Unit deleted", "success");
        fetchUnits();
      } else {
        toastify(res.error, "error");
      }
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setDeletingId(null);
    }
  };

  const fetchUnits = async () => {
    try {
      setLoading(true);
      let url = `${UNITS_URL}?limit=100`;
      if (statusFilter) url += `&status=${statusFilter}`;
      const res = await makeAuthRequest(url, "GET");
      if (res.success) setUnits(res.data.units || []);
      else toastify(res.error, "error");
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnits();
  }, [statusFilter]);

  const filtered = units.filter(
    (u) =>
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.division?.toLowerCase().includes(search.toLowerCase()) ||
      u.floorUnitNo?.toLowerCase().includes(search.toLowerCase()),
  );
  const sorted = sortUnits(filtered, sortField, sortDir);

  return (
    <div className="card-body">
      <SoftTableStyles />
      <div className="row mb-3">
        <div className="col-md-5">
          <input
            className="form-control dmr-search-pill"
            placeholder="Search by unit name, division..."
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
            <option value="VACANT">Vacant</option>
            <option value="OCCUPIED">Occupied</option>
            <option value="MAINTENANCE">Maintenance</option>
          </select>
        </div>
        <div className="col-md-4 text-end">
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={fetchUnits}
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
            className="ti ti-door-off text-muted"
            style={{ fontSize: "48px" }}
          ></i>
          <p className="text-muted mt-2">No units found</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover dmr-soft-table">
            <thead>
              <tr>
                <SortableHeader label="#" field="index" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Unit Name" field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Type" field="unitType" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Block" field="block" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Floor" field="floor" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Division" field="division" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Floor/Unit No" field="floorUnitNo" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Facility" field="facility" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <th className="text-end">Action</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((u, i) => (
                <tr key={u._id}>
                  <td>{sortField === "index" && sortDir === "desc" ? sorted.length - i : i + 1}</td>
                  <td>
                    <strong>{u.name}</strong>
                  </td>
                  <td>{u.unitType || "—"}</td>
                  <td>{u.blockName || "—"}</td>
                  <td>{u.floorName || u.floor || "—"}</td>
                  <td>{u.division || "—"}</td>
                  <td>{u.floorUnitNo || "—"}</td>
                  <td>{u.facilityId?.name || "—"}</td>
                  <td>
                    <StatusBadge status={u.status} />
                  </td>
                  <td className="text-end">
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => handleDelete(u)}
                      disabled={deletingId === u._id}
                    >
                      {deletingId === u._id ? "Deleting..." : "Delete"}
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

function AddUnitTab({ onSuccess }) {
  const [form, setForm] = useState({
    name: "",
    facilityId: "",
    blockId: "",
    floorId: "",
    unitType: "",
    division: "",
    floorUnitNo: "",
    waterRate: 80,
    floor: "",
  });
  const [facilities, setFacilities] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [floors, setFloors] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    makeAuthRequest(FACILITIES_URL, "GET").then((res) => {
      if (res.success) setFacilities(res.data.facilities || []);
    });
  }, []);
  const selectedFacility = facilities.find((f) => f._id === form.facilityId);
  const blockLabel = selectedFacility?.blockLabel || "Block";

  const handleFacilityChange = async (e) => {
    const facilityId = e.target.value;
    setForm((prev) => ({ ...prev, facilityId, blockId: "", floorId: "" }));
    if (facilityId) {
      const res = await makeAuthRequest(
        `${BLOCKS_URL}?facilityId=${facilityId}`,
        "GET",
      );
      if (res.success) setBlocks(res.data.blocks || []);
    } else {
      setBlocks([]);
    }
    setFloors([]);
  };
  const handleBlockChange = async (e) => {
    const blockId = e.target.value;
    setForm((prev) => ({ ...prev, blockId, floorId: "" }));
    if (blockId) {
      const res = await makeAuthRequest(
        `${FLOORS_URL}?blockId=${blockId}`,
        "GET",
      );
      if (res.success) setFloors(res.data.floors || []);
      else setFloors([]);
    } else {
      setFloors([]);
    }
  };

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async () => {
    const { name, facilityId, unitType, division, floorUnitNo } = form;
    if (!name || !facilityId || !unitType || !division || !floorUnitNo) {
      toastify(
        "Name, facility, unit type, division and floor/unit number are required",
        "error",
      );
      return;
    }
    try {
      setLoading(true);
      const res = await makeAuthRequest(UNITS_URL, "POST", form);
      if (res.success) {
        toastify("Unit created successfully", "success");
        setForm({
          name: "",
          facilityId: "",
          blockId: "",
          floorId: "",
          unitType: "",
          division: "",
          floorUnitNo: "",
          waterRate: 80,
          floor: "",
        });
        setBlocks([]);
        setFloors([]);
        if (onSuccess) onSuccess();
      } else toastify(res.error, "error");
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card-body">
      <div className="row justify-content-center">
        <div className="col-md-8">
          <div className="row">
            <div className="col-md-6 mb-3">
              <label className="form-label">
                Unit Name <span className="text-danger">*</span>
              </label>
              <input
                name="name"
                className="form-control"
                placeholder="e.g. A001"
                value={form.name}
                onChange={handleChange}
              />
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label">
                Unit Type <span className="text-danger">*</span>
              </label>
              <select
                name="unitType"
                className="form-select"
                value={form.unitType}
                onChange={handleChange}
              >
                <option value="">Select type...</option>
                <option value="Residential">Residential</option>
                <option value="Commercial">Commercial</option>
                <option value="Office">Office</option>
                <option value="Studio">Studio</option>
                <option value="Bedsitter">Bedsitter</option>
                <option value="1 Bedroom">1 Bedroom</option>
                <option value="2 Bedroom">2 Bedroom</option>
                <option value="3 Bedroom">3 Bedroom</option>
                <option value="Penthouse">Penthouse</option>
              </select>
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label">
                Facility <span className="text-danger">*</span>
              </label>
              <select
                name="facilityId"
                className="form-select"
                value={form.facilityId}
                onChange={handleFacilityChange}
              >
                <option value="">Select facility...</option>
                {facilities.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label">{blockLabel} (optional)</label>
              <select
                name="blockId"
                className="form-select"
                value={form.blockId}
                onChange={handleBlockChange}
                disabled={!form.facilityId}
              >
                <option value="">Select {blockLabel.toLowerCase()}...</option>
                {blocks.map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            {form.blockId && floors.length > 0 && (
              <div className="col-md-6 mb-3">
                <label className="form-label">Floor</label>
                <select
                  name="floorId"
                  className="form-select"
                  value={form.floorId}
                  onChange={handleChange}
                >
                  <option value="">Select floor...</option>
                  {floors.map((f) => (
                    <option key={f._id} value={f._id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="col-md-6 mb-3">
              <label className="form-label">
                Division <span className="text-danger">*</span>
              </label>
              <input
                name="division"
                className="form-control"
                placeholder="e.g. Block A, Wing East"
                value={form.division}
                onChange={handleChange}
              />
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label">
                Floor / Unit No <span className="text-danger">*</span>
              </label>
              <input
                name="floorUnitNo"
                className="form-control"
                placeholder="e.g. 3A, GF-01"
                value={form.floorUnitNo}
                onChange={handleChange}
              />
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label">Water Rate (KES/m³)</label>
              <input
                name="waterRate"
                type="number"
                min="0"
                className="form-control"
                value={form.waterRate}
                onChange={handleChange}
              />
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label">
                Floor label{" "}
                {floors.length > 0
                  ? "(fallback if no floor selected above)"
                  : "(optional)"}
              </label>
              <input
                name="floor"
                className="form-control"
                placeholder="e.g. G, 3, B1"
                value={form.floor}
                onChange={handleChange}
                disabled={!!form.floorId}
              />
            </div>
          </div>
          <div className="text-end">
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                "Creating..."
              ) : (
                <>
                  <i className="ti ti-plus me-2"></i>Add Unit
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Units() {
  const [activeTab, setActiveTab] = useState("all");

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
                <li className="breadcrumb-item active">Units</li>
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
                <li className="nav-item">
                  <button
                    className={`nav-link ${activeTab === "all" ? "active" : ""}`}
                    onClick={() => setActiveTab("all")}
                    type="button"
                  >
                    <i className="ti ti-door me-2"></i>All Units
                  </button>
                </li>
                <li className="nav-item">
                  <button
                    className={`nav-link ${activeTab === "add" ? "active" : ""}`}
                    onClick={() => setActiveTab("add")}
                    type="button"
                  >
                    <i className="ti ti-plus me-2"></i>Add Unit
                  </button>
                </li>
              </ul>
            </div>
            {activeTab === "all" && <AllUnitsTab />}
            {activeTab === "add" && (
              <AddUnitTab onSuccess={() => setActiveTab("all")} />
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default Units;
