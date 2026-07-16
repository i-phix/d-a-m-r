const db = require("../utils/coreSchemas");
const {
  getReading: getReadingModel,
  getFlag: getFlagModel,
  getMeter: getMeterModel,
} = require("../utils/damrSchemas");
const {
  sendEmail,
  sendSMS,
  sendWhatsApp,
  flagAlertEmailHTML,
  flagAlertSmsText,
  residentLeakAlertSmsText,
} = require("../utils/emailSmsService");

const LEAK_SUGGESTIVE_TYPES = new Set(["SPIKE", "OVERNIGHT_LEAK", "CRITICAL"]);
async function notifyFlagCreated(flag, meter) {
  try {
    const [facility, unit, staff] = await Promise.all([
      meter.facilityId ? db.Facility.findById(meter.facilityId).lean() : null,
      meter.unitId ? db.Unit.findById(meter.unitId).lean() : null,
      meter.facilityId
        ? db.User.find({
            facilityId: meter.facilityId,
            role: { $in: ["admin", "editor"] },
          }).lean()
        : [],
    ]);

    const alertData = {
      flagType: flag.type,
      meterSerial: meter.serialNumber,
      facilityName: facility?.name,
      unitName: unit?.name,
      description: flag.description,
    };

    const recipients = staff.length
      ? staff
      : process.env.ADMIN_EMAIL
        ? [{ email: process.env.ADMIN_EMAIL, phoneNumber: null }]
        : [];

    await Promise.allSettled(
      recipients.map(async (user) => {
        const email = user.email;
        const phone = user.phoneNumber || user.phone;
        const tasks = [];
        if (email) {
          tasks.push(
            sendEmail(
              email,
              `⚠️ DAMR Alert: ${flag.type} on meter ${meter.serialNumber}`,
              flagAlertEmailHTML(alertData),
            ),
          );
        }
        if (phone) {
          const smsText = flagAlertSmsText(alertData);
          tasks.push(
            sendSMS(phone, smsText),
            sendWhatsApp(phone, smsText, { source: "damr-flag-alert" }),
          );
        }
        await Promise.allSettled(tasks);
      }),
    );

    if (LEAK_SUGGESTIVE_TYPES.has(flag.type) && meter.currentResident) {
      const resident = await db.Resident.findById(meter.currentResident).lean();
      const phone = resident?.phoneNumber || resident?.phone;
      if (phone) {
        const smsText = residentLeakAlertSmsText({
          residentName: resident.name,
          meterSerial: meter.serialNumber,
        });
        await Promise.allSettled([
          sendSMS(phone, smsText),
          sendWhatsApp(phone, smsText, {
            contactName: resident.name,
            source: "damr-resident-leak-alert",
          }),
        ]);
      }
    }
  } catch (err) {
    console.error(
      `Flag alert notification failed for flag ${flag._id}:`,
      err.message,
    );
  }
}

const BLOCKING_FLAG_TYPES = [
  "SPIKE",
  "OVERNIGHT_LEAK",
  "CRITICAL",
  "serial_mismatch",
  "serial_unverified",
];

async function getBlockingFlag(readingId) {
  if (!readingId) return null;
  const Flag = getFlagModel();
  return await Flag.findOne({
    readingId,
    type: { $in: BLOCKING_FLAG_TYPES },
    status: "open",
  }).lean();
}

const FLAG_SEVERITY = {
  SPIKE: "HIGH",
  DROP: "MEDIUM",
  ZERO_FLOW: "LOW",
  OVERNIGHT_LEAK: "MEDIUM",
  ERRATIC: "LOW",
  CRITICAL: "CRITICAL",
};
const DROP_SIGMA_THRESHOLD = -2.5;

function stats(values) {
  if (!values.length) return { mean: 0, std: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

function coefficientOfVariation(values) {
  const { mean, std } = stats(values);
  return mean === 0 ? 0 : std / mean;
}

async function detectAnomalies(reading) {
  const { meterId, value, consumption, readingDate } = reading;

  const Reading = getReadingModel();
  const Flag = getFlagModel();
  const Meter = getMeterModel();
  const history = await Reading.find({ meterId, _id: { $ne: reading._id } })
    .sort({ readingDate: -1 })
    .limit(10)
    .lean();

  const consumptions = history
    .map((r) => r.consumption)
    .filter((c) => c !== null && c !== undefined && c >= 0);

  const { mean, std } = stats(consumptions);

  let flagType = null;
  let sigmaDeviation = null;
  let extraSeverity = null;
  if (consumption !== null && consumption >= 0 && std > 0) {
    sigmaDeviation = (consumption - mean) / std;
    if (sigmaDeviation > 3) flagType = "SPIKE";
    else if (mean > 0 && sigmaDeviation < DROP_SIGMA_THRESHOLD)
      flagType = "DROP";
  }
  if (!flagType && history.length >= 2) {
    const lastTwo = history.slice(0, 2);
    if (lastTwo.every((r) => r.value === value)) flagType = "ZERO_FLOW";
  }
  const hour = new Date(readingDate).getHours();
  if (!flagType && consumption > 0 && hour >= 0 && hour < 5) {
    flagType = "OVERNIGHT_LEAK";
    const overnightHistory = history.filter((r) => {
      const h = new Date(r.readingDate).getHours();
      return h >= 0 && h < 5 && r.consumption > 0;
    });
    if (overnightHistory.length >= 2) extraSeverity = "HIGH";
  }
  if (!flagType && consumptions.length >= 4) {
    const cov = coefficientOfVariation(consumptions.slice(0, 7));
    if (cov > 1.5) flagType = "ERRATIC";
  }
  if (flagType === "OVERNIGHT_LEAK" && sigmaDeviation > 3) {
    flagType = "CRITICAL";
    extraSeverity = null;
  }

  if (!flagType) return null;

  const severity = extraSeverity || FLAG_SEVERITY[flagType];

  const flag = await Flag.create({
    type: flagType,
    meterId,
    readingId: reading._id,
    facilityId: reading.facilityId,
    status: "open",
    description: `${flagType} detected — consumption: ${consumption} m³, deviation: ${sigmaDeviation ? sigmaDeviation.toFixed(2) + "σ" : "N/A"}`,
  });
  const updatedMeter = await Meter.findByIdAndUpdate(
    meterId,
    { $inc: { openFlagCount: 1 } },
    { new: true },
  ).lean();

  await notifyFlagCreated(flag, updatedMeter);

  return flag;
}

async function checkDuplicateSubmission(reading) {
  const Reading = getReadingModel();
  const Flag = getFlagModel();
  const Meter = getMeterModel();

  const readingDate = new Date(reading.readingDate);
  const startOfDay = new Date(readingDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(readingDate);
  endOfDay.setHours(23, 59, 59, 999);

  const sameDayCount = await Reading.countDocuments({
    meterId: reading.meterId,
    _id: { $ne: reading._id },
    readingDate: { $gte: startOfDay, $lte: endOfDay },
  });

  if (sameDayCount === 0) return null;

  const flag = await Flag.create({
    type: "duplicate_submission",
    meterId: reading.meterId,
    readingId: reading._id,
    facilityId: reading.facilityId || null,
    status: "open",
    description: `Another reading already exists for this meter on ${startOfDay.toDateString()} — please verify this submission isn't a duplicate.`,
  });

  const updatedMeter = await Meter.findByIdAndUpdate(
    reading.meterId,
    { $inc: { openFlagCount: 1 } },
    { new: true },
  ).lean();

  await notifyFlagCreated(flag, updatedMeter);

  return flag;
}

module.exports = {
  detectAnomalies,
  notifyFlagCreated,
  checkDuplicateSubmission,
  getBlockingFlag,
  BLOCKING_FLAG_TYPES,
};
