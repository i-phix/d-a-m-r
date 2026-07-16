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
        "serial_mismatch",
        "serial_unverified",
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

const invoiceSchema = new mongoose.Schema(
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
      enum: ["Unpaid", "Paid", "Partial", "Void", "Overdue", "Held"],
      default: "Unpaid",
    },

    heldReason: { type: String, default: null },
    mpesaCode: { type: String, default: null },
    appliedReceipts: { type: [String], default: [] },
    paidAt: { type: Date, default: null },
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    dueDate: { type: Date, default: null },
    tariffPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TariffPlan",
      default: null,
    },
    breakdown: {
      bands: [
        {
          _id: false,
          from: Number,
          to: { type: Number, default: null },
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
    remindersSent: {
      upcoming: { type: Boolean, default: false },
      dueToday: { type: Boolean, default: false },
    },
    publicToken: { type: String, unique: true, sparse: true },
    publicTokenExpiresAt: { type: Date, default: null },
    notes: { type: String, default: null },
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

const facilitySettingsSchema = new mongoose.Schema(
  {
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Facility",
      required: true,
      unique: true,
    },
    blockLabel: { type: String, default: "Block", trim: true },
    mpesaShortCode: { type: String, trim: true, default: null },
    mpesaConsumerKey: { type: String, trim: true, default: null },
    mpesaConsumerSecret: { type: String, trim: true, default: null },
    mpesaPasskey: { type: String, trim: true, default: null },
    mpesaC2bRegistered: { type: Boolean, default: false },
  },
  { timestamps: true },
);
const getFacilitySettings = () =>
  getModel("FacilitySettings", facilitySettingsSchema);
const mpesaTransactionSchema = new mongoose.Schema(
  {
    transId: { type: String, required: true, unique: true, trim: true },
    accountNumber: { type: String, required: true, trim: true, index: true },
    amount: { type: Number, required: true },
    msisdn: { type: String, default: null },
    transTime: { type: String, default: null },
    shortCode: { type: String, default: null },
    source: {
      type: String,
      enum: ["mpesa-c2b", "cash"],
      default: "mpesa-c2b",
    },

    rawPayload: { type: Object, default: null },
  },
  { timestamps: true },
);
const getMpesaTransaction = () =>
  getModel("MpesaTransaction", mpesaTransactionSchema);

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
    checkoutRequestId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
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
    floorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Floor",
      default: null,
    },
    floor: { type: String, default: null, trim: true },
  },
  { timestamps: true },
);
const getUnitMeta = () => getModel("UnitMeta", unitMetaSchema);
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
    blockId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Block",
      default: null,
      index: true,
    },

    unitType: { type: String, default: null, trim: true, index: true },

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
    penaltyType: {
      type: String,
      enum: ["percentage", "flat"],
      default: "percentage",
    },
    penaltyValue: { type: Number, default: 0, min: 0 }, // % (e.g. 5) or flat KES
    dueDateOffsetDays: { type: Number, default: 15, min: 0 },
    reminderDaysBefore: { type: Number, default: 3, min: 0 },

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
    accountNumber: { type: String, required: true, unique: true, trim: true },
    appliedReceipts: { type: [String], default: [] },
  },
  { timestamps: true },
);
paymentAccountSchema.index({ residentId: 1, facilityId: 1 }, { unique: true });

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
const getPaymentAccount = () =>
  getModel("PaymentAccount", paymentAccountSchema);
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
