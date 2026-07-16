const db = require("../utils/coreSchemas");
const {
  getMeterBinding,
  getUnitMeta: getUnitMetaModel,
  getBlock,
} = require("../utils/damrSchemas");
const {
  sendEmail,
  sendSMS,
  sendWhatsApp,
  meterAssignedEmailHTML,
  meterAssignedSmsText,
  welcomeResidentEmailHTML,
  welcomeResidentSmsText,
  wrapPlainTextEmail,
} = require("../utils/emailSmsService");
const { generateResidentMessage } = require("./aiMessageService");

async function assignMeterToUnit(meter, unit, { logPrefix = "" } = {}) {
  const MeterBinding = getMeterBinding();
  const UnitMeta = getUnitMetaModel();
  const unitMeta = await UnitMeta.findOne({ unitId: unit._id }).lean();

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

  await db.Unit.findByIdAndUpdate(unit._id, { meterId: meter._id });

  const activeResidentId = unit.residentId || unit.activeResident;
  if (!activeResidentId) {
    console.log(
      `${logPrefix}[assignMeterToUnit] Unit ${unit._id} has no residentId set — meter bound, skipping resident bind + notification.`,
    );
    return { notified: false };
  }

  console.log(
    `${logPrefix}[assignMeterToUnit] Binding meter ${meter._id} to resident ${activeResidentId}, sending notification...`,
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
    if (!resident) {
      console.log(
        `${logPrefix}[assignMeterToUnit] No resident document found for id ${activeResidentId} — cannot notify.`,
      );
      return { notified: false };
    }

    const isFirstNotification = !resident.welcomeMessageSent;

    let facility = null;
    let block = null;
    if (isFirstNotification) {
      [facility, block] = await Promise.all([
        unit.facilityId ? db.Facility.findById(unit.facilityId).lean() : null,
        unitMeta?.blockId ? getBlock().findById(unitMeta.blockId).lean() : null,
      ]);
    }

    const notifyData = {
      residentName: resident.name,
      meterSerial: meter.serialNumber,
      initialReading: meter.initialReading,
      ...(isFirstNotification && {
        facilityName: facility?.name,
        blockName: block?.name,
        unitName: unit.name,
      }),
    };
    const phone = resident.phoneNumber || resident.phone;
    const emailSubject = isFirstNotification
      ? `Welcome to ${facility?.name || "your new home"}`
      : "Water Meter Assigned";
    let aiText = null;
    try {
      aiText = await generateResidentMessage({
        ...notifyData,
        isNewResident: isFirstNotification,
      });
      console.log(
        `${logPrefix}[assignMeterToUnit] AI-generated ${isFirstNotification ? "welcome+meter" : "meter-assigned"} message used for meter ${meter._id}`,
      );
    } catch (aiErr) {
      console.warn(
        `${logPrefix}[assignMeterToUnit] AI message generation failed, using fallback template: ${aiErr.message}`,
      );
    }
    const emailHtml = aiText
      ? wrapPlainTextEmail(emailSubject, aiText)
      : isFirstNotification
        ? welcomeResidentEmailHTML(notifyData)
        : meterAssignedEmailHTML(notifyData);
    const smsText = aiText
      ? aiText.replace(/\n+/g, " ").trim()
      : isFirstNotification
        ? welcomeResidentSmsText(notifyData)
        : meterAssignedSmsText(notifyData);

    const results = await Promise.allSettled([
      resident.email
        ? sendEmail(resident.email, emailSubject, emailHtml)
        : Promise.resolve({ skipped: "no email on file" }),
      phone
        ? sendSMS(phone, smsText)
        : Promise.resolve({ skipped: "no phone on file" }),
      phone
        ? sendWhatsApp(phone, smsText, {
            contactName: resident.name,
            source: isFirstNotification
              ? "damr-resident-welcome"
              : "damr-meter-assigned",
          })
        : Promise.resolve({ skipped: "no phone on file" }),
    ]);
    const [emailResult, smsResult, waResult] = results;
    console.log(
      `${logPrefix}[assignMeterToUnit] Notification results for meter ${meter._id} → resident ${activeResidentId} (source: ${aiText ? "AI" : "template"}): ` +
        `email=${emailResult.status}${emailResult.status === "rejected" ? ` (${emailResult.reason?.message})` : ""}, ` +
        `sms=${smsResult.status}${smsResult.status === "rejected" ? ` (${smsResult.reason?.message})` : ""}, ` +
        `whatsapp=${waResult.status}${waResult.status === "rejected" ? ` (${waResult.reason?.message})` : ""}`,
    );

    if (isFirstNotification) {
      await db.Resident.findByIdAndUpdate(resident._id, {
        welcomeMessageSent: true,
      });
    }

    return { notified: true, isFirstNotification };
  } catch (notifyErr) {
    console.error(
      `${logPrefix}Meter-assigned notification failed for meter ${meter._id}:`,
      notifyErr.message,
    );
    return { notified: false, error: notifyErr.message };
  }
}

module.exports = { assignMeterToUnit };
