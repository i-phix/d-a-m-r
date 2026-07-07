import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Layout from '../../../../layout/Layout';
import { makeAuthRequest } from '../../../../../utils/makeRequest';
import { toastify } from '../../../../../utils/toast';
import { getResidentsURL } from '../../../../../utils/urls';

const InfoRow = ({ label, value }) => (
    <div className="row mb-2">
        <div className="col-5 text-muted">{label}</div>
        <div className="col-7"><strong>{value || '—'}</strong></div>
    </div>
);

function ResidentHistory() {
    const { id }   = useParams();
    const navigate = useNavigate();
    const userRole = useSelector((state) => state.damrReducer.user?.role);

    const [resident,  setResident]  = useState(null);
    const [history,   setHistory]   = useState([]);
    const [loading,   setLoading]   = useState(false);
    const [activeTab, setActiveTab] = useState('details');

    // Move out
    const [moveOutReason, setMoveOutReason] = useState('');
    const [movingOut,     setMovingOut]     = useState(false);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [resRes, histRes] = await Promise.all([
                makeAuthRequest(`${getResidentsURL}/${id}`, 'GET'),
                makeAuthRequest(`${getResidentsURL}/${id}/history`, 'GET'),
            ]);
            if (resRes.success)  setResident(resRes.data.resident);
            else { toastify(resRes.error, 'error'); navigate('/residents'); }
            if (histRes.success) setHistory(histRes.data.history || []);
        } catch (err) { toastify(err.message, 'error'); }
        finally { setLoading(false); }
    };

    const handleMoveOut = async () => {
        if (!moveOutReason) { toastify('Please select a move-out reason', 'error'); return; }
        if (!window.confirm('Move out this resident? This will vacate the unit and unbind the meter.')) return;
        try {
            setMovingOut(true);
            const res = await makeAuthRequest(`${getResidentsURL}/${id}`, 'DELETE', { moveOutReason });
            if (res.success) {
                toastify('Resident moved out successfully', 'success');
                navigate('/residents');
            } else {
                toastify(res.error, 'error');
            }
        } catch (err) { toastify(err.message, 'error'); }
        finally { setMovingOut(false); }
    };

    useEffect(() => { fetchData(); }, [id]);

    const tabs = [
        { key: 'details', label: 'Resident Details', icon: 'ti ti-user' },
        { key: 'history', label: 'Occupancy History', icon: 'ti ti-history' },
    ];

    return (
        <Layout>
            <div className="page-header">
                <div className="page-block">
                    <div className="row align-items-center">
                        <div className="col-md-12">
                            <ul className="breadcrumb mb-3">
                                <li className="breadcrumb-item"><Link to="/">Dashboard</Link></li>
                                <li className="breadcrumb-item"><Link to="/residents">Resident Management</Link></li>
                                <li className="breadcrumb-item active">{resident?.name || 'Resident Details'}</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            <div className="card mb-3">
                <div className="card-header d-flex align-items-center justify-content-between">
                    <Link to="/residents"><i className="ti ti-arrow-narrow-left me-1"></i>Back to Residents</Link>
                    {resident && (
                        <span className={`badge ${resident.status === 'Active' ? 'bg-success' : 'bg-secondary'}`}>
                            {resident.status}
                        </span>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="text-center py-5"><div className="spinner-border text-primary" role="status"></div></div>
            ) : resident ? (
                <div className="card">
                    <div className="card-body py-0">
                        <ul className="nav nav-tabs profile-tabs" role="tablist">
                            {tabs.map((tab) => (
                                <li className="nav-item" key={tab.key}>
                                    <button className={`nav-link ${activeTab === tab.key ? 'active' : ''}`} onClick={() => setActiveTab(tab.key)} type="button">
                                        <i className={`${tab.icon} me-2`}></i>{tab.label}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="card-body">

                        {/* ── DETAILS TAB ── */}
                        {activeTab === 'details' && (
                            <div className="row">
                                <div className="col-md-6">
                                    <div className="card">
                                        <div className="card-header"><h5 className="card-title mb-0"><i className="ti ti-user me-2 text-primary"></i>Personal Info</h5></div>
                                        <div className="card-body">
                                            <InfoRow label="Full Name"   value={resident.name} />
                                            <InfoRow label="National ID" value={resident.nationalId} />
                                            <InfoRow label="Phone"       value={resident.phone} />
                                            <InfoRow label="Email"       value={resident.email} />
                                            <InfoRow label="Resident ID" value={resident.residentId} />
                                            <InfoRow label="Registered"  value={new Date(resident.registrationDate || resident.createdAt).toLocaleDateString()} />
                                        </div>
                                    </div>
                                </div>

                                <div className="col-md-6">
                                    <div className="card">
                                        <div className="card-header"><h5 className="card-title mb-0"><i className="ti ti-building me-2 text-info"></i>Assignment</h5></div>
                                        <div className="card-body">
                                            <InfoRow label="Unit"     value={resident.unitId?.name || resident.unitName} />
                                            <InfoRow label="Facility" value={resident.facilityId?.name} />
                                            <InfoRow label="Status"   value={resident.status} />
                                        </div>
                                    </div>

                                    {/* Move out — admin/editor, active residents only */}
                                    {userRole !== 'Staff' && resident.status === 'Active' && (
                                        <div className="card border-danger">
                                            <div className="card-header bg-light-danger">
                                                <h5 className="card-title mb-0 text-danger"><i className="ti ti-logout me-2"></i>Move Out Resident</h5>
                                            </div>
                                            <div className="card-body">
                                                <div className="mb-3">
                                                    <label className="form-label">Move-out Reason <span className="text-danger">*</span></label>
                                                    <select className="form-select" value={moveOutReason} onChange={(e) => setMoveOutReason(e.target.value)}>
                                                        <option value="">Select reason...</option>
                                                        <option value="lease_end">Lease End</option>
                                                        <option value="transfer">Transfer</option>
                                                        <option value="eviction">Eviction</option>
                                                        <option value="other">Other</option>
                                                    </select>
                                                </div>
                                                <button className="btn btn-danger w-100" onClick={handleMoveOut} disabled={movingOut}>
                                                    {movingOut ? <><span className="spinner-border spinner-border-sm me-2"></span>Processing...</> : <><i className="ti ti-logout me-2"></i>Confirm Move Out</>}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── HISTORY TAB ── */}
                        {activeTab === 'history' && (
                            history.length === 0 ? (
                                <div className="text-center py-5">
                                    <i className="ti ti-history text-muted" style={{ fontSize: '48px' }}></i>
                                    <p className="text-muted mt-2">No occupancy history found</p>
                                </div>
                            ) : (
                                <div className="table-responsive">
                                    <table className="table table-hover">
                                        <thead>
                                            <tr>
                                                <th>#</th>
                                                <th>Unit</th>
                                                <th>Move-in Date</th>
                                                <th>Move-out Date</th>
                                                <th>Reason</th>
                                                <th>Recorded By</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {history.map((h, i) => (
                                                <tr key={h._id}>
                                                    <td>{i + 1}</td>
                                                    <td>{h.unitId?.name || '—'}</td>
                                                    <td>{new Date(h.moveInDate).toLocaleDateString()}</td>
                                                    <td>{h.moveOutDate ? new Date(h.moveOutDate).toLocaleDateString() : <span className="badge bg-success">Current</span>}</td>
                                                    <td className="text-capitalize">{h.moveOutReason?.replace(/_/g, ' ') || '—'}</td>
                                                    <td>{h.recordedBy?.fullName || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )
                        )}

                    </div>
                </div>
            ) : null}
        </Layout>
    );
}

export default ResidentHistory;
