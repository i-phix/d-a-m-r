import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import Layout from "../../../../layout/Layout";
import { makeAuthRequest } from "../../../../../utils/makeRequest";
import { toastify } from "../../../../../utils/toast";
import { getMetersURL, getReadingsURL, backend_url } from "../../../../../utils/urls";
import { getItem } from "../../../../../utils/localStorage";

function ManualReading() {
  const navigate = useNavigate();

  const [meters, setMeters] = useState([]);
  const [meterId, setMeterId] = useState("");
  const [meterInfo, setMeterInfo] = useState(null);
  const [form, setForm] = useState({ value: "", readingDate: "", notes: "" });
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);
  useEffect(() => {
    makeAuthRequest(`${getMetersURL}?status=ASSIGNED`, "GET").then((res) => {
      if (res.success) setMeters(res.data.meters || []);
    });
  }, []);

  const handleMeterChange = (e) => {
    const selectedId = e.target.value;
    setMeterId(selectedId);
    setResult(null);
    if (selectedId) {
      const found = meters.find((m) => m._id === selectedId);
      setMeterInfo(found || null);
    } else {
      setMeterInfo(null);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handlePhotoChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    setPhoto(selected);
    setPhotoPreview(URL.createObjectURL(selected));
  };

  const handleSubmit = async () => {
    if (!meterId) {
      toastify("Please select a meter", "error");
      return;
    }
    if (!form.value) {
      toastify("Reading value is required", "error");
      return;
    }
    if (parseFloat(form.value) < 0) {
      toastify("Value cannot be negative", "error");
      return;
    }

    try {
      setLoading(true);
      if (photo) {
        const damrUser = await getItem("DAMR_USER");
        const formData = new FormData();
        formData.append("meterImage", photo);
        formData.append("meterId", meterId);
        formData.append("value", form.value);
        if (form.readingDate) formData.append("readingDate", form.readingDate);
        if (form.notes) formData.append("notes", form.notes);

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
          setResult(response.data);
          toastify("Reading submitted successfully", "success");
        }
      } else {
        const res = await makeAuthRequest(`${getReadingsURL}/manual`, "POST", {
          meterId,
          value: form.value,
          readingDate: form.readingDate || undefined,
          notes: form.notes || undefined,
        });

        if (res.success) {
          setResult(res.data);
          toastify("Reading submitted successfully", "success");
        } else {
          toastify(res.error, "error");
        }
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      toastify(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setForm({ value: "", readingDate: "", notes: "" });
    setResult(null);
    setMeterInfo(null);
    setMeterId("");
    setPhoto(null);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const previousValue =
    meterInfo?.lastReadingValue ?? meterInfo?.initialReading ?? 0;
  const consumption = form.value
    ? Math.max(0, parseFloat(form.value || 0) - previousValue).toFixed(2)
    : null;

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
                <li className="breadcrumb-item active">Manual Reading</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-md-7">
          <div className="card">
            <div className="card-header">
              <h5 className="card-title mb-0">
                <i className="ti ti-keyboard me-2 text-primary"></i>Manual Meter
                Reading
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
                    {meterInfo.facilityId?.name || ""} —{" "}
                    {meterInfo.unitId?.name || "No unit"}
                  </span>
                  <br />
                  <small className="text-muted">
                    Last reading:{" "}
                    <strong>{meterInfo.lastReadingValue ?? "N/A"} m³</strong>
                    {meterInfo.lastReadingDate
                      ? ` on ${new Date(meterInfo.lastReadingDate).toLocaleDateString()}`
                      : ""}
                  </small>
                </div>
              )}

              {/* Reading value */}
              <div className="mb-3">
                <label className="form-label">
                  Reading Value (m³) <span className="text-danger">*</span>
                </label>
                <input
                  name="value"
                  type="number"
                  step="0.01"
                  min="0"
                  className="form-control form-control-lg"
                  placeholder="e.g. 128.50"
                  value={form.value}
                  onChange={handleChange}
                />
                {meterInfo && form.value && (
                  <small className="text-muted">
                    Consumption: <strong>{consumption} m³</strong>
                  </small>
                )}
              </div>

              {/* Reading date */}
              <div className="mb-3">
                <label className="form-label">
                  Reading Date{" "}
                  <span className="text-muted">
                    (optional — defaults to today)
                  </span>
                </label>
                <input
                  name="readingDate"
                  type="date"
                  className="form-control"
                  value={form.readingDate}
                  onChange={handleChange}
                  max={new Date().toISOString().split("T")[0]}
                />
              </div>

              {/* Notes */}
              <div className="mb-3">
                <label className="form-label">Notes (optional)</label>
                <textarea
                  name="notes"
                  className="form-control"
                  rows={2}
                  placeholder="Any observations..."
                  value={form.notes}
                  onChange={handleChange}
                />
              </div>

              {/* Optional photo — cross-checked against the keyed value via OCR */}
              <div className="mb-3">
                <label className="form-label">
                  Meter Photo{" "}
                  <span className="text-muted">
                    (optional — OCR will cross-check your keyed value)
                  </span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="form-control"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoChange}
                />
                {photoPreview && (
                  <img
                    src={photoPreview}
                    alt="Meter preview"
                    className="mt-2"
                    style={{
                      maxWidth: "100%",
                      maxHeight: 180,
                      objectFit: "contain",
                      borderRadius: 8,
                    }}
                  />
                )}
              </div>

              <div className="d-flex gap-2">
                <button
                  className="btn btn-primary flex-grow-1"
                  onClick={handleSubmit}
                  disabled={loading || !meterId}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2"></span>
                      Submitting...
                    </>
                  ) : (
                    <>
                      <i className="ti ti-check me-2"></i>Submit Reading
                    </>
                  )}
                </button>
                <button
                  className="btn btn-outline-secondary"
                  onClick={handleReset}
                  disabled={loading}
                >
                  Clear
                </button>
              </div>

              {/* Inline result */}
              {result && (
                <div
                  className={`alert mt-3 ${
                    result.ocrCheck?.serialStatus === "mismatch" ||
                    result.ocrCheck?.serialStatus === "unverified"
                      ? "alert-warning"
                      : "alert-success"
                  }`}
                >
                  <i className="ti ti-circle-check me-2"></i>
                  <strong>Reading recorded:</strong> {result.reading?.value} m³
                  &nbsp;|&nbsp; Consumption: {result.reading?.consumption} m³
                  {result.ocrCheck?.serialStatus === "mismatch" && (
                    <div className="mt-2 text-danger">
                      <i className="ti ti-alert-triangle me-1"></i>
                      <strong>Held as pending:</strong> the attached photo's serial number
                      ({result.ocrCheck.serialNumber || "unclear"}) doesn't match this
                      meter's registered serial number — please verify before it's confirmed.
                    </div>
                  )}
                  {result.ocrCheck?.serialStatus === "unverified" && (
                    <div className="mt-2 text-danger">
                      <i className="ti ti-alert-triangle me-1"></i>
                      <strong>Held as pending:</strong> couldn't confidently read a serial
                      number off the attached photo — please verify this reading is for the
                      right meter before it's confirmed.
                    </div>
                  )}
                  {result.flag && (
                    <div className="mt-2 text-danger">
                      <i className="ti ti-flag me-1"></i>
                      <strong>Anomaly:</strong>{" "}
                      {result.flag.type?.replace(/_/g, " ")}
                    </div>
                  )}
                  {result.duplicateFlag && (
                    <div className="mt-2 text-warning">
                      <i className="ti ti-copy me-1"></i>
                      <strong>Duplicate:</strong> another reading already exists for this
                      meter today — flagged for review.
                    </div>
                  )}
                  {result.ocrCheck?.performed && (
                    <div
                      className={`mt-2 ${result.ocrCheck.mismatch ? "text-danger" : "text-success"}`}
                    >
                      <i className="ti ti-scan me-1"></i>
                      <strong>OCR cross-check:</strong>{" "}
                      {result.ocrCheck.value != null
                        ? `read ${result.ocrCheck.value} m³ from photo`
                        : "no reading detected in photo"}
                      {result.ocrCheck.mismatch && (
                        <>
                          {" "}
                          — differs from keyed value, flagged for review.
                        </>
                      )}
                    </div>
                  )}
                  <div className="mt-2">
                    <button
                      className="btn btn-sm btn-outline-success me-2"
                      onClick={handleReset}
                    >
                      Submit Another
                    </button>
                    <button
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => navigate("/readings")}
                    >
                      View All Readings
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default ManualReading;
