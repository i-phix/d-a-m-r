# DAMR — Manual UI End-to-End Test Procedure

Run this after the cleanup script (`cleanup_damr.ps1`) and `npm install` in both
`backend/` and `frontend/`. Start the backend (`npm start` or `npm run dev` in
`backend/`) and the frontend (`npm start` in `frontend/`) before beginning.

Work through the phases in order — each one builds on data created in the
previous phase. Check off each step as you go.

---

## Phase 0 — Environment Sanity Check

- [x] Backend starts with no errors, connects to MongoDB (check console log)
- [x] Frontend loads at `http://localhost:3000` (or your configured port)
- [x] `.env` in `backend/` has real values for: `MONGO_URI`, `JWT_SECRET`,
      `FRONTEND_BASE_URL`, `MPESA_ENV`, `MPESA_CALLBACK_BASE_URL`, and either
      global or per-facility Daraja credentials
- [x] Email/SMS/WhatsApp provider credentials are set (or you're OK with
      those notification steps below failing silently in the console)

---

## Phase 1 — Authentication & Roles

- [x] Log in as **Admin**. Confirm you land on the dashboard and see every
      facility in the system.
- [x] Log out. Attempt to visit a protected page directly by URL while
      logged out — confirm you're redirected to login.
- [x] Log back in as Admin. Create one **Facility Manager (editor)** user and
      one **Field Staff** user, both scoped to a single facility (create the
      facility first in Phase 2 if none exists yet, then come back to finish
      this step).
- [x] Log in as the **Facility Manager**. Confirm the dashboard only shows
      their assigned facility — no other facility appears anywhere,
      including in dropdowns.
- [ ] While logged in as Facility Manager, try to open a record (unit,
      resident, invoice) belonging to a **different** facility by editing the
      URL/ID directly. Confirm you get blocked (403/404), not the record.
- [ ] Log in as **Field Staff**. Confirm you can reach Meters and Readings,
      but billing, invoices, and payment settings are hidden or blocked.

---

## Phase 2 — Facility & Hierarchy Setup

- [ ] Create a new **Facility**.
- [ ] Add at least one **Complex** (try a Block, a Court, or a Tower — pick
      whichever term fits) and confirm it saves with the correct type label.
- [ ] Add a **Floor** under that complex (if your facility structure uses
      floors), then a **Unit** under the floor.
- [ ] Separately, create one **Unit** directly under the Facility (no
      complex/floor) to confirm the flat structure still works.
- [ ] Create a **Tariff Plan** and confirm you can scope it to: (a) the whole
      facility, (b) just the complex, (c) just one unit category. Save all
      three and confirm each unit resolves to the _most specific_ plan that
      applies to it.

---

## Phase 3 — Residents & Meters

- [ ] Add a **Resident** to one of the units created above. Make sure to
      fill in both an email and a phone number — later notification steps
      depend on this.
- [ ] Add a **Meter** and assign it to the same unit.
- [ ] Confirm the resident, unit, and meter all show correctly linked when
      you view any one of the three records.

---

## Phase 4 — Capturing Readings (OCR + Manual)

- [ ] Submit a reading using the **photo/OCR** path. Use a clear photo of a
      meter and confirm the digits extracted match what's in the photo (or
      correct them if OCR misreads — confirm the correction saves).
- [ ] Submit a second reading using **manual entry** for a different meter
      (or the same one, next period).
- [ ] Immediately submit a **duplicate** reading for the same meter, same
      day. Confirm it's flagged for review rather than silently accepted.

---

## Phase 5 — Anomaly Detection & Held Billing (the trust layer)

This is the feature most worth demonstrating carefully.

- [ ] Submit a reading with an extreme jump in consumption (e.g. 10x the
      unit's normal usage) to intentionally trigger a **SPIKE** flag.
      Confirm the flag appears under Flags with type SPIKE and status open.
- [ ] Go to Invoices and generate a bill for that reading's period (either
      via the manual "Generate Invoice" action or by triggering the monthly
      invoicing job — see Phase 9). Confirm the invoice is created with
      status **Held**, and that the "held reason" is visible on the invoice.
- [ ] Confirm **no email/SMS/WhatsApp went out** for this invoice (check
      your inbox/phone, and check the backend console log — it should show
      no notification attempt for this invoice).
- [ ] Open the invoice in the UI and confirm the dark "Held" banner is shown
      with the message pointing you to resolve the flag.
- [ ] Go to Flags, resolve the SPIKE flag you created.
- [ ] Go back to the invoice — confirm its status automatically changed to
      **Unpaid** (or **Overdue** if the due date already passed), the held
      reason is cleared, and a bill notification was now sent (check
      email/SMS/console log for the "Invoice ... notification results" line).
- [ ] Repeat quickly with a **non-blocking** flag type (e.g. a DROP) on a
      different reading — confirm the resulting invoice bills normally and
      is **not** held.

---

## Phase 6 — Billing Math

- [ ] On a normal (non-held) invoice, manually verify the total: tiered
      consumption rate + sewerage % + fixed tech fee, with the minimum
      charge floor applied if consumption was very low.
- [ ] Create a second invoice for the same resident, leave the first one
      unpaid, and confirm the prior balance carries forward as arrears onto
      the new invoice.
- [ ] Record a partial payment or credit against the resident (however your
      UI exposes this) and confirm it's applied oldest-invoice-first.

---

## Phase 7 — Native M-Pesa Payments

**Note:** the local diagnostic scripts used during development
(`simulate_c2b_payment.js` etc.) have been removed as part of this cleanup —
from here on, testing goes through the real UI and Safaricom's actual
sandbox. If your network still has the Safaricom-sandbox WAF block that came
up earlier, the OAuth token request may fail with a 400 error unrelated to
your code — try from a different network (mobile hotspot/VPN) if so.

- [ ] From an unpaid invoice, click **Pay Now** (STK Push). Use Safaricom's
      official sandbox test number (`254708374149`) if you don't have a real
      test line. Confirm a prompt is sent and the UI shows a pending state.
- [ ] Approve (or simulate approval per Safaricom's sandbox docs) and
      confirm the invoice updates to **Paid** without a page refresh/poll
      delay beyond what's expected.
- [ ] From the resident's public bill link (see Phase 8), repeat the STK
      Push flow with no login — confirm it behaves identically.
- [ ] If a facility Paybill/C2B is registered, send a test payment into it
      and confirm the confirmation webhook lands and reconciles against the
      correct open invoice automatically (may take up to the auto-reconcile
      cron's interval if the webhook itself is delayed — see Phase 9).
- [ ] Record one **offline/cash** payment manually through the UI and
      confirm it reconciles the same way a Paybill payment would.

---

## Phase 8 — Resident Self-Service

- [ ] Open an invoice's **public bill link** (no login) in a private/incognito
      window. Confirm it loads and shows the correct amount, due date, and
      AI validation status line.
- [ ] Open the resident's **statement of account** link. Confirm it lists
      every non-Held invoice with a correct running outstanding balance, and
      that any Held invoice from Phase 5 is **excluded** from both the list
      and the balance total (until it's released).
- [ ] Let a token expire (or manually check the 90-day expiry logic if you
      can adjust the date) and confirm an expired statement link returns a
      clear "expired" message rather than an error page.
- [ ] If a resident portal login exists, log in as the resident and confirm
      they only see their own readings and bills.

---

## Phase 9 — Automation (Scheduled Jobs)

For each job, use its manual "Run Now" trigger rather than waiting on the
clock:

- [ ] **Monthly Invoicing** — run it and confirm invoices are generated for
      all eligible units, correctly split between normal and Held.
- [ ] **Upcoming/Overdue Reminders** — run it and confirm reminder
      notifications go out for invoices approaching or past their due date.
- [ ] **Daily Anomaly Scan** — run it and confirm it catches a unit with a
      missing reading for the period.
- [ ] **Auto-Reconcile Payments** — run it and confirm any unclaimed M-Pesa
      or cash transaction from Phase 7 gets matched to its invoice.

---

## Phase 10 — Regression Pass

- [ ] Log out and log back in as each of the three roles one more time and
      spot-check that nothing from the steps above broke another role's
      view (e.g. Field Staff still can't see invoices, Facility Manager
      still can't see another facility).
- [ ] Restart the backend once and confirm all of the above still works —
      this catches anything that only worked because of in-memory state.

---

## If Something Fails

Note the phase/step number, what you expected vs. what happened, and any
console error text (backend terminal + browser dev tools console) — that's
what's needed to reproduce and fix the issue.
