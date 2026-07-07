const monthlyInvoices = require("../../crons/invoicing/monthlyInvoices");
const overdueReminders = require("../../crons/invoicing/overdueReminders");
const upcomingDueReminders = require("../../crons/invoicing/upcomingDueReminders");
const dailyAnomalyScan = require("../../crons/anomaly/dailyAnomalyScan");
const autoReconcile = require("../../crons/payments/autoReconcile");
const JOBS = {
  monthlyInvoices,
  overdueReminders,
  upcomingDueReminders,
  dailyAnomalyScan,
  autoReconcile,
};
const runCron = async (req, res) => {
  try {
    const { job } = req.body;
    const fn = JOBS[job];
    if (!fn) {
      return res.status(400).send({
        error: `Unknown job "${job}". Valid jobs: ${Object.keys(JOBS).join(", ")}`,
      });
    }
    const stats = await fn();

    return res.status(200).send({
      message: `${job} ran successfully`,
      stats: stats || null,
    });
  } catch (err) {
    console.error(`Error running cron job "${req.body?.job}":`, err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = { runCron };
