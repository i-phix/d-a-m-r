const mongoose = require("mongoose");
const { getModel } = require("./getModel");
const meterSchema = new mongoose.Schema(
  {
    serialNumber: { type: String, required: true, unique: true, trim: true },
    manufacturer: { type: String, trim: true },
    model: { type: String, trim: true },
    meterType: {
      type: String,
      enum: ["analogue", "digital"],
      default: "analogue",
    },
    installationDate: { type: Date, default: Date.now },
    initialReading: { type: Number, default: 0 },
    condition: {
      type: String,
      enum: ["new", "used", "replaced"],
      default: "new",
    },
    // A meter is either bound to a unit or it isn't — "UNOCCUPIED" used to
    // exist as a third in-between state for "still bound to the unit, but
    // no resident currently lives there," which just confused the
    // Assigned/Unassigned distinction. A meter stays ASSIGNED for as long
    // as it's physically installed on a unit, regardless of whether that
    // unit currently has a resident (see delete_resident.js, which now
    // just clears currentResident instead of downgrading the status).
    status: {
      type: String,
      enum: ["UNASSIGNED", "ASSIGNED", "FAULTY"],
      default: "UNASSIGNED",
    },
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      default: null,
    },
    blockId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Block",
      default: null,
    },
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Facility",
      default: null,
    },
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
    }, // Current resident binding
    currentResident: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resident",
      default: null,
    },
    lastReadingValue: { type: Number, default: null },
    lastReadingDate: { type: Date, default: null },
    lastReadingBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    openFlagCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);
const meterBindingSchema = new mongoose.Schema(
  {
    meterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Meter",
      required: true,
    },
    residentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resident",
      required: true,
    },
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      required: true,
    },
    bindDate: { type: Date, default: Date.now },
    unbindDate: { type: Date, default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
const readingSchema = new mongoose.Schema(
  {
    meterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Meter",
      required: true,
    },
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      default: null,
    },
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Facility",
      default: null,
    },
    readingDate: { type: Date, default: Date.now },
    value: { type: Number, required: true },
    previousValue: { type: Number, default: null },
    consumption: { type: Number, default: null },
    method: { type: String, enum: ["ocr", "manual"], default: "manual" },
    imageUrl: { type: String, default: null },
    ocrRawValue: { type: String, default: null },
    ocrConfidence: { type: Number, default: null },
    status: {
      type: String,
      enum: ["pending", "confirmed", "rejected"],
      default: "pending",
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    notes: { type: String, default: null },
  },
  { timestamps: true },
);
const flagSchema = new mongoose.Schema(
  {
    meterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Meter",
      required: true,
    },
    readingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reading",
      default: null,
    },
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Facility",
      default: null,
    },
    type: {
      type: String,
      enum: [
        "high_consumption",
        "ocr_mismatch",
        "missing_reading",
        "manual_review",
        "duplicate_submission",
        "SPIKE",
        "DROP",
        "ZERO_FLOW",
        "OVERNIGHT_LEAK",
        "ERRATIC",
        "CRITICAL",
      ],
      required: true,
    },
    status: { type: String, enum: ["open", "resolved"], default: "open" },
    description: { type: String },
    notes: { type: String, default: null },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolvedAt: { type: Date, default: null },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

// Invoices
const invoiceSchema = new mongoose.Schema(
  {
    meterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Meter",
      required: true,
    },
    // The specific Reading whose value was billed (the latest reading in
    // the period) — lets the invoice detail view surface the meter photo
    // that reading was captured with, when it exists (OCR path only;
    // manual readings have no photo). Optional since older invoices
    // predate this field.
    readingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reading",
      default: null,
    },
    residentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resident",
      required: true,
    },
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      default: null,
    },
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Facility",
      default: null,
    },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    consumption: { type: Number, required: true },
    ratePerUnit: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },
    balance: { type: Number, default: null },
    status: {
      type: String,
      // "Held" — Roadmap Phase 8, #1 (anomaly-gated billing). Set instead of
      // "Unpaid" at creation time when the billed reading has an unresolved
      // high-severity flag (SPIKE/OVERNIGHT_LEAK/CRITICAL) — the invoice
      // exists (amount already calculated) but the resident is never
      // notified of it until a staff member resolves the flag, at which
      // point it's auto-released to "Unpaid"/"Overdue" and the normal bill
      // notification fires for the first time. See anomalyService.js
      // (getBlockingFlag) and resolve_flag.js (the auto-release).
      enum: ["Unpaid", "Paid", "Partial", "Void", "Overdue", "Held"],
      default: "Unpaid",
    },
    // Which flag (id + type) put this invoice on hold, e.g. "SPIKE: 6a1b2c...".
    // Null once released or if the invoice was never held. Purely
    // informational — release logic re-checks Flag.status directly rather
    // than trusting this field alone.
    heldReason: { type: String, default: null },
    mpesaCode: { type: String, default: null }, // most recent applied receipt, kept for backward-compat display
    // Every M-Pesa receipt number already reconciled against this invoice —
    // prevents double-counting the same Paybill transaction across repeated
    // "Check for Payment" clicks, and supports multiple partial payments.
    appliedReceipts: { type: [String], default: [] },
    paidAt: { type: Date, default: null },
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // ── Phase 2 billing engine additions ─────────────────────────────
    dueDate: { type: Date, default: null },
    tariffPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TariffPlan",
      default: null,
    },
    // Itemized, persisted charge breakdown — previously computed once and
    // returned only in the generation API response, never saved, so it
    // couldn't be viewed again from the invoice detail page.
    breakdown: {
      bands: [
        {
          _id: false,
          from: Number,
          to: { type: Number, default: null }, // null = unbounded top band
          units: Number,
          rate: Number,
          amount: Number,
        },
      ],
      waterCharge: { type: Number, default: 0 },
      sewerageCharge: { type: Number, default: 0 },
      techFee: { type: Number, default: 0 },
      minimumChargeApplied: { type: Boolean, default: false },
      arrears: { type: Number, default: 0 },
      creditsApplied: { type: Number, default: 0 },
      penalty: { type: Number, default: 0 },
    },
    penaltyApplied: { type: Boolean, default: false },
    // Idempotency guards for the "before due date" / "on due date" reminders
    // (crons/invoicing/upcomingDueReminders.js) — the daily cron would
    // otherwise re-send the same reminder every day it runs. The "after due
    // date" reminder (overdueReminders.js) intentionally has no such guard;
    // it's meant to keep nagging until the invoice is paid.
    remindersSent: {
      upcoming: { type: Boolean, default: false },
      dueToday: { type: Boolean, default: false },
    },
    // Public, tokenized bill link (Roadmap Phase 3) — lets a resident view
    // and pay this invoice without logging in. Generated on first request
    // (see controllers/invoices/public_bill.js) rather than at creation
    // time, so invoices that are never shared never get a token at all.
    // No `default: null` here on purpose — a sparse index only excludes
    // documents where the path is truly absent (undefined), not documents
    // where it's explicitly set to `null`. With a default of `null`, every
    // untokenized invoice would store an explicit null and collide on this
    // unique index the moment a second one existed (surfaced by
    // bulk_generate.js, which doesn't eagerly tokenize like the other two
    // invoice-creation paths do). Leaving the path unset until
    // ensurePublicToken() assigns a real token keeps the sparse index
    // actually sparse.
    publicToken: { type: String, unique: true, sparse: true },
    publicTokenExpiresAt: { type: Date, default: null },
    // Free-text internal note (not shown to the resident) — set via the
    // manual "Edit" action on the invoice list/detail view.
    notes: { type: String, default: null },
    // Audit trail for manual edits (controllers/invoices/update_invoice.js).
    // Every dueDate/status/notes/breakdown/totalAmount change made through
    // that endpoint is appended here rather than silently overwritten, so
    // "why doesn't this invoice match what the tariff engine computed"
    // always has an answer.
    editHistory: {
      type: [
        {
          _id: false,
          editedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          editedAt: { type: Date, default: Date.now },
          changes: [
            {
              _id: false,
              field: String,
              before: mongoose.Schema.Types.Mixed,
              after: mongoose.Schema.Types.Mixed,
            },
          ],
          reason: { type: String, default: null },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

// Lazy-register models (safe to call multiple times)
const getMeter = () => getModel("Meter", meterSchema);
const getMeterBinding = () => getModel("MeterBinding", meterBindingSchema);
const getReading = () => getModel("Reading", readingSchema);
const getFlag = () => getModel("Flag", flagSchema);
const getInvoice = () => getModel("MeterInvoice", invoiceSchema);

// exports below

// ── OccupancyHistory ──────────────────────────────────────────────────
const occupancyHistorySchema = new mongoose.Schema(
  {
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      required: true,
    },
    residentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resident",
      required: true,
    },
    moveInDate: { type: Date, default: Date.now },
    moveOutDate: { type: Date, default: null },
    moveOutReason: {
      type: String,
      enum: ["transfer", "eviction", "lease_end", "other"],
      default: null,
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

const getOccupancyHistory = () =>
  getModel("OccupancyHistory", occupancyHistorySchema);

// Re-export with OccupancyHistory added

// ── Location ──────────────────────────────────────────────────────────
const locationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    county: { type: String, trim: true },
    town: { type: String, trim: true },
    address: { type: String, trim: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

// ── Block ─────────────────────────────────────────────────────────────
// A single facility can mix types at this tier — e.g. "Block A/B/C", a
// "Court" called Northwing, and a "Tower", all in one facility. So the
// type/term ("Block", "Court", "Tower", "Wing"...) lives per-item here,
// not just once on FacilitySettings. `type: null` falls back to the
// facility's default blockLabel (FacilitySettings) for older records
// created before this field existed.
const blockSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, default: null, trim: true },
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Facility",
      required: true,
    },
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
    },
    floors: { type: Number, default: 1 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

const getLocation = () => getModel("Location", locationSchema);
const getBlock = () => getModel("Block", blockSchema);

// ── Floor ─────────────────────────────────────────────────────────────
// Hierarchy: Facility -> Block/Court (optional) -> Floor (optional) ->
// Unit. A Floor always belongs to a specific Block — a facility with no
// blocks skips Floor entirely too (units on a flat facility just don't set
// `UnitMeta.floorId`, though they can still use the free-text `floor`
// label below). `name` holds real building conventions ("G", "B1", "1",
// "2"...), not just a plain number — see the deterministic naming in
// aiMessageService.js#buildFallbackNames (count + an optional basement
// count are the only inputs; no free text, no AI).
const floorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    blockId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Block",
      required: true,
      index: true,
    },
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Facility",
      required: true,
      index: true,
    },
    // Display/sort order independent of alphabetical `name` sorting (which
    // would put "B1" after "1" and before "G", not in physical floor
    // order) — lower sorts first (deepest basement), higher sorts last
    // (top floor). Set at creation time from generation order.
    order: { type: Number, default: 0 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);
const getFloor = () => getModel("Floor", floorSchema);

// ── FacilitySettings ──────────────────────────────────────────────────
// Small DAMR-owned side table for facility-level settings that don't
// belong on payservedb's Facility model (same externally-owned-reference
// reasoning as everything else in this file). Currently just the
// customizable label for the Block/Court tier — one facility might call
// it "Block", another "Court", another "Wing" or "Division".
const facilitySettingsSchema = new mongoose.Schema(
  {
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Facility",
      required: true,
      unique: true,
    },
    blockLabel: { type: String, default: "Block", trim: true },
    // ── M-Pesa Daraja credentials (native integration — no external
    // Payments microservice anymore) ────────────────────────────────────
    // A facility only needs its own row here if it has its own registered
    // Paybill/Daraja app; mpesaService.getCredentials() falls back to the
    // shared MPESA_* vars in .env when any of these are unset. Stored in
    // plaintext for now, same as every other secret already in this
    // codebase's env files — not encrypted at rest.
    mpesaShortCode: { type: String, trim: true, default: null },
    mpesaConsumerKey: { type: String, trim: true, default: null },
    mpesaConsumerSecret: { type: String, trim: true, default: null },
    mpesaPasskey: { type: String, trim: true, default: null },
    // Set once registerC2BUrls() succeeds for this facility's shortcode, so
    // the UI can show "already registered" instead of re-registering blindly
    // (Safaricom allows re-registration, but there's no need to repeat it).
    mpesaC2bRegistered: { type: Boolean, default: false },
  },
  { timestamps: true },
);
const getFacilitySettings = () =>
  getModel("FacilitySettings", facilitySettingsSchema);

// ── MpesaTransaction ────────────────────────────────────────────────────
// Native ledger of M-Pesa Paybill top-ups, replacing the old pull-based
// "ask PayServe's Payments microservice for this account's transactions"
// model. Populated two ways: (1) Safaricom's C2B confirmation webhook
// (mpesa_callback.js -> mpesaService.recordC2BConfirmation) whenever a
// resident tops up their Paybill sub-account directly, and (2) admin/FM
// "Record Cash Payment" (paymentsService.recordOfflinePayment), which
// synthesizes a row here with source: "cash" so cash payments flow through
// the exact same reconciliation code path as real M-Pesa ones. `transId` is
// unique so Safaricom's documented at-least-once callback delivery never
// double-counts the same receipt.
const mpesaTransactionSchema = new mongoose.Schema(
  {
    transId: { type: String, required: true, unique: true, trim: true },
    accountNumber: { type: String, required: true, trim: true, index: true },
    amount: { type: Number, required: true },
    msisdn: { type: String, default: null },
    // Raw Safaricom "YYYYMMDDHHMMSS" transaction time when known (C2B), else
    // left null and createdAt is used instead (cash payments have no such
    // concept — they're timestamped as of when staff recorded them).
    transTime: { type: String, default: null },
    shortCode: { type: String, default: null },
    source: {
      type: String,
      enum: ["mpesa-c2b", "cash"],
      default: "mpesa-c2b",
    },
    // Full Safaricom payload, kept verbatim for support/debugging — never
    // read by reconciliation logic itself.
    rawPayload: { type: Object, default: null },
  },
  { timestamps: true },
);
const getMpesaTransaction = () =>
  getModel("MpesaTransaction", mpesaTransactionSchema);

// ── StkPushRequest ──────────────────────────────────────────────────────
// Tracks a single "Lipa Na M-Pesa Online" (STK push) request from
// initiation through Safaricom's async callback. Unlike the Paybill/C2B
// model above, an STK push is invoice-specific — it's how "Pay Now" on a
// single invoice works — so this is looked up by CheckoutRequestID when
// Safaricom calls stk-callback, and by _id/checkoutRequestId when the
// frontend polls for status (there's no more Socket.IO push notification;
// polling this document is the replacement).
const stkPushRequestSchema = new mongoose.Schema(
  {
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MeterInvoice",
      required: true,
      index: true,
    },
    residentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resident",
      default: null,
    },
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Facility",
      default: null,
    },
    phone: { type: String, required: true },
    amount: { type: Number, required: true },
    accountReference: { type: String, default: null },
    merchantRequestId: { type: String, default: null },
    checkoutRequestId: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ["pending", "success", "failed", "cancelled"],
      default: "pending",
    },
    resultCode: { type: Number, default: null },
    resultDesc: { type: String, default: null },
    mpesaReceiptNumber: { type: String, default: null },
    transactionDate: { type: String, default: null },
  },
  { timestamps: true },
);
const getStkPushRequest = () =>
  getModel("StkPushRequest", stkPushRequestSchema);

// ── UnitMeta ──────────────────────────────────────────────────────────
// payservedb's Unit schema has no `blockId` or `floor` field, and (same
// silent-drop issue as the old per-unit `waterRate`)
// `controllers/facility/units.js` was writing both straight onto
// `payservedb.Unit.create()`/`findByIdAndUpdate()` and they were quietly
// discarded every time — meaning a unit's block/floor assignment never
// actually persisted anywhere, despite the admin UI having working-looking
// form fields for both. This join is the fix, following the same
// externally-owned-reference pattern as TariffPlan/Meter/Reading below:
// one row per unit that has either set. (Named UnitMeta, not UnitBlock,
// since it now also carries `floor`.)
const unitMetaSchema = new mongoose.Schema(
  {
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      required: true,
      unique: true,
    },
    blockId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Block",
      default: null,
    },
    // Preferred when the unit's block actually has real Floor records
    // (Facility -> Block -> Floor -> Unit hierarchy).
    floorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Floor",
      default: null,
    },
    // Free-text fallback for a facility with no blocks/floors at all (flat
    // Facility -> Unit) that still wants a floor label on the unit itself.
    // String, not Number — real labels aren't purely numeric ("G", "B1").
    floor: { type: String, default: null, trim: true },
  },
  { timestamps: true },
);
const getUnitMeta = () => getModel("UnitMeta", unitMetaSchema);

// ── TariffPlan ────────────────────────────────────────────────────────
// Owned entirely by DAMR — deliberately NOT stored as a field on
// payservedb's Facility/Unit models. Those schemas don't declare
// `strict: false`, so Mongoose's default strict mode silently drops any
// field not in the schema (this is why the old per-unit `waterRate` never
// actually persisted — every invoice silently fell back to the `|| 80`
// default). Referencing facilityId from here instead follows the same
// pattern already used by Block/Location/Meter/Reading above.
const tariffBandSchema = new mongoose.Schema(
  {
    // Upper bound of this band in m³, inclusive. `null` = unbounded (last band).
    upTo: { type: Number, default: null },
    rate: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const tariffPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Facility",
      required: true,
      index: true,
    },
    // Roadmap Phase 8, #20 — optional narrower scope than facility-wide.
    // Mutually exclusive by convention (enforced in the controller, not
    // here): a plan is either a facility default (both null), a per-block
    // plan, or a per-category plan. getActiveTariffPlan() resolves
    // unitType-scoped first, then blockId-scoped, then the facility
    // default, most specific match wins.
    blockId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Block",
      default: null,
      index: true,
    },
    // Free-text match against Unit.unitType (e.g. "Residential",
    // "Commercial", "Penthouse" — see the Unit creation form's dropdown).
    unitType: { type: String, default: null, trim: true, index: true },
    // Ordered ascending by `upTo` (last band's upTo should be null).
    bands: {
      type: [tariffBandSchema],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "A tariff plan needs at least one band",
      },
    },
    minimumCharge: { type: Number, default: 0, min: 0 },
    sewerageRate: { type: Number, default: 0.75, min: 0 }, // fraction of water charge
    techFee: { type: Number, default: 150, min: 0 },
    penaltyEnabled: { type: Boolean, default: false },
    penaltyType: { type: String, enum: ["percentage", "flat"], default: "percentage" },
    penaltyValue: { type: Number, default: 0, min: 0 }, // % (e.g. 5) or flat KES
    dueDateOffsetDays: { type: Number, default: 15, min: 0 },
    // How many days before dueDate the "upcoming bill due" reminder fires
    // (see crons/invoicing/upcomingDueReminders.js). The "on due date" and
    // "after due date" (overdueReminders.js) reminders aren't separately
    // configurable — only the lead time for the early one is.
    reminderDaysBefore: { type: Number, default: 3, min: 0 },
    // M-Pesa Paybill shortcode this facility's residents pay into, shown to
    // residents on their bill. Should match FacilitySettings.mpesaShortCode
    // (or the shared .env default) — kept here on the tariff plan purely
    // for display, not read by mpesaService/paymentsService.
    paybillShortCode: { type: String, trim: true, default: null },
    active: { type: Boolean, default: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

// ── PaymentAccount ────────────────────────────────────────────────────
// Maps a DAMR resident+facility to the Paybill sub-account number
// (BillRefNumber) they pay into. Purely local now — there's no external
// service to register this with; Safaricom accepts any BillRefNumber on a
// Paybill payment, so this is just DAMR's own deterministic bookkeeping.
// One account per resident per facility; created lazily the first time
// it's needed (see paymentsService.provisionAccount).
const paymentAccountSchema = new mongoose.Schema(
  {
    residentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resident",
      required: true,
      index: true,
    },
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Facility",
      required: true,
      index: true,
    },
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      default: null,
    },
    // 3-20 alphanumeric chars, generated deterministically from
    // residentId+facilityId (see paymentsService.generateAccountNumber).
    accountNumber: { type: String, required: true, unique: true, trim: true },
    // Every M-Pesa receipt ever applied against ANY invoice on this account —
    // the source of truth for "already reconciled" (Roadmap Phase 8, #22).
    // A resident can have more than one Unpaid/Partial invoice sharing this
    // same Paybill account (e.g. two missed months); tracking this only on
    // Invoice.appliedReceipts let the same receipt be pulled in a second time
    // when a different invoice for the same account was checked, since each
    // invoice's own list has no visibility into what another invoice already
    // claimed. This account-level ledger closes that gap.
    appliedReceipts: { type: [String], default: [] },
  },
  { timestamps: true },
);
paymentAccountSchema.index({ residentId: 1, facilityId: 1 }, { unique: true });

// ── Credit ────────────────────────────────────────────────────────────
// Manual admin-issued credit that reduces a resident's next invoice.
// Applied oldest-first, up to the invoice total, at generation time.
const creditSchema = new mongoose.Schema(
  {
    residentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resident",
      required: true,
      index: true,
    },
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Facility",
      default: null,
    },
    amount: { type: Number, required: true, min: 0 },
    remainingAmount: { type: Number, required: true, min: 0 },
    reason: { type: String, trim: true, default: null },
    status: {
      type: String,
      enum: ["open", "applied", "void"],
      default: "open",
    },
    appliedToInvoiceIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "MeterInvoice" },
    ],
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

const getTariffPlan = () => getModel("TariffPlan", tariffPlanSchema);
const getCredit = () => getModel("Credit", creditSchema);
const getPaymentAccount = () => getModel("PaymentAccount", paymentAccountSchema);

// ── BulkMeter / BulkReading ──────────────────────────────────────────
// Roadmap Phase 6 — non-revenue water (NRW). Tracks the facility's own
// bulk/supplier meter (the one the water utility itself bills the facility
// on), separate from the per-unit Meter/Reading models above. Comparing
// bulk-supplied consumption against the sum of billed unit consumption for
// the same period surfaces leakage/theft/metering loss — no such concept
// existed anywhere in the schema before this.
const bulkMeterSchema = new mongoose.Schema(
  {
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Facility",
      required: true,
      unique: true,
    },
    serialNumber: { type: String, trim: true, default: null },
    installationDate: { type: Date, default: Date.now },
    initialReading: { type: Number, default: 0 },
    lastReadingValue: { type: Number, default: null },
    lastReadingDate: { type: Date, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

const bulkReadingSchema = new mongoose.Schema(
  {
    bulkMeterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BulkMeter",
      required: true,
    },
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Facility",
      required: true,
    },
    readingDate: { type: Date, default: Date.now },
    value: { type: Number, required: true },
    previousValue: { type: Number, default: null },
    consumption: { type: Number, default: null },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    notes: { type: String, default: null },
  },
  { timestamps: true },
);

const getBulkMeter = () => getModel("BulkMeter", bulkMeterSchema);
const getBulkReading = () => getModel("BulkReading", bulkReadingSchema);

// Eagerly register every model as soon as this module is first required.
// Several schemas above reference each other by name (e.g. invoiceSchema's
// meterId -> ref: "Meter"), and mongoose only resolves those refs — including
// during .populate() — if the referenced model has already been registered.
// Registration was previously lazy (only on first getX() call), so whichever
// route happened to run first in the process decided whether populate()
// worked. Calling every getter here removes that ordering dependency.
// getModel() is idempotent, so this is safe even if a getter also runs later.
getMeter();
getMeterBinding();
getReading();
getFlag();
getInvoice();
getOccupancyHistory();
getLocation();
getBlock();
getFloor();
getFacilitySettings();
getUnitMeta();
getTariffPlan();
getCredit();
getPaymentAccount();
getBulkMeter();
getBulkReading();
getMpesaTransaction();
getStkPushRequest();

module.exports = {
  getMeter,
  getMeterBinding,
  getReading,
  getFlag,
  getInvoice,
  getOccupancyHistory,
  getLocation,
  getBlock,
  getFloor,
  getFacilitySettings,
  getUnitMeta,
  getTariffPlan,
  getCredit,
  getPaymentAccount,
  getBulkMeter,
  getBulkReading,
  getMpesaTransaction,
  getStkPushRequest,
};
