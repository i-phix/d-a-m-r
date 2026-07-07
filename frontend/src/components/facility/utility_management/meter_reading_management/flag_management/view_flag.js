import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Layout from '../../../../layout/Layout';
import { makeAuthRequest } from '../../../../../utils/makeRequest';
import { toastify } from '../../../../../utils/toast';
import { getFlagsURL } from '../../../../../utils/urls';

// ── Helpers ────────────────────────────────────────────────────────────
const InfoRow = ({ label, value }) => (
    <div className="row mb-2">
        <div className="col-5 text-muted">{label}</div>
        <div className="col-7"><strong>{value || '—'}</strong></div>
    </div>
);

const TypeBadge = ({ type }) => {
    const map = {
        SPIKE:           'bg-danger',
        CRITICAL:        'bg-danger',
        OVERNIGHT_LEAK:  'bg-warning',
        ZERO_FLOW:       'bg-secondary',
        ERRATIC:         'bg-info',
        high_consumption:'bg-danger',
        ocr_mismatch:    'bg-warning',
        missing_reading: 'bg-secondary',
        manual_review:   'bg-info',
    };
    return (
        <span className={`badge ${map[type] || 'bg-secondary'}`}>
            {type?.replace(/_/g, ' ')}
        </span>
    );
};

function ViewFlag() {
    const { id }   = useParams();
    const navigate = useNavigate();
    const userRole = useSelector((state) => state.damrReducer.user?.role);

    const [flag,     setFlag]     = useState(null);
    const [loading,  setLoading]  = useState(false);
    const [notes,    setNotes]    = useState('');
    const [resolving, setResolving] = useState(false);
    const [savingNotes, setSavingNotes] = useState(false);

    const fetchFlag = async () => {
        try {
            setLoading(true);
            const res = await makeAuthRequest(`${getFlagsURL}/${id}`, 'GET');
            if (res.success) {
                setFlag(res.data.flag);
                setNotes(res.data.flag.notes || '');
            } else {
                toastify(res.error, 'error');
                navigate('/flags');
            }
        } catch (err) {
            toastify(err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleResolve = async () => {
        if (!window.confirm('Mark this flag as resolved?')) return;
        try {
            setResolving(true);
            const res = await makeAuthRequest(`${getFlagsURL}/${id}/resolve`, 'PATCH', { notes });
            if (res.success) {
                toastify('Flag resolved successfully', 'success');
                fetchFlag();
            } else {
                toastify(res.error, 'error');
            }
        } catch (err) {
            toastify(err.message, 'error');
        } finally {
            setResolving(false);
        }
    };

    const handleSaveNotes = async () => {
        if (!notes) { toastify('Notes cannot be empty', 'error'); return; }
        try {
            setSavingNotes(true);
            const res = await makeAuthRequest(`${getFlagsURL}/${id}/notes`, 'PATCH', { notes });
            if (res.success) {
                toastify('Notes saved successfully', 'success');
                fetchFlag();
            } else {
                toastify(res.error, 'error');
            }
        } catch (err) {
            toastify(err.message, 'error');
        } finally {
            setSavingNotes(false);
        }
    };

    useEffect(() => { fetchFlag(); }, [id]);

    return (
        <Layout>
            {/* Breadcrumb */}
            <div className="page-header">
                <div className="page-block">
                    <div className="row align-items-center">
                        <div className="col-md-12">
                            <ul className="breadcrumb mb-3">
                                <li className="breadcrumb-item"><Link to="/">Dashboard</Link></li>
                                <li className="breadcrumb-item"><Link to="/flags">Flag Management</Link></li>
                                <li className="breadcrumb-item active">Flag Details</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            {/* Back button */}
            <div className="card mb-3">
                <div className="card-header">
                    <Link to="/flags">
                        <i className="ti ti-arrow-narrow-left me-1"></i> Back to Flags
                    </Link>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-5">
                    <div className="spinner-border text-warning" role="status"></div>
                </div>
            ) : flag ? (
                <div className="row">

                    {/* ── Left: Flag details ── */}
                    <div className="col-md-6">
                        <div className="card">
                            <div className="card-header d-flex align-items-center justify-content-between">
                                <h5 className="card-title mb-0">
                                    <i className="ti ti-flag me-2 text-warning"></i>Flag Details
                                </h5>
                                <TypeBadge type={flag.type} />
                            </div>
                            <div className="card-body">
                                <InfoRow label="Flag ID"    value={flag._id} />
                                <InfoRow label="Type"       value={flag.type?.replace(/_/g, ' ')} />
                                <InfoRow label="Status"     value={flag.status} />
                                <InfoRow label="Description" value={flag.description} />
                                <InfoRow label="Raised On"  value={new Date(flag.createdAt).toLocaleString()} />
                                <InfoRow label="Resolved On" value={flag.resolvedAt ? new Date(flag.resolvedAt).toLocaleString() : null} />
                                <InfoRow label="Resolved By" value={flag.resolvedBy?.fullName} />
                            </div>
                        </div>

                        {/* Linked reading */}
                        {flag.readingId && (
                            <div className="card">
                                <div className="card-header">
                                    <h5 className="card-title mb-0">
                                        <i className="ti ti-graph me-2 text-info"></i>Linked Reading
                                    </h5>
                                </div>
                                <div className="card-body">
                                    <InfoRow label="Reading Value" value={flag.readingId?.value != null ? `${flag.readingId.value} m³` : null} />
                                    <InfoRow label="Reading Date"  value={flag.readingId?.readingDate ? new Date(flag.readingId.readingDate).toLocaleDateString() : null} />
                                    <InfoRow label="Method"        value={flag.readingId?.method} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Right: Meter info + Actions ── */}
                    <div className="col-md-6">
                        <div className="card">
                            <div className="card-header">
                                <h5 className="card-title mb-0">
                                    <i className="ti ti-cpu-charge me-2 text-primary"></i>Meter
                                </h5>
                            </div>
                            <div className="card-body">
                                <InfoRow label="Serial Number" value={flag.meterId?.serialNumber} />
                                <InfoRow label="Meter Type"    value={flag.meterId?.meterType} />
                                <div className="mt-2">
                                    <Link to={`/meters/${flag.meterId?._id}`} className="btn btn-sm btn-outline-primary">
                                        <i className="ti ti-eye me-1"></i> View Meter
                                    </Link>
                                </div>
                            </div>
                        </div>

                        {/* Notes */}
                        <div className="card">
                            <div className="card-header">
                                <h5 className="card-title mb-0">
                                    <i className="ti ti-notes me-2 text-secondary"></i>Notes
                                </h5>
                            </div>
                            <div className="card-body">
                                <textarea
                                    className="form-control mb-2"
                                    rows={3}
                                    placeholder="Add notes or observations..."
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                />
                                <button
                                    className="btn btn-outline-secondary btn-sm w-100"
                                    onClick={handleSaveNotes}
                                    disabled={savingNotes}
                                >
                                    {savingNotes ? 'Saving...' : 'Save Notes'}
                                </button>
                            </div>
                        </div>

                        {/* Resolve action — admin/editor only, only if open */}
                        {userRole !== 'Staff' && flag.status === 'open' && (
                            <div className="card border-success">
                                <div className="card-header bg-light-success">
                                    <h5 className="card-title mb-0 text-success">
                                        <i className="ti ti-circle-check me-2"></i>Resolve Flag
                                    </h5>
                                </div>
                                <div className="card-body">
                                    <p className="text-muted mb-3">
                                        Mark this flag as resolved once the issue has been investigated and addressed.
                                    </p>
                                    <button
                                        className="btn btn-success w-100"
                                        onClick={handleResolve}
                                        disabled={resolving}
                                    >
                                        {resolving
                                            ? <><span className="spinner-border spinner-border-sm me-2"></span>Resolving...</>
                                            : <><i className="ti ti-check me-2"></i>Mark as Resolved</>
                                        }
                                    </button>
                                </div>
                            </div>
                        )}

                        {flag.status === 'resolved' && (
                            <div className="alert alert-success">
                                <i className="ti ti-circle-check me-2"></i>
                                This flag was resolved on <strong>{new Date(flag.resolvedAt).toLocaleDateString()}</strong>
                                {flag.resolvedBy?.fullName && <> by <strong>{flag.resolvedBy.fullName}</strong></>}.
                            </div>
                        )}
                    </div>

                </div>
            ) : null}
        </Layout>
    );
}

export default ViewFlag;
