const fs = require("fs");
const { getMeter, getReading, getFlag } = require("../../utils/damrSchemas");
const {
  detectAnomalies,
  checkDuplicateSubmission,
} = require("../../services/anomalyService");
const { isFacilityMismatch } = require("../../utils/accessControl");
const { runOCRPipeline, verifySerial } = require("../../services/ocrService");

const MAX_ROWS = 1000;
const OCR_MISMATCH_ABS_TOLERANCE = 1;
const OCR_MISMATCH_REL_TOLERANCE = 0.02;

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const createBulkReadings = async (req, res) => {
  try {
    let readings;
    try {
      readings = JSON.parse(req.body.readings || "[]");
    } catch {
      return res.status(400).send({ error: "readings must be valid JSON" });
    }

    if (!Array.isArray(readings) || readings.length === 0) {
      return res
        .status(400)
        .send({ error: "readings (a non-empty array) is required" });
    }
    if (readings.length > MAX_ROWS) {
      return res
        .status(400)
        .send({ error: `Import is limited to ${MAX_ROWS} readings at a time` });
    }

    const photoByIndex = new Map();
    for (const file of req.files || []) {
      const match = file.fieldname.match(/^photo_(\d+)$/);
      const index = match ? Number(match[1]) : -1;
      if (match && index >= 0 && index < readings.length) {
        photoByIndex.set(index, file);
      } else {
        fs.unlink(file.path, () => {});
      }
    }

    const Meter = getMeter();
    const Reading = getReading();
    const Flag = getFlag();
    const results = [];

    for (let i = 0; i < readings.length; i++) {
      const row = readings[i] || {};
      const rowNum = i + 1;
      const serialNumber = String(
        row.meterSerial || row.serialNumber || "",
      ).trim();
      const photoFile = photoByIndex.get(i) || null;

      try {
        if (!serialNumber) {
          results.push({
            row: rowNum,
            status: "error",
            message: "Meter serial number is required",
          });
          continue;
        }
        if (row.value === undefined || row.value === null || row.value === "") {
          results.push({
            row: rowNum,
            serialNumber,
            status: "error",
            message: "Reading value is required",
          });
          continue;
        }
        const parsedValue = parseFloat(row.value);
        if (isNaN(parsedValue) || parsedValue < 0) {
          results.push({
            row: rowNum,
            serialNumber,
            status: "error",
            message: "Reading value must be a non-negative number",
          });
          continue;
        }

        const meter = await Meter.findOne({
          serialNumber: {
            $regex: new RegExp(`^${escapeRegExp(serialNumber)}$`, "i"),
          },
        });
        if (!meter) {
          results.push({
            row: rowNum,
            serialNumber,
            status: "error",
            message: "No meter found with this serial number",
          });
          continue;
        }
        if (isFacilityMismatch(req, meter)) {
          results.push({
            row: rowNum,
            serialNumber,
            status: "error",
            message: "You do not have access to this meter's facility",
          });
          continue;
        }
        if (meter.status === "UNASSIGNED") {
          results.push({
            row: rowNum,
            serialNumber,
            status: "skipped",
            message: "Meter is not assigned to a unit",
          });
          continue;
        }

        const resolvedDate = row.readingDate
          ? new Date(row.readingDate)
          : new Date();
        if (isNaN(resolvedDate.getTime())) {
          results.push({
            row: rowNum,
            serialNumber,
            status: "error",
            message: `Invalid reading date: "${row.readingDate}"`,
          });
          continue;
        }

        const previous = await Reading.findOne({ meterId: meter._id })
          .sort({ readingDate: -1 })
          .lean();
        const previousValue = previous?.value ?? meter.initialReading ?? 0;
        const isMeterReset = parsedValue < previousValue;
        const consumption = isMeterReset
          ? parsedValue
          : Math.max(0, parsedValue - previousValue);

        let ocrResult = null;
        if (photoFile) {
          ocrResult = await runOCRPipeline(photoFile.path);
        }
        const serialStatus = photoFile
          ? verifySerial(ocrResult, meter.serialNumber)
          : null;
        const serialNeedsReview =
          serialStatus === "mismatch" || serialStatus === "unverified";

        const reading = await Reading.create({
          meterId: meter._id,
          unitId: meter.unitId || null,
          facilityId: meter.facilityId || null,
          readingDate: resolvedDate,
          value: parsedValue,
          previousValue,
          consumption,
          method: "manual",
          imageUrl: photoFile ? `/uploads/${photoFile.filename}` : null,
          ocrRawValue: ocrResult?.rawText || null,
          ocrConfidence: ocrResult?.confidence || null,
          status: serialNeedsReview ? "pending" : "confirmed",
          submittedBy: req.user._id,
          notes: row.notes
            ? String(row.notes).trim()
            : isMeterReset
              ? "Meter reset detected"
              : "",
        });

        await Meter.findByIdAndUpdate(meter._id, {
          lastReadingValue: reading.value,
          lastReadingDate: reading.readingDate,
          lastReadingBy: req.user._id,
        });

        let flag = null;
        if (isMeterReset) {
          flag = await Flag.create({
            type: "manual_review",
            meterId: meter._id,
            readingId: reading._id,
            facilityId: meter.facilityId || null,
            status: "open",
            description: `Meter reset detected — previous reading: ${previousValue} m³, new reading: ${parsedValue} m³. Please verify.`,
          });
          await Meter.findByIdAndUpdate(meter._id, {
            $inc: { openFlagCount: 1 },
          });
        } else {
          flag = await detectAnomalies(reading);
        }

        let ocrMismatchFlag = null;
        if (
          ocrResult?.value !== null &&
          ocrResult?.value !== undefined &&
          ocrResult.meetsThreshold
        ) {
          const tolerance = Math.max(
            OCR_MISMATCH_ABS_TOLERANCE,
            parsedValue * OCR_MISMATCH_REL_TOLERANCE,
          );
          if (Math.abs(ocrResult.value - parsedValue) > tolerance) {
            ocrMismatchFlag = await Flag.create({
              type: "ocr_mismatch",
              meterId: meter._id,
              readingId: reading._id,
              facilityId: meter.facilityId || null,
              status: "open",
              description: `Keyed value ${parsedValue} m³ differs from the OCR-read value ${ocrResult.value} m³ on the attached photo — please verify.`,
            });
            await Meter.findByIdAndUpdate(meter._id, {
              $inc: { openFlagCount: 1 },
            });
          }
        }

        let serialFlag = null;
        if (serialStatus === "mismatch" || serialStatus === "unverified") {
          serialFlag = await Flag.create({
            type:
              serialStatus === "mismatch"
                ? "serial_mismatch"
                : "serial_unverified",
            meterId: meter._id,
            readingId: reading._id,
            facilityId: meter.facilityId || null,
            status: "open",
            description:
              serialStatus === "mismatch"
                ? `Attached photo's visible serial number ("${ocrResult.serialNumber}") doesn't match this meter's registered serial number ("${meter.serialNumber}") — reading held as pending until verified.`
                : `Could not confidently read a serial number from the attached photo — reading held as pending until someone verifies it's for meter ${meter.serialNumber}.`,
          });
          await Meter.findByIdAndUpdate(meter._id, {
            $inc: { openFlagCount: 1 },
          });
        }

        const duplicateFlag = await checkDuplicateSubmission(reading);

        results.push({
          row: rowNum,
          serialNumber,
          status: "created",
          readingId: reading._id,
          value: parsedValue,
          consumption,
          photo: !!photoFile,
          ocrChecked: !!ocrResult,
          pending: serialNeedsReview,
          flag: flag
            ? flag.type
            : serialFlag
              ? serialFlag.type
              : ocrMismatchFlag
                ? "ocr_mismatch"
                : null,
          duplicate: !!duplicateFlag,
        });
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
      message: "Bulk reading import complete",
      created: results.filter((r) => r.status === "created").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      errors: results.filter((r) => r.status === "error").length,
      flagged: results.filter((r) => r.flag).length,
      withPhoto: results.filter((r) => r.photo).length,
      pending: results.filter((r) => r.pending).length,
      results,
    });
  } catch (err) {
    console.error("Error in createBulkReadings:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = createBulkReadings;
