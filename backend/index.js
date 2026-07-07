const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cron = require("node-cron");
require("dotenv").config();
const { connectDB } = require("./src/utils/dbConnection");
const app = express();

app.use(cors());
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(process.env.UPLOADS_DIR || "./uploads"));

const routes = require("./src/routes/index");
app.use("/api/v1/damr", routes);
connectDB().catch((err) => {
  console.error("Failed to connect to MongoDB:", err);
  process.exit(1);
});

const monthlyInvoices = require("./src/crons/invoicing/monthlyInvoices");
const overdueReminders = require("./src/crons/invoicing/overdueReminders");
const upcomingDueReminders = require("./src/crons/invoicing/upcomingDueReminders");
const dailyAnomalyScan = require("./src/crons/anomaly/dailyAnomalyScan");
const autoReconcile = require("./src/crons/payments/autoReconcile");

cron.schedule("30 0 1 * *", monthlyInvoices, { timezone: "Africa/Nairobi" });
cron.schedule("0 8 * * *", overdueReminders, { timezone: "Africa/Nairobi" });
// "Before due" + "on due date" reminders — separate from overdueReminders.js,
// which only covers "after". Runs once daily; each reminder type is
// idempotent per invoice (see Invoice.remindersSent).
cron.schedule("0 9 * * *", upcomingDueReminders, { timezone: "Africa/Nairobi" });

cron.schedule("0 2 * * *", dailyAnomalyScan, { timezone: "Africa/Nairobi" });

// Roadmap Phase 8, #22 — PayServe's Payments microservice has no webhook for
// Paybill top-ups, so this polls every 15 minutes instead of waiting for a
// resident/FM to manually click "Check for Payment". Frequent enough that a
// payment shows as settled within minutes, not whenever someone happens to
// look; cheap enough (only residents with an open invoice are touched) to
// run this often.
cron.schedule("*/15 * * * *", autoReconcile, { timezone: "Africa/Nairobi" });

console.log("DAMR cron jobs scheduled (EAT timezone)");

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`DAMR service is running on port ${PORT}`);
});
