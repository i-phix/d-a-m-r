import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import Layout from "../layout/Layout";
import { makeAuthRequest } from "../../utils/makeRequest";
import { toastify } from "../../utils/toast";
import { myResidenciesURL, myReadingsPortalURL, backend_url } from "../../utils/urls";

function ResidentReadings() {
  const [residencies, setResidencies] = useState([]);
  const [unitId, setUnitId] = useState("");
  const [readings, setReadings] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    makeAuthRequest(myResidenciesURL, "GET").then((res) => {
      if (res.success) setResidencies(res.data.residencies || []);
    });
  }, []);

  const fetchReadings = useCallback(async () => {
    try {
      setLoading(true);
      const url = unitId
        ? `${myReadingsPortalURL}?unitId=${unitId}`
        : myReadingsPortalURL;
      const res = await makeAuthRequest(url, "GET");
      if (res.success) {
        setReadings(res.data.readings || []);
        setTotal(res.data.total || 0);
      } else {
        toastify(res.error, "error");
      }
    } catch (err) {
      toastify(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => {
    fetchReadings();
  }, [fetchReadings]);

  return (
    <Layout>
      <div className="page-header">
        <div className="page-block">
          <div className="row align-items-center">
            <div className="col-md-12">
              <ul className="breadcrumb mb-3">
                <li className="breadcrumb-item">
                  <Link to="/">My Unit</Link>
                </li>
                <li className="breadcrumb-item active">My Readings</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h5 className="card-title mb-0">
            <i className="ti ti-graph me-2 text-primary"></i>Reading History
          </h5>
          {residencies.length > 1 && (
            <select
              className="form-select form-select-sm"
              style={{ maxWidth: 220 }}
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
            >
              <option value="">All my units</option>
              {residencies.map((r) => (
                <option key={r.residentDocId} value={r.unit?._id}>
                  {r.unit?.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="card-body">
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          ) : readings.length === 0 ? (
            <div className="text-center py-4">
              <i className="ti ti-inbox text-muted" style={{ fontSize: 48 }}></i>
              <p className="text-muted mt-2">No readings recorded yet.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Meter</th>
                    <th className="text-end">Reading (m³)</th>
                    <th className="text-end">Consumption (m³)</th>
                    <th>Method</th>
                    <th>Photo</th>
                  </tr>
                </thead>
                <tbody>
                  {readings.map((r) => (
                    <tr key={r._id}>
                      <td>{new Date(r.readingDate).toLocaleDateString()}</td>
                      <td>{r.meterId?.serialNumber || "—"}</td>
                      <td className="text-end">{r.value}</td>
                      <td className="text-end">{r.consumption ?? "—"}</td>
                      <td className="text-capitalize">{r.method}</td>
                      <td>
                        {r.imageUrl ? (
                          <a href={`${backend_url}${r.imageUrl}`} target="_blank" rel="noopener noreferrer">
                            View
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-muted mb-0" style={{ fontSize: 13 }}>
                {total} reading{total === 1 ? "" : "s"} total
              </p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

export default ResidentReadings;
