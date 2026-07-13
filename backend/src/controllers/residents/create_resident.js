const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const db = require("../../utils/coreSchemas");
const {
  getMeter: getMeterModel,
  getMeterBinding,
  getOccupancyHistory,
  getBlock,
  getUnitMeta: getUnitMetaModel,
} = require("../../utils/damrSchemas");
const {
  sendEmail,
  sendSMS,
  sendWhatsApp,
  welcomeResidentEmailHTML,
  welcomeResidentSmsText,
  wrapPlainTextEmail,
} = require("../../utils/emailSmsService");
const { generateResidentMessage } = require("../../services/aiMessageService");
const { denyIfFacilityMismatch } = require("../../utils/accessControl");

const createResident = async (req, res) => {
  try {
    const { unitId, fullName, nationalId, phone, email, moveInDate } = req.body;

    if (!unitId || !fullName || !nationalId || !phone || !email) {
      return res.status(400).send({
        error: "unitId, fullName, nationalId, phone and email are required",
      });
    }

    const unit = await db.Unit.findById(unitId);
    if (!unit) return res.status(404).send({ error: "Unit not found" });
    if (denyIfFacilityMismatch(req, res, unit)) return;

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await db.User.findOne({
      email: normalizedEmail,
    });

    let reuseExistingUser = false;
    if (existingUser) {
      if (existingUser.type !== "Resident") {
        return res.status(400).send({
          error: "A staff/admin account with this email already exists",
        });
      }
      const idMatches = await bcrypt.compare(nationalId, existingUser.password);
      if (!idMatches) {
        return res.status(400).send({
          error:
            "This email is already registered under a different ID number — please verify the resident's details.",
        });
      }
      reuseExistingUser = true;
    }

    const Meter = getMeterModel();
    const MeterBinding = getMeterBinding();
    const OccupancyHistory = getOccupancyHistory();

    // Move out previous resident if unit is occupied
    if (unit.residentId) {
      await db.Resident.findByIdAndUpdate(unit.residentId, {
        status: "Inactive",
      });
      await OccupancyHistory.findOneAndUpdate(
        { residentId: unit.residentId, moveOutDate: null },
        {
          moveOutDate: new Date(),
          moveOutReason: "transfer",
          recordedBy: req.user._id,
        },
      );
    }

    const resident = await db.Resident.create({
      residentId: uuidv4().slice(0, 8).toUpperCase(),
      name: fullName,
      email: normalizedEmail,
      phone,
      nationalId,
      unitId,
      unitName: unit.name || "",
      facilityId: unit.facilityId,
    });
    let user = existingUser;
    if (!reuseExistingUser) {
      const hashedPassword = await bcrypt.hash(nationalId, 10);
      try {
        user = await db.User.create({
          fullName,
          email: normalizedEmail,
          phoneNumber: phone,
          idNumber: nationalId,
          password: hashedPassword,
          role: "user",
          type: "Resident",
          facilityId: unit.facilityId,
        });
      } catch (userErr) {
        if (
          userErr.code === 11000 &&
          Object.keys(userErr.keyPattern || {}).includes("phoneNumber")
        ) {
          const conflicting = await db.User.findOne({
            phoneNumber: phone,
          }).lean();
          await db.Resident.findByIdAndDelete(resident._id);
          return res.status(400).send({
            error: conflicting
              ? `This phone number is already registered to another account (${conflicting.fullName || conflicting.email}). If this is the same person moving into a second unit, use the email address they originally registered with instead.`
              : "This phone number is already registered to another account.",
          });
        }
        throw userErr;
      }
    }

    await db.Unit.findByIdAndUpdate(unitId, {
      status: "OCCUPIED",
      residentId: resident._id,
    });

    await OccupancyHistory.create({
      unitId,
      residentId: resident._id,
      moveInDate: moveInDate ? new Date(moveInDate) : new Date(),
      recordedBy: req.user._id,
    });
    let boundMeter = null;
    if (unit.meterId) {
      boundMeter = await Meter.findByIdAndUpdate(
        unit.meterId,
        { currentResident: resident._id, status: "ASSIGNED" },
        { new: true },
      ).lean();
      await MeterBinding.updateMany(
        { meterId: unit.meterId, active: true },
        { active: false, unbindDate: new Date() },
      );
      await MeterBinding.create({
        meterId: unit.meterId,
        residentId: resident._id,
        unitId,
      });
    }

    if (!boundMeter) {
      console.log(
        `[createResident] Unit ${unitId} has no meter yet — holding welcome notification for resident ${resident._id} until a meter is assigned.`,
      );
    } else {
      try {
        const unitMeta = await getUnitMetaModel()
          .findOne({ unitId: unit._id })
          .lean();
        const [facility, block] = await Promise.all([
          unit.facilityId ? db.Facility.findById(unit.facilityId).lean() : null,
          unitMeta?.blockId
            ? getBlock().findById(unitMeta.blockId).lean()
            : null,
        ]);
        const welcomeData = {
          residentName: fullName,
          facilityName: facility?.name,
          blockName: block?.name,
          unitName: unit.name,
          meterSerial: boundMeter?.serialNumber,
          initialReading: boundMeter?.initialReading,
        };

        let aiText = null;
        try {
          aiText = await generateResidentMessage({
            ...welcomeData,
            isNewResident: true,
          });
          console.log(
            `[createResident] AI-generated welcome message used for resident ${resident._id}`,
          );
        } catch (aiErr) {
          console.warn(
            `[createResident] AI welcome message generation failed, using fallback template: ${aiErr.message}`,
          );
        }
        const emailHtml = aiText
          ? wrapPlainTextEmail(
              `Welcome to ${facility?.name || "your new home"}`,
              aiText,
            )
          : welcomeResidentEmailHTML(welcomeData);
        const smsText = aiText
          ? aiText.replace(/\n+/g, " ").trim()
          : welcomeResidentSmsText(welcomeData);

        const results = await Promise.allSettled([
          email
            ? sendEmail(
                email,
                `Welcome to ${facility?.name || "your new home"}`,
                emailHtml,
              )
            : Promise.resolve({ skipped: "no email" }),
          phone
            ? sendSMS(phone, smsText)
            : Promise.resolve({ skipped: "no phone" }),
          phone
            ? sendWhatsApp(phone, smsText, {
                contactName: fullName,
                source: "damr-resident-welcome",
              })
            : Promise.resolve({ skipped: "no phone" }),
        ]);
        const [emailResult, smsResult, waResult] = results;
        console.log(
          `[createResident] Welcome notification results for resident ${resident._id} (source: ${aiText ? "AI" : "template"}): ` +
            `email=${emailResult.status}${emailResult.status === "rejected" ? ` (${emailResult.reason?.message})` : ""}, ` +
            `sms=${smsResult.status}${smsResult.status === "rejected" ? ` (${smsResult.reason?.message})` : ""}, ` +
            `whatsapp=${waResult.status}${waResult.status === "rejected" ? ` (${waResult.reason?.message})` : ""}`,
        );
        await db.Resident.findByIdAndUpdate(resident._id, {
          welcomeMessageSent: true,
        });
      } catch (notifyErr) {
        console.error(
          `Welcome notification failed for resident ${resident._id}:`,
          notifyErr.message,
        );
      }
    }

    return res.status(200).send({
      message: reuseExistingUser
        ? "Resident added to a new unit successfully — using their existing login"
        : "Resident created successfully",
      resident,
      credentials: reuseExistingUser
        ? {
            email: user.email,
            note: "This resident already has a login from a previous unit — same email and ID number work for this one too.",
          }
        : {
            email: user.email,
            password: nationalId,
            note: "Default password is the national ID. Resident should change after first login.",
          },
    });
  } catch (err) {
    console.error("Error in createResident:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = createResident;
