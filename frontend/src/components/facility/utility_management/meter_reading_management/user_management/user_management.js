import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import Layout from "../../../../layout/Layout";
import { makeAuthRequest } from "../../../../../utils/makeRequest";
import { toastify } from "../../../../../utils/toast";

const FACILITIES_URL = "/api/v1/damr/facility/facilities";
const REGISTER_URL = "/api/v1/damr/auth/register";
const USERS_URL = "/api/v1/damr/users";

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

const ROLE_LABELS = {
  admin: "Administrator",
  editor: "Facility Manager",
  Staff: "Field Staff",
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

// Generic comparator driving every sortable column on the All Users table.
// "index" sorts by the order users were fetched in (newest first, since
// get_users.js sorts by createdAt desc).
function sortUsers(list, field, dir) {
  if (field === "index") {
    return dir === "asc" ? list : [...list].reverse();
  }
  const getValue = (u) => {
    switch (field) {
      case "name":
        return u.fullName || "";
      case "email":
        return u.email || "";
      case "phone":
        return u.phoneNumber || "";
      case "role":
        return ROLE_LABELS[u.role] || u.role || "";
      case "facility":
        return u.facilityId?.name || "";
      case "status":
        return u.isEnabled === false ? "Inactive" : "Active";
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

// ── All Users (admin only) ─────────────────────────────────────────────
function AllUsersTab({ onResetPassword }) {
  const currentUserId = useSelector((state) => state.damrReducer.user?._id);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("index");
  const [sortDir, setSortDir] = useState("asc");
  const [deletingId, setDeletingId] = useState(null);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await makeAuthRequest(USERS_URL, "GET");
      if (res.success) setUsers(res.data.users || []);
      else toastify(res.error, "error");
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleDelete = async (u) => {
    if (
      !window.confirm(
        `Delete "${u.fullName}"? This cannot be undone — they will immediately lose access.`,
      )
    )
      return;
    try {
      setDeletingId(u._id);
      const res = await makeAuthRequest(`${USERS_URL}/${u._id}`, "DELETE");
      if (res.success) {
        toastify("User deleted", "success");
        fetchUsers();
      } else {
        toastify(res.error, "error");
      }
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = users.filter(
    (u) =>
      u.fullName?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.phoneNumber?.includes(search),
  );
  const sorted = sortUsers(filtered, sortField, sortDir);

  return (
    <div className="card-body">
      <SoftTableStyles />
      <div className="row mb-3">
        <div className="col-md-6">
          <input
            className="form-control dmr-search-pill"
            placeholder="Search by name, email or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="col-md-6 text-end">
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={fetchUsers}
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
          <p className="text-muted mt-2">No users found</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover dmr-soft-table">
            <thead>
              <tr>
                <SortableHeader label="#" field="index" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Name" field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Email" field="email" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Phone" field="phone" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Role" field="role" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
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
                    <strong>{u.fullName}</strong>
                    {String(u._id) === String(currentUserId) && (
                      <span className="text-muted small ms-1">(you)</span>
                    )}
                  </td>
                  <td>{u.email}</td>
                  <td>{u.phoneNumber || "—"}</td>
                  <td>{ROLE_LABELS[u.role] || u.role}</td>
                  <td>{u.facilityId?.name || "—"}</td>
                  <td>
                    <StatusBadge status={u.isEnabled === false ? "Inactive" : "Active"} />
                  </td>
                  <td className="text-end">
                    <button
                      className="btn btn-sm btn-outline-primary me-1"
                      onClick={() => onResetPassword(u)}
                    >
                      <i className="ti ti-key me-1"></i>Reset Password
                    </button>
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => handleDelete(u)}
                      disabled={
                        deletingId === u._id ||
                        String(u._id) === String(currentUserId)
                      }
                      title={
                        String(u._id) === String(currentUserId)
                          ? "You cannot delete your own account"
                          : undefined
                      }
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

// ── Reset Password (admin only) — rendered inline as its own tab within
// this same page, not a modal or a separate route. Write-only by design:
// the stored password is a one-way bcrypt hash (see
// backend/src/controllers/auth/register.js) and can never be displayed,
// so this is the only supported way to "recover" a lost password.
function ResetPasswordTab({ user, onDone, onCancel }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const handleSave = async () => {
    if (!newPassword || newPassword.length < 8) {
      toastify("New password must be at least 8 characters", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      toastify("Passwords do not match", "error");
      return;
    }
    try {
      setSaving(true);
      const res = await makeAuthRequest(
        `${USERS_URL}/${user._id}/password`,
        "PUT",
        { newPassword },
      );
      if (res.success) {
        toastify(`Password updated for ${user.fullName}`, "success");
        setDone(true);
        setNewPassword("");
        setConfirmPassword("");
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
    <div className="card-body">
      <div className="row justify-content-center">
        <div className="col-md-6">
          <div className="alert alert-secondary py-2 mb-3">
            <i className="ti ti-key me-2"></i>
            Resetting password for <strong>{user.fullName}</strong> (
            {user.email})
            <button
              className="btn btn-sm btn-link float-end"
              onClick={onCancel}
            >
              Back to All Users
            </button>
          </div>

          <div className="alert alert-info py-2 small mb-3">
            <i className="ti ti-info-circle me-1"></i>
            Passwords are securely hashed and can't be viewed — set a new one
            below and share it with the user directly.
          </div>

          {done && (
            <div className="alert alert-success py-2">
              <i className="ti ti-circle-check me-1"></i>
              Password updated successfully.
            </div>
          )}

          <div className="mb-3">
            <label className="form-label">New Password</label>
            <input
              type="password"
              className="form-control"
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="mb-3">
            <label className="form-label">Confirm Password</label>
            <input
              type="password"
              className="form-control"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <div className="text-end">
            <button
              className="btn btn-outline-secondary me-2"
              onClick={onDone}
              disabled={saving}
            >
              Done
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Update Password"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UserForm({ userType, onSuccess }) {
  const userRole = useSelector((state) => state.damrReducer.user?.role);
  const userFacId = useSelector((state) => state.damrReducer.user?.facilityId);
  const isFM = userRole === "editor";

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    facilityId: "",
  });
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isFM) {
      makeAuthRequest(FACILITIES_URL, "GET").then((res) => {
        if (res.success) setFacilities(res.data.facilities || []);
      });
    }
    setForm({
      fullName: "",
      email: "",
      phone: "",
      password: "",
      facilityId: isFM ? userFacId || "" : "",
    });
  }, [userType, isFM, userFacId]);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async () => {
    const { fullName, email, phone, password } = form;
    if (!fullName || !email || !phone || !password) {
      toastify("Name, email, phone and password are required", "error");
      return;
    }
    if (userType === "fm" && !form.facilityId) {
      toastify("Please assign a facility to the manager", "error");
      return;
    }
    try {
      setLoading(true);
      const res = await makeAuthRequest(REGISTER_URL, "POST", {
        ...form,
        userType,
      });
      if (res.success) {
        const label = userType === "fm" ? "Facility manager" : "Field staff";
        toastify(`${label} account created`, "success");
        setForm({
          fullName: "",
          email: "",
          phone: "",
          password: "",
          facilityId: "",
        });
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

  const isFMTab = userType === "fm";
  const label = isFMTab ? "Facility Manager" : "Field Staff";
  const infoText = isFMTab
    ? "A Facility Manager can manage meters, residents and invoices for their assigned facility."
    : isFM
      ? `This staff member will be automatically scoped to your facility.`
      : "Field staff can submit meter readings and view flags.";

  return (
    <div className="card-body">
      <div className="row justify-content-center">
        <div className="col-md-7">
          <div className="alert alert-info py-2 mb-4">
            <i className="ti ti-info-circle me-2"></i>
            {infoText}
          </div>

          <div className="mb-3">
            <label className="form-label">
              Full Name <span className="text-danger">*</span>
            </label>
            <input
              name="fullName"
              className="form-control"
              placeholder={isFMTab ? "e.g. Jane Mwangi" : "e.g. David Omondi"}
              value={form.fullName}
              onChange={handleChange}
            />
          </div>

          <div className="row">
            <div className="col-md-6 mb-3">
              <label className="form-label">
                Email <span className="text-danger">*</span>
              </label>
              <input
                name="email"
                type="email"
                className="form-control"
                placeholder="email@facility.co.ke"
                value={form.email}
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
                placeholder="0712345678"
                value={form.phone}
                onChange={handleChange}
              />
            </div>
          </div>

          {/* Facility selector — admin only; FM is auto-scoped */}
          {isFM ? (
            <div className="alert alert-secondary py-2 mb-3">
              <i className="ti ti-building me-2"></i>
              This account will be scoped to <strong>your facility</strong>{" "}
              automatically.
            </div>
          ) : (
            <div className="mb-3">
              <label className="form-label">
                Assign to Facility
                {isFMTab && <span className="text-danger"> *</span>}
                {!isFMTab && <span className="text-muted"> (optional)</span>}
              </label>
              <select
                name="facilityId"
                className="form-select"
                value={form.facilityId}
                onChange={handleChange}
              >
                <option value="">
                  {isFMTab ? "Select facility..." : "No specific facility"}
                </option>
                {facilities.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.name}
                  </option>
                ))}
              </select>
              {facilities.length === 0 && (
                <small className="text-warning">
                  No facilities found. Create a facility first.
                </small>
              )}
            </div>
          )}

          <div className="mb-3">
            <label className="form-label">
              Password <span className="text-danger">*</span>
            </label>
            <input
              name="password"
              type="password"
              className="form-control"
              placeholder="Set a strong password"
              value={form.password}
              onChange={handleChange}
            />
            <small className="text-muted">
              Communicate this securely to the new user.
            </small>
          </div>

          <div className="text-end">
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2"></span>
                  Creating...
                </>
              ) : (
                <>
                  <i className="ti ti-user-plus me-2"></i>Create {label}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Add Resident (FM or Admin) ─────────────────────────────────────────
function AddResidentTabLocal() {
  const userRole = useSelector((state) => state.damrReducer.user?.role);
  const isFM = userRole === "editor";

  return (
    <div className="card-body">
      <div className="row justify-content-center">
        <div className="col-md-7">
          <div className="alert alert-info py-2">
            <i className="ti ti-info-circle me-2"></i>
            {isFM
              ? "You can add residents for units in your facility from the Residents page."
              : "Residents are added from the Residents page — they are linked to a specific unit."}
          </div>
          <div className="text-center mt-4">
            <Link to="/residents" className="btn btn-outline-primary">
              <i className="ti ti-user-plus me-2"></i>Go to Resident Management
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════
function UserManagement() {
  const userRole = useSelector((state) => state.damrReducer.user?.role);
  const isAdmin = userRole === "admin";
  const isFM = userRole === "editor";

  const [activeTab, setActiveTab] = useState(isAdmin ? "all" : "staff");
  const [resetPasswordUser, setResetPasswordUser] = useState(null);

  const handleResetPassword = (user) => {
    setResetPasswordUser(user);
    setActiveTab("reset");
  };
  const handleResetDone = () => {
    setResetPasswordUser(null);
    setActiveTab("all");
  };

  const tabs = [
    {
      key: "all",
      label: "All Users",
      icon: "ti ti-users",
      show: isAdmin,
    },
    // Only appears once a "Reset Password" action has been triggered from
    // the All Users list — an inline tab (not a modal, not a separate
    // route) that shows the reset form for that one user.
    {
      key: "reset",
      label: resetPasswordUser
        ? `Reset Password — ${resetPasswordUser.fullName}`
        : "Reset Password",
      icon: "ti ti-key",
      show: isAdmin && !!resetPasswordUser,
    },
    {
      key: "fm",
      label: "Add Facility Manager",
      icon: "ti ti-briefcase",
      show: isAdmin,
    },
    {
      key: "staff",
      label: "Add Field Staff",
      icon: "ti ti-walk",
      show: isAdmin || isFM,
    },
    {
      key: "resident",
      label: "Add Resident",
      icon: "ti ti-home",
      show: isAdmin || isFM,
    },
  ].filter((t) => t.show);

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
                <li className="breadcrumb-item active">User Management</li>
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

            {activeTab === "all" && (
              <AllUsersTab onResetPassword={handleResetPassword} />
            )}
            {activeTab === "reset" && resetPasswordUser && (
              <ResetPasswordTab
                user={resetPasswordUser}
                onDone={handleResetDone}
                onCancel={handleResetDone}
              />
            )}
            {activeTab === "fm" && (
              <UserForm userType="fm" onSuccess={() => {}} />
            )}
            {activeTab === "staff" && (
              <UserForm userType="staff" onSuccess={() => {}} />
            )}
            {activeTab === "resident" && <AddResidentTabLocal />}
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default UserManagement;
