import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Layout from "../../../../layout/Layout";
import { makeAuthRequest } from "../../../../../utils/makeRequest";
import { toastify } from "../../../../../utils/toast";

const FACILITIES_URL = "/api/v1/damr/facility/facilities";
const BLOCKS_URL = "/api/v1/damr/facility/blocks";
const FLOORS_URL = "/api/v1/damr/facility/floors";
const LOCATIONS_URL = "/api/v1/damr/facility/locations";

const COMPLEX_TYPE_OPTIONS = [
  "Block",
  "Phase",
  "Tower",
  "Court",
  "Wing",
  "Zone",
  "Other",
];

const SoftTableStyles = () => (
  <style>{`
        .dmr-soft-table thead th {
            background: #eef3fc;
            color: #1f2a44;
        }
        .dmr-soft-table tbody td {
            padding: 12px 16px;
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
    `}</style>
);

// Clickable column header — click once to sort ascending on that field,
// click again to flip to descending, click a different header to switch
// fields (always starting ascending on the new one).
const SortableHeader = ({ label, field, sortField, sortDir, onSort, className }) => {
  const active = sortField === field;
  const [hover, setHover] = useState(false);
  return (
    <th
      className={className}
      onClick={() => onSort(field)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
        padding: "12px 16px",
        fontSize: "14px",
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
            fontSize: "16px",
            opacity: active ? 1 : 0.45,
            color: active ? "#3b5bdb" : "inherit",
          }}
        ></i>
      </span>
    </th>
  );
};

// Generic comparator for the per-type complex tables (Name/Floors/Units/
// Occupied/Unoccupied/Meters Installed).
function sortBlocks(list, field, dir) {
  const getValue = (b) => {
    switch (field) {
      case "name":
        return b.name || "";
      case "floors":
        return b.floorCount ?? 0;
      case "units":
        return b.unitsCount ?? 0;
      case "occupied":
        return b.occupiedCount ?? 0;
      case "unoccupied":
        return b.unoccupiedCount ?? 0;
      case "meters":
        return b.metersInstalled ?? 0;
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

function Complex() {
  const [facilities, setFacilities] = useState([]);
  const [facilityId, setFacilityId] = useState("");
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [itemType, setItemType] = useState("Block");
  const [customType, setCustomType] = useState("");
  const effectiveType = itemType === "Other" ? customType.trim() : itemType;
  const [count, setCount] = useState("1");
  const [name, setName] = useState("");
  const [numFloors, setNumFloors] = useState("");
  const [numBasements, setNumBasements] = useState("0");
  const [locationId, setLocationId] = useState("");
  const [locations, setLocations] = useState([]);
  const [saving, setSaving] = useState(false);
  const [expandedFloors, setExpandedFloors] = useState({});
  const [loadingFloorsFor, setLoadingFloorsFor] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("Block");
  const [editCustomType, setEditCustomType] = useState("");
  const [editNumFloors, setEditNumFloors] = useState("1");
  const [editNumUnits, setEditNumUnits] = useState("0");
  const [editLocationId, setEditLocationId] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [sortField, setSortField] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const effectiveEditType =
    editType === "Other" ? editCustomType.trim() : editType;

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const COMPLEX_BADGE_COLORS = {
    Block: "bg-light-primary",
    Phase: "bg-light-info",
    Tower: "bg-light-warning",
    Court: "bg-light-success",
    Wing: "bg-light-danger",
    Zone: "bg-light-secondary",
  };
  const complexBadgeClass = (type) =>
    COMPLEX_BADGE_COLORS[type] || "bg-light-secondary";
  const groupedBlocks = blocks.reduce((groups, b) => {
    const key = b.type || "Block";
    if (!groups[key]) groups[key] = [];
    groups[key].push(b);
    return groups;
  }, {});

  useEffect(() => {
    makeAuthRequest(FACILITIES_URL, "GET").then((res) => {
      if (res.success) setFacilities(res.data.facilities || []);
    });
    makeAuthRequest(LOCATIONS_URL, "GET").then((res) => {
      if (res.success) setLocations(res.data.locations || []);
    });
  }, []);

  const fetchBlocks = async (fid) => {
    if (!fid) {
      setBlocks([]);
      return;
    }
    try {
      setLoading(true);
      const res = await makeAuthRequest(
        `${BLOCKS_URL}?facilityId=${fid}`,
        "GET",
      );
      if (res.success) setBlocks(res.data.blocks || []);
      else toastify(res.error, "error");
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleFacilityChange = (e) => {
    const fid = e.target.value;
    setFacilityId(fid);
    setExpandedFloors({});
    setEditingId(null);
    fetchBlocks(fid);
  };

  const toggleFloors = async (blockId) => {
    if (expandedFloors[blockId]) {
      setExpandedFloors((prev) => {
        const next = { ...prev };
        delete next[blockId];
        return next;
      });
      return;
    }
    try {
      setLoadingFloorsFor(blockId);
      const res = await makeAuthRequest(
        `${FLOORS_URL}?blockId=${blockId}`,
        "GET",
      );
      setExpandedFloors((prev) => ({
        ...prev,
        [blockId]: res.success ? res.data.floors || [] : [],
      }));
    } finally {
      setLoadingFloorsFor(null);
    }
  };

  const startEdit = (b) => {
    setEditingId(b._id);
    setEditName(b.name);
    if (COMPLEX_TYPE_OPTIONS.includes(b.type) && b.type !== "Other") {
      setEditType(b.type);
      setEditCustomType("");
    } else {
      setEditType("Other");
      setEditCustomType(b.type || "");
    }
    setEditNumFloors(String(b.floorCount ?? 1));
    setEditNumUnits(String(b.unitsCount ?? 0));
    setEditLocationId(b.locationId ? String(b.locationId) : "");
  };

  const cancelEdit = () => setEditingId(null);

  const handleDelete = async (b) => {
    if (
      !window.confirm(
        `Delete "${b.name}"? This cannot be undone. It must have no units assigned to it — otherwise the request will be rejected.`,
      )
    )
      return;
    try {
      setDeletingId(b._id);
      const res = await makeAuthRequest(`${BLOCKS_URL}/${b._id}`, "DELETE");
      if (res.success) {
        toastify(res.data.message || "Complex deleted", "success");
        fetchBlocks(facilityId);
      } else {
        toastify(res.error, "error");
      }
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setDeletingId(null);
    }
  };

  const saveEdit = async (b) => {
    if (!editName.trim()) {
      toastify("Name cannot be empty", "error");
      return;
    }
    if (!effectiveEditType) {
      toastify(
        editType === "Other"
          ? "Enter a name for the custom complex type"
          : "Type is required (e.g. Block, Phase, Tower)",
        "error",
      );
      return;
    }
    if (!Number.isInteger(Number(editNumFloors)) || Number(editNumFloors) < 1) {
      toastify("Number of floors must be at least 1", "error");
      return;
    }
    if (!Number.isInteger(Number(editNumUnits)) || Number(editNumUnits) < 0) {
      toastify("Number of units must be 0 or more", "error");
      return;
    }
    try {
      setSavingEdit(true);
      const res = await makeAuthRequest(`${BLOCKS_URL}/${b._id}`, "PUT", {
        name: editName.trim(),
        type: effectiveEditType,
        numFloors: Number(editNumFloors),
        numUnits: Number(editNumUnits),
        locationId: editLocationId || null,
      });
      if (res.success) {
        toastify(res.data.message || "Complex updated", "success");
        setEditingId(null);
        fetchBlocks(facilityId);
      } else {
        toastify(res.error, "error");
      }
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCreate = async () => {
    if (!facilityId) {
      toastify("Select a facility first", "error");
      return;
    }
    if (!effectiveType) {
      toastify(
        itemType === "Other"
          ? "Enter a name for the custom complex type"
          : "Type is required (e.g. Block, Phase, Tower)",
        "error",
      );
      return;
    }
    if (!Number.isInteger(Number(count)) || Number(count) < 1) {
      toastify("Count must be at least 1", "error");
      return;
    }
    if (!Number.isInteger(Number(numFloors)) || Number(numFloors) < 1) {
      toastify(
        `Number of floors for "${effectiveType}" is required and must be at least 1 — every complex has at least one floor`,
        "error",
      );
      return;
    }
    if (
      numBasements !== "" &&
      (!Number.isInteger(Number(numBasements)) || Number(numBasements) < 0)
    ) {
      toastify("Number of basements must be 0 or more", "error");
      return;
    }
    try {
      setSaving(true);
      const res = await makeAuthRequest(BLOCKS_URL, "POST", {
        facilityId,
        type: effectiveType,
        count: Number(count),
        name: name.trim() || undefined,
        numFloors: Number(numFloors),
        numBasements: numBasements === "" ? 0 : Number(numBasements),
        locationId: locationId || undefined,
      });
      if (res.success) {
        const created = res.data.blocks || [];
        toastify(
          `Created: ${created.map((b) => `${b.type} ${b.name}${b.floors?.length ? ` (${b.floors.length} floor${b.floors.length === 1 ? "" : "s"})` : ""}`).join(", ")}`,
          "success",
        );
        setName("");
        setNumFloors("");
        setNumBasements("0");
        setCount("1");
        setCustomType("");
        setLocationId("");
        fetchBlocks(facilityId);
      } else {
        toastify(res.error, "error");
      }
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setSaving(false);
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
                <li className="breadcrumb-item active">Complex</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div className="row">
        <div className="col-sm-12">
          <div className="card">
            <div className="card-body">
              <div className="row mb-3">
                <div className="col-md-4">
                  <label className="form-label">Facility</label>
                  <select
                    className="form-select"
                    value={facilityId}
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
              </div>

              {facilityId && (
                <>
                  <div className="card mb-4">
                    <div className="card-header">
                      <h6 className="mb-0">Facility Complexes</h6>
                    </div>
                    <div className="card-body">
                      <SoftTableStyles />
                      {loading ? (
                        <div className="text-center py-3">
                          <div
                            className="spinner-border spinner-border-sm text-primary"
                            role="status"
                          ></div>
                        </div>
                      ) : blocks.length === 0 ? (
                        <p className="text-muted mb-0">
                          Nothing registered yet for this facility — create one
                          below. Units and tariff plans can then be assigned to
                          it.
                        </p>
                      ) : (
                        <>
                          {/* Summary strip — total count per type, at a glance */}
                          <div className="d-flex flex-wrap gap-2 mb-3">
                            {Object.entries(groupedBlocks).map(
                              ([type, items]) => (
                                <span
                                  key={type}
                                  className={`badge ${complexBadgeClass(type)}`}
                                >
                                  {type}: {items.length}
                                </span>
                              ),
                            )}
                          </div>

                          {Object.entries(groupedBlocks).map(
                            ([type, items]) => (
                              <div key={type} className="mb-3">
                                <h6 className="mb-2">
                                  <span
                                    className={`badge ${complexBadgeClass(type)} me-2`}
                                  >
                                    {type}
                                  </span>
                                  <span className="text-muted small">
                                    {items.length} registered
                                  </span>
                                </h6>
                                <div className="table-responsive">
                                  <table className="table table-sm align-middle mb-0 dmr-soft-table">
                                    <thead>
                                      <tr>
                                        <SortableHeader label="Name" field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                                        <SortableHeader label="Floors" field="floors" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                                        <SortableHeader label="Units" field="units" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                                        <SortableHeader label="Occupied" field="occupied" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                                        <SortableHeader label="Unoccupied" field="unoccupied" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                                        <SortableHeader label="Meters Installed" field="meters" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                                        <th className="text-end">Action</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {sortBlocks(items, sortField, sortDir).map((b) => (
                                        <React.Fragment key={b._id}>
                                          {editingId === b._id ? (
                                            <tr>
                                              <td colSpan={6}>
                                                <div className="d-flex gap-2 align-items-end flex-wrap mb-2">
                                                  <div>
                                                    <label className="form-label mb-0 small">
                                                      Name
                                                    </label>
                                                    <input
                                                      className="form-control form-control-sm"
                                                      value={editName}
                                                      onChange={(e) =>
                                                        setEditName(
                                                          e.target.value,
                                                        )
                                                      }
                                                    />
                                                  </div>
                                                  <div>
                                                    <label className="form-label mb-0 small">
                                                      Complex
                                                    </label>
                                                    <select
                                                      className="form-select form-select-sm"
                                                      value={editType}
                                                      onChange={(e) =>
                                                        setEditType(
                                                          e.target.value,
                                                        )
                                                      }
                                                    >
                                                      {COMPLEX_TYPE_OPTIONS.map(
                                                        (t) => (
                                                          <option
                                                            key={t}
                                                            value={t}
                                                          >
                                                            {t}
                                                          </option>
                                                        ),
                                                      )}
                                                    </select>
                                                  </div>
                                                  {editType === "Other" && (
                                                    <div>
                                                      <label className="form-label mb-0 small">
                                                        Custom type
                                                      </label>
                                                      <input
                                                        className="form-control form-control-sm"
                                                        placeholder="e.g. Estate"
                                                        value={editCustomType}
                                                        onChange={(e) =>
                                                          setEditCustomType(
                                                            e.target.value,
                                                          )
                                                        }
                                                      />
                                                    </div>
                                                  )}
                                                  <div>
                                                    <label className="form-label mb-0 small">
                                                      Number of Floors
                                                    </label>
                                                    <input
                                                      type="number"
                                                      min="1"
                                                      className="form-control form-control-sm"
                                                      style={{ width: "90px" }}
                                                      value={editNumFloors}
                                                      onChange={(e) =>
                                                        setEditNumFloors(
                                                          e.target.value,
                                                        )
                                                      }
                                                    />
                                                  </div>
                                                  <div>
                                                    <label className="form-label mb-0 small">
                                                      Number of Units
                                                    </label>
                                                    <input
                                                      type="number"
                                                      min="0"
                                                      className="form-control form-control-sm"
                                                      style={{ width: "90px" }}
                                                      value={editNumUnits}
                                                      onChange={(e) =>
                                                        setEditNumUnits(
                                                          e.target.value,
                                                        )
                                                      }
                                                    />
                                                  </div>
                                                  <div>
                                                    <label className="form-label mb-0 small">
                                                      Location
                                                    </label>
                                                    <select
                                                      className="form-select form-select-sm"
                                                      value={editLocationId}
                                                      onChange={(e) =>
                                                        setEditLocationId(
                                                          e.target.value,
                                                        )
                                                      }
                                                    >
                                                      <option value="">
                                                        Not set
                                                      </option>
                                                      {locations.map((l) => (
                                                        <option
                                                          key={l._id}
                                                          value={l._id}
                                                        >
                                                          {l.name}
                                                        </option>
                                                      ))}
                                                    </select>
                                                  </div>
                                                </div>
                                                <div className="form-text">
                                                  Raising Floors/Units
                                                  auto-creates the extra ones.
                                                  Lowering Floors removes the
                                                  top floors (even if units are
                                                  on them); lowering Units only
                                                  removes vacant, meter-less
                                                  units, newest first.
                                                </div>
                                              </td>
                                              <td className="text-end align-top">
                                                <button
                                                  className="btn btn-sm btn-primary me-1"
                                                  onClick={() => saveEdit(b)}
                                                  disabled={savingEdit}
                                                >
                                                  {savingEdit
                                                    ? "Saving..."
                                                    : "Save"}
                                                </button>
                                                <button
                                                  className="btn btn-sm btn-outline-secondary"
                                                  onClick={cancelEdit}
                                                  disabled={savingEdit}
                                                >
                                                  Cancel
                                                </button>
                                              </td>
                                            </tr>
                                          ) : (
                                            <tr>
                                              <td>{b.name}</td>
                                              <td>{b.floorCount ?? 0}</td>
                                              <td>{b.unitsCount ?? 0}</td>
                                              <td>
                                                <span className="badge bg-light-success">
                                                  {b.occupiedCount ?? 0}
                                                </span>
                                              </td>
                                              <td>
                                                <span className="badge bg-light-secondary">
                                                  {b.unoccupiedCount ?? 0}
                                                </span>
                                              </td>
                                              <td>{b.metersInstalled ?? 0}</td>
                                              <td className="text-end">
                                                {b.floorCount > 0 && (
                                                  <button
                                                    className="btn btn-sm btn-outline-secondary me-1"
                                                    onClick={() =>
                                                      toggleFloors(b._id)
                                                    }
                                                    disabled={
                                                      loadingFloorsFor === b._id
                                                    }
                                                  >
                                                    {expandedFloors[b._id]
                                                      ? "Hide floors"
                                                      : "View floors"}
                                                  </button>
                                                )}
                                                <button
                                                  className="btn btn-sm btn-outline-primary me-1"
                                                  onClick={() => startEdit(b)}
                                                >
                                                  Edit
                                                </button>
                                                <button
                                                  className="btn btn-sm btn-outline-danger"
                                                  onClick={() => handleDelete(b)}
                                                  disabled={deletingId === b._id}
                                                >
                                                  {deletingId === b._id
                                                    ? "Deleting..."
                                                    : "Delete"}
                                                </button>
                                              </td>
                                            </tr>
                                          )}
                                          {expandedFloors[b._id] && (
                                            <tr>
                                              <td
                                                colSpan={7}
                                                className="bg-light"
                                              >
                                                {expandedFloors[b._id]
                                                  .length === 0 ? (
                                                  <span className="text-muted">
                                                    No floors found.
                                                  </span>
                                                ) : (
                                                  <div className="d-flex flex-wrap gap-1">
                                                    {expandedFloors[b._id].map(
                                                      (f) => (
                                                        <span
                                                          key={f._id}
                                                          className="badge bg-light-primary"
                                                        >
                                                          {f.name}
                                                        </span>
                                                      ),
                                                    )}
                                                  </div>
                                                )}
                                              </td>
                                            </tr>
                                          )}
                                        </React.Fragment>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ),
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-header">
                      <h6 className="mb-0">Add Complex</h6>
                    </div>
                    <div className="card-body">
                      <p className="text-muted small mb-2">
                        A facility can mix types at this tier — e.g. 3 Blocks
                        now, then come back and add a Court, then a Tower. Each
                        addition needs its own type, count, and floor count
                        (never guessed to 1 — enter a number).
                      </p>
                      <div className="row">
                        <div className="col-md-3 mb-3">
                          <label className="form-label">
                            Complex <span className="text-danger">*</span>
                          </label>
                          <select
                            className="form-select"
                            value={itemType}
                            onChange={(e) => setItemType(e.target.value)}
                          >
                            {COMPLEX_TYPE_OPTIONS.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                          {itemType === "Other" && (
                            <input
                              className="form-control mt-2"
                              placeholder="e.g. Estate, Court..."
                              value={customType}
                              onChange={(e) => setCustomType(e.target.value)}
                            />
                          )}
                        </div>
                        <div className="col-md-2 mb-3">
                          <label className="form-label">
                            Count <span className="text-danger">*</span>
                          </label>
                          <input
                            type="number"
                            min="1"
                            className="form-control"
                            value={count}
                            onChange={(e) => setCount(e.target.value)}
                          />
                        </div>
                        {Number(count) === 1 && (
                          <div className="col-md-7 mb-3">
                            <label className="form-label">Name (optional)</label>
                            <input
                              className="form-control"
                              placeholder="e.g. Northwing"
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                            />
                            <div className="form-text">
                              Leave blank to auto-name it "{effectiveType} A".
                            </div>
                          </div>
                        )}
                        <div className="col-md-4 mb-3">
                          <label className="form-label">
                            Number of Floors{" "}
                            <span className="text-danger">*</span>
                          </label>
                          <input
                            type="number"
                            min="1"
                            className="form-control"
                            placeholder="e.g. 4"
                            value={numFloors}
                            onChange={(e) => setNumFloors(e.target.value)}
                          />
                          <div className="form-text">
                            Minimum 1 — never 0, never assumed.
                          </div>
                        </div>
                        <div className="col-md-4 mb-3">
                          <label className="form-label">
                            Number of Basements
                          </label>
                          <input
                            type="number"
                            min="0"
                            className="form-control"
                            placeholder="e.g. 2"
                            value={numBasements}
                            onChange={(e) => setNumBasements(e.target.value)}
                          />
                          <div className="form-text">
                            0 if none. Basements are named "B1", "B2"...
                            (closest to ground last), then "G" for ground,
                            then "1", "2"... for the rest.
                          </div>
                        </div>
                        <div className="col-md-4 mb-3">
                          <label className="form-label">Location</label>
                          <select
                            className="form-select"
                            value={locationId}
                            onChange={(e) => setLocationId(e.target.value)}
                          >
                            <option value="">Not set</option>
                            {locations.map((l) => (
                              <option key={l._id} value={l._id}>
                                {l.name}
                              </option>
                            ))}
                          </select>
                          <div className="form-text">
                            Optional — links this complex to a place from{" "}
                            <Link to="/facility/locations">Locations</Link>,
                            shown wherever meters under it display their
                            location.
                          </div>
                        </div>
                      </div>
                      <div className="text-end">
                        <button
                          className="btn btn-primary"
                          onClick={handleCreate}
                          disabled={saving}
                        >
                          {saving ? "Saving..." : "Add"}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default Complex;
