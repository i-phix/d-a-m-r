const { getMeter } = require("../../utils/damrSchemas");
const createMeter = async (req, res) => {
  try {
    const {
      serialNumber,
      manufacturer,
      model,
      meterType,
      installationDate,
      initialReading,
      condition,
    } = req.body;

    if (!serialNumber) {
      return res.status(400).send({ error: "Serial number is required" });
    }

    const Meter = getMeter();

    const existing = await Meter.findOne({ serialNumber: serialNumber.trim() });
    if (existing) {
      return res
        .status(400)
        .send({
          error: `Meter with serial number "${serialNumber}" already exists`,
        });
    }

    const resolvedInitialReading = initialReading || 0;
    const resolvedInstallationDate = installationDate
      ? new Date(installationDate)
      : new Date();

    const meter = await Meter.create({
      serialNumber: serialNumber.trim(),
      manufacturer,
      model,
      meterType,
      installationDate: resolvedInstallationDate,
      initialReading: resolvedInitialReading,
      condition,
      // The reading taken at installation IS the meter's first reading —
      // it shouldn't show as a blank/dashed "Last Reading" on the meter
      // page until someone happens to submit a reading later. Denormalized
      // onto the Meter doc only (same fields upload/manual readings keep
      // in sync) — no Reading document is created here, since
      // upload_reading.js/manual_reading.js already fall back to
      // meter.initialReading as "previousValue" when no Reading exists yet,
      // so consumption math is unaffected either way.
      lastReadingValue: resolvedInitialReading,
      lastReadingDate: resolvedInstallationDate,
      lastReadingBy: req.user._id,
    });

    return res
      .status(200)
      .send({ message: "Meter created successfully", meter });
  } catch (err) {
    console.error("Error in createMeter:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = createMeter;
