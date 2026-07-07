import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import axios from "axios";
import Layout from "../../../../layout/Layout";
import { makeAuthRequest } from "../../../../../utils/makeRequest";
import { toastify } from "../../../../../utils/toast";
import { getMetersURL, backend_url } from "../../../../../utils/urls";
import { getItem } from "../../../../../utils/localStorage";

// Local (not UTC) YYYY-MM-DD — matches what an <input type="date"> expects,
// and avoids the classic toISOString() off-by-one-day bug near midnight.
function todayDateString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

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

function AllMetersTab() {
  const navigate = useNavigate();
  const [meters, setMeters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const fetchMeters = async () => {
    try {
      setLoading(true);
      const url = statusFilter
        ? `${getMetersURL}?status=${statusFilter}`
        : getMetersURL;
      const res = await makeAuthRequest(url, "GET");
      if (res.success) setMeters(res.data.meters || []);
      else toastify(res.error, "error");
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeters();
  }, [statusFilter]);

  const filtered = meters.filter(
    (m) =>
      m.serialNumber?.toLowerCase().includes(search.toLowerCase()) ||
      m.manufacturer?.toLowerCase().includes(search.toLowerCase()) ||
      m.unitId?.name?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="card-body">
      <div className="row mb-3">
        <div className="col-md-5">
          <input
            className="form-control"
            placeholder="Search by serial number, manufacturer, unit..."
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
            <option value="UNASSIGNED">Unassigned</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="FAULTY">Faulty</option>
          </select>
        </div>
        <div className="col-md-4 text-end">
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={fetchMeters}
          >
            <i className="ti ti-refresh me-1"></i> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status"></div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-5">
          <i
            className="ti ti-inbox text-muted"
            style={{ fontSize: "48px" }}
          ></i>
          <p className="text-muted mt-2">No meters found</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover">
            <thead>
              <tr>
                <th>#</th>
                <th>Serial Number</th>
                <th>Type</th>
                <th>Manufacturer</th>
                <th>Unit</th>
                <th>Facility</th>
                <th>Last Reading</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((meter, i) => (
                <tr key={meter._id}>
                  <td>{i + 1}</td>
                  <td>
                    <strong>{meter.serialNumber}</strong>
                  </td>
                  <td className="text-capitalize">{meter.meterType}</td>
                  <td>{meter.manufacturer || "—"}</td>
                  <td>{meter.unitId?.name || "—"}</td>
                  <td>{meter.facilityId?.name || "—"}</td>
                  <td>
                    {meter.lastReadingValue != null
                      ? `${meter.lastReadingValue} m³`
                      : "—"}
                  </td>
                  <td>
                    <StatusBadge status={meter.status} />
                  </td>
                  <td>
                    <button
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => navigate(`/meters/${meter._id}`)}
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

function AddMeterTab({ onSuccess }) {
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    serialNumber: "",
    manufacturer: "",
    model: "",
    meterType: "analogue",
    installationDate: todayDateString(),
    initialReading: 0,
    condition: "new",
  });
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [entryMode, setEntryMode] = useState("scan"); // 'scan' | 'manual'

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    handleScan(file);
  };

  const handleScan = async (file) => {
    try {
      setScanning(true);
      setScanResult(null);

      const damrUser = await getItem("DAMR_USER");
      const formData = new FormData();
      formData.append("meterImage", file);

      const res = await axios.post(
        `${backend_url}/api/v1/damr/meters/scan`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${damrUser?.token}`,
          },
        },
      );

      if (res.status === 200 && res.data.extracted) {
        const e = res.data.extracted;
        setScanResult(e);

        setForm((prev) => ({
          ...prev,
          serialNumber: e.serialNumber || prev.serialNumber,
          manufacturer: e.manufacturer || prev.manufacturer,
          model: e.model || prev.model,
          meterType: e.meterType || prev.meterType,
          initialReading:
            e.initialReading != null ? e.initialReading : prev.initialReading,
        }));

        toastify(
          "Nameplate scanned — please review and confirm the details",
          "info",
        );
      } else {
        toastify("Could not extract details — please fill in manually", "warn");
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      toastify(`Scan failed: ${msg} — please fill in manually`, "warn");
    } finally {
      setScanning(false);
    }
  };
  const handleSubmit = async () => {
    if (!form.serialNumber) {
      toastify("Serial number is required", "error");
      return;
    }
    if (!form.installationDate) {
      toastify("Installation date is required", "error");
      return;
    }
    try {
      setLoading(true);
      const res = await makeAuthRequest(getMetersURL, "POST", form);
      if (res.success) {
        toastify("Meter created successfully", "success");
        setForm({
          serialNumber: "",
          manufacturer: "",
          model: "",
          meterType: "analogue",
          installationDate: todayDateString(),
          initialReading: 0,
          condition: "new",
        });
        setScanResult(null);
        setPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
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

  const handleClear = () => {
    setForm({
      serialNumber: "",
      manufacturer: "",
      model: "",
      meterType: "analogue",
      installationDate: todayDateString(),
      initialReading: 0,
      condition: "new",
    });
    setScanResult(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const confidenceColor = (c) =>
    ({ high: "text-success", medium: "text-warning", low: "text-danger" })[c] ||
    "";

  return (
    <div className="card-body">
      <div className="row">
        {/* ── LEFT: Scan + Form ── */}
        <div className="col-md-7">
          {/* Entry mode toggle */}
          <div className="mb-4">
            <div className="btn-group w-100" role="group">
              <button
                type="button"
                className={`btn ${entryMode === "scan" ? "btn-primary" : "btn-outline-primary"}`}
                onClick={() => setEntryMode("scan")}
              >
                <i className="ti ti-camera me-2"></i>Scan Nameplate
              </button>
              <button
                type="button"
                className={`btn ${entryMode === "manual" ? "btn-primary" : "btn-outline-primary"}`}
                onClick={() => setEntryMode("manual")}
              >
                <i className="ti ti-keyboard me-2"></i>Manual Entry
              </button>
            </div>
          </div>

          {/* Scan mode */}
          {entryMode === "scan" && (
            <div className="mb-4">
              <label className="form-label">
                <i className="ti ti-camera me-1"></i>
                Photo of Meter Nameplate
              </label>
              <input
                ref={fileInputRef}
                type="file"
                className="form-control"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                disabled={scanning}
              />
              <small className="text-muted">
                Take a clear photo of the meter label showing serial number,
                manufacturer and model.
              </small>

              {scanning && (
                <div className="alert alert-info py-2 mt-2">
                  <span className="spinner-border spinner-border-sm me-2"></span>
                  Scanning nameplate...
                </div>
              )}

              {scanResult && !scanning && (
                <div className="alert alert-success py-2 mt-2">
                  <i className="ti ti-check me-1"></i>
                  <strong>Scan complete.</strong> Fields auto-filled below.
                  <span
                    className="ms-2 text-primary"
                    style={{ cursor: "pointer", textDecoration: "underline" }}
                    onClick={() => setEntryMode("manual")}
                  >
                    Edit manually if needed
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Form fields — always visible, editable */}
          <div className="row">
            <div className="col-md-6 mb-3">
              <label className="form-label">
                Serial Number <span className="text-danger">*</span>
                {scanResult?.confidence?.serialNumber && (
                  <small
                    className={`ms-2 ${confidenceColor(scanResult.confidence.serialNumber)}`}
                  >
                    ({scanResult.confidence.serialNumber} confidence)
                  </small>
                )}
              </label>
              <input
                name="serialNumber"
                className="form-control"
                value={form.serialNumber}
                onChange={handleChange}
                placeholder="e.g. MTR-2024-001"
              />
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label">
                Meter Type
                {scanResult?.confidence?.meterType && (
                  <small
                    className={`ms-2 ${confidenceColor(scanResult.confidence.meterType)}`}
                  >
                    ({scanResult.confidence.meterType} confidence)
                  </small>
                )}
              </label>
              <select
                name="meterType"
                className="form-select"
                value={form.meterType}
                onChange={handleChange}
              >
                <option value="analogue">Analogue</option>
                <option value="digital">Digital</option>
              </select>
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label">
                Manufacturer
                {scanResult?.confidence?.manufacturer && (
                  <small
                    className={`ms-2 ${confidenceColor(scanResult.confidence.manufacturer)}`}
                  >
                    ({scanResult.confidence.manufacturer} confidence)
                  </small>
                )}
              </label>
              <input
                name="manufacturer"
                className="form-control"
                value={form.manufacturer}
                onChange={handleChange}
                placeholder="e.g. Zenner"
              />
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label">
                Model
                {scanResult?.confidence?.model && (
                  <small
                    className={`ms-2 ${confidenceColor(scanResult.confidence.model)}`}
                  >
                    ({scanResult.confidence.model} confidence)
                  </small>
                )}
              </label>
              <input
                name="model"
                className="form-control"
                value={form.model}
                onChange={handleChange}
                placeholder="e.g. MTKD-N"
              />
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label">Condition</label>
              <select
                name="condition"
                className="form-select"
                value={form.condition}
                onChange={handleChange}
              >
                <option value="new">New</option>
                <option value="used">Used</option>
                <option value="replaced">Replaced</option>
              </select>
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label">
                Initial Reading (m³)
                {scanResult?.confidence?.initialReading && (
                  <small
                    className={`ms-2 ${confidenceColor(scanResult.confidence.initialReading)}`}
                  >
                    ({scanResult.confidence.initialReading} confidence)
                  </small>
                )}
              </label>
              <input
                name="initialReading"
                type="number"
                step="0.01"
                min="0"
                className="form-control"
                value={form.initialReading}
                onChange={handleChange}
              />
              <small className="text-muted">
                Read from the register in the photo — verify against the image before saving.
              </small>
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label">
                Installation Date <span className="text-danger">*</span>
              </label>
              <input
                name="installationDate"
                type="date"
                className="form-control"
                value={form.installationDate}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="text-end mt-2">
            <button className="btn btn-secondary me-2" onClick={handleClear}>
              Clear
            </button>
            <button
              className="btn btn-primary"
              disabled={loading}
              onClick={handleSubmit}
            >
              {loading ? (
                "Saving..."
              ) : (
                <>
                  <i className="ti ti-plus me-2"></i>Add Meter
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── RIGHT: Image preview + raw OCR ── */}
        <div className="col-md-5">
          {preview && (
            <div className="card">
              <div className="card-header">
                <h6 className="card-title mb-0">
                  <i className="ti ti-photo me-2 text-info"></i>Nameplate
                  Preview
                </h6>
              </div>
              <div className="card-body text-center">
                <img
                  src={preview}
                  alt="Meter nameplate"
                  style={{
                    maxWidth: "100%",
                    maxHeight: 280,
                    objectFit: "contain",
                    borderRadius: 8,
                  }}
                />
              </div>
            </div>
          )}

          {scanResult?.rawText && (
            <div className="card mt-3">
              <div className="card-header">
                <h6 className="card-title mb-0">
                  <i className="ti ti-file-text me-2 text-secondary"></i>Raw OCR
                  Text
                </h6>
              </div>
              <div className="card-body">
                <pre
                  style={{
                    fontSize: "11px",
                    maxHeight: 200,
                    overflow: "auto",
                    background: "#f8f9fa",
                    padding: 8,
                    borderRadius: 4,
                  }}
                >
                  {scanResult.rawText}
                </pre>
              </div>
            </div>
          )}

          {!preview && (
            <div
              className="card border-dashed text-center p-4"
              style={{ border: "2px dashed #dee2e6" }}
            >
              <i
                className="ti ti-camera text-muted"
                style={{ fontSize: "48px" }}
              ></i>
              <p className="text-muted mt-2 mb-0">
                Take a photo of the meter nameplate to auto-fill the form
              </p>
              <small className="text-muted">
                or use Manual Entry to type details directly
              </small>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Meters() {
  const location = useLocation();
  const userRole = useSelector((state) => state.damrReducer.user?.role);
  const [activeTab, setActiveTab] = useState(
    location.state?.activeTab || "all",
  );

  const tabs = [
    {
      key: "all",
      label: "All Meters",
      icon: "ti ti-cpu-charge",
      roles: ["admin", "editor", "Staff"],
    },
    {
      key: "add",
      label: "Add Meter",
      icon: "ti ti-plus",
      roles: ["admin", "editor"],
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
                <li className="breadcrumb-item active">Meter Management</li>
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

            {activeTab === "all" && <AllMetersTab />}
            {activeTab === "add" && userRole !== "Staff" && (
              <AddMeterTab onSuccess={() => setActiveTab("all")} />
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default Meters;
