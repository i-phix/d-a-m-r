export const backend_url = "http://localhost:5050";

// export const backend_url = "https://api.damr.payserve.co.ke";

// M-Pesa (STK push / Paybill) is now handled entirely by our own backend
// (see backend/src/services/mpesaService.js) — the frontend only ever calls
// DAMR's own /invoices/:id/stk-push + /stk-status routes, never Safaricom
// or any external payments service directly.

export const loginURL = "/api/v1/damr/auth/login";
export const getMeURL = "/api/v1/damr/auth/me";
export const getMetersURL = "/api/v1/damr/meters";
export const getReadingsURL = "/api/v1/damr/readings";
export const getMyReadingsURL = "/api/v1/damr/readings/mine";
export const getFlagsURL = "/api/v1/damr/flags";
export const getInvoicesURL = "/api/v1/damr/invoices";
export const getResidentsURL = "/api/v1/damr/residents";
export const runCronURL = "/api/v1/damr/admin/run-cron";
export const arrearsAgeingURL = "/api/v1/damr/reports/arrears-ageing";
export const defaultersURL = "/api/v1/damr/reports/defaulters";
export const consumptionTrendsURL = "/api/v1/damr/reports/consumption-trends";
export const dashboardStatsURL = "/api/v1/damr/reports/dashboard-stats";
export const bulkMetersURL = "/api/v1/damr/facility/bulk-meters";
export const nrwReportURL = "/api/v1/damr/reports/nrw";

// Resident portal (Roadmap Phase 8)
export const myResidenciesURL = "/api/v1/damr/resident/me";
export const myReadingsPortalURL = "/api/v1/damr/resident/readings";
export const myInvoicesURL = "/api/v1/damr/resident/invoices";
