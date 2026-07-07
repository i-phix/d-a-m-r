import React, { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import Layout from "../../../../layout/Layout";
import { makeAuthRequest } from "../../../../../utils/makeRequest";
import { toastify } from "../../../../../utils/toast";

const USERS_URL = "/api/v1/damr/users";

// Standalone page (opened in its own browser tab from the All Users list)
// for an admin to set a brand-new password for a user. Write-only by
// design — the stored password is a one-way bcrypt hash (see
// backend/src/controllers/auth/register.js) and can never be displayed,
// so this is the only supported way to "recover" a lost password: reset
// it here and share the new one with the user directly.
function ResetUserPassword() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const fetchUser = async () => {
    try {
      setLoading(true);
      const res = await makeAuthRequest(`${USERS_URL}/${id}`, "GET");
      if (res.success) setUser(res.data.user);
      else toastify(res.error, "error");
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
        `${USERS_URL}/${id}/password`,
        "PUT",
        { newPassword },
      );
      if (res.success) {
        toastify("Password updated", "success");
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
    <Layout>
      <div className="page-header">
        <div className="page-block">
          <div className="row align-items-center">
            <div className="col-md-12">
              <ul className="breadcrumb mb-3">
                <li className="breadcrumb-item">
                  <Link to="/">Dashboard</Link>
                </li>
                <li className="breadcrumb-item">
                  <Link to="/users">User Management</Link>
                </li>
                <li className="breadcrumb-item active">Reset Password</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-md-6">
          <div className="card" style={{ borderRadius: 0 }}>
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5 className="card-title mb-0">
                <i className="ti ti-key me-2 text-primary"></i>
                Reset Password{user ? ` — ${user.fullName}` : ""}
              </h5>
              <button
                className="btn btn-sm btn-outline-secondary"
                style={{ borderRadius: 0 }}
                onClick={() => navigate("/users")}
              >
                Back to Users
              </button>
            </div>
            <div className="card-body">
              {loading ? (
                <div className="text-center py-5">
                  <div className="spinner-border text-primary" role="status"></div>
                </div>
              ) : !user ? (
                <div className="text-center py-5">
                  <i
                    className="ti ti-user-off text-muted"
                    style={{ fontSize: "48px" }}
                  ></i>
                  <p className="text-muted mt-2">User not found</p>
                </div>
              ) : (
                <>
                  <dl className="row mb-4">
                    <dt className="col-sm-4">Email</dt>
                    <dd className="col-sm-8">{user.email}</dd>
                    <dt className="col-sm-4">Phone</dt>
                    <dd className="col-sm-8">{user.phoneNumber || "—"}</dd>
                    <dt className="col-sm-4">Role</dt>
                    <dd className="col-sm-8">{user.role}</dd>
                  </dl>

                  <div className="alert alert-info py-2 small" style={{ borderRadius: 0 }}>
                    <i className="ti ti-info-circle me-1"></i>
                    Passwords are securely hashed and can't be viewed — set a
                    new one below and share it with the user directly.
                  </div>

                  {done && (
                    <div className="alert alert-success py-2" style={{ borderRadius: 0 }}>
                      <i className="ti ti-circle-check me-1"></i>
                      Password updated successfully.
                    </div>
                  )}

                  <div className="mb-3">
                    <label className="form-label">New Password</label>
                    <input
                      type="password"
                      className="form-control"
                      style={{ borderRadius: 0 }}
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
                      style={{ borderRadius: 0 }}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                  <div className="text-end">
                    <button
                      className="btn btn-primary"
                      style={{ borderRadius: 0 }}
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? "Saving..." : "Update Password"}
                    </button>
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

export default ResetUserPassword;
