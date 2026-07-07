const db = require("../../utils/coreSchemas");
const {
  getMeter: getMeterModel,
  getMeterBinding,
  getUnitMeta: getUnitMetaModel,
  getBlock,
} = require("../../utils/damrSchemas");
const {
  sendEmail,
  sendSMS,
  sendWhatsApp,
  meterAssignedEmailHTML,
  meterAssignedSmsText,
  wrapPlainTextEmail,
} = require("../../utils/emailSmsService");
const {
  generateMeterAssignedMessage,
} = require("../../services/aiMessageService");
const { denyIfFacilityMismatch } = require("../../utils/accessControl");
const assignMeter = async (req, res) => {
  try {
    const { unitId } = req.body;

    if (!unitId) {
      return res.status(400).send({ error: "unitId is required" });
    }

    const Meter = getMeterModel();
    const MeterBinding = getMeterBinding();
    const unit = await db.Unit.findById(unitId).lean();
    if (!unit) {
      return res.status(404).send({ error: "Unit not found" });
    }
    if (denyIfFacilityMismatch(req, res, unit)) return;

    const meter = await Meter.findById(req.params.id);
    if (!meter) {
      return res.status(404).send({ error: "Meter not found" });
    }
    if (denyIfFacilityMismatch(req, res, meter)) return;

    if (meter.status === "ASSIGNED") {
      return res
        .status(400)
        .send({ error: "Meter is already assigned. Unassign it first." });
    }
    const UnitMeta = getUnitMetaModel();
    const unitMeta = await UnitMeta.findOne({ unitId: unit._id }).lean();

    // Unit itself has no locationId field (db.Unit / coreSchemas.js never
    // defines one) — the unit's actual physical location lives on its
    // Block (Block.locationId, set via the facility's Complex/Block admin
    // UI), reached through the DAMR UnitMeta join. Previously this read
    // `unit.locationId`, which was always undefined, so the meter's
    // Location always displayed blank.
    let blockLocationId = null;
    if (unitMeta?.blockId) {
      const block = await getBlock().findById(unitMeta.blockId).lean();
      blockLocationId = block?.locationId || null;
    }

    meter.status = "ASSIGNED";
    meter.unitId = unit._id;
    meter.blockId = unitMeta?.blockId || null;
    meter.facilityId = unit.facilityId || null;
    meter.locationId = blockLocationId;
    await meter.save();

    await db.Unit.findByIdAndUpdate(unitId, { meterId: meter._id });
    const activeResidentId = unit.residentId || unit.activeResident;
    if (!activeResidentId) {
      console.log(
        `[assignMeter] Unit ${unitId} has status "${unit.status}" but no residentId set — skipping resident bind + notification.`,
      );
    }
    if (activeResidentId) {
      console.log(
        `[assignMeter] Binding meter ${meter._id} to resident ${activeResidentId}, sending notification...`,
      );
      meter.currentResident = activeResidentId;
      await meter.save();
      await MeterBinding.updateMany(
        { meterId: meter._id, active: true },
        { active: false, unbindDate: new Date() },
      );

      await MeterBinding.create({
        meterId: meter._id,
        residentId: activeResidentId,
        unitId: unit._id,
      });
      try {
        const resident = await db.Resident.findById(activeResidentId).lean();
        if (resident) {
          const notifyData = {
            residentName: resident.name,
            meterSerial: meter.serialNumber,
            initialReading: meter.initialReading,
          };
          const phone = resident.phoneNumber || resident.phone;
          let aiText = null;
          try {
            aiText = await generateMeterAssignedMessage(notifyData);
            console.log(
              `[assignMeter] AI-generated message used for meter ${meter._id}`,
            );
          } catch (aiErr) {
            console.warn(
              `[assignMeter] AI meter-assigned message generation failed, using fallback template: ${aiErr.message}`,
            );
          }
          const emailHtml = aiText
            ? wrapPlainTextEmail("Water Meter Assigned", aiText)
            : meterAssignedEmailHTML(notifyData);
          const smsText = aiText
            ? aiText.replace(/\n+/g, " ").trim()
            : meterAssignedSmsText(notifyData);

          const results = await Promise.allSettled([
            resident.email
              ? sendEmail(resident.email, "Water Meter Assigned", emailHtml)
              : Promise.resolve({ skipped: "no email on file" }),
            phone
              ? sendSMS(phone, smsText)
              : Promise.resolve({ skipped: "no phone on file" }),
            phone
              ? sendWhatsApp(phone, smsText, {
                  contactName: resident.name,
                  source: "damr-meter-assigned",
                })
              : Promise.resolve({ skipped: "no phone on file" }),
          ]);
          const [emailResult, smsResult, waResult] = results;
          console.log(
            `[assignMeter] Notification results for meter ${meter._id} → resident ${activeResidentId} (source: ${aiText ? "AI" : "template"}): ` +
              `email=${emailResult.status}${emailResult.status === "rejected" ? ` (${emailResult.reason?.message})` : ""}, ` +
              `sms=${smsResult.status}${smsResult.status === "rejected" ? ` (${smsResult.reason?.message})` : ""}, ` +
              `whatsapp=${waResult.status}${waResult.status === "rejected" ? ` (${waResult.reason?.message})` : ""}`,
          );
        } else {
          console.log(
            `[assignMeter] No resident document found for id ${activeResidentId} — cannot notify.`,
          );
        }
      } catch (notifyErr) {
        console.error(
          `Meter-assigned notification failed for meter ${meter._id}:`,
          notifyErr.message,
        );
      }
    }

    return res
      .status(200)
      .send({ message: "Meter assigned successfully", meter });
  } catch (err) {
    console.error("Error in assignMeter:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = assignMeter;
