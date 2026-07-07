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
const { generateWelcomeMessage } = require("../../services/aiMessageService");
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

    // A resident can occupy more than one unit (e.g. a landlord renting out
    // a second unit in the same estate). Previously ANY existing User with
    // this email blocked creation outright, which made a second unit
    // impossible without a different email. Now: if the existing account is
    // itself a resident login, and the national ID they're registering with
    // matches the one already on file (bcrypt-compared against the stored
    // password, since that's literally what it's hashed from), reuse that
    // login instead of trying to create a second one — which also avoids
    // ever re-attempting User.create() with the same phone number, sidestepping
    // payservedb's unique index on phoneNumber (a shared package — not something
    // DAMR can relax) for this legitimate case. A genuine conflict (a
    // different account type, or a mismatched ID) still blocks as before.
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

    // Create resident record — every unit gets its own Resident document
    // (residentId is unique per document, but email/phone/nationalId are
    // deliberately not unique on this schema) even when it's the same
    // physical person occupying a second unit.
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

    // Create the login account only the first time — reusing it for a
    // second (or third...) unit under the same person, per the check above.
    // Residents are NOT staff and cannot access admin/staff features.
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
        // payservedb's User model has a unique (schema-level) index on
        // phoneNumber — not something DAMR can relax, it's a shared
        // package. This only bites when a genuinely different person
        // (different email/ID) shares a phone number with an existing
        // account; the same-person-multiple-units case above never reaches
        // here since it reuses the existing account instead.
        if (userErr.code === 11000 && Object.keys(userErr.keyPattern || {}).includes("phoneNumber")) {
          const conflicting = await db.User.findOne({ phoneNumber: phone }).lean();
          await db.Resident.findByIdAndDelete(resident._id); // roll back the orphaned Resident doc
          return res.status(400).send({
            error: conflicting
              ? `This phone number is already registered to another account (${conflicting.fullName || conflicting.email}). If this is the same person moving into a second unit, use the email address they originally registered with instead.`
              : "This phone number is already registered to another account.",
          });
        }
        throw userErr;
      }
    }

    // Mark unit as occupied
    await db.Unit.findByIdAndUpdate(unitId, {
      status: "OCCUPIED",
      residentId: resident._id,
    });

    // Occupancy history
    await OccupancyHistory.create({
      unitId,
      residentId: resident._id,
      moveInDate: moveInDate ? new Date(moveInDate) : new Date(),
      recordedBy: req.user._id,
    });

    // Auto-bind meter if unit has one
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

    // Welcome message — best-effort, never blocks resident creation which
    // has already fully succeeded above.
    try {
      // unit.blockId isn't a real db.Unit field — resolve it from
      // DAMR's own UnitMeta join (see controllers/facility/units.js).
      const unitMeta = await getUnitMetaModel().findOne({ unitId: unit._id }).lean();
      const [facility, block] = await Promise.all([
        unit.facilityId ? db.Facility.findById(unit.facilityId).lean() : null,
        unitMeta?.blockId ? getBlock().findById(unitMeta.blockId).lean() : null,
      ]);
      const welcomeData = {
        residentName: fullName,
        facilityName: facility?.name,
        blockName: block?.name,
        unitName: unit.name,
        meterSerial: boundMeter?.serialNumber,
        initialReading: boundMeter?.initialReading,
      };
      // Try generating the message live via AI first; fall back to the
      // hardcoded template on any failure (not configured, timeout, API
      // error, safety-filtered, too short, etc.) so a flaky AI provider
      // never blocks the welcome notification from going out.
      let aiText = null;
      try {
        aiText = await generateWelcomeMessage(welcomeData);
        console.log(`[createResident] AI-generated welcome message used for resident ${resident._id}`);
      } catch (aiErr) {
        console.warn(
          `[createResident] AI welcome message generation failed, using fallback template: ${aiErr.message}`,
        );
      }
      const emailHtml = aiText
        ? wrapPlainTextEmail(`Welcome to ${facility?.name || "your new home"}`, aiText)
        : welcomeResidentEmailHTML(welcomeData);
      const smsText = aiText ? aiText.replace(/\n+/g, " ").trim() : welcomeResidentSmsText(welcomeData);

      // Each channel is fired via one Promise.allSettled call so a
      // failure in email (e.g. communications endpoint unreachable)
      // can't silently prevent SMS/WhatsApp from being attempted too —
      // previously sendEmail was awaited on its own, so an email failure
      // skipped SMS/WhatsApp entirely.
      const results = await Promise.allSettled([
        email
          ? sendEmail(email, `Welcome to ${facility?.name || "your new home"}`, emailHtml)
          : Promise.resolve({ skipped: "no email" }),
        phone ? sendSMS(phone, smsText) : Promise.resolve({ skipped: "no phone" }),
        phone
          ? sendWhatsApp(phone, smsText, { contactName: fullName, source: "damr-resident-welcome" })
          : Promise.resolve({ skipped: "no phone" }),
      ]);
      const [emailResult, smsResult, waResult] = results;
      console.log(
        `[createResident] Welcome notification results for resident ${resident._id} (source: ${aiText ? "AI" : "template"}): ` +
          `email=${emailResult.status}${emailResult.status === "rejected" ? ` (${emailResult.reason?.message})` : ""}, ` +
          `sms=${smsResult.status}${smsResult.status === "rejected" ? ` (${smsResult.reason?.message})` : ""}, ` +
          `whatsapp=${waResult.status}${waResult.status === "rejected" ? ` (${waResult.reason?.message})` : ""}`,
      );
    } catch (notifyErr) {
      console.error(
        `Welcome notification failed for resident ${resident._id}:`,
        notifyErr.message,
      );
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
