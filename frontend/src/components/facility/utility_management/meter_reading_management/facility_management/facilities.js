import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Layout from "../../../../layout/Layout";
import { makeAuthRequest } from "../../../../../utils/makeRequest";
import { toastify } from "../../../../../utils/toast";
import AddressAutocompleteInput from "../../../../common/AddressAutocompleteInput";

const FACILITIES_URL = "/api/v1/damr/facility/facilities";
const LOCATIONS_URL = "/api/v1/damr/facility/locations";
const TARIFF_PLANS_URL = "/api/v1/damr/facility/tariff-plans";
const BLOCKS_URL = "/api/v1/damr/facility/blocks";
const UNIT_TYPE_OPTIONS = [
  "Residential",
  "Commercial",
  "Office",
  "Studio",
  "Bedsitter",
  "1 Bedroom",
  "2 Bedroom",
  "3 Bedroom",
  "Penthouse",
];
const DEFAULT_TARIFF_PLAN = {
  bands: [{ upTo: null, rate: 80 }],
  minimumCharge: 0,
  sewerageRatePercent: 75,
  techFee: 150,
  penaltyEnabled: false,
  penaltyType: "percentage",
  penaltyValue: 0,
  dueDateOffsetDays: 15,
  reminderDaysBefore: 3,
  paybillShortCode: "",
};
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

function sortFacilities(list, field, dir) {
  if (field === "index") {
    return dir === "asc" ? list : [...list].reverse();
  }
  const getValue = (f) => {
    switch (field) {
      case "name":
        return f.name || "";
      case "location":
        return f.location || "";
      case "subDivision":
        return f.subDivision || "";
      case "accountNumber":
        return f.accountNumber && f.accountNumber !== f.dbName
          ? f.accountNumber
          : "";
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

function AllFacilitiesTab({ onEdit }) {
  const [facilities, setFacilities] = useState([]);
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

  const fetchFacilities = async () => {
    try {
      setLoading(true);
      const res = await makeAuthRequest(FACILITIES_URL, "GET");
      if (res.success) setFacilities(res.data.facilities || []);
      else toastify(res.error, "error");
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this facility?")) return;
    try {
      const res = await makeAuthRequest(`${FACILITIES_URL}/${id}`, "DELETE");
      if (res.success) {
        toastify("Facility deleted", "success");
        fetchFacilities();
      } else toastify(res.error, "error");
    } catch (err) {
      toastify(err.message, "error");
    }
  };

  useEffect(() => {
    fetchFacilities();
  }, []);

  const filtered = facilities.filter(
    (f) =>
      f.name?.toLowerCase().includes(search.toLowerCase()) ||
      f.location?.toLowerCase().includes(search.toLowerCase()),
  );
  const sorted = sortFacilities(filtered, sortField, sortDir);

  return (
    <div className="card-body">
      <SoftTableStyles />
      <div className="row mb-3">
        <div className="col-md-6">
          <input
            className="form-control dmr-search-pill"
            placeholder="Search facilities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="col-md-6 text-end">
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={fetchFacilities}
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
            className="ti ti-building-off text-muted"
            style={{ fontSize: "48px" }}
          ></i>
          <p className="text-muted mt-2">No facilities found</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover dmr-soft-table">
            <thead>
              <tr>
                <SortableHeader
                  label="#"
                  field="index"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Name"
                  field="name"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Location"
                  field="location"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Sub-Division"
                  field="subDivision"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="KRA/eTims Account #"
                  field="accountNumber"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((f, i) => (
                <tr key={f._id}>
                  <td>
                    {sortField === "index" && sortDir === "desc"
                      ? sorted.length - i
                      : i + 1}
                  </td>
                  <td>
                    <strong>{f.name}</strong>
                  </td>
                  <td>{f.location || "—"}</td>
                  <td>{f.subDivision || "—"}</td>
                  <td>
                    {f.accountNumber && f.accountNumber !== f.dbName ? (
                      f.accountNumber
                    ) : (
                      <span className="badge bg-light-warning">
                        Not yet assigned
                      </span>
                    )}
                  </td>
                  <td>
                    <button
                      className="btn btn-sm btn-outline-primary me-1"
                      onClick={() => onEdit(f)}
                    >
                      <i className="ti ti-edit me-1"></i>Edit
                    </button>
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => handleDelete(f._id)}
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

function TariffBandEditor({ bands, onChange }) {
  const updateBand = (idx, field, value) => {
    const next = bands.map((b, i) =>
      i === idx ? { ...b, [field]: value } : b,
    );
    onChange(next);
  };

  const addBand = () => {
    const last = bands[bands.length - 1];
    const priorCeiling = bands.length >= 2 ? bands[bands.length - 2].upTo : 0;
    const suggestedCeiling = (priorCeiling || 0) + 5;
    const next = [
      ...bands.slice(0, -1),
      { upTo: suggestedCeiling, rate: last.rate },
      { ...last },
    ];
    onChange(next);
  };

  const removeBand = (idx) => {
    if (bands.length <= 1) return;
    onChange(bands.filter((_, i) => i !== idx));
  };

  return (
    <div className="table-responsive mb-2">
      <table className="table table-sm align-middle mb-0">
        <thead>
          <tr>
            <th style={{ width: "45%" }}>Up to (m&sup3;)</th>
            <th style={{ width: "40%" }}>Rate (KES/m&sup3;)</th>
            <th style={{ width: "15%" }}></th>
          </tr>
        </thead>
        <tbody>
          {bands.map((band, idx) => {
            const isLast = idx === bands.length - 1;
            return (
              <tr key={idx}>
                <td>
                  {isLast ? (
                    <span className="text-muted">and above</span>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      className="form-control form-control-sm"
                      value={band.upTo ?? ""}
                      onChange={(e) =>
                        updateBand(idx, "upTo", Number(e.target.value))
                      }
                    />
                  )}
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="form-control form-control-sm"
                    value={band.rate}
                    onChange={(e) =>
                      updateBand(idx, "rate", Number(e.target.value))
                    }
                  />
                </td>
                <td>
                  {!isLast && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => removeBand(idx)}
                    >
                      <i className="ti ti-x"></i>
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button
        type="button"
        className="btn btn-sm btn-outline-primary"
        onClick={addBand}
      >
        <i className="ti ti-plus me-1"></i>Add Band
      </button>
    </div>
  );
}

function FacilityFormTab({ editing, onSuccess, onCancelEdit }) {
  const [form, setForm] = useState({
    name: "",
    location: "",
    subDivision: "",
    county: "",
    town: "",
    address: "",
    accountNumber: "",
    taxNumber: "",
  });
  const [tariffPlan, setTariffPlan] = useState(DEFAULT_TARIFF_PLAN);
  const [loading, setLoading] = useState(false);
  const [paymentCreds, setPaymentCreds] = useState({
    consumerKey: "",
    consumerSecret: "",
    passkey: "",
  });
  const [registeringPayment, setRegisteringPayment] = useState(false);

  useEffect(() => {
    const loadForm = async () => {
      if (editing) {
        // Prefill county/town/address from the matching Location record, if one exists
        let county = "";
        let town = "";
        let address = "";
        try {
          const res = await makeAuthRequest(LOCATIONS_URL, "GET");
          if (res.success) {
            const match = (res.data.locations || []).find(
              (l) => l.name?.toLowerCase() === editing.location?.toLowerCase(),
            );
            if (match) {
              county = match.county || "";
              town = match.town || "";
              address = match.address || "";
            }
          }
        } catch (err) {
          // non-fatal — just leave location fields blank
        }
        setForm({
          name: editing.name || "",
          location: editing.location || "",
          subDivision: editing.subDivision || "",
          county,
          town,
          address,
          // Facility.accountNumber is auto-seeded with a placeholder
          // (dbName) at creation to satisfy payservedb's unique-but-not-
          // sparse index — shown here so it can be replaced once a real
          // KRA/eTims account number is assigned, per Roadmap Phase 7.
          accountNumber: editing.accountNumber || "",
          taxNumber: editing.taxNumber || "",
        });

        // Prefill the tariff plan editor from the facility's currently
        // active plan, if one has been configured; otherwise show the
        // same flat-rate default the billing engine falls back to.
        try {
          const planRes = await makeAuthRequest(
            `${TARIFF_PLANS_URL}?facilityId=${editing._id}`,
            "GET",
          );
          const activePlan = planRes.success
            ? (planRes.data.plans || []).find((p) => p.active)
            : null;
          if (activePlan) {
            setTariffPlan({
              bands: activePlan.bands,
              minimumCharge: activePlan.minimumCharge ?? 0,
              sewerageRatePercent: Math.round(
                (activePlan.sewerageRate ?? 0.75) * 100,
              ),
              techFee: activePlan.techFee ?? 150,
              penaltyEnabled: activePlan.penaltyEnabled ?? false,
              penaltyType: activePlan.penaltyType ?? "percentage",
              penaltyValue: activePlan.penaltyValue ?? 0,
              dueDateOffsetDays: activePlan.dueDateOffsetDays ?? 15,
              reminderDaysBefore: activePlan.reminderDaysBefore ?? 3,
              paybillShortCode: activePlan.paybillShortCode || "",
            });
          } else {
            setTariffPlan(DEFAULT_TARIFF_PLAN);
          }
        } catch (err) {
          setTariffPlan(DEFAULT_TARIFF_PLAN);
        }
      } else {
        setForm({
          name: "",
          location: "",
          subDivision: "",
          county: "",
          town: "",
          address: "",
          accountNumber: "",
          taxNumber: "",
        });
        setTariffPlan(DEFAULT_TARIFF_PLAN);
      }
    };
    loadForm();
  }, [editing]);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.name || !form.location || !form.subDivision) {
      toastify("Name, location and sub-division are required", "error");
      return;
    }
    if (tariffPlan.bands.some((b) => !b.rate || b.rate < 0)) {
      toastify("Every tariff band needs a rate", "error");
      return;
    }
    try {
      setLoading(true);
      const url = editing ? `${FACILITIES_URL}/${editing._id}` : FACILITIES_URL;
      const method = editing ? "PUT" : "POST";

      const payload = { ...form };
      if (payload.accountNumber?.trim()) {
        payload.accountNumber = payload.accountNumber.trim();
      } else {
        delete payload.accountNumber;
      }
      payload.taxNumber = payload.taxNumber?.trim() || null;
      if (!editing) {
        payload.blockGroups = [];
      }

      const res = await makeAuthRequest(url, method, payload);
      if (!res.success) {
        toastify(res.error, "error");
        return;
      }

      const facilityId = editing ? editing._id : res.data.facility?._id;
      if (facilityId) {
        const planRes = await makeAuthRequest(TARIFF_PLANS_URL, "POST", {
          name: `${form.name} — ${new Date().toLocaleDateString()}`,
          facilityId,
          bands: tariffPlan.bands,
          minimumCharge: Number(tariffPlan.minimumCharge) || 0,
          sewerageRate: (Number(tariffPlan.sewerageRatePercent) || 0) / 100,
          techFee: Number(tariffPlan.techFee) || 0,
          penaltyEnabled: tariffPlan.penaltyEnabled,
          penaltyType: tariffPlan.penaltyType,
          penaltyValue: Number(tariffPlan.penaltyValue) || 0,
          dueDateOffsetDays: Number(tariffPlan.dueDateOffsetDays) || 0,
          reminderDaysBefore: Number(tariffPlan.reminderDaysBefore) || 0,
          paybillShortCode: tariffPlan.paybillShortCode?.trim() || null,
        });
        if (!planRes.success) {
          toastify(
            `Facility saved, but tariff plan failed: ${planRes.error}`,
            "error",
          );
          return;
        }
      }

      if (!editing && res.data.blocks?.length) {
        toastify(
          `Facility created with ${res.data.blocks.length} item(s): ${res.data.blocks.map((b) => `${b.type} ${b.name}`).join(", ")}`,
          "success",
        );
      } else {
        toastify(editing ? "Facility updated" : "Facility created", "success");
      }
      if (onSuccess) onSuccess();
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setLoading(false);
    }
  };
  const handleRegisterPaymentDetails = async () => {
    if (!editing) {
      toastify(
        "Save the facility first, then register payment details",
        "error",
      );
      return;
    }
    if (!tariffPlan.paybillShortCode?.trim()) {
      toastify("Set a Paybill Shortcode above before registering", "error");
      return;
    }
    const partiallyFilled = [
      paymentCreds.consumerKey,
      paymentCreds.consumerSecret,
      paymentCreds.passkey,
    ].filter(Boolean).length;
    if (partiallyFilled > 0 && partiallyFilled < 3) {
      toastify(
        "Fill in all three credential fields, or leave all blank to use PayServe's default",
        "error",
      );
      return;
    }
    try {
      setRegisteringPayment(true);
      const res = await makeAuthRequest(
        "/api/v1/damr/facility/payment-details",
        "POST",
        {
          facilityId: editing._id,
          shortCode: tariffPlan.paybillShortCode.trim(),
          passkey: paymentCreds.passkey || undefined,
          consumerKey: paymentCreds.consumerKey || undefined,
          consumerSecret: paymentCreds.consumerSecret || undefined,
        },
      );
      if (res.success) {
        toastify(
          res.data.message ||
            "Payment details registered with the Payments microservice",
          "success",
        );
        setPaymentCreds({ consumerKey: "", consumerSecret: "", passkey: "" });
      } else {
        toastify(res.error, "error");
      }
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setRegisteringPayment(false);
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
              Facility Name <span className="text-danger">*</span>
            </label>
            <input
              name="name"
              className="form-control"
              placeholder="e.g. Falcon Heights"
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
              onPlaceSelected={({ formattedAddress, county, town }) =>
                setForm((prev) => ({
                  ...prev,
                  location: formattedAddress || prev.location,
                  county: county || prev.county,
                  town: town || prev.town,
                }))
              }
            />
            <div className="form-text">
              Start typing to see suggestions — picking one also fills in
              Location/County/Town below.
            </div>
          </div>
          <div className="mb-3">
            <label className="form-label">
              Location <span className="text-danger">*</span>
            </label>
            <AddressAutocompleteInput
              name="location"
              placeholder="e.g. Nairobi, Westlands"
              value={form.location}
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
          <div className="mb-3">
            <label className="form-label">
              Sub-Division <span className="text-danger">*</span>
            </label>
            <input
              name="subDivision"
              className="form-control"
              placeholder="e.g. Block A, Phase 1"
              value={form.subDivision}
              onChange={handleChange}
            />
          </div>

          {editing && (
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label">KRA/eTims Account Number</label>
                <input
                  name="accountNumber"
                  className="form-control"
                  placeholder="Assigned during KRA/eTims onboarding"
                  value={form.accountNumber}
                  onChange={handleChange}
                />
                <div className="form-text">
                  Auto-assigned a placeholder until a real number is set here.
                  Must be unique across facilities — leave unchanged if not yet
                  assigned.
                </div>
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">KRA Tax Number (TIN)</label>
                <input
                  name="taxNumber"
                  className="form-control"
                  placeholder="e.g. P051234567X"
                  value={form.taxNumber}
                  onChange={handleChange}
                />
              </div>
            </div>
          )}
          <hr className="my-4" />
          <h6 className="mb-3">
            <i className="ti ti-receipt-2 me-2"></i>Tariff Plan
          </h6>
          <div className="mb-3">
            <label className="form-label">Water rate bands</label>
            <TariffBandEditor
              bands={tariffPlan.bands}
              onChange={(bands) =>
                setTariffPlan((prev) => ({ ...prev, bands }))
              }
            />
            <small className="text-muted">
              e.g. 180/m&sup3; up to 6m&sup3;, then 205/m&sup3; above — leave a
              single unbounded band for a flat rate.
            </small>
          </div>
          <div className="row">
            <div className="col-md-4 mb-3">
              <label className="form-label">Minimum charge (KES)</label>
              <input
                type="number"
                min="0"
                className="form-control"
                value={tariffPlan.minimumCharge}
                onChange={(e) =>
                  setTariffPlan((prev) => ({
                    ...prev,
                    minimumCharge: e.target.value,
                  }))
                }
              />
            </div>
            <div className="col-md-4 mb-3">
              <label className="form-label">Sewerage (% of water charge)</label>
              <input
                type="number"
                min="0"
                max="200"
                className="form-control"
                value={tariffPlan.sewerageRatePercent}
                onChange={(e) =>
                  setTariffPlan((prev) => ({
                    ...prev,
                    sewerageRatePercent: e.target.value,
                  }))
                }
              />
            </div>
            <div className="col-md-4 mb-3">
              <label className="form-label">Tech fee (KES)</label>
              <input
                type="number"
                min="0"
                className="form-control"
                value={tariffPlan.techFee}
                onChange={(e) =>
                  setTariffPlan((prev) => ({
                    ...prev,
                    techFee: e.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div className="row">
            <div className="col-md-6 mb-3">
              <label className="form-label">Paybill Shortcode</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. 400200"
                value={tariffPlan.paybillShortCode}
                onChange={(e) =>
                  setTariffPlan((prev) => ({
                    ...prev,
                    paybillShortCode: e.target.value,
                  }))
                }
              />
              <div className="form-text">
                Must match the shortcode already registered for this facility in
                the Payments system. Leave blank if not yet provisioned.
              </div>
            </div>
          </div>

          {editing && (
            <div className="card border-secondary mb-3">
              <div className="card-header bg-light">
                <h6 className="mb-0">
                  <i className="ti ti-key me-2"></i>Register STK Push (M-Pesa
                  Daraja credentials)
                </h6>
              </div>
              <div className="card-body">
                <p className="text-muted small mb-2">
                  One-time action — forwards credentials to PayServe's shared
                  Payments microservice so residents can be sent a real STK push
                  from the invoice page. Not stored in DAMR's own database.
                </p>
                <p className="text-muted small mb-2">
                  <i className="ti ti-info-circle me-1"></i>
                  Leave all three fields blank to register using{" "}
                  <strong>PayServe's default Daraja credentials</strong>. Only
                  fill these in if this facility has its own separate
                  Paybill/Daraja app.
                </p>
                <div className="row">
                  <div className="col-md-6 mb-2">
                    <label className="form-label">
                      Consumer Key (optional)
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Leave blank for PayServe default"
                      value={paymentCreds.consumerKey}
                      onChange={(e) =>
                        setPaymentCreds((prev) => ({
                          ...prev,
                          consumerKey: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="col-md-6 mb-2">
                    <label className="form-label">
                      Consumer Secret (optional)
                    </label>
                    <input
                      type="password"
                      className="form-control"
                      placeholder="Leave blank for PayServe default"
                      value={paymentCreds.consumerSecret}
                      onChange={(e) =>
                        setPaymentCreds((prev) => ({
                          ...prev,
                          consumerSecret: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="col-md-6 mb-2">
                    <label className="form-label">Passkey (optional)</label>
                    <input
                      type="password"
                      className="form-control"
                      placeholder="Leave blank for PayServe default"
                      value={paymentCreds.passkey}
                      onChange={(e) =>
                        setPaymentCreds((prev) => ({
                          ...prev,
                          passkey: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={handleRegisterPaymentDetails}
                  disabled={registeringPayment}
                >
                  {registeringPayment ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2"></span>
                      Registering...
                    </>
                  ) : (
                    <>
                      <i className="ti ti-plug-connected me-2"></i>Register
                      Payment Details
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          <div className="row align-items-end">
            <div className="col-md-3 mb-3">
              <label className="form-label">Due (days after period end)</label>
              <input
                type="number"
                min="0"
                className="form-control"
                value={tariffPlan.dueDateOffsetDays}
                onChange={(e) =>
                  setTariffPlan((prev) => ({
                    ...prev,
                    dueDateOffsetDays: e.target.value,
                  }))
                }
              />
            </div>
            <div className="col-md-3 mb-3">
              <label className="form-label">Remind (days before due)</label>
              <input
                type="number"
                min="0"
                className="form-control"
                value={tariffPlan.reminderDaysBefore}
                onChange={(e) =>
                  setTariffPlan((prev) => ({
                    ...prev,
                    reminderDaysBefore: e.target.value,
                  }))
                }
              />
              <div className="form-text">
                Also reminds on the due date itself; overdue reminders continue
                daily after.
              </div>
            </div>
            <div className="col-md-3 mb-3">
              <div className="form-check mt-4">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="penaltyEnabled"
                  checked={tariffPlan.penaltyEnabled}
                  onChange={(e) =>
                    setTariffPlan((prev) => ({
                      ...prev,
                      penaltyEnabled: e.target.checked,
                    }))
                  }
                />
                <label className="form-check-label" htmlFor="penaltyEnabled">
                  Enable late fee
                </label>
              </div>
            </div>
            {tariffPlan.penaltyEnabled && (
              <>
                <div className="col-md-3 mb-3">
                  <label className="form-label">Late fee type</label>
                  <select
                    className="form-select"
                    value={tariffPlan.penaltyType}
                    onChange={(e) =>
                      setTariffPlan((prev) => ({
                        ...prev,
                        penaltyType: e.target.value,
                      }))
                    }
                  >
                    <option value="percentage">Percentage</option>
                    <option value="flat">Flat (KES)</option>
                  </select>
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label">
                    Late fee value{" "}
                    {tariffPlan.penaltyType === "percentage" ? "(%)" : "(KES)"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="form-control"
                    value={tariffPlan.penaltyValue}
                    onChange={(e) =>
                      setTariffPlan((prev) => ({
                        ...prev,
                        penaltyValue: e.target.value,
                      }))
                    }
                  />
                </div>
              </>
            )}
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
                  ? "Update Facility"
                  : "Add Facility"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const SCOPE_FACILITY = "facility";
const SCOPE_BLOCK = "block";
const SCOPE_UNIT_TYPE = "unitType";

function scopeLabel(plan) {
  if (plan.blockId) return `Block: ${plan.blockId.name || plan.blockId}`;
  if (plan.unitType) return `Category: ${plan.unitType}`;
  return "Facility default";
}
function TariffPlansTab() {
  const [facilities, setFacilities] = useState([]);
  const [facilityId, setFacilityId] = useState("");
  const [blocks, setBlocks] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);

  const [scope, setScope] = useState(SCOPE_FACILITY);
  const [blockId, setBlockId] = useState("");
  const [unitType, setUnitType] = useState("");
  const [planName, setPlanName] = useState("");
  const [tariffPlan, setTariffPlan] = useState(DEFAULT_TARIFF_PLAN);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    makeAuthRequest(FACILITIES_URL, "GET").then((res) => {
      if (res.success) setFacilities(res.data.facilities || []);
    });
  }, []);

  const fetchPlans = async (fid) => {
    if (!fid) {
      setPlans([]);
      return;
    }
    try {
      setLoading(true);
      const res = await makeAuthRequest(
        `${TARIFF_PLANS_URL}?facilityId=${fid}`,
        "GET",
      );
      if (res.success) setPlans(res.data.plans || []);
      else toastify(res.error, "error");
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleFacilityChange = async (e) => {
    const fid = e.target.value;
    setFacilityId(fid);
    setBlockId("");
    if (fid) {
      const res = await makeAuthRequest(
        `${BLOCKS_URL}?facilityId=${fid}`,
        "GET",
      );
      if (res.success) setBlocks(res.data.blocks || []);
      else setBlocks([]);
      fetchPlans(fid);
    } else {
      setBlocks([]);
      setPlans([]);
    }
  };

  const resetForm = () => {
    setScope(SCOPE_FACILITY);
    setBlockId("");
    setUnitType("");
    setPlanName("");
    setTariffPlan(DEFAULT_TARIFF_PLAN);
  };

  const handleCreate = async () => {
    if (!facilityId) {
      toastify("Select a facility first", "error");
      return;
    }
    if (scope === SCOPE_BLOCK && !blockId) {
      toastify("Select a block", "error");
      return;
    }
    if (scope === SCOPE_UNIT_TYPE && !unitType) {
      toastify("Select a unit category", "error");
      return;
    }
    if (tariffPlan.bands.some((b) => !b.rate || b.rate < 0)) {
      toastify("Every tariff band needs a rate", "error");
      return;
    }

    const facility = facilities.find((f) => f._id === facilityId);
    const defaultName =
      scope === SCOPE_BLOCK
        ? `${facility?.name || "Facility"} — Block ${blocks.find((b) => b._id === blockId)?.name || ""}`
        : scope === SCOPE_UNIT_TYPE
          ? `${facility?.name || "Facility"} — ${unitType}`
          : `${facility?.name || "Facility"} — Default`;

    try {
      setSaving(true);
      const res = await makeAuthRequest(TARIFF_PLANS_URL, "POST", {
        name: planName.trim() || defaultName,
        facilityId,
        blockId: scope === SCOPE_BLOCK ? blockId : null,
        unitType: scope === SCOPE_UNIT_TYPE ? unitType : null,
        bands: tariffPlan.bands,
        minimumCharge: Number(tariffPlan.minimumCharge) || 0,
        sewerageRate: (Number(tariffPlan.sewerageRatePercent) || 0) / 100,
        techFee: Number(tariffPlan.techFee) || 0,
        penaltyEnabled: tariffPlan.penaltyEnabled,
        penaltyType: tariffPlan.penaltyType,
        penaltyValue: Number(tariffPlan.penaltyValue) || 0,
        dueDateOffsetDays: Number(tariffPlan.dueDateOffsetDays) || 0,
        reminderDaysBefore: Number(tariffPlan.reminderDaysBefore) || 0,
        paybillShortCode: tariffPlan.paybillShortCode?.trim() || null,
      });
      if (res.success) {
        toastify("Tariff plan created successfully", "success");
        resetForm();
        fetchPlans(facilityId);
      } else {
        toastify(res.error, "error");
      }
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (planId) => {
    try {
      const res = await makeAuthRequest(
        `${TARIFF_PLANS_URL}/${planId}`,
        "DELETE",
      );
      if (res.success) {
        toastify("Plan deactivated", "success");
        fetchPlans(facilityId);
      } else {
        toastify(res.error, "error");
      }
    } catch (err) {
      toastify(err.message, "error");
    }
  };

  return (
    <div className="card-body">
      <div className="row justify-content-center">
        <div className="col-md-10">
          <div className="mb-3">
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

          {facilityId && (
            <>
              <div className="card mb-4">
                <div className="card-header">
                  <h6 className="mb-0">
                    Active &amp; past plans for this facility
                  </h6>
                </div>
                <div className="card-body">
                  {loading ? (
                    <div className="text-center py-3">
                      <div
                        className="spinner-border spinner-border-sm text-primary"
                        role="status"
                      ></div>
                    </div>
                  ) : plans.length === 0 ? (
                    <p className="text-muted mb-0">
                      No tariff plans configured yet — billing falls back to the
                      flat default rate.
                    </p>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-sm align-middle mb-0">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Scope</th>
                            <th>Bands</th>
                            <th>Status</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {plans.map((p) => (
                            <tr key={p._id}>
                              <td>{p.name}</td>
                              <td>{scopeLabel(p)}</td>
                              <td>
                                {p.bands?.length} band
                                {p.bands?.length === 1 ? "" : "s"}, KES{" "}
                                {Math.min(
                                  ...(p.bands || []).map((b) => b.rate),
                                )}
                                –
                                {Math.max(
                                  ...(p.bands || []).map((b) => b.rate),
                                )}
                                /m³
                              </td>
                              <td>
                                <span
                                  className={`badge ${p.active ? "bg-light-success" : "bg-light-secondary"}`}
                                >
                                  {p.active ? "Active" : "Inactive"}
                                </span>
                              </td>
                              <td>
                                {p.active && (
                                  <button
                                    className="btn btn-sm btn-outline-danger"
                                    onClick={() => handleDeactivate(p._id)}
                                  >
                                    Deactivate
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h6 className="mb-0">Create a new scoped plan</h6>
                </div>
                <div className="card-body">
                  <div className="mb-3">
                    <label className="form-label">Scope</label>
                    <div className="d-flex gap-3">
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="radio"
                          id="scopeFacility"
                          checked={scope === SCOPE_FACILITY}
                          onChange={() => setScope(SCOPE_FACILITY)}
                        />
                        <label
                          className="form-check-label"
                          htmlFor="scopeFacility"
                        >
                          Facility default
                        </label>
                      </div>
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="radio"
                          id="scopeBlock"
                          checked={scope === SCOPE_BLOCK}
                          onChange={() => setScope(SCOPE_BLOCK)}
                        />
                        <label
                          className="form-check-label"
                          htmlFor="scopeBlock"
                        >
                          Specific block
                        </label>
                      </div>
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="radio"
                          id="scopeUnitType"
                          checked={scope === SCOPE_UNIT_TYPE}
                          onChange={() => setScope(SCOPE_UNIT_TYPE)}
                        />
                        <label
                          className="form-check-label"
                          htmlFor="scopeUnitType"
                        >
                          Unit category
                        </label>
                      </div>
                    </div>
                    <small className="text-muted">
                      Billing resolves the most specific match first: unit
                      category → block → facility default.
                    </small>
                  </div>

                  {scope === SCOPE_BLOCK && (
                    <div className="mb-3">
                      <label className="form-label">Block</label>
                      <select
                        className="form-select"
                        value={blockId}
                        onChange={(e) => setBlockId(e.target.value)}
                      >
                        <option value="">Select block...</option>
                        {blocks.map((b) => (
                          <option key={b._id} value={b._id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                      {blocks.length === 0 && (
                        <small className="text-muted">
                          No blocks set up for this facility yet.
                        </small>
                      )}
                    </div>
                  )}

                  {scope === SCOPE_UNIT_TYPE && (
                    <div className="mb-3">
                      <label className="form-label">Unit Category</label>
                      <select
                        className="form-select"
                        value={unitType}
                        onChange={(e) => setUnitType(e.target.value)}
                      >
                        <option value="">Select category...</option>
                        {UNIT_TYPE_OPTIONS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="mb-3">
                    <label className="form-label">Plan Name (optional)</label>
                    <input
                      className="form-control"
                      placeholder="Auto-generated if left blank"
                      value={planName}
                      onChange={(e) => setPlanName(e.target.value)}
                    />
                  </div>

                  <label className="form-label">Water rate bands</label>
                  <TariffBandEditor
                    bands={tariffPlan.bands}
                    onChange={(bands) =>
                      setTariffPlan((prev) => ({ ...prev, bands }))
                    }
                  />

                  <div className="row mt-3">
                    <div className="col-md-4 mb-3">
                      <label className="form-label">Minimum Charge (KES)</label>
                      <input
                        type="number"
                        min="0"
                        className="form-control"
                        value={tariffPlan.minimumCharge}
                        onChange={(e) =>
                          setTariffPlan((prev) => ({
                            ...prev,
                            minimumCharge: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="col-md-4 mb-3">
                      <label className="form-label">
                        Sewerage Rate (% of water charge)
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="form-control"
                        value={tariffPlan.sewerageRatePercent}
                        onChange={(e) =>
                          setTariffPlan((prev) => ({
                            ...prev,
                            sewerageRatePercent: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="col-md-4 mb-3">
                      <label className="form-label">Tech Fee (KES)</label>
                      <input
                        type="number"
                        min="0"
                        className="form-control"
                        value={tariffPlan.techFee}
                        onChange={(e) =>
                          setTariffPlan((prev) => ({
                            ...prev,
                            techFee: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="col-md-4 mb-3">
                      <label className="form-label">
                        Due Date Offset (days)
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="form-control"
                        value={tariffPlan.dueDateOffsetDays}
                        onChange={(e) =>
                          setTariffPlan((prev) => ({
                            ...prev,
                            dueDateOffsetDays: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="col-md-4 mb-3">
                      <label className="form-label">
                        Reminder Lead Time (days)
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="form-control"
                        value={tariffPlan.reminderDaysBefore}
                        onChange={(e) =>
                          setTariffPlan((prev) => ({
                            ...prev,
                            reminderDaysBefore: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="text-end">
                    <button
                      className="btn btn-primary"
                      onClick={handleCreate}
                      disabled={saving}
                    >
                      {saving ? "Saving..." : "Create Plan"}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Facilities() {
  const [activeTab, setActiveTab] = useState("all");
  const [editing, setEditing] = useState(null);

  const handleEdit = (f) => {
    setEditing(f);
    setActiveTab("form");
  };
  const handleSuccess = () => {
    setEditing(null);
    setActiveTab("all");
  };
  const handleCancel = () => {
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
                <li className="breadcrumb-item active">Facilities</li>
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
                    <i className="ti ti-building me-2"></i>All Facilities
                  </button>
                </li>
                <li className="nav-item">
                  <button
                    className={`nav-link ${activeTab === "form" ? "active" : ""}`}
                    onClick={() => setActiveTab("form")}
                    type="button"
                  >
                    <i className="ti ti-plus me-2"></i>
                    {editing ? "Edit Facility" : "Add Facility"}
                  </button>
                </li>
                <li className="nav-item">
                  <button
                    className={`nav-link ${activeTab === "tariffs" ? "active" : ""}`}
                    onClick={() => {
                      setEditing(null);
                      setActiveTab("tariffs");
                    }}
                    type="button"
                  >
                    <i className="ti ti-receipt-2 me-2"></i>Tariff Plans
                  </button>
                </li>
              </ul>
            </div>
            {activeTab === "all" && <AllFacilitiesTab onEdit={handleEdit} />}
            {activeTab === "form" && (
              <FacilityFormTab
                editing={editing}
                onSuccess={handleSuccess}
                onCancelEdit={handleCancel}
              />
            )}
            {activeTab === "tariffs" && <TariffPlansTab />}
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default Facilities;
