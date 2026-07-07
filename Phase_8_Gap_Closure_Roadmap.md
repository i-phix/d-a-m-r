# DAMR Phase 8 — Closing the Remaining Proposal Gaps

Follow-up to the PayServe proposal roadmap (Phases 1–7, all complete). This
covers the 5 gaps found when checking the live implementation against the
proposal document itself, page by page.

---

## 1. Anomalies should gate billing, not just flag it — DONE

Today `detectAnomalies()` raises a Flag (SPIKE, DROP, ZERO_FLOW, etc.) but
`monthlyInvoices.js` / `generate_invoice.js` bill the reading regardless —
the proposal's "AI validation... flags spikes, drops and zeros **before
billing**" implies a hold, not just a note.

- [x] Policy decided: hold only for HIGH/CRITICAL severity flags — SPIKE,
      OVERNIGHT_LEAK, CRITICAL — not DROP/ERRATIC/ZERO_FLOW or the legacy
      manual-review-style types, which are common and often legitimate.
      `anomalyService.js#BLOCKING_FLAG_TYPES` / `getBlockingFlag(readingId)`.
- [x] All three invoice-creation paths (`monthlyInvoices.js`,
      `generate_invoice.js`, `bulk_generate.js`) now check
      `getBlockingFlag(lastReadingDoc._id)` before creating the invoice —
      the invoice is still created (amount already calculated, nothing to
      redo later) but with `status: "Held"` and `heldReason` set instead of
      `Unpaid`, and the resident is NOT notified.
- [x] Auto-release implemented in `resolve_flag.js`: when the resolved
      flag is a blocking type and no other open blocking flag remains on
      the same reading, any `Held` invoice for that reading flips to
      `Unpaid`/`Overdue` (based on due date) and — for the first time —
      the resident gets the normal bill notification.
- [x] Extracted a shared `services/invoiceNotificationService.js`
      (`sendInvoiceCreatedNotification`) so all three creation paths AND
      the release path send the exact same notification — previously
      three copy-pasted, slightly-drifted blocks; now one function, reused
      a fourth time by the release path with no new duplication.
- [x] Held/generated counts surfaced in cron stats (`monthlyInvoices`
      returns `{generated, held, skipped, errors}`) and in
      `bulk_generate`'s response (`{generated, held, skipped, errors,
    results}`, each result item's `status` is `"held"` or `"created"`).
      `generate_invoice.js`'s response includes `held: boolean`.
- [x] Frontend: "Held" status badge (`view_invoice.js`, `invoices.js`) plus
      an explanatory banner on the invoice detail page while held (payment
      actions are already hidden automatically — they only render for
      `Unpaid`/`Overdue`/`Partial`, and `Held` isn't in that list).
- [x] Tests: `test/crons/monthlyInvoices.test.js` (holds on SPIKE, still
      bills normally on non-blocking DROP), `test/controllers/
    resolveFlag.test.js` (release to Unpaid vs. Overdue by due date,
      stays held while a second blocking flag remains open, resolving an
      unrelated non-blocking flag never touches an unrelated Held invoice).

## 2. Reconciliation is pull-based, not automatic — DONE

Confirmed against `paymentsService.js`'s own notes: the Payments
microservice supports no webhook/callback registration (only `addAccount`,
`get_transaction_by_account_number`, `callback_url_offline`,
`addPaymentDetails` exist), so there's nothing to receive a push from.

- [x] Added `crons/payments/autoReconcile.js`, scheduled every 15 minutes
      in `index.js` (`*/15 * * * *`) alongside the existing daily/monthly
      crons, and also wired into the admin "Run Cron Now" dispatcher for
      on-demand testing.
- [x] Fixed a real double-reconciliation risk this surfaced: `appliedReceipts`
      was only tracked per-invoice, so a resident with two open invoices on
      the same Paybill account (e.g. two missed months) could have the same
      M-Pesa receipt applied to both. Added `PaymentAccount.appliedReceipts`
      as the account-level source of truth; `checkAndReconcileInvoice` now
      checks/claims receipts there, and a new `reconcileResidentInvoices()`
      walks a resident's open invoices oldest-first so a payment cascades
      correctly instead of double-counting.
- [x] Receipt notification (SMS/WhatsApp/email) fires from the cron itself
      via the shared `sendPaymentReceipt()` (moved into `paymentsService.js`
      so both the manual "Check for Payment" / "I've Paid" actions and the
      cron use the exact same function).
- [x] Manual "Check for Payment" / "I've Paid" buttons kept as-is for an
      instant option alongside the automatic polling.
- [x] Integration tests added (`test/crons/autoReconcile.test.js`): applies
      a real transaction and marks Paid, and specifically asserts the
      double-apply fix (older invoice paid, newer untouched, one receipt
      claimed once at the account level).

## 3. No resident statement of account (multi-invoice view) — DONE

The proposal promises "each resident has a running statement of account,
viewable any time — every bill, payment and receipt in one place." Only a
single-invoice public link existed before this; there was no resident login
or multi-bill view.

- [x] Access model: stayed consistent with the existing "no resident login"
      design decision — extended the tokenized-link pattern to a
      **resident-level** token instead of building real authentication.
- [x] Backend: `Resident.publicToken`/`publicTokenExpiresAt` added to
      `coreSchemas.js` (same sparse-unique-index pattern as
      `Invoice.publicToken`, same reasoning about not defaulting to
      `null`). `controllers/residents/statement.js` —
      `ensureResidentPublicToken()` (lazy generation, 90-day TTL, same as
      the per-invoice token) + `GET /public/statement/:token` (no auth)
      returning every invoice for that resident, current outstanding
      balance, and each invoice's AI-validation status. `Held` invoices
      (see #1 above) are deliberately excluded — the resident isn't meant
      to see a bill still under review.
- [x] Frontend: new standalone `statement_view.js` page (same pattern as
      `public_bill_view.js` — no `Layout`, plain axios) listing bill
      history (period/invoice ref/consumption/total/paid/balance/status)
      and a running outstanding balance. Read-only by design — paying a
      specific bill still happens via that bill's own link.
- [x] "View your full statement of account" link added to every invoice
      email/SMS notification (`emailSmsService.js#statementLinkHTML` /
      `statementLinkSmsText`), generated alongside the per-invoice bill
      link in the same `sendInvoiceCreatedNotification()` call (see #1) —
      so it appears automatically on every bill, no separate wiring needed
      per invoice-creation path.
- [x] Tests: `test/controllers/statement.test.js` (lists Paid + Unpaid,
      excludes Held, correct outstanding-balance aggregation, 404 on
      unknown token, 410 on expired token, token generation is idempotent
      while still valid).

## 4. Tariffs are per-facility only — no per-block or per-category plans — DONE

- [x] Extended `tariffPlanSchema` with optional `blockId` and `unitType`
      scoping fields (mutually exclusive by convention, enforced in the
      controller).
- [x] `getActiveTariffPlan(facilityId, {blockId, unitType})` now resolves
      most-specific-first: unit-type/category plan → block plan → facility
      default plan → `DEFAULT_PLAN` fallback.
- [x] `calcInvoice()` callers (`monthlyInvoices.js`, `generate_invoice.js`,
      `bulk_generate.js`) now pass `unitId`/`unitType` through so the right
      plan resolves; `calcInvoice` resolves `blockId` from `unitId`
      internally via `resolveBlockId()`.
- [x] **Found and fixed a real, pre-existing bug this depended on**:
      payservedb's `Unit` schema has no `blockId` field at all, so
      `controllers/facility/units.js` writing `blockId` straight onto
      `payservedb.Unit.create()`/`findByIdAndUpdate()` was always silently
      discarded by Mongoose's default strict mode (same bug class as the
      old per-unit `waterRate`) — meaning a unit's block assignment never
      actually persisted anywhere, and `?blockId=` filtering on `getUnits`
      always silently returned zero results, despite the admin UI having a
      working-looking "Block (optional)" selector the whole time. Fixed
      with a new DAMR-owned join collection (`damrSchemas.js`;
      originally named `UnitBlock`, later renamed to `UnitMeta` once it
      also started carrying `floor`/`floorId` — see #6 below), with
      `units.js`, `assign_meter.js`, and `create_resident.js` all updated
      to read/write through it instead of the phantom field.
- [x] New "Tariff Plans" tab on the Facilities page
      (`facilities.js#TariffPlansTab`) — lists a facility's active/past
      plans with their scope, and lets an admin create a new plan scoped to
      the facility default, a specific block, or a specific unit category.
- [x] Tests: `test/services/billingService.test.js` (resolution order),
      `test/controllers/units.test.js` (blockId persistence fix),
      `test/controllers/tariffPlans.test.js` (scope exclusivity +
      scope-aware deactivation).

## 5. The bill doesn't show an "AI validation" status line — DONE

- [x] Added `services/validationStatusService.js#getValidationStatus(readingId)`
      — "Passed — within normal range" (no flag), "Flagged: <type>" (open
      flag), or "Reviewed & Cleared (<type>)" (flag resolved). No new schema
      field — derived live each time from `Flag.findOne({readingId})` (Flag
      references Reading via `readingId`, not the other way around), so a
      flag resolved after billing shows as current instead of stale.
      Also added a batch variant (`getValidationStatusesForReadings`) for
      list views so a resident's full bill history costs one query, not one
      per invoice.
- [x] Wired into `invoiceEmailHTML` / `invoiceSmsText` (all three invoice
      creation paths: `generate_invoice.js`, `monthlyInvoices.js`,
      `bulk_generate.js` — the last of which also wasn't setting
      `Invoice.readingId` at all, fixed as part of this), the staff
      `view_invoice.js` detail page (via `get_invoices.js`), the public,
      no-login `public_bill_view.js`, and the resident portal's
      `resident_bills.js` (via `getMyInvoices`).
- [x] Tests added: `test/services/validationStatusService.test.js`.

## 6. Blocks/Courts/Floors were never actually registerable, and the hierarchy had no real structure — DONE

Flagged directly during this work ("Blocks or floors or courts are not
registered anywhere... it is very necessary though are not registered"):
the backend `POST /facility/blocks` endpoint worked, but nothing in the
frontend ever called it, and there was no Floor entity at all — just a
bare numeric `floor` field on Unit that (per #4 above) never even
persisted.

- [x] Built the missing "Blocks" management tab (`units.js#BlocksTab`) —
      list + create — so blocks/courts can actually be registered for the
      first time.
- [x] Fixed `Unit.floor` persistence (same silent-strict-mode-drop bug as
      `blockId`) via the same `UnitMeta` join, renamed from `UnitBlock`.
- [x] Modeled the full hierarchy explicitly: **Facility -> Block/Court
      (optional) -> Floor (optional) -> Unit**, with a flat escape hatch
      (a facility can skip blocks entirely and attach units straight to
      itself). New schemas: `Floor` (`name`, `blockId`, `facilityId`,
      `order`) and `FacilitySettings` (`facilityId`, `blockLabel`).
      `UnitMeta` extended with `floorId` (ref Floor) alongside the
      existing free-text `floor` label (changed from `Number` to `String`
      to support real labels like "G"/"B1"/"M2", not just digits).
- [x] **Per-item, mixed terminology** — a single facility can mix types at
      this tier (e.g. "Bosquet" has 3 Blocks A/B/C, a Court called
      Northwing, and a Tower, all at once). Each `Block` document carries
      its own `type` field ("Block", "Court", "Tower", "Wing", anything),
      set per group at creation time — not one label for the whole
      facility. `FacilitySettings.blockLabel` remains as the facility's
      _default_ term (used as a fallback and shown as the generic term
      elsewhere in the UI), editable via `GET/PUT /facility/facility-settings`.
- [x] **AI-assisted naming, per group** — both `createFacility`
      (`blockGroups: [{type, count, description, numFloors,
    floorDescription}, ...]`, required but an empty array is valid — a
      flat facility) and `createBlock` (single group, `count` defaults to 1) bulk-generate named child records per group via
      `generateSequentialNames()` (`aiMessageService.js`), which calls
      Gemini to match the admin's description (e.g. "northern wing and
      southern wing" for 2 -> "Northern Wing"/"Southern Wing") and, for
      floors, follows real building conventions (basements as
      "B1"/"B2"/"B3", ground as "G", mezzanines as "M1"/"M2", top as "T",
      plain ascending numbers otherwise). Always falls back to a
      deterministic non-AI scheme (`buildFallbackNames` — "<Type> A/B/C",
      "G, 1, 2, 3...") when AI is disabled/unavailable/fails, which is the
      path the test suite exercises (`AI_MESSAGES_ENABLED=false`).
- [x] **Floor count is required per group, never guessed to 1** — each
      group (whether Blocks, a Court, or a Tower) must give its own
      `numFloors` (0 is valid) or mention it in `floorDescription` (e.g.
      "this tower has 10 floors"), extracted deterministically via
      `extractCount()` (regex + number-word matching, no AI needed).
      Neither present -> a clear validation error instead of a silent
      default (`hierarchyService.js#resolveNumFloors`).
- [x] Add Unit form now cascades Facility -> Block -> Floor (real Floor
      records, fetched live) with the free-text `floor` label kept as a
      fallback for facilities/blocks with no Floor records.
- [x] Tests: `test/services/aiMessageService.test.js` (naming fallback +
      `extractCount` logic), `test/controllers/facilities.test.js`
      (`blockGroups` validation, the Bosquet mixed-type scenario,
      blockLabel round-trip), `test/controllers/blocks.test.js` (adding
      Block/Court/Tower groups incrementally to the same facility,
      per-group floor counts, floorCount, getFloors).

---

## Status: all six gaps closed

Completed in roughly this order: #5 → #4 → #6 → #2 (superseded — see below)
→ #3 → #1.

Note on #2: it was originally closed against PayServe's shared Payments
microservice (pull-based reconciliation via a 15-minute cron, since that
service exposed no webhook). DAMR has since moved off that microservice
entirely — `services/mpesaService.js` now talks to Safaricom's Daraja API
directly, with real C2B confirmation/STK callback webhooks
(`controllers/invoices/mpesa_callback.js`) landing in DAMR's own
`MpesaTransaction` collection. The 15-minute `autoReconcile` cron is kept
as a fallback for facilities that haven't registered C2B URLs yet, or in
case a webhook delivery is ever missed — not because webhooks still don't
exist.

I need to prsent this project from end to end ot the manager, from system design and the flow of everything. I need the presentation on powerpoint. The presentation should take a maximum of 25 minutes
