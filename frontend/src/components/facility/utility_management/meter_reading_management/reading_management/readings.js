import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import axios from 'axios';
import * as XLSX from 'xlsx';
import Layout from '../../../../layout/Layout';
import { makeAuthRequest } from '../../../../../utils/makeRequest';
import { toastify } from '../../../../../utils/toast';
import {
    getReadingsURL,
    getMyReadingsURL,
    importReadingsURL,
    importReadingsTemplateURL,
    backend_url,
} from '../../../../../utils/urls';
import { getItem } from '../../../../../utils/localStorage';
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
const IMPORT_READING_HEADER_MAP = {
    meterserial: 'meterSerial',
    serial: 'meterSerial',
    serialnumber: 'meterSerial',
    meter: 'meterSerial',
    value: 'value',
    readingvalue: 'value',
    reading: 'value',
    readingdate: 'readingDate',
    date: 'readingDate',
    notes: 'notes',
    notesoptional: 'notes',
    note: 'notes',
};

function normalizeReadingImportRow(raw) {
    const row = {};
    Object.entries(raw).forEach(([key, value]) => {
        const normKey = String(key)
            .trim()
            .toLowerCase()
            .replace(/[\s_()\-‐‑‒–—]+/g, '');
        const mapped = IMPORT_READING_HEADER_MAP[normKey];
        if (!mapped) return;
        row[mapped] = typeof value === 'string' ? value.trim() : value;
    });
    return row;
}
function isBlankReadingRow(row) {
    return Object.entries(row).every(
        ([key, v]) => key === 'readingDate' || String(v || '').trim() === '',
    );
}

function ImportReadingsTab({ onSuccess }) {
    const csvInputRef = useRef(null);
    const excelInputRef = useRef(null);
    const photosInputRef = useRef(null);
    const [fileName, setFileName] = useState('');
    const [propertyName, setPropertyName] = useState('');
    const [rows, setRows] = useState([]);
    const [parseErrors, setParseErrors] = useState([]);
    const [importing, setImporting] = useState(false);
    const [downloadingTemplate, setDownloadingTemplate] = useState(false);
    const [results, setResults] = useState(null);
    const [photoMap, setPhotoMap] = useState({});

    const handleDownloadTemplate = async () => {
        try {
            setDownloadingTemplate(true);
            const damrUser = await getItem('DAMR_USER');
            const res = await axios.get(`${backend_url}${importReadingsTemplateURL}`, {
                responseType: 'blob',
                headers: { Authorization: `Bearer ${damrUser?.token}` },
            });
            const url = URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'reading_import_template.xlsx';
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            let msg = err.message;
            if (err.response?.data instanceof Blob) {
                try {
                    const text = await err.response.data.text();
                    msg = JSON.parse(text).error || msg;
                } catch {
                }
            }
            toastify(`Could not download template: ${msg}`, 'error');
        } finally {
            setDownloadingTemplate(false);
        }
    };
    const handlePhotosChange = (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        const newMap = { ...photoMap };
        let matchedCount = 0;
        const unmatchedNames = [];

        files.forEach((file) => {
            const base = file.name.replace(/\.[^.]+$/, '').toLowerCase();
            const idx = rows.findIndex((r) => {
                const serial = String(r.meterSerial || '').trim().toLowerCase();
                return serial && base.includes(serial);
            });
            if (idx !== -1) {
                newMap[idx] = file;
                matchedCount++;
            } else {
                unmatchedNames.push(file.name);
            }
        });

        setPhotoMap(newMap);
        if (matchedCount > 0) {
            toastify(
                `Matched ${matchedCount} photo(s) to rows by serial number in the filename` +
                    (unmatchedNames.length > 0 ? `; ${unmatchedNames.length} file(s) didn't match any row` : ''),
                unmatchedNames.length > 0 ? 'warn' : 'success',
            );
        } else {
            toastify(
                "No photos matched — make sure each filename contains that row's meter serial number",
                'error',
            );
        }
        if (photosInputRef.current) photosInputRef.current.value = '';
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setFileName(file.name);
        setResults(null);
        setPhotoMap({}); 

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                const isOwnTemplate =
                    workbook.SheetNames.includes('Property') &&
                    workbook.SheetNames.includes('Readings');

                let property = '';
                let dataSheetName = workbook.SheetNames[0];
                if (isOwnTemplate) {
                    const propertyCell = workbook.Sheets['Property']['A2'];
                    property = propertyCell ? String(propertyCell.v || '').trim() : '';
                    dataSheetName = 'Readings';
                }

                const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[dataSheetName], {
                    defval: '',
                    raw: false,
                });

                const normalized = rawRows.map(normalizeReadingImportRow).filter((r) => !isBlankReadingRow(r));
                const errors = [];
                normalized.forEach((row, i) => {
                    if (!row.meterSerial) {
                        errors.push(`Row ${i + 1}: missing meter serial number`);
                    } else if (!row.value) {
                        errors.push(`Row ${i + 1}: missing reading value`);
                    }
                });

                setPropertyName(property);
                setRows(normalized);
                setParseErrors(errors);

                if (normalized.length === 0) {
                    toastify('No rows found in file', 'warn');
                } else {
                    toastify(
                        `Parsed ${normalized.length} row(s)${property ? ` for ${property}` : ''} — review below and click Import`,
                        'info',
                    );
                }
            } catch (err) {
                toastify(`Could not read file: ${err.message}`, 'error');
                setRows([]);
                setParseErrors([]);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleImport = async () => {
        if (rows.length === 0) {
            toastify('Choose a file to import first', 'error');
            return;
        }
        try {
            setImporting(true);
            setResults(null);
            const formData = new FormData();
            formData.append('readings', JSON.stringify(rows));
            Object.entries(photoMap).forEach(([index, file]) => {
                formData.append(`photo_${index}`, file);
            });

            const res = await makeAuthRequest(importReadingsURL, 'POST', formData);
            if (res.success) {
                const summary = res.data;
                setResults(summary);
                toastify(
                    `Import complete — ${summary.created} created, ${summary.skipped} skipped, ${summary.errors} errors` +
                        (summary.pending ? `, ${summary.pending} held pending (serial number mismatch)` : '') +
                        (summary.flagged ? `, ${summary.flagged} flagged for review` : '') +
                        (summary.withPhoto ? `, ${summary.withPhoto} with a photo cross-checked` : ''),
                    summary.errors > 0 || summary.pending > 0 ? 'warn' : 'success',
                );
                if (onSuccess) onSuccess();
            } else {
                toastify(res.error, 'error');
            }
        } catch (err) {
            toastify(err.message, 'error');
        } finally {
            setImporting(false);
        }
    };

    const handleClear = () => {
        setPhotoMap({});
        setFileName('');
        setPropertyName('');
        setRows([]);
        setParseErrors([]);
        setResults(null);
        if (csvInputRef.current) csvInputRef.current.value = '';
        if (excelInputRef.current) excelInputRef.current.value = '';
        if (photosInputRef.current) photosInputRef.current.value = '';
    };

    const resultBadge = (status) =>
        ({
            created: 'bg-success',
            skipped: 'bg-warning',
            error: 'bg-danger',
        })[status] || 'bg-secondary';

    return (
        <div className="card-body">
            <div className="d-flex justify-content-end align-items-start mb-2">
                <div className="btn-group" role="group" aria-label="Import readings">
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
                        style={{ borderRadius: 0, backgroundColor: '#fd7e14' }}
                        disabled={downloadingTemplate}
                        onClick={handleDownloadTemplate}
                    >
                        <i className="ti ti-download me-1"></i>
                        {downloadingTemplate ? 'Preparing...' : 'Download Template'}
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
                    Columns: meterSerial (required — must match an already-assigned
                    meter), value (required), readingDate (optional — defaults to
                    today), notes (optional).
                    {fileName && <> Selected: <strong>{fileName}</strong></>}
                    {propertyName && <> · Property: <strong>{propertyName}</strong></>}
                </small>
            </div>

            {parseErrors.length > 0 && (
                <div className="alert alert-warning py-2">
                    <strong>{parseErrors.length} row(s) will be skipped:</strong>
                    <ul className="mb-0">
                        {parseErrors.slice(0, 5).map((e, i) => (
                            <li key={i}>{e}</li>
                        ))}
                        {parseErrors.length > 5 && <li>...and {parseErrors.length - 5} more</li>}
                    </ul>
                </div>
            )}

            {rows.length > 0 && !results && (
                <>
                    <div className="d-flex justify-content-between align-items-center mb-2">
                        <small className="text-muted">
                            Optional: attach meter photos for an OCR cross-check against the
                            keyed value — name each file with that row's meter serial number
                            (e.g. <code>SN1023.jpg</code>) and they'll be matched automatically.
                        </small>
                        <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm text-nowrap ms-2"
                            onClick={() => photosInputRef.current?.click()}
                        >
                            <i className="ti ti-camera me-1"></i>
                            Attach Photos
                            {Object.keys(photoMap).length > 0 && ` (${Object.keys(photoMap).length} matched)`}
                        </button>
                        <input
                            ref={photosInputRef}
                            type="file"
                            className="d-none"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            onChange={handlePhotosChange}
                        />
                    </div>

                    <div className="table-responsive mb-3" style={{ maxHeight: 320, overflowY: 'auto' }}>
                        <table className="table table-sm table-hover">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Meter Serial</th>
                                    <th>Value</th>
                                    <th>Reading Date</th>
                                    <th>Notes</th>
                                    <th>Photo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r, i) => (
                                    <tr key={i} className={!r.meterSerial || !r.value ? 'table-danger' : ''}>
                                        <td>{i + 1}</td>
                                        <td>{r.meterSerial || <span className="text-danger">missing</span>}</td>
                                        <td>{r.value || <span className="text-danger">missing</span>}</td>
                                        <td>{r.readingDate || 'today'}</td>
                                        <td>{r.notes || '—'}</td>
                                        <td>
                                            {photoMap[i] ? (
                                                <span className="badge bg-success" title={photoMap[i].name}>
                                                    <i className="ti ti-check me-1"></i>attached
                                                </span>
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="text-end">
                        <button className="btn btn-secondary me-2" onClick={handleClear}>
                            Clear
                        </button>
                        <button className="btn btn-primary" disabled={importing} onClick={handleImport}>
                            {importing ? (
                                'Importing...'
                            ) : (
                                <>
                                    <i className="ti ti-upload me-2"></i>
                                    Import {rows.length} Reading{rows.length === 1 ? '' : 's'}
                                </>
                            )}
                        </button>
                    </div>
                </>
            )}

            {results && (
                <div>
                    <div className="row mb-3">
                        <div className="col">
                            <div className="alert alert-success mb-0 text-center">
                                <div className="fs-4 fw-bold">{results.created}</div>
                                Created
                            </div>
                        </div>
                        <div className="col">
                            <div className="alert alert-primary mb-0 text-center">
                                <div className="fs-4 fw-bold">{results.pending || 0}</div>
                                Pending Verification
                            </div>
                        </div>
                        <div className="col">
                            <div className="alert alert-info mb-0 text-center">
                                <div className="fs-4 fw-bold">{results.flagged || 0}</div>
                                Flagged for Review
                            </div>
                        </div>
                        <div className="col">
                            <div className="alert alert-warning mb-0 text-center">
                                <div className="fs-4 fw-bold">{results.skipped}</div>
                                Skipped
                            </div>
                        </div>
                        <div className="col">
                            <div className="alert alert-danger mb-0 text-center">
                                <div className="fs-4 fw-bold">{results.errors}</div>
                                Errors
                            </div>
                        </div>
                    </div>

                    <div className="table-responsive mb-3" style={{ maxHeight: 320, overflowY: 'auto' }}>
                        <table className="table table-sm table-hover">
                            <thead>
                                <tr>
                                    <th>Row</th>
                                    <th>Meter Serial</th>
                                    <th>Status</th>
                                    <th>Message</th>
                                    <th>Photo</th>
                                    <th>Flag</th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.results.map((r) => (
                                    <tr key={r.row}>
                                        <td>{r.row}</td>
                                        <td>{r.serialNumber || '—'}</td>
                                        <td>
                                            {r.pending ? (
                                                <span className="badge bg-primary" title="Awaiting a matching photo/serial number before it's confirmed">
                                                    pending
                                                </span>
                                            ) : (
                                                <span className={`badge ${resultBadge(r.status)}`}>{r.status}</span>
                                            )}
                                        </td>
                                        <td>
                                            {r.message ||
                                                (r.pending
                                                    ? r.flag === 'serial_mismatch'
                                                        ? "Recorded, held pending — photo's serial number didn't match"
                                                        : "Recorded, held pending — couldn't read a serial number off the photo"
                                                    : r.status === 'created'
                                                        ? 'Reading recorded'
                                                        : '')}
                                        </td>
                                        <td>
                                            {r.photo ? (
                                                <i
                                                    className="ti ti-camera text-primary"
                                                    title={r.ocrChecked ? 'Photo attached — OCR cross-checked' : 'Photo attached'}
                                                ></i>
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                        <td>
                                            {r.flag ? (
                                                <span className="badge bg-danger" title="Anomaly flag raised">
                                                    {r.flag.replace(/_/g, ' ')}
                                                </span>
                                            ) : r.duplicate ? (
                                                <span className="badge bg-secondary" title="Another reading exists for this meter the same day">
                                                    duplicate
                                                </span>
                                            ) : (
                                                '—'
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
                    style={{ border: '2px dashed #dee2e6' }}
                >
                    <i className="ti ti-file-upload text-muted" style={{ fontSize: '48px' }}></i>
                    <p className="text-muted mt-2 mb-0">
                        Click CSV or Excel above to choose a file and preview readings before importing
                    </p>
                </div>
            )}
        </div>
    );
}
function Readings() {
    const location = useLocation();
    const userRole = useSelector((state) => state.damrReducer.user?.role);
    const [activeTab, setActiveTab] = useState(location.state?.activeTab || (userRole === 'Staff' ? 'mine' : 'all'));

    const tabs = [
        { key: 'all',    label: 'All Readings',    icon: 'ti ti-list',         roles: ['admin', 'editor'] },
        { key: 'mine',   label: 'My Readings',     icon: 'ti ti-user-check',   roles: ['admin', 'editor', 'Staff'] },
        { key: 'import', label: 'Import Readings', icon: 'ti ti-file-import', roles: ['admin', 'editor', 'Staff'] },
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

                        {activeTab === 'all'    && <AllReadingsTab />}
                        {activeTab === 'mine'   && <MyReadingsTab />}
                        {activeTab === 'import' && <ImportReadingsTab onSuccess={() => {}} />}
                    </div>
                </div>
            </div>
        </Layout>
    );
}

export default Readings;
