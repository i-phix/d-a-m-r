import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import axios from "axios";
import * as XLSX from "xlsx";
import Layout from "../../../../layout/Layout";
import { makeAuthRequest } from "../../../../../utils/makeRequest";
import { toastify } from "../../../../../utils/toast";
import {
  getMetersURL,
  importMetersURL,
  importMetersTemplateURL,
  backend_url,
} from "../../../../../utils/urls";
import { getItem } from "../../../../../utils/localStorage";
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
                Read from the register in the photo — verify against the image
                before saving.
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
const IMPORT_HEADER_MAP = {
  serialnumber: "serialNumber",
  serial: "serialNumber",
  serialno: "serialNumber",
  manufacturer: "manufacturer",
  make: "manufacturer",
  model: "model",
  metertype: "meterType",
  type: "meterType",
  installationdate: "installationDate",
  installdate: "installationDate",
  date: "installationDate",
  initialreading: "initialReading",
  initialreadingm3: "initialReading",
  reading: "initialReading",
  condition: "condition",
  unitname: "unitName",
  unit: "unitName",
  unitnameoptionalautoassignsthemeter: "unitName",
};

function normalizeImportRow(raw) {
  const row = {};
  Object.entries(raw).forEach(([key, value]) => {
    const normKey = String(key)
      .trim()
      .toLowerCase()
      .replace(/[\s_()\-‐‑‒–—]+/g, "");
    const mapped = IMPORT_HEADER_MAP[normKey];
    if (!mapped) return;
    row[mapped] = typeof value === "string" ? value.trim() : value;
  });
  return row;
}

function isBlankRow(row) {
  return Object.entries(row).every(
    ([key, v]) => key === "installationDate" || String(v || "").trim() === "",
  );
}

function ImportMetersTab({ onSuccess }) {
  const csvInputRef = useRef(null);
  const excelInputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [propertyName, setPropertyName] = useState("");
  const [rows, setRows] = useState([]);
  const [parseErrors, setParseErrors] = useState([]);
  const [importing, setImporting] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [results, setResults] = useState(null);

  const handleDownloadTemplate = async () => {
    try {
      setDownloadingTemplate(true);
      const damrUser = await getItem("DAMR_USER");
      const res = await axios.get(`${backend_url}${importMetersTemplateURL}`, {
        responseType: "blob",
        headers: { Authorization: `Bearer ${damrUser?.token}` },
      });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = "meter_import_template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      let msg = err.message;
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          msg = JSON.parse(text).error || msg;
        } catch {
          // fall through to the generic err.message
        }
      }
      toastify(`Could not download template: ${msg}`, "error");
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setResults(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const isOwnTemplate =
          workbook.SheetNames.includes("Property") &&
          workbook.SheetNames.includes("Meters");

        let property = "";
        let dataSheetName = workbook.SheetNames[0];
        if (isOwnTemplate) {
          const propertyCell = workbook.Sheets["Property"]["A2"];
          property = propertyCell ? String(propertyCell.v || "").trim() : "";
          dataSheetName = "Meters";
        }

        const rawRows = XLSX.utils.sheet_to_json(
          workbook.Sheets[dataSheetName],
          {
            defval: "",
            raw: false,
          },
        );

        const normalized = rawRows
          .map(normalizeImportRow)
          .filter((r) => !isBlankRow(r));
        const errors = [];
        normalized.forEach((row, i) => {
          if (!row.serialNumber) {
            errors.push(`Row ${i + 1}: missing serial number`);
          }
        });

        setPropertyName(property);
        setRows(normalized);
        setParseErrors(errors);

        if (normalized.length === 0) {
          toastify("No rows found in file", "warn");
        } else {
          toastify(
            `Parsed ${normalized.length} row(s)${property ? ` for ${property}` : ""} — review below and click Import`,
            "info",
          );
        }
      } catch (err) {
        toastify(`Could not read file: ${err.message}`, "error");
        setRows([]);
        setParseErrors([]);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (rows.length === 0) {
      toastify("Choose a file to import first", "error");
      return;
    }
    try {
      setImporting(true);
      setResults(null);
      const res = await makeAuthRequest(importMetersURL, "POST", {
        meters: rows,
        facilityName: propertyName || undefined,
      });
      if (res.success) {
        const summary = res.data;
        setResults(summary);
        toastify(
          `Import complete — ${summary.created} created, ${summary.skipped} skipped, ${summary.errors} errors` +
            (summary.assigned
              ? `, ${summary.assigned} assigned to a unit`
              : ""),
          summary.errors > 0 ? "warn" : "success",
        );
        if (onSuccess) onSuccess();
      } else {
        toastify(res.error, "error");
      }
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setImporting(false);
    }
  };

  const handleClear = () => {
    setFileName("");
    setPropertyName("");
    setRows([]);
    setParseErrors([]);
    setResults(null);
    if (csvInputRef.current) csvInputRef.current.value = "";
    if (excelInputRef.current) excelInputRef.current.value = "";
  };

  const resultBadge = (status) =>
    ({
      created: "bg-success",
      skipped: "bg-warning",
      error: "bg-danger",
    })[status] || "bg-secondary";

  return (
    <div className="card-body">
      <div className="d-flex justify-content-end align-items-start mb-2">
        <div className="btn-group" role="group" aria-label="Import meters">
          <button
            type="button"
            className="btn btn-primary text-white"
            style={{ borderRadius: 0 }}
            onClick={() => csvInputRef.current?.click()}
          >
            <i className="ti ti-file-type-csv me-1"></i> CSV
          </button>
          <button
            type="button"
            className="btn btn-success text-white"
            style={{ borderRadius: 0 }}
            onClick={() => excelInputRef.current?.click()}
          >
            <i className="ti ti-file-spreadsheet me-1"></i> Excel
          </button>
          <button
            type="button"
            className="btn text-white"
            style={{ borderRadius: 0, backgroundColor: "#fd7e14" }}
            disabled={downloadingTemplate}
            onClick={handleDownloadTemplate}
          >
            <i className="ti ti-download me-1"></i>
            {downloadingTemplate ? "Preparing..." : "Download Template"}
          </button>
        </div>
        <input
          ref={csvInputRef}
          type="file"
          className="d-none"
          accept=".csv"
          onChange={handleFileChange}
        />
        <input
          ref={excelInputRef}
          type="file"
          className="d-none"
          accept=".xlsx,.xls,.xlsm"
          onChange={handleFileChange}
        />
      </div>
      <div className="mb-4 text-end">
        <small className="text-muted">
          Columns: serialNumber (required), manufacturer, model, meterType
          (analogue/digital), installationDate, initialReading, condition
          (new/used/replaced), unitName (optional — auto-assigns the meter to
          that unit). Unmatched columns are ignored.
          {fileName && (
            <>
              {" "}
              Selected: <strong>{fileName}</strong>
            </>
          )}
          {propertyName && (
            <>
              {" "}
              · Property: <strong>{propertyName}</strong>
            </>
          )}
        </small>
      </div>

      {parseErrors.length > 0 && (
        <div className="alert alert-warning py-2">
          <strong>{parseErrors.length} row(s) will be skipped:</strong>
          <ul className="mb-0">
            {parseErrors.slice(0, 5).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
            {parseErrors.length > 5 && (
              <li>...and {parseErrors.length - 5} more</li>
            )}
          </ul>
        </div>
      )}

      {rows.length > 0 && !results && (
        <>
          <div
            className="table-responsive mb-3"
            style={{ maxHeight: 320, overflowY: "auto" }}
          >
            <table className="table table-sm table-hover">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Serial Number</th>
                  <th>Manufacturer</th>
                  <th>Model</th>
                  <th>Type</th>
                  <th>Installation Date</th>
                  <th>Initial Reading</th>
                  <th>Condition</th>
                  <th>Unit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={!r.serialNumber ? "table-danger" : ""}>
                    <td>{i + 1}</td>
                    <td>
                      {r.serialNumber || (
                        <span className="text-danger">missing</span>
                      )}
                    </td>
                    <td>{r.manufacturer || "—"}</td>
                    <td>{r.model || "—"}</td>
                    <td>{r.meterType || "analogue"}</td>
                    <td>{r.installationDate || "today"}</td>
                    <td>{r.initialReading || 0}</td>
                    <td>{r.condition || "new"}</td>
                    <td>{r.unitName || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-end">
            <button className="btn btn-secondary me-2" onClick={handleClear}>
              Clear
            </button>
            <button
              className="btn btn-primary"
              disabled={importing}
              onClick={handleImport}
            >
              {importing ? (
                "Importing..."
              ) : (
                <>
                  <i className="ti ti-upload me-2"></i>
                  Import {rows.length} Meter{rows.length === 1 ? "" : "s"}
                </>
              )}
            </button>
          </div>
        </>
      )}

      {results && (
        <div>
          <div className="row mb-3">
            <div className="col-md-3">
              <div className="alert alert-success mb-0 text-center">
                <div className="fs-4 fw-bold">{results.created}</div>
                Created
              </div>
            </div>
            <div className="col-md-3">
              <div className="alert alert-info mb-0 text-center">
                <div className="fs-4 fw-bold">{results.assigned || 0}</div>
                Assigned to a Unit
              </div>
            </div>
            <div className="col-md-3">
              <div className="alert alert-warning mb-0 text-center">
                <div className="fs-4 fw-bold">{results.skipped}</div>
                Skipped
              </div>
            </div>
            <div className="col-md-3">
              <div className="alert alert-danger mb-0 text-center">
                <div className="fs-4 fw-bold">{results.errors}</div>
                Errors
              </div>
            </div>
          </div>

          <div
            className="table-responsive mb-3"
            style={{ maxHeight: 320, overflowY: "auto" }}
          >
            <table className="table table-sm table-hover">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Serial Number</th>
                  <th>Status</th>
                  <th>Message</th>
                  <th>Assignment</th>
                </tr>
              </thead>
              <tbody>
                {results.results.map((r) => (
                  <tr key={r.row}>
                    <td>{r.row}</td>
                    <td>{r.serialNumber || "—"}</td>
                    <td>
                      <span className={`badge ${resultBadge(r.status)}`}>
                        {r.status}
                      </span>
                    </td>
                    <td>
                      {r.message ||
                        (r.status === "created" ? "Meter created" : "")}
                    </td>
                    <td>
                      {r.assignment ? (
                        <span
                          className={`badge ${r.assignment.status === "assigned" ? "bg-info" : "bg-secondary"}`}
                          title={r.assignment.message || ""}
                        >
                          {r.assignment.status === "assigned"
                            ? `→ ${r.assignment.unitName}`
                            : r.assignment.status}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-end">
            <button className="btn btn-secondary" onClick={handleClear}>
              <i className="ti ti-refresh me-1"></i> Import Another File
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 && !results && (
        <div
          className="card border-dashed text-center p-4"
          style={{ border: "2px dashed #dee2e6" }}
        >
          <i
            className="ti ti-file-upload text-muted"
            style={{ fontSize: "48px" }}
          ></i>
          <p className="text-muted mt-2 mb-0">
            Click CSV or Excel above to choose a file and preview meters before
            importing
          </p>
        </div>
      )}
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
    {
      key: "import",
      label: "Import Meters",
      icon: "ti ti-file-import",
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
            {activeTab === "import" && userRole !== "Staff" && (
              <ImportMetersTab onSuccess={() => {}} />
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default Meters;
