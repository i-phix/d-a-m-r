import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import Layout from "../../../../layout/Layout";
import { makeAuthRequest } from "../../../../../utils/makeRequest";
import { toastify } from "../../../../../utils/toast";
import {
  getMyReadingsURL,
  getFlagsURL,
  runCronURL,
  dashboardStatsURL,
} from "../../../../../utils/urls";
const CRON_JOBS = [
  {
    key: "monthlyInvoices",
    label: "Monthly Invoices",
    description:
      "Generates invoices for occupied units with readings in the prior billing period.",
    icon: "ti ti-file-invoice",
  },
  {
    key: "overdueReminders",
    label: "Overdue Reminders",
    description: "Sends reminders for invoices already past their due date.",
    icon: "ti ti-alert-circle",
  },
  {
    key: "upcomingDueReminders",
    label: "Upcoming Due Reminders",
    description: "Sends reminders before/on the due date, per facility config.",
    icon: "ti ti-clock",
  },
  {
    key: "dailyAnomalyScan",
    label: "Anomaly Scan",
    description: "Scans for missing readings and re-runs anomaly detection.",
    icon: "ti ti-activity",
  },
  {
    key: "autoReconcile",
    label: "Auto Reconcile Payments",
    description:
      "Pulls new M-Pesa Paybill transactions and applies them to open invoices (also runs automatically every 15 min).",
    icon: "ti ti-refresh",
  },
];

const COLORS = {
  primary: "#4680ff",
  success: "#2ca87f",
  danger: "#dc3545",
  warning: "#e58a00",
  info: "#0dcaf0",
  secondary: "#6c757d",
};

function DamrDashboard() {
  const navigate = useNavigate();
  const user = useSelector((state) => state.damrReducer.user);
  const userRole = user?.role || "";

  const [loading, setLoading] = useState(false);
  const [runningCron, setRunningCron] = useState(null);

  // shared stats
  const [totalMeters, setTotalMeters] = useState(0);
  const [totalReadings, setTotalReadings] = useState(0);
  const [openFlags, setOpenFlags] = useState(0);
  const [resolvedFlags, setResolvedFlags] = useState(0);

  //Admin / Fm stats
  const [totalInvoices, setTotalInvoices] = useState(0);
  const [paidInvoices, setPaidInvoices] = useState(0);
  const [unpaidInvoices, setUnpaidInvoices] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [monthlyReadings, setMonthlyReadings] = useState([]);
  const [flagBreakdown, setFlagBreakdown] = useState([]);

  // Staff
  const [myReadingsToday, setMyReadingsToday] = useState(0);
  const [myReadingsSubmitted, setMyReadingsSubmitted] = useState(0);
  const [myFlagged, setMyFlagged] = useState(0);

  const formatCurrency = (amount) =>
    `KES ${Number(amount || 0).toLocaleString()}`;

  const handleRunCron = async (jobKey) => {
    if (runningCron) return;
    try {
      setRunningCron(jobKey);
      const res = await makeAuthRequest(runCronURL, "POST", { job: jobKey });
      if (res.success) {
        const stats = res.data.stats;
        const summary = stats
          ? Object.entries(stats)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" | ")
          : null;
        toastify(
          summary
            ? `${res.data.message} — ${summary}`
            : res.data.message || `${jobKey} ran successfully`,
          "success",
        );
      } else {
        toastify(res.error, "error");
      }
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setRunningCron(null);
    }
  };
  const fetchAdminStats = async () => {
    try {
      setLoading(true);
      const res = await makeAuthRequest(dashboardStatsURL, "GET");

      if (res.success) {
        const d = res.data;
        setTotalMeters(d.totalMeters || 0);
        setTotalReadings(d.totalReadings || 0);
        setOpenFlags(d.openFlags || 0);
        setResolvedFlags(d.resolvedFlags || 0);
        setTotalInvoices(d.totalInvoices || 0);
        setPaidInvoices(d.paidInvoices || 0);
        setUnpaidInvoices(d.unpaidInvoices || 0);
        setTotalRevenue(d.totalRevenue || 0);
        setMonthlyReadings(d.monthlyReadings || []);
        setFlagBreakdown(d.flagBreakdown || []);
      } else {
        toastify(res.error, "error");
      }
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchStaffStats = async () => {
    try {
      setLoading(true);

      const [readingsRes, flagsRes] = await Promise.all([
        makeAuthRequest(getMyReadingsURL, "GET"),
        makeAuthRequest(getFlagsURL, "GET"),
      ]);

      if (readingsRes.success) {
        const readings = readingsRes.data?.readings || [];
        const today = new Date().toDateString();
        const todayList = readings.filter(
          (r) =>
            new Date(r.createdAt || r.readingDate).toDateString() === today,
        );
        setMyReadingsToday(todayList.length);
        setMyReadingsSubmitted(
          readings.filter((r) => r.status === "confirmed").length,
        );
        setTotalReadings(readings.length);
      }

      if (flagsRes.success) {
        const flags = flagsRes.data?.flags || [];
        setMyFlagged(
          flags.filter(
            (f) =>
              f.status !== "resolved" &&
              String(f.staffId) === String(user?._id),
          ).length,
        );
      }
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userRole === "Staff") {
      fetchStaffStats();
    } else {
      fetchAdminStats();
    }
  }, [userRole]);
  const StatCard = ({ count, label, icon, color, onClick }) => (
    <div className="col-md-3 col-sm-6">
      <div
        className="card"
        style={{ cursor: onClick ? "pointer" : "default" }}
        onClick={onClick}
      >
        <div className="card-body">
          <div className="row align-items-center">
            <div className="col-8">
              <h3 className="mb-1">{count}</h3>
              <p className="text-muted mb-0">{label}</p>
            </div>
            <div className="col-4 text-end">
              <i
                className={`${icon} f-36`}
                style={{ color: COLORS[color] }}
              ></i>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  //Render
  return (
    <Layout>
      <div className="row">
        <div className="col-md-12">
          {/* ── Welcome banner ── */}
          <div className="card mb-3">
            <div className="card-body">
              <h5 className="mb-0">
                Welcome back, <strong>{user?.fullName || user?.email}</strong>
                <span className="badge bg-light-primary ms-2 text-capitalize">
                  {userRole}
                </span>
              </h5>
            </div>
          </div>

          {userRole !== "Staff" && (
            <>
              {/* Stat cards row 1 */}
              <div className="row mb-4">
                <StatCard
                  count={totalMeters}
                  label="Total Meters"
                  icon="ti ti-cpu-charge"
                  color="primary"
                  onClick={() => navigate("/meters")}
                />
                <StatCard
                  count={totalReadings}
                  label="Total Readings"
                  icon="ti ti-graph"
                  color="info"
                  onClick={() => navigate("/readings")}
                />
                <StatCard
                  count={openFlags}
                  label="Open Flags"
                  icon="ti ti-flag"
                  color="warning"
                  onClick={() => navigate("/flags")}
                />
                <StatCard
                  count={resolvedFlags}
                  label="Resolved Flags"
                  icon="ti ti-flag-check"
                  color="success"
                />
              </div>
              {userRole === "admin" && (
                <div className="row mb-4">
                  <StatCard
                    count={totalInvoices}
                    label="Total Invoices"
                    icon="ti ti-note"
                    color="primary"
                    onClick={() => navigate("/invoices")}
                  />
                  <StatCard
                    count={paidInvoices}
                    label="Paid Invoices"
                    icon="ti ti-circle-check"
                    color="success"
                  />
                  <StatCard
                    count={unpaidInvoices}
                    label="Unpaid Invoices"
                    icon="ti ti-alert-triangle"
                    color="danger"
                  />
                  <div className="col-md-3 col-sm-6">
                    <div className="card">
                      <div className="card-body">
                        <div className="row align-items-center">
                          <div className="col-8">
                            <h5 className="mb-1 text-success">
                              {formatCurrency(totalRevenue)}
                            </h5>
                            <p className="text-muted mb-0">Revenue Collected</p>
                          </div>
                          <div className="col-4 text-end">
                            <i
                              className="ti ti-cash f-36"
                              style={{ color: COLORS.success }}
                            ></i>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Charts */}
              <div className="row mb-4">
                {/* Monthly readings bar chart */}
                <div className="col-md-8">
                  <div className="card">
                    <div className="card-header">
                      <h5 className="card-title mb-0">
                        <i className="ti ti-chart-bar text-primary me-2"></i>
                        Readings — Last 6 Months
                      </h5>
                    </div>
                    <div className="card-body">
                      {loading ? (
                        <div className="text-center py-5">
                          <div
                            className="spinner-border text-primary"
                            role="status"
                          >
                            <span className="visually-hidden">Loading...</span>
                          </div>
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height={260}>
                          <BarChart data={monthlyReadings}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="Readings" fill={COLORS.primary} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </div>

                {/* Flag breakdown pie chart */}
                <div className="col-md-4">
                  <div className="card">
                    <div className="card-header">
                      <h5 className="card-title mb-0">
                        <i className="ti ti-flag text-warning me-2"></i>
                        Flag Status
                      </h5>
                    </div>
                    <div className="card-body">
                      {loading ? (
                        <div className="text-center py-5">
                          <div
                            className="spinner-border text-warning"
                            role="status"
                          >
                            <span className="visually-hidden">Loading...</span>
                          </div>
                        </div>
                      ) : flagBreakdown.every((f) => f.value === 0) ? (
                        <div className="text-center py-4">
                          <i
                            className="ti ti-inbox text-muted"
                            style={{ fontSize: "48px" }}
                          ></i>
                          <p className="text-muted mt-2">No flags raised</p>
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height={260}>
                          <PieChart>
                            <Pie
                              data={flagBreakdown}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={2}
                              dataKey="value"
                              label={({ name, percent }) =>
                                `${name}: ${(percent * 100).toFixed(0)}%`
                              }
                            >
                              <Cell fill={COLORS.warning} />
                              <Cell fill={COLORS.success} />
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {userRole === "admin" && (
                <div className="row mb-4">
                  <div className="col-md-12">
                    <div className="card">
                      <div className="card-header">
                        <h5 className="card-title mb-0">
                          <i className="ti ti-settings-automation text-secondary me-2"></i>
                          Admin Tools
                        </h5>
                      </div>
                      <div className="card-body">
                        <p className="text-muted mb-3">
                          Trigger a scheduled job immediately instead of waiting
                          for its normal schedule. Results are logged on the
                          server; a summary toast will show here once it
                          finishes.
                        </p>
                        <div className="row">
                          {CRON_JOBS.map((job) => (
                            <div
                              className="col-md-3 col-sm-6 mb-3"
                              key={job.key}
                            >
                              <div className="card h-100">
                                <div className="card-body text-center">
                                  <i
                                    className={`${job.icon} f-32 text-primary mb-2`}
                                  ></i>
                                  <h6>{job.label}</h6>
                                  <p
                                    className="text-muted"
                                    style={{ fontSize: "12px" }}
                                  >
                                    {job.description}
                                  </p>
                                  <button
                                    className="btn btn-outline-primary btn-sm w-100"
                                    disabled={!!runningCron}
                                    onClick={() => handleRunCron(job.key)}
                                  >
                                    {runningCron === job.key
                                      ? "Running..."
                                      : "Run Now"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          {userRole === "Staff" && (
            <>
              <div className="row mb-4">
                <StatCard
                  count={myReadingsToday}
                  label="Readings Today"
                  icon="ti ti-graph"
                  color="primary"
                  onClick={() => navigate("/readings")}
                />
                <StatCard
                  count={myReadingsSubmitted}
                  label="Confirmed Readings"
                  icon="ti ti-circle-check"
                  color="success"
                />
                <StatCard
                  count={totalReadings}
                  label="Total My Readings"
                  icon="ti ti-list"
                  color="info"
                  onClick={() => navigate("/readings")}
                />
                <StatCard
                  count={myFlagged}
                  label="My Flagged Readings"
                  icon="ti ti-flag"
                  color="warning"
                  onClick={() => navigate("/flags")}
                />
              </div>

              {/* Quick actions for staff */}
              <div className="card">
                <div className="card-header">
                  <h5 className="card-title mb-0">Quick Actions</h5>
                </div>
                <div className="card-body">
                  <div className="row">
                    <div className="col-md-4">
                      <button
                        className="btn btn-primary w-100 mb-2"
                        onClick={() => navigate("/readings/upload")}
                      >
                        <i className="ti ti-upload me-2"></i>
                        Upload Meter Photo
                      </button>
                    </div>
                    <div className="col-md-4">
                      <button
                        className="btn btn-outline-primary w-100 mb-2"
                        onClick={() => navigate("/readings/manual")}
                      >
                        <i className="ti ti-keyboard me-2"></i>
                        Manual Entry
                      </button>
                    </div>
                    <div className="col-md-4">
                      <button
                        className="btn btn-outline-warning w-100 mb-2"
                        onClick={() => navigate("/flags")}
                      >
                        <i className="ti ti-flag me-2"></i>
                        View My Flags
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}

export default DamrDashboard;
