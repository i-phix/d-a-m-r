const db = require("../../utils/coreSchemas");
const { getMeter } = require("../../utils/damrSchemas");
const { assignMeterToUnit } = require("../../services/meterAssignmentService");
const { denyIfFacilityMismatch } = require("../../utils/accessControl");

const VALID_METER_TYPES = ["analogue", "digital"];
const VALID_CONDITIONS = ["new", "used", "replaced"];
const MAX_ROWS = 1000;

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const createBulkMeters = async (req, res) => {
  try {
    const { meters } = req.body;
    let { facilityId } = req.body;
    const { facilityName } = req.body;

    if (!Array.isArray(meters) || meters.length === 0) {
      return res
        .status(400)
        .send({ error: "meters (a non-empty array) is required" });
    }
    if (meters.length > MAX_ROWS) {
      return res
        .status(400)
        .send({ error: `Import is limited to ${MAX_ROWS} meters at a time` });
    }

    if (!facilityId && facilityName) {
      const facility = await db.Facility.findOne({
        name: { $regex: new RegExp(`^${escapeRegExp(facilityName)}$`, "i") },
      }).lean();
      facilityId = facility?._id || null;
      if (!facilityId) {
        console.warn(
          `[bulkImportMeters] Property "${facilityName}" not found — any rows requesting unit assignment will be skipped.`,
        );
      }
    }
    if (facilityId && denyIfFacilityMismatch(req, res, { facilityId })) return;

    const Meter = getMeter();
    const results = [];

    // Sequential, not Promise.all — the duplicate-serial-number check (and
    // the "is this unit already taken" check for assignment) both need to
    // see rows created/assigned earlier in this same batch, and a large
    // batch shouldn't open hundreds of concurrent writes anyway.
    for (let i = 0; i < meters.length; i++) {
      const row = meters[i] || {};
      const rowNum = i + 1;
      const serialNumber = String(row.serialNumber || "").trim();

      try {
        if (!serialNumber) {
          results.push({
            row: rowNum,
            status: "error",
            message: "Serial number is required",
          });
          continue;
        }

        const existing = await Meter.findOne({ serialNumber });
        if (existing) {
          results.push({
            row: rowNum,
            serialNumber,
            status: "skipped",
            message: "Serial number already exists",
          });
          continue;
        }

        const meterType = VALID_METER_TYPES.includes(row.meterType)
          ? row.meterType
          : "analogue";
        const condition = VALID_CONDITIONS.includes(row.condition)
          ? row.condition
          : "new";

        const resolvedInitialReading = Number(row.initialReading) || 0;
        const resolvedInstallationDate = row.installationDate
          ? new Date(row.installationDate)
          : new Date();
        if (isNaN(resolvedInstallationDate.getTime())) {
          results.push({
            row: rowNum,
            serialNumber,
            status: "error",
            message: `Invalid installation date: "${row.installationDate}"`,
          });
          continue;
        }

        const meter = await Meter.create({
          serialNumber,
          manufacturer: row.manufacturer
            ? String(row.manufacturer).trim()
            : undefined,
          model: row.model ? String(row.model).trim() : undefined,
          meterType,
          installationDate: resolvedInstallationDate,
          initialReading: resolvedInitialReading,
          condition,
          // Same reasoning as create_meter.js — the installation reading IS
          // the meter's first reading, denormalized onto the Meter doc so it
          // doesn't show blank until someone submits a reading later.
          lastReadingValue: resolvedInitialReading,
          lastReadingDate: resolvedInstallationDate,
          lastReadingBy: req.user._id,
        });

        const result = {
          row: rowNum,
          serialNumber,
          status: "created",
          meterId: meter._id,
        };

        // Assignment is entirely optional per row — only attempted when a
        // unit name was actually supplied.
        const unitName = row.unitName ? String(row.unitName).trim() : "";
        if (unitName) {
          if (!facilityId) {
            result.assignment = {
              status: "skipped",
              message: "No property selected — meter created but not assigned",
            };
          } else {
            const matchingUnit = await db.Unit.findOne({
              facilityId,
              name: { $regex: new RegExp(`^${escapeRegExp(unitName)}$`, "i") },
            }).lean();

            // Unit.meterId isn't a reliable field (see the comment above
            // meterAssignmentService.js's Unit.findByIdAndUpdate call) — the
            // real check for "already metered" is on the Meter side.
            const existingMeterOnUnit = matchingUnit
              ? await Meter.findOne({ unitId: matchingUnit._id }).lean()
              : null;

            if (!matchingUnit) {
              result.assignment = {
                status: "skipped",
                message: `Unit "${unitName}" not found in selected property — meter created but not assigned`,
              };
            } else if (existingMeterOnUnit) {
              result.assignment = {
                status: "skipped",
                message: `Unit "${unitName}" already has a meter — meter created but not assigned`,
              };
            } else {
              const assignOutcome = await assignMeterToUnit(
                meter,
                matchingUnit,
                {
                  logPrefix: "[bulkImportMeters] ",
                },
              );
              result.assignment = {
                status: "assigned",
                unitName: matchingUnit.name,
                notified: assignOutcome.notified,
              };
            }
          }
        }

        results.push(result);
      } catch (err) {
        results.push({
          row: rowNum,
          serialNumber: serialNumber || undefined,
          status: "error",
          message: err.message,
        });
      }
    }

    return res.status(200).send({
      message: "Bulk meter import complete",
      created: results.filter((r) => r.status === "created").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      errors: results.filter((r) => r.status === "error").length,
      assigned: results.filter((r) => r.assignment?.status === "assigned")
        .length,
      results,
    });
  } catch (err) {
    console.error("Error in createBulkMeters:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = createBulkMeters;
