import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Layout from "../../../../layout/Layout";
import { makeAuthRequest } from "../../../../../utils/makeRequest";
import { toastify } from "../../../../../utils/toast";
import AddressAutocompleteInput from "../../../../common/AddressAutocompleteInput";

const LOCATIONS_URL = "/api/v1/damr/facility/locations";

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

// Generic comparator driving every sortable column on the All Locations
// table. "index" sorts by the order locations were fetched in.
function sortLocations(list, field, dir) {
  if (field === "index") {
    return dir === "asc" ? list : [...list].reverse();
  }
  const getValue = (l) => {
    switch (field) {
      case "name":
        return l.name || "";
      case "county":
        return l.county || "";
      case "town":
        return l.town || "";
      case "address":
        return l.address || "";
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

function AllLocationsTab({ onEdit }) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
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

  const fetchLocations = async () => {
    try {
      setLoading(true);
      const res = await makeAuthRequest(LOCATIONS_URL, "GET");
      if (res.success) setLocations(res.data.locations || []);
      else toastify(res.error, "error");
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this location?")) return;
    try {
      const res = await makeAuthRequest(`${LOCATIONS_URL}/${id}`, "DELETE");
      if (res.success) {
        toastify("Location deleted", "success");
        fetchLocations();
      } else toastify(res.error, "error");
    } catch (err) {
      toastify(err.message, "error");
    }
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  const filtered = locations.filter(
    (l) =>
      l.name?.toLowerCase().includes(search.toLowerCase()) ||
      l.county?.toLowerCase().includes(search.toLowerCase()) ||
      l.town?.toLowerCase().includes(search.toLowerCase()),
  );
  const sorted = sortLocations(filtered, sortField, sortDir);

  return (
    <div className="card-body">
      <SoftTableStyles />
      <div className="row mb-3">
        <div className="col-md-6">
          <input
            className="form-control dmr-search-pill"
            placeholder="Search locations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="col-md-6 text-end">
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={fetchLocations}
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
            className="ti ti-map-pin-off text-muted"
            style={{ fontSize: "48px" }}
          ></i>
          <p className="text-muted mt-2">No locations found</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover dmr-soft-table">
            <thead>
              <tr>
                <SortableHeader label="#" field="index" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Name" field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="County" field="county" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Town" field="town" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Address" field="address" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((l, i) => (
                <tr key={l._id}>
                  <td>{sortField === "index" && sortDir === "desc" ? sorted.length - i : i + 1}</td>
                  <td>
                    <strong>{l.name}</strong>
                  </td>
                  <td>{l.county || "—"}</td>
                  <td>{l.town || "—"}</td>
                  <td>{l.address || "—"}</td>
                  <td>
                    <button
                      className="btn btn-sm btn-outline-primary me-1"
                      onClick={() => onEdit(l)}
                    >
                      <i className="ti ti-edit me-1"></i>Edit
                    </button>
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => handleDelete(l._id)}
                    >
                      <i className="ti ti-trash me-1"></i>Delete
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
function LocationFormTab({ editing, onSuccess, onCancelEdit }) {
  const [form, setForm] = useState({
    name: "",
    county: "",
    town: "",
    address: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (editing)
      setForm({
        name: editing.name || "",
        county: editing.county || "",
        town: editing.town || "",
        address: editing.address || "",
      });
    else setForm({ name: "", county: "", town: "", address: "" });
  }, [editing]);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.name) {
      toastify("Location name is required", "error");
      return;
    }
    try {
      setLoading(true);
      const url = editing ? `${LOCATIONS_URL}/${editing._id}` : LOCATIONS_URL;
      const method = editing ? "PUT" : "POST";
      const res = await makeAuthRequest(url, method, form);
      if (res.success) {
        toastify(editing ? "Location updated" : "Location created", "success");
        setForm({ name: "", county: "", town: "", address: "" });
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
        <div className="col-md-7">
          {editing && (
            <div className="alert alert-info py-2 mb-3">
              <i className="ti ti-edit me-2"></i>Editing:{" "}
              <strong>{editing.name}</strong>
              <button
                className="btn btn-sm btn-link float-end"
                onClick={onCancelEdit}
              >
                Cancel Edit
              </button>
            </div>
          )}
          <div className="mb-3">
            <label className="form-label">
              Name <span className="text-danger">*</span>
            </label>
            <input
              name="name"
              className="form-control"
              placeholder="e.g. Nairobi CBD"
              value={form.name}
              onChange={handleChange}
            />
          </div>
          <div className="mb-3">
            <label className="form-label">Place</label>
            <AddressAutocompleteInput
              name="address"
              placeholder="Start typing a place..."
              value={form.address}
              onChange={handleChange}
              countryCodes={["ke"]}
              onPlaceSelected={({ county, town }) =>
                setForm((prev) => ({
                  ...prev,
                  county: county || prev.county,
                  town: town || prev.town,
                }))
              }
            />
            <div className="form-text">
              Start typing to see suggestions — picking one also fills in County/Town below.
            </div>
          </div>
          <div className="row">
            <div className="col-md-6 mb-3">
              <label className="form-label">County</label>
              <input
                name="county"
                className="form-control"
                placeholder="e.g. Nairobi"
                value={form.county}
                onChange={handleChange}
              />
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label">Town</label>
              <input
                name="town"
                className="form-control"
                placeholder="e.g. Westlands"
                value={form.town}
                onChange={handleChange}
              />
            </div>
          </div>
          <div className="text-end">
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading
                ? "Saving..."
                : editing
                  ? "Update Location"
                  : "Add Location"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
function Locations() {
  const [activeTab, setActiveTab] = useState("all");
  const [editing, setEditing] = useState(null);

  const handleEdit = (location) => {
    setEditing(location);
    setActiveTab("form");
  };
  const handleCancelEdit = () => {
    setEditing(null);
    setActiveTab("all");
  };
  const handleSuccess = () => {
    setEditing(null);
    setActiveTab("all");
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
                <li className="breadcrumb-item active">Locations</li>
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
                    onClick={() => {
                      setEditing(null);
                      setActiveTab("all");
                    }}
                    type="button"
                  >
                    <i className="ti ti-map-pin me-2"></i>All Locations
                  </button>
                </li>
                <li className="nav-item">
                  <button
                    className={`nav-link ${activeTab === "form" ? "active" : ""}`}
                    onClick={() => setActiveTab("form")}
                    type="button"
                  >
                    <i className="ti ti-plus me-2"></i>
                    {editing ? "Edit Location" : "Add Location"}
                  </button>
                </li>
              </ul>
            </div>

            {activeTab === "all" && <AllLocationsTab onEdit={handleEdit} />}
            {activeTab === "form" && (
              <LocationFormTab
                editing={editing}
                onSuccess={handleSuccess}
                onCancelEdit={handleCancelEdit}
              />
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default Locations;
