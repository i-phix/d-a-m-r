# DAMR — Digital Automated Meter Reading

DAMR is a water-utility billing system for multi-facility residential/commercial properties. It covers the full loop from meter reading to invoice to payment: field staff capture readings (manually or via photo + AI vision OCR), the system automatically flags anomalous consumption before it gets billed, tiered-rate invoices are generated on a schedule, and residents pay by M-Pesa (STK push or Paybill) without ever needing to create an account.

It's built as two independent apps in this repo: a Node/Express/MongoDB API (`backend/`) and a React SPA (`frontend/`).

## Key features

**Meter & reading management** — register meters against units, capture readings by typing a value or uploading a photo. Photos are run through Gemini vision to both extract a reading and cross-check it against the value staff typed in, flagging a mismatch if they disagree.

**Anomaly detection** — every new reading is checked against that meter's own consumption history. Usage more than 3 standard deviations above normal is flagged `SPIKE`; unusual overnight-hours usage is flagged `OVERNIGHT_LEAK` (escalating to `CRITICAL` if both conditions hit); a reading lower than the last one is treated as a possible meter reset rather than negative consumption. Leak-suggestive flags notify the resident directly, not just facility staff.

**Anomaly-gated billing** — an invoice generated against a reading that still has an unresolved high-severity flag is created but held (status `Held`) and the resident is never notified, until a staff member resolves the flag — at which point the invoice is released and the bill notification goes out for the first time.

**Tiered billing engine** — per-facility tariff plans with rate bands (e.g. first 6m³ at one rate, everything above at another), a sewerage percentage, a tech fee, an optional late-payment penalty, and a configurable due-date offset. Plans can be scoped to a whole facility, a specific block, or a unit category, resolved most-specific-first. All invoice math goes through a single shared calculation function — no duplicated billing logic.

**Payments** — native M-Pesa/Daraja integration, no third-party payments microservice in the loop. Three paths converge on the same invoice: STK push (frontend polls status while Safaricom's async callback applies the result), direct Paybill top-up reconciled automatically via Safaricom's C2B webhook (backed by a 15-minute polling cron as a safety net), and manual cash recording by staff. Every manual edit to an invoice is appended to an audit trail (`editHistory`) rather than overwriting the record.

**Resident access without accounts** — bill and statement-of-account links are tokenized and unauthenticated; the random token is the credential. This is the channel every SMS/email notification points at. A smaller resident portal (email + national ID login) exists for residents who want to check their own readings/invoices directly.

**User management** — admins can list all staff accounts, delete one, or reset a user's password. Passwords are bcrypt-hashed and never retrievable in plaintext, by design — "reset" is the only recovery path.

**Reporting** — arrears ageing, defaulters list, consumption trends, non-revenue water (NRW) report, and a dashboard stats endpoint.

## Tech stack

**Backend**: Node.js, Express 5, MongoDB via Mongoose 8, JWT auth, bcryptjs, node-cron for scheduled jobs, Multer + Sharp for image uploads, `@google/genai` (Vertex AI) for Gemini vision OCR, native Safaricom Daraja (M-Pesa) integration, Nodemailer for email.

**Frontend**: React 18, Redux Toolkit + redux-persist, React Router 6, Bootstrap 5 (CDN), PrimeReact/PrimeIcons, Chart.js/Recharts for reporting views, jsPDF + html2canvas for PDF invoice export, SheetJS (xlsx) for spreadsheet export, Google Places Autocomplete for address fields.

## Project structure

```
d-a-m-r/
├── backend/
│   ├── index.js                 # app entrypoint — middleware, routes, cron schedules
│   └── src/
│       ├── routes/index.js      # every API route, single file
│       ├── controllers/         # one file per endpoint, grouped by resource
│       │   ├── auth/            # login, register, get_me
│       │   ├── users/           # admin user management (list/delete/reset password)
│       │   ├── meters/ readings/ flags/ invoices/ residents/
│       │   ├── facility/        # facilities, blocks/complex, units, locations, tariff plans
│       │   ├── reports/         # arrears, defaulters, consumption, NRW
│       │   └── admin/           # manual cron trigger
│       ├── services/            # billingService, anomalyService, mpesaService,
│       │                        # paymentsService, ocrService, aiMessageService,
│       │                        # emailSmsService, invoiceNotificationService
│       ├── crons/                # monthlyInvoices, overdueReminders,
│       │                        # upcomingDueReminders, dailyAnomalyScan, autoReconcile
│       ├── middleware/           # auth (protect/role guards), upload (Multer)
│       └── utils/                # coreSchemas (User/Facility/Unit/Resident),
│                                  # damrSchemas (Meter/Reading/Flag/Invoice/...),
│                                  # accessControl (facility-scoping), dbConnection
└── frontend/
    └── src/
        ├── components/
        │   ├── authentication/          # login
        │   ├── facility/utility_management/meter_reading_management/
        │   │   ├── meter_management/ reading_management/ flag_management/
        │   │   ├── invoice_management/  # list, detail, pay page
        │   │   ├── resident_management/ facility_management/ user_management/
        │   │   ├── dashboard/ reports/
        │   ├── resident_portal/         # logged-in resident views
        │   └── public/                  # tokenized bill/statement views (no auth)
        ├── router/routes.js             # all frontend routes
        ├── features/damr/damrReducer.js # Redux slice (current user, token, etc.)
        └── utils/                       # makeRequest (axios wrapper), urls, formatDate
```

## Roles & permissions

| Role             | Value                    | Access                                                                                                        |
| ---------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Admin            | `admin`                  | Everything — all facilities, user management, tariff plans, cron trigger                                      |
| Facility Manager | `editor`                 | Scoped to their own `facilityId` — can manage meters/readings/invoices/residents/staff for that facility only |
| Field Staff      | `Staff`                  | Submit readings, view flags — no billing/user-management access                                               |
| Resident         | `user` (type `Resident`) | Their own readings/invoices only, via the resident portal login or a tokenized public link                    |

Facility scoping for Facility Managers is enforced on both list endpoints (filtered at the query level) and single-item fetch-by-id endpoints (checked post-fetch via `accessControl.denyIfFacilityMismatch`) — an FM cannot access another facility's data even by guessing an ID.

## Getting started

### Prerequisites

- Node.js 18+
- A running MongoDB instance (local or hosted)
- A Google Cloud project with Vertex AI enabled, if you want meter-reading OCR to work (`gcloud auth application-default login` for local dev)
- Safaricom Daraja sandbox/production credentials, if you want M-Pesa payments to work

### Backend

```bash
cd backend
npm install
cp .env.example .env   # then fill in real values
npm run dev             # node --watch index.js
```

The API listens on `PORT` (default `5050`) under the `/api/v1/damr` prefix. Cron jobs (monthly invoicing, overdue/upcoming-due reminders, daily anomaly scan, 15-minute payment reconciliation) are scheduled in-process on startup — see `backend/index.js`.

### Frontend

```bash
cd frontend
npm install
npm start
```

The frontend's backend URL is currently a hardcoded constant in `frontend/src/utils/urls.js` (`backend_url`), not an environment variable — edit that file directly to point at a different backend, or wire it up to read `REACT_APP_BACKEND_URL` from `.env` (a `.env.example` already exists with that variable, it's just not consumed yet).

## Environment variables (backend)

See `backend/.env.example` for the full list with inline comments. Grouped summary:

- **Core**: `PORT`, `ALLOWED_ORIGINS`, `FRONTEND_BASE_URL`
- **MongoDB**: `MONGODB_DB_NAME`, `MONGODB_SECURED`, `MONGODB_USER`, `MONGODB_PASSWORD`, `MONGODB_HOST`, `MONGODB_PORT`
- **Auth**: `JWT_SECRET`, `JWT_EXPIRES_IN`
- **Uploads**: `UPLOADS_DIR`
- **AI / OCR**: `GOOGLE_VISION_API_KEY`, `AI_MESSAGES_ENABLED`, `GEMINI_MODEL`, `GOOGLE_GENAI_USE_VERTEXAI`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`
- **Google APIs**: `GOOGLE_TRANSLATE_API_KEY`, `GOOGLE_PLACES_API_KEY`
- **M-Pesa**: `MPESA_ENV`, `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_CALLBACK_BASE_URL`
- **Notifications**: `COMMUNICATIONS_ENDPOINT`, `SENDERID`, `API_KEY`, `DAMR_SMS_FACILITY_ID`, `EMAIL_*`, `DAMR_EMAIL_FACILITY_ID`, `UTILITY_WHATSAPP_ENABLED`, `ADMIN_EMAIL`
- **Internal**: `MAIN_BACKEND_URL`, `INTERNAL_SERVICE_TOKEN`

## API overview

Everything is under `/api/v1/damr`. Grouped by resource:

- `POST /auth/login`, `GET /auth/me`, `POST /auth/register` (admin/FM only, creates staff accounts)
- `GET/POST /users`, `DELETE /users/:id`, `PUT /users/:id/password` (admin only)
- `GET/POST /meters`, `GET /meters/:id`, `PATCH /meters/:id/assign`
- `POST /readings/upload`, `POST /readings/scan`, `POST /readings/manual`, `GET /readings`
- `GET /flags`, `GET /flags/:id`, `PATCH /flags/:id/resolve`, `PATCH /flags/:id/notes`
- `POST /invoices/generate`, `POST /invoices/bulk`, `GET /invoices`, `GET/PUT /invoices/:id`
- `GET /invoices/:id/payment-info`, `POST /invoices/:id/check-payment`, `POST /invoices/:id/stk-push`, `GET /invoices/:id/stk-status`, `POST /invoices/:id/cash-payment`
- `POST /invoices/credits`, `GET /invoices/credits`, `PATCH /invoices/credits/:id/void`
- `POST /mpesa/stk-callback`, `POST /mpesa/c2b-validation`, `POST /mpesa/c2b-confirmation` — Safaricom webhooks, unauthenticated by necessity
- `GET /invoices/:id/public-link`, `GET /public/bill/:token`, `GET /public/statement/:token` — tokenized resident-facing links, no auth
- `POST/GET /residents`, `GET /residents/:id`, `GET /residents/:id/history`, `DELETE /residents/:id`
- `POST/GET/PUT/DELETE /facility/locations`, `/facility/facilities`, `/facility/blocks`, `/facility/units`, `/facility/tariff-plans`
- `GET /facility/floors`, `POST/GET /facility/bulk-meters`
- `GET /reports/arrears-ageing`, `/reports/defaulters`, `/reports/consumption-trends`, `/reports/dashboard-stats`, `/reports/nrw`
- `GET /resident/me`, `/resident/readings`, `/resident/invoices` — logged-in resident portal
- `POST /admin/run-cron` (admin only) — manually trigger any scheduled job on demand

## Security notes

- Never commit `backend/.env` or `frontend/.env` — see the repo-root `.gitignore`. Use `backend/.env.example` / `frontend/.env.example` as the template for what to fill in.
- Passwords are bcrypt-hashed; there is no way to view an existing user's password, by admin or anyone else. Password recovery is reset-only.
- JWTs are stored client-side (via `localforage`) rather than in an httpOnly cookie — standard SPA tradeoff, but be mindful of XSS exposure if adding any HTML-rendering feature to the frontend.
