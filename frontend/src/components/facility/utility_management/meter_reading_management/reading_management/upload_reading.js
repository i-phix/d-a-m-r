import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import Layout from "../../../../layout/Layout";
import { toastify } from "../../../../../utils/toast";
import { makeAuthRequest } from "../../../../../utils/makeRequest";
import { backend_url, getMetersURL } from "../../../../../utils/urls";
import { getItem } from "../../../../../utils/localStorage";

function UploadReading() {
  const [meters, setMeters] = useState([]);
  const [meterId, setMeterId] = useState("");
  const [meterInfo, setMeterInfo] = useState(null);
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Set once a scan has run for the currently-selected photo — the same
  // button then switches from "Scan" to "Submit". Any change to the file
  // or meter invalidates it, since a stale OCR result shouldn't be
  // submittable against a different photo.
  const [scanned, setScanned] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);
  const [readingValue, setReadingValue] = useState("");
  const [submitResult, setSubmitResult] = useState(null);
  const fileInputRef = useRef(null);

  // Fetch assigned meters for dropdown
  useEffect(() => {
    makeAuthRequest(`${getMetersURL}?status=ASSIGNED`, "GET").then((res) => {
      if (res.success) setMeters(res.data.meters || []);
    });
  }, []);

  const resetScanState = () => {
    setScanned(false);
    setOcrResult(null);
    setReadingValue("");
    setSubmitResult(null);
  };

  const handleMeterChange = (e) => {
    const selectedId = e.target.value;
    setMeterId(selectedId);
    resetScanState();
    if (selectedId) {
      const found = meters.find((m) => m._id === selectedId);
      setMeterInfo(found || null);
    } else {
      setMeterInfo(null);
    }
  };

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    resetScanState();
  };

  const handleScan = async () => {
    if (!meterId) {
      toastify("Please select a meter", "error");
      return;
    }
    if (!file) {
      toastify("Please select a meter image", "error");
      return;
    }

    try {
      setScanning(true);
      const damrUser = await getItem("DAMR_USER");

      const formData = new FormData();
      formData.append("meterImage", file);

      const response = await axios.post(
        `${backend_url}/api/v1/damr/readings/scan`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${damrUser?.token}`,
          },
        },
      );

      if (response.status === 200) {
        const ocr = response.data.ocr;
        setOcrResult(ocr);
        setReadingValue(ocr?.value != null ? String(ocr.value) : "");
        setScanned(true);
        if (ocr?.error) {
          toastify(`Scan finished, but: ${ocr.error}`, "warn");
        } else if (!ocr?.meetsThreshold) {
          toastify(
            "Scanned — couldn't confidently read the register, please check/correct the value below",
            "warn",
          );
        } else {
          toastify("Scan complete — review the value, then submit", "success");
        }
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      toastify(msg, "error");
    } finally {
      setScanning(false);
    }
  };

  const handleFinalSubmit = async () => {
    const parsedValue = parseFloat(readingValue);
    if (readingValue === "" || isNaN(parsedValue) || parsedValue < 0) {
      toastify("Enter a valid, non-negative reading value", "error");
      return;
    }

    try {
      setSubmitting(true);
      const damrUser = await getItem("DAMR_USER");

      const formData = new FormData();
      formData.append("meterImage", file);
      formData.append("meterId", meterId);
      formData.append("value", parsedValue);
      formData.append("notes", notes);

      const response = await axios.post(
        `${backend_url}/api/v1/damr/readings/manual`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${damrUser?.token}`,
          },
        },
      );

      if (response.status === 200) {
        setSubmitResult(response.data);
        toastify(response.data.message || "Reading submitted successfully", "success");
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      toastify(msg, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setNotes("");
    setMeterId("");
    setMeterInfo(null);
    resetScanState();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const confidenceColor = (c) => {
    if (c >= 0.85) return "text-success";
    if (c >= 0.65) return "text-warning";
    return "text-danger";
  };

  const busy = scanning || submitting;

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
                  <Link to="/readings">Reading Management</Link>
                </li>
                <li className="breadcrumb-item active">Upload Reading</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="row">
        {/* ── LEFT: Form ── */}
        <div className="col-md-6">
          <div className="card">
            <div className="card-header">
              <h5 className="card-title mb-0">
                <i className="ti ti-upload me-2 text-primary"></i>Upload Meter
                Photo
              </h5>
            </div>
            <div className="card-body">
              {/* Meter dropdown */}
              <div className="mb-3">
                <label className="form-label">
                  Select Meter <span className="text-danger">*</span>
                </label>
                <select
                  className="form-select"
                  value={meterId}
                  onChange={handleMeterChange}
                  disabled={busy}
                >
                  <option value="">Select assigned meter...</option>
                  {meters.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.serialNumber}
                      {m.unitId?.name ? ` — ${m.unitId.name}` : ""}
                      {m.facilityId?.name ? ` (${m.facilityId.name})` : ""}
                    </option>
                  ))}
                </select>
                {meters.length === 0 && (
                  <small className="text-warning">
                    No assigned meters found. Assign meters to units first.
                  </small>
                )}
              </div>

              {/* Meter info */}
              {meterInfo && (
                <div className="alert alert-success py-2 mb-3">
                  <strong>{meterInfo.serialNumber}</strong>
                  <span className="ms-2 text-muted">
                    {meterInfo.unitId?.name || "No unit"} — Last:{" "}
                    {meterInfo.lastReadingValue ?? "N/A"} m³
                  </span>
                </div>
              )}

              {/* Image upload */}
              <div className="mb-3">
                <label className="form-label">
                  Meter Photo <span className="text-danger">*</span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="form-control"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  disabled={busy}
                />
                <small className="text-muted">
                  JPG, PNG or WebP — max 10MB
                </small>
              </div>

              {/* Notes */}
              <div className="mb-3">
                <label className="form-label">Notes (optional)</label>
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="Any observations about the meter or reading..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={busy}
                />
              </div>

              {/* Editable reading value — appears once a scan has run */}
              {scanned && !submitResult && (
                <div className="mb-3">
                  <label className="form-label">
                    Reading Value (m³) <span className="text-danger">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-control"
                    value={readingValue}
                    onChange={(e) => setReadingValue(e.target.value)}
                    disabled={busy}
                  />
                  <small className="text-muted">
                    Pre-filled from the scan — correct it if it doesn't match the photo, then Submit.
                  </small>
                </div>
              )}

              <div className="d-flex gap-2">
                {!scanned ? (
                  <button
                    className="btn btn-primary flex-grow-1"
                    onClick={handleScan}
                    disabled={busy || !file || !meterId}
                  >
                    {scanning ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2"></span>
                        Scanning...
                      </>
                    ) : (
                      <>
                        <i className="ti ti-cpu me-2"></i>Scan
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    className="btn btn-success flex-grow-1"
                    onClick={handleFinalSubmit}
                    disabled={busy || !!submitResult}
                  >
                    {submitting ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2"></span>
                        Submitting...
                      </>
                    ) : (
                      <>
                        <i className="ti ti-check me-2"></i>Submit
                      </>
                    )}
                  </button>
                )}
                <button
                  className="btn btn-outline-secondary"
                  onClick={handleReset}
                  disabled={busy}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Preview + Result ── */}
        <div className="col-md-6">
          {preview && (
            <div className="card mb-3">
              <div className="card-header">
                <h5 className="card-title mb-0">
                  <i className="ti ti-photo me-2 text-info"></i>Image Preview
                </h5>
              </div>
              <div className="card-body text-center">
                <img
                  src={preview}
                  alt="Meter preview"
                  style={{
                    maxWidth: "100%",
                    maxHeight: 300,
                    objectFit: "contain",
                    borderRadius: 8,
                  }}
                />
              </div>
            </div>
          )}

          {/* Scan result — shown between Scan and Submit */}
          {ocrResult && !submitResult && (
            <div className="card">
              <div className="card-header">
                <h5 className="card-title mb-0">
                  <i className="ti ti-cpu me-2 text-success"></i>Scan Result
                </h5>
              </div>
              <div className="card-body">
                <div className="row mb-3">
                  <div className="col-6">
                    <p className="text-muted mb-1">Read Value</p>
                    <h2 className="mb-0 text-primary">
                      {ocrResult.value ?? "—"} <small className="fs-6">m³</small>
                    </h2>
                  </div>
                  <div className="col-6">
                    <p className="text-muted mb-1">Confidence</p>
                    <h2 className={`mb-0 ${confidenceColor(ocrResult.confidence)}`}>
                      {ocrResult.confidence != null
                        ? `${(ocrResult.confidence * 100).toFixed(0)}%`
                        : "—"}
                    </h2>
                  </div>
                </div>

                {ocrResult.error && (
                  <div className="alert alert-warning py-2 mt-2">
                    <i className="ti ti-alert-triangle me-1"></i>
                    Scan note: {ocrResult.error}
                  </div>
                )}
                {!ocrResult.error && !ocrResult.meetsThreshold && (
                  <div className="alert alert-warning py-2 mt-2">
                    <i className="ti ti-alert-triangle me-1"></i>
                    Low confidence — please verify the value against the photo before submitting.
                  </div>
                )}

                <p className="text-muted small mt-2 mb-0">
                  Nothing has been saved yet. Adjust the reading value on the
                  left if needed, then click Submit.
                </p>
              </div>
            </div>
          )}

          {/* Final submitted result */}
          {submitResult && (
            <div className="card">
              <div className="card-header">
                <h5 className="card-title mb-0">
                  <i className="ti ti-circle-check me-2 text-success"></i>
                  Reading Submitted
                </h5>
              </div>
              <div className="card-body">
                <div className="row mb-2">
                  <div className="col-6">
                    <small className="text-muted">Value</small>
                    <p className="mb-0">
                      <strong>{submitResult.reading?.value ?? "—"} m³</strong>
                    </p>
                  </div>
                  <div className="col-6">
                    <small className="text-muted">Consumption</small>
                    <p className="mb-0">
                      <strong>{submitResult.reading?.consumption ?? "—"} m³</strong>
                    </p>
                  </div>
                </div>
                <div className="row mb-2">
                  <div className="col-6">
                    <small className="text-muted">Status</small>
                    <p className="mb-0">
                      <span
                        className={`badge ${submitResult.reading?.status === "confirmed" ? "bg-success" : "bg-warning"}`}
                      >
                        {submitResult.reading?.status}
                      </span>
                    </p>
                  </div>
                </div>

                {submitResult.ocrMismatchFlag && (
                  <div className="alert alert-warning py-2 mt-2">
                    <i className="ti ti-alert-triangle me-1"></i>
                    <strong>OCR mismatch:</strong>{" "}
                    {submitResult.ocrMismatchFlag.description}
                  </div>
                )}

                {submitResult.flag && (
                  <div className="alert alert-danger py-2 mt-2">
                    <i className="ti ti-flag me-1"></i>
                    <strong>Anomaly detected:</strong>{" "}
                    {submitResult.flag.type?.replace(/_/g, " ")}
                    <br />
                    <small>{submitResult.flag.description}</small>
                  </div>
                )}

                {submitResult.duplicateFlag && (
                  <div className="alert alert-warning py-2 mt-2">
                    <i className="ti ti-copy me-1"></i>
                    <strong>Duplicate:</strong> another reading already exists for this
                    meter today — flagged for review.
                  </div>
                )}

                <button
                  className="btn btn-outline-primary btn-sm mt-2 w-100"
                  onClick={handleReset}
                >
                  Submit Another Reading
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

export default UploadReading;
