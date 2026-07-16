const express = require("express");
const router = express.Router();

const {
  protect,
  adminOnly,
  adminOrFM,
  fieldStaff,
  residentOnly,
} = require("../middleware/auth");
const upload = require("../middleware/upload");
const login = require("../controllers/auth/login");
const getMe = require("../controllers/auth/get_me");
const register = require("../controllers/auth/register");
const getUsers = require("../controllers/users/get_users");
const deleteUser = require("../controllers/users/delete_user");
const updateUserPassword = require("../controllers/users/update_user_password");
const scanMeter = require("../controllers/meters/scan_meter");
const createMeter = require("../controllers/meters/create_meter");
const createBulkMeters = require("../controllers/meters/bulk_create_meters");
const getImportTemplate = require("../controllers/meters/get_import_template");
const getMeters = require("../controllers/meters/get_meters");
const getMeter = require("../controllers/meters/get_meter");
const assignMeter = require("../controllers/meters/assign_meter");
const uploadReading = require("../controllers/readings/upload_reading");
const scanReading = require("../controllers/readings/scan_reading");
const manualReading = require("../controllers/readings/manual_reading");
const createBulkReadings = require("../controllers/readings/bulk_create_readings");
const getReadingImportTemplate = require("../controllers/readings/get_reading_import_template");
const getReadings = require("../controllers/readings/get_readings");
const getFlags = require("../controllers/flags/get_flags");
const resolveFlag = require("../controllers/flags/resolve_flag");
const updateFlagNotes = require("../controllers/flags/update_flag_notes");
const getInvoices = require("../controllers/invoices/get_invoices");
const updateInvoice = require("../controllers/invoices/update_invoice");
const generateInvoice = require("../controllers/invoices/generate_invoice");
const bulkGenerate = require("../controllers/invoices/bulk_generate");
const {
  checkPayment,
  getPaymentInfo,
  recordCashPayment,
} = require("../controllers/invoices/check_payment");
const {
  stkPushInvoice,
  getStkStatus,
} = require("../controllers/invoices/pay_invoice");
const {
  stkCallback,
  c2bValidation,
  c2bConfirmation,
} = require("../controllers/invoices/mpesa_callback");
const {
  getPublicLink,
  getPublicBill,
  publicCheckPayment,
  publicStkPush,
  publicGetStkStatus,
} = require("../controllers/invoices/public_bill");
const {
  registerPaymentDetails,
} = require("../controllers/facility/paymentDetails");
const { runCron } = require("../controllers/admin/crons");
const createResident = require("../controllers/residents/create_resident");
const getResidents = require("../controllers/residents/get_residents");
const deleteResident = require("../controllers/residents/delete_resident");
const getResidentHistory = require("../controllers/residents/get_resident_history");
const {
  createLocation,
  getLocations,
  updateLocation,
  deleteLocation,
} = require("../controllers/facility/locations");
const {
  createFacility,
  getFacilities,
  updateFacility,
  deleteFacility,
  getFacilitySettingsForFacility,
  updateFacilitySettings,
} = require("../controllers/facility/facilities");
const {
  createBlock,
  getBlocks,
  updateBlock,
  getFloors,
  deleteBlock,
} = require("../controllers/facility/blocks");
const {
  createUnit,
  getUnits,
  getUnit,
  updateUnit,
  deleteUnit,
} = require("../controllers/facility/units");
const {
  createTariffPlan,
  getTariffPlans,
  updateTariffPlan,
  deleteTariffPlan,
} = require("../controllers/facility/tariffPlans");
const {
  issueCredit,
  getCredits,
  voidCredit,
} = require("../controllers/invoices/credits");
const {
  getArrearsAgeing,
  getDefaultersList,
  getDashboardStats,
} = require("../controllers/reports/billingReports");
const {
  getConsumptionTrends,
} = require("../controllers/reports/consumptionReports");
const {
  getMyResidencies,
  getMyReadings,
  getMyInvoices,
  getMyInvoiceBillLink,
} = require("../controllers/residents/resident_portal");
const { getPublicStatement } = require("../controllers/residents/statement");
const {
  createBulkMeter,
  getBulkMeters,
  submitBulkReading,
  getNRWReport,
} = require("../controllers/facility/bulkMeters");
router.post("/auth/login", login);
router.get("/auth/me", protect, getMe);
router.post("/auth/register", protect, adminOrFM, register);
router.get("/users", protect, adminOnly, getUsers);
router.get("/users/:id", protect, adminOnly, getUsers);
router.delete("/users/:id", protect, adminOnly, deleteUser);
router.put("/users/:id/password", protect, adminOnly, updateUserPassword);

router.post("/meters", protect, adminOrFM, createMeter);
router.post("/meters/bulk", protect, adminOrFM, createBulkMeters);
router.post(
  "/meters/scan",
  protect,
  adminOrFM,
  upload.single("meterImage"),
  scanMeter,
);
router.get("/meters", protect, fieldStaff, getMeters);
// Must come before "/meters/:id" — otherwise Express would match
// "import-template" as the :id param and hand it to getMeter instead.
router.get("/meters/import-template", protect, adminOrFM, getImportTemplate);
router.get("/meters/:id", protect, fieldStaff, getMeter);
router.patch("/meters/:id/assign", protect, adminOrFM, assignMeter);
router.post(
  "/readings/upload",
  protect,
  fieldStaff,
  upload.single("meterImage"),
  uploadReading,
);
router.post(
  "/readings/scan",
  protect,
  fieldStaff,
  upload.single("meterImage"),
  scanReading,
);
router.post(
  "/readings/manual",
  protect,
  fieldStaff,
  upload.single("meterImage"),
  manualReading,
);
router.post(
  "/readings/bulk",
  protect,
  fieldStaff,
  upload.any(),
  createBulkReadings,
);
router.get(
  "/readings/import-template",
  protect,
  fieldStaff,
  getReadingImportTemplate,
);
router.get(
  "/readings/mine",
  protect,
  fieldStaff,
  (req, res, next) => {
    req.isMine = true;
    next();
  },
  getReadings,
);
router.get("/readings", protect, fieldStaff, getReadings);
router.get("/flags", protect, fieldStaff, getFlags);
router.get(
  "/flags/:id",
  protect,
  fieldStaff,
  (req, res, next) => {
    req.isSingle = true;
    next();
  },
  getFlags,
);
router.patch("/flags/:id/resolve", protect, adminOrFM, resolveFlag);
router.patch("/flags/:id/notes", protect, fieldStaff, updateFlagNotes);
router.post("/invoices/generate", protect, adminOrFM, generateInvoice);
router.post("/invoices/bulk", protect, adminOnly, bulkGenerate);
router.post("/invoices/credits", protect, adminOrFM, issueCredit);
router.get("/invoices/credits", protect, adminOrFM, getCredits);
router.patch("/invoices/credits/:id/void", protect, adminOnly, voidCredit);
router.get("/invoices/:id/payment-info", protect, adminOrFM, getPaymentInfo);
router.post("/invoices/:id/check-payment", protect, adminOrFM, checkPayment);
router.post("/invoices/:id/stk-push", protect, adminOrFM, stkPushInvoice);
router.get("/invoices/:id/stk-status", protect, adminOrFM, getStkStatus);

router.post(
  "/invoices/:id/cash-payment",
  protect,
  adminOrFM,
  recordCashPayment,
);

router.post(
  "/facility/payment-details",
  protect,
  adminOnly,
  registerPaymentDetails,
);

router.post("/mpesa/stk-callback", stkCallback);
router.post("/mpesa/c2b-validation", c2bValidation);
router.post("/mpesa/c2b-confirmation", c2bConfirmation);

router.get("/invoices/:id/public-link", protect, adminOrFM, getPublicLink);
router.get("/public/bill/:token", getPublicBill);
router.post("/public/bill/:token/check-payment", publicCheckPayment);
router.post("/public/bill/:token/stk-push", publicStkPush);
router.get("/public/bill/:token/stk-status", publicGetStkStatus);
router.get("/public/statement/:token", getPublicStatement);
router.post("/admin/run-cron", protect, adminOnly, runCron);

router.get("/invoices", protect, adminOrFM, getInvoices);
router.get("/invoices/:id", protect, adminOrFM, getInvoices);
router.put("/invoices/:id", protect, adminOrFM, updateInvoice);

router.post("/residents", protect, adminOrFM, createResident);
router.get("/residents", protect, adminOrFM, getResidents);
router.get(
  "/residents/:id/history",
  protect,
  adminOrFM,
  (req, res, next) => {
    req.isHistory = true;
    next();
  },
  getResidentHistory,
);
router.get("/residents/:id", protect, adminOrFM, getResidentHistory);
router.delete("/residents/:id", protect, adminOrFM, deleteResident);

router.post("/facility/locations", protect, adminOnly, createLocation);
router.get("/facility/locations", protect, fieldStaff, getLocations);
router.put("/facility/locations/:id", protect, adminOnly, updateLocation);
router.delete("/facility/locations/:id", protect, adminOnly, deleteLocation);

router.post("/facility/facilities", protect, adminOnly, createFacility);
router.get("/facility/facilities", protect, fieldStaff, getFacilities);
router.put("/facility/facilities/:id", protect, adminOrFM, updateFacility);
router.delete("/facility/facilities/:id", protect, adminOnly, deleteFacility);
router.get(
  "/facility/facility-settings",
  protect,
  fieldStaff,
  getFacilitySettingsForFacility,
);
router.put(
  "/facility/facility-settings",
  protect,
  adminOrFM,
  updateFacilitySettings,
);

router.post("/facility/blocks", protect, adminOrFM, createBlock);
router.get("/facility/blocks", protect, fieldStaff, getBlocks);
router.put("/facility/blocks/:id", protect, adminOrFM, updateBlock);
router.delete("/facility/blocks/:id", protect, adminOrFM, deleteBlock);
router.get("/facility/floors", protect, fieldStaff, getFloors);

router.post("/facility/units", protect, adminOrFM, createUnit);
router.get("/facility/units", protect, fieldStaff, getUnits);
router.get("/facility/units/:id", protect, fieldStaff, getUnit);
router.put("/facility/units/:id", protect, adminOrFM, updateUnit);
router.delete("/facility/units/:id", protect, adminOrFM, deleteUnit);

// Tariff plans (Phase 2 billing engine)
router.post("/facility/tariff-plans", protect, adminOnly, createTariffPlan);
router.get("/facility/tariff-plans", protect, fieldStaff, getTariffPlans);
router.put("/facility/tariff-plans/:id", protect, adminOnly, updateTariffPlan);
router.delete(
  "/facility/tariff-plans/:id",
  protect,
  adminOnly,
  deleteTariffPlan,
);

router.get("/reports/arrears-ageing", protect, adminOrFM, getArrearsAgeing);
router.get("/reports/defaulters", protect, adminOrFM, getDefaultersList);
router.get(
  "/reports/consumption-trends",
  protect,
  adminOrFM,
  getConsumptionTrends,
);
router.get("/reports/dashboard-stats", protect, adminOrFM, getDashboardStats);
router.get("/reports/nrw", protect, adminOrFM, getNRWReport);
router.get("/resident/me", protect, residentOnly, getMyResidencies);
router.get("/resident/readings", protect, residentOnly, getMyReadings);
router.get("/resident/invoices", protect, residentOnly, getMyInvoices);
router.get(
  "/resident/invoices/:id/bill-link",
  protect,
  residentOnly,
  getMyInvoiceBillLink,
);

router.post("/facility/bulk-meters", protect, adminOnly, createBulkMeter);
router.get("/facility/bulk-meters", protect, adminOrFM, getBulkMeters);
router.post(
  "/facility/bulk-meters/:id/readings",
  protect,
  adminOrFM,
  submitBulkReading,
);

module.exports = router;
