import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Layout from '../../../../layout/Layout';
import { makeAuthRequest } from '../../../../../utils/makeRequest';
import { toastify } from '../../../../../utils/toast';
import { getReadingsURL, getMyReadingsURL } from '../../../../../utils/urls';

// ── Helpers ────────────────────────────────────────────────────────────

// One shared <style> block for every soft-styled table/search input on this
// page — a soft blue header, faint zebra striping, and a pill-shaped search
// box, instead of the default harsher Bootstrap table/input look.
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

const pillBase = {
    display: 'inline-block',
    padding: '4px 14px',
    borderRadius: '999px',
    fontSize: '13px',
    fontWeight: 600,
    lineHeight: 1.5,
};

const StatusBadge = ({ status }) => {
    const map = {
        confirmed: { bg: '#e3f9e8', color: '#1f9254' },
        pending: { bg: '#fff4de', color: '#b7791f' },
        rejected: { bg: '#fdeaea', color: '#c0392b' },
    };
    const s = map[status] || { bg: '#eef0f3', color: '#5c6470' };
    return (
        <span style={{ ...pillBase, backgroundColor: s.bg, color: s.color }}>
            {status}
        </span>
    );
};

const MethodBadge = ({ method }) => {
    const s = method === 'ocr'
        ? { bg: '#e7f1ff', color: '#3b5bdb' }
        : { bg: '#f1f2f6', color: '#495057' };
    return (
        <span style={{ ...pillBase, backgroundColor: s.bg, color: s.color }}>
            {method === 'ocr' ? 'OCR' : 'Manual'}
        </span>
    );
};

// Clickable column header — click once to sort ascending on that field,
// click again to flip to descending, click a different header to switch
// fields (always starting ascending on the new one).
const SortableHeader = ({ label, field, sortField, sortDir, onSort }) => {
    const active = sortField === field;
    const [hover, setHover] = useState(false);
    return (
        <th
            onClick={() => onSort(field)}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
                cursor: 'pointer',
                userSelect: 'none',
                whiteSpace: 'nowrap',
                padding: '14px 18px',
                fontSize: '15px',
                fontWeight: 600,
                backgroundColor: active ? '#dce6fb' : hover ? '#e4ecfa' : undefined,
                color: active ? '#3b5bdb' : '#1f2a44',
                transition: 'background-color 0.15s ease',
            }}
        >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                {label}
                <i
                    className={`ti ${active ? (sortDir === 'asc' ? 'ti-sort-ascending' : 'ti-sort-descending') : 'ti-arrows-sort'}`}
                    style={{
                        fontSize: '18px',
                        opacity: active ? 1 : 0.45,
                        color: active ? '#3b5bdb' : 'inherit',
                    }}
                ></i>
            </span>
        </th>
    );
};

// Generic comparator driving every sortable column below. "index" sorts by
// the order readings were fetched in (# reflects position in that order —
// there's no separate field to sort by, so ascending = as-fetched,
// descending = reversed).
function sortReadings(list, field, dir) {
    if (field === 'index') {
        return dir === 'asc' ? list : [...list].reverse();
    }
    const getValue = (r) => {
        switch (field) {
            case 'meter': return r.meterId?.serialNumber || '';
            case 'date': return new Date(r.readingDate).getTime() || 0;
            case 'value': return typeof r.value === 'number' ? r.value : -Infinity;
            case 'consumption': return r.consumption != null ? r.consumption : -Infinity;
            case 'method': return r.method || '';
            case 'confidence': return r.ocrConfidence != null ? r.ocrConfidence : -Infinity;
            case 'submittedBy': return r.submittedBy?.fullName || '';
            case 'status': return r.status || '';
            default: return 0;
        }
    };
    return [...list].sort((a, b) => {
        const av = getValue(a);
        const bv = getValue(b);
        let cmp;
        if (typeof av === 'string') cmp = av.localeCompare(bv);
        else cmp = av - bv;
        return dir === 'asc' ? cmp : -cmp;
    });
}

// ══════════════════════════════════════════════════════════════════════
// TAB: All Readings (admin / editor)
// ══════════════════════════════════════════════════════════════════════
function AllReadingsTab() {
    const [readings, setReadings] = useState([]);
    const [loading,  setLoading]  = useState(false);
    const [search,   setSearch]   = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [methodFilter, setMethodFilter] = useState('');
    const [sortField, setSortField] = useState('index');
    const [sortDir, setSortDir] = useState('asc');

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDir('asc');
        }
    };

    const fetchReadings = async () => {
        try {
            setLoading(true);
            let url = getReadingsURL + '?limit=100';
            if (statusFilter) url += `&status=${statusFilter}`;
            if (methodFilter) url += `&method=${methodFilter}`;
            const res = await makeAuthRequest(url, 'GET');
            if (res.success) setReadings(res.data.readings || []);
            else toastify(res.error, 'error');
        } catch (err) {
            toastify(err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchReadings(); }, [statusFilter, methodFilter]);

    const filtered = readings.filter((r) =>
        r.meterId?.serialNumber?.toLowerCase().includes(search.toLowerCase()) ||
        r.submittedBy?.fullName?.toLowerCase().includes(search.toLowerCase())
    );
    const sorted = sortReadings(filtered, sortField, sortDir);

    return (
        <div className="card-body">
            <SoftTableStyles />
            <div className="row mb-3">
                <div className="col-md-4">
                    <input
                        className="form-control dmr-search-pill"
                        placeholder="Search by meter serial or staff name..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="col-md-3">
                    <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="">All Statuses</option>
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="rejected">Rejected</option>
                    </select>
                </div>
                <div className="col-md-3">
                    <select className="form-select" value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
                        <option value="">All Methods</option>
                        <option value="ocr">OCR</option>
                        <option value="manual">Manual</option>
                    </select>
                </div>
                <div className="col-md-2 text-end">
                    <button className="btn btn-outline-secondary btn-sm" onClick={fetchReadings}>
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
                    <i className="ti ti-inbox text-muted" style={{ fontSize: '48px' }}></i>
                    <p className="text-muted mt-2">No readings found</p>
                </div>
            ) : (
                <div className="table-responsive">
                    <table className="table table-hover dmr-soft-table">
                        <thead>
                            <tr>
                                <SortableHeader label="#" field="index" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                                <SortableHeader label="Meter" field="meter" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                                <SortableHeader label="Date" field="date" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                                <SortableHeader label="Value (m³)" field="value" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                                <SortableHeader label="Consumption" field="consumption" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                                <SortableHeader label="Method" field="method" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                                <SortableHeader label="OCR Confidence" field="confidence" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                                <SortableHeader label="Submitted By" field="submittedBy" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                                <SortableHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((r, i) => (
                                <tr key={r._id}>
                                    <td>
                                        {sortField === 'index' && sortDir === 'desc'
                                            ? sorted.length - i
                                            : i + 1}
                                    </td>
                                    <td><strong>{r.meterId?.serialNumber || '—'}</strong></td>
                                    <td>{new Date(r.readingDate).toLocaleDateString()}</td>
                                    <td>{r.value}</td>
                                    <td>{r.consumption != null ? `${r.consumption} m³` : '—'}</td>
                                    <td><MethodBadge method={r.method} /></td>
                                    <td>
                                        {r.ocrConfidence != null
                                            ? `${(r.ocrConfidence * 100).toFixed(0)}%`
                                            : '—'}
                                    </td>
                                    <td>{r.submittedBy?.fullName || '—'}</td>
                                    <td><StatusBadge status={r.status} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════
// TAB: My Readings (Staff)
// ══════════════════════════════════════════════════════════════════════
function MyReadingsTab() {
    const [readings, setReadings] = useState([]);
    const [loading,  setLoading]  = useState(false);

    useEffect(() => {
        const fetch = async () => {
            try {
                setLoading(true);
                const res = await makeAuthRequest(getMyReadingsURL, 'GET');
                if (res.success) setReadings(res.data.readings || []);
                else toastify(res.error, 'error');
            } catch (err) {
                toastify(err.message, 'error');
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, []);

    return (
        <div className="card-body">
            {loading ? (
                <div className="text-center py-5">
                    <div className="spinner-border text-primary" role="status"></div>
                </div>
            ) : readings.length === 0 ? (
                <div className="text-center py-5">
                    <i className="ti ti-inbox text-muted" style={{ fontSize: '48px' }}></i>
                    <p className="text-muted mt-2">You have not submitted any readings yet</p>
                </div>
            ) : (
                <div className="table-responsive">
                    <table className="table table-hover dmr-soft-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Meter</th>
                                <th>Date</th>
                                <th>Value (m³)</th>
                                <th>Consumption</th>
                                <th>Method</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {readings.map((r, i) => (
                                <tr key={r._id}>
                                    <td>{i + 1}</td>
                                    <td><strong>{r.meterId?.serialNumber || '—'}</strong></td>
                                    <td>{new Date(r.readingDate).toLocaleDateString()}</td>
                                    <td>{r.value}</td>
                                    <td>{r.consumption != null ? `${r.consumption} m³` : '—'}</td>
                                    <td><MethodBadge method={r.method} /></td>
                                    <td><StatusBadge status={r.status} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════
function Readings() {
    const location = useLocation();
    const userRole = useSelector((state) => state.damrReducer.user?.role);
    const [activeTab, setActiveTab] = useState(location.state?.activeTab || (userRole === 'Staff' ? 'mine' : 'all'));

    const tabs = [
        { key: 'all',  label: 'All Readings', icon: 'ti ti-list',        roles: ['admin', 'editor'] },
        { key: 'mine', label: 'My Readings',  icon: 'ti ti-user-check',  roles: ['admin', 'editor', 'Staff'] },
    ];

    const visibleTabs = tabs.filter((t) => t.roles.includes(userRole));

    return (
        <Layout>
            <div className="page-header">
                <div className="page-block">
                    <div className="row align-items-center">
                        <div className="col-md-12">
                            <ul className="breadcrumb mb-3">
                                <li className="breadcrumb-item"><Link to="/">Dashboard</Link></li>
                                <li className="breadcrumb-item active">Reading Management</li>
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
                                            className={`nav-link ${activeTab === tab.key ? 'active' : ''}`}
                                            onClick={() => setActiveTab(tab.key)}
                                            type="button"
                                        >
                                            <i className={`${tab.icon} me-2`}></i>{tab.label}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {activeTab === 'all'  && <AllReadingsTab />}
                        {activeTab === 'mine' && <MyReadingsTab />}
                    </div>
                </div>
            </div>
        </Layout>
    );
}

export default Readings;
