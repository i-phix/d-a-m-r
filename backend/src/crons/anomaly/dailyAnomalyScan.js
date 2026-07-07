const {
  getMeter: getMeterModel,
  getReading: getReadingModel,
  getFlag: getFlagModel,
} = require("../../utils/damrSchemas");
const {
  detectAnomalies,
  notifyFlagCreated,
} = require("../../services/anomalyService");
const { sendEmail } = require("../../utils/emailSmsService");
const MISSING_READING_THRESHOLD_DAYS = 7;

async function dailyAnomalyScan() {
  console.log("[CRON] Daily anomaly scan started:", new Date().toISOString());

  const Meter = getMeterModel();
  const Reading = getReadingModel();
  const Flag = getFlagModel();
  const now = new Date();
  const stats = { scanned: 0, flagged: 0, pending_rerun: 0, errors: 0 };

  try {
    const assignedMeters = await Meter.find({ status: "ASSIGNED" }).lean();

    for (const meter of assignedMeters) {
      try {
        stats.scanned++;

        const lastReading = await Reading.findOne({ meterId: meter._id })
          .sort({ readingDate: -1 })
          .lean();

        const lastReadingDate = lastReading?.readingDate || meter.createdAt;
        const daysSinceLast = Math.floor(
          (now - new Date(lastReadingDate)) / (1000 * 60 * 60 * 24),
        );

        if (daysSinceLast >= MISSING_READING_THRESHOLD_DAYS) {
          const existingFlag = await Flag.findOne({
            meterId: meter._id,
            type: "missing_reading",
            status: "open",
          });

          if (!existingFlag) {
            const flag = await Flag.create({
              type: "missing_reading",
              meterId: meter._id,
              facilityId: meter.facilityId || null,
              status: "open",
              description: `No reading recorded in ${daysSinceLast} days (last: ${new Date(lastReadingDate).toLocaleDateString()})`,
            });

            await Meter.findByIdAndUpdate(meter._id, {
              $inc: { openFlagCount: 1 },
            });
            stats.flagged++;
            await notifyFlagCreated(flag, meter);
          }
        }
      } catch (err) {
        console.error(
          `[CRON] Missing reading scan error for meter ${meter._id}:`,
          err.message,
        );
        stats.errors++;
      }
    }
    const cutoff = new Date(now - 24 * 60 * 60 * 1000);
    const pendingReadings = await Reading.find({
      status: "pending",
      createdAt: { $gte: cutoff },
    }).lean();

    for (const reading of pendingReadings) {
      try {
        await detectAnomalies(reading);
        stats.pending_rerun++;
      } catch (err) {
        console.error(
          `[CRON] Anomaly re-run error for reading ${reading._id}:`,
          err.message,
        );
        stats.errors++;
      }
    }
    const openFlagCount = await Flag.countDocuments({ status: "open" });
    if (openFlagCount >= 10 && process.env.ADMIN_EMAIL) {
      await sendEmail(
        process.env.ADMIN_EMAIL,
        `DAMR Alert: ${openFlagCount} open flags require attention`,
        `<p>There are currently <strong>${openFlagCount} open flags</strong> in the DAMR system that require your attention.</p><p>Please log in to review and resolve them.</p>`,
      );
    }
  } catch (err) {
    console.error("[CRON] dailyAnomalyScan fatal error:", err.message);
  }

  console.log(
    `[CRON] Anomaly scan done — Scanned: ${stats.scanned} | Flagged: ${stats.flagged} | Pending rerun: ${stats.pending_rerun} | Errors: ${stats.errors}`,
  );

  return stats;
}

module.exports = dailyAnomalyScan;
