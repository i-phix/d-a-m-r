const axios = require("axios");

const {
  COMMUNICATIONS_ENDPOINT,
  SENDERID,
  API_KEY,
  DAMR_SMS_FACILITY_ID,
  EMAIL_SENDER,
  EMAIL_HOST,
  EMAIL_PORT,
  EMAIL_SECURE,
  EMAIL_USER,
  EMAIL_PASS,
  EMAIL_SENDER_NAME,
  DAMR_EMAIL_FACILITY_ID,
  MAIN_BACKEND_URL,
  INTERNAL_SERVICE_TOKEN,
  UTILITY_WHATSAPP_ENABLED,
} = process.env;

const DIRECT_SMS_ENDPOINT = () => `${COMMUNICATIONS_ENDPOINT}/api/sms/send`;
const DIRECT_EMAIL_ENDPOINT = () => `${COMMUNICATIONS_ENDPOINT}/api/email/send`;
const WHATSAPP_ENDPOINT = () =>
  `${MAIN_BACKEND_URL}/api/internal/notifications/whatsapp`;

function formatKenyanPhone(phone) {
  const digits = String(phone).replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits.slice(1);
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  return `254${digits}`;
}

function formatFromField(senderEmail, senderName) {
  if (senderName && senderName.trim() !== "") {
    const escapedName = senderName.replace(/"/g, '\\"');
    return `"${escapedName}" <${senderEmail}>`;
  }
  return senderEmail;
}

const SMS_MAX_CHARS = 141;

function capSmsText(text, max = SMS_MAX_CHARS) {
  const trimmed = String(text || "").trim();
  if (trimmed.length <= max) return trimmed;
  let cut = trimmed.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > max * 0.6) cut = cut.slice(0, lastSpace);
  return cut.trim();
}
function appendLinkIfFits(base, label, link, max = SMS_MAX_CHARS) {
  if (!link) return base;
  const withLink = `${base} ${label}: ${link}`;
  return withLink.length <= max ? withLink : base;
}

async function sendSMS(to, message) {
  if (!to) return null;

  if (!COMMUNICATIONS_ENDPOINT || !SENDERID || !API_KEY) {
    throw new Error(
      "SMS service not configured — set COMMUNICATIONS_ENDPOINT, SENDERID and API_KEY",
    );
  }

  try {
    const payload = {
      facilityId: DAMR_SMS_FACILITY_ID,
      from: SENDERID,
      to: formatKenyanPhone(to),
      message,
      token: API_KEY,
    };

    const response = await axios.post(DIRECT_SMS_ENDPOINT(), payload, {
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    console.log(`[SMS] Sent to ${to}`);
    return response.data;
  } catch (err) {
    console.error(
      `[SMS] Failed to send to ${to}:`,
      err.response?.data || err.message,
    );
    throw err;
  }
}

async function sendEmail(to, subject, html, text) {
  if (!to) return null;

  if (!COMMUNICATIONS_ENDPOINT || !EMAIL_HOST || !EMAIL_USER || !EMAIL_PASS) {
    throw new Error(
      "Email service not configured — set COMMUNICATIONS_ENDPOINT, EMAIL_HOST, EMAIL_USER and EMAIL_PASS",
    );
  }

  try {
    const payload = {
      facilityId: DAMR_EMAIL_FACILITY_ID,
      from: formatFromField(EMAIL_SENDER || EMAIL_USER, EMAIL_SENDER_NAME),
      to,
      subject,
      text:
        text ||
        `${subject}\n\nPlease view this email with an HTML-capable client.`,
      ...(html && { html }),
      emailConfig: {
        host: EMAIL_HOST,
        port: parseInt(EMAIL_PORT, 10) || 587,
        secure: EMAIL_SECURE === "true",
        user: EMAIL_USER,
        pass: EMAIL_PASS,
        rejectUnauthorized: true,
      },
    };

    const response = await axios.post(DIRECT_EMAIL_ENDPOINT(), payload, {
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    console.log(`[Email] Sent to ${to}: "${subject}"`);
    return response.data;
  } catch (err) {
    console.error(
      `[Email] Failed to send to ${to}:`,
      err.response?.data || err.message,
    );
    throw err;
  }
}

async function sendWhatsApp(to, message, opts = {}) {
  if (!to) return { success: false, error: "no recipient" };

  if (UTILITY_WHATSAPP_ENABLED !== "true") {
    return { success: false, error: "UTILITY_WHATSAPP_ENABLED is not 'true'" };
  }

  if (!MAIN_BACKEND_URL || !INTERNAL_SERVICE_TOKEN) {
    console.warn(
      "[WhatsApp] Not configured — set MAIN_BACKEND_URL and INTERNAL_SERVICE_TOKEN",
    );
    return { success: false, error: "WhatsApp bridge not configured" };
  }

  try {
    const response = await axios.post(
      WHATSAPP_ENDPOINT(),
      {
        phone: formatKenyanPhone(to),
        message,
        contactName: opts.contactName,
        source: opts.source || "damr",
      },
      {
        timeout: 15000,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${INTERNAL_SERVICE_TOKEN}`,
        },
      },
    );
    console.log(`[WhatsApp] Sent to ${to}`);
    return response.data;
  } catch (err) {
    console.warn(
      `[WhatsApp] Failed to send to ${to}:`,
      err.response?.data || err.message,
    );
    return { success: false, error: err.response?.data?.error || err.message };
  }
}

function wrapPlainTextEmail(title, plainText) {
  const bodyHtml = String(plainText || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p}</p>`)
    .join("\n");
  return baseEmailWrapper(title, bodyHtml);
}

function baseEmailWrapper(title, bodyHtml) {
  return `
  <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; color: #131920;">
    <div style="background:#0d3b66; padding:20px; text-align:center;">
      <h2 style="color:#ffffff; margin:0;">DAMR &mdash; PayServe</h2>
    </div>
    <div style="padding: 24px; background:#ffffff;">
      <h3 style="margin-top:0;">${title}</h3>
      ${bodyHtml}
    </div>
    <div style="padding:12px; text-align:center; color:#888888; font-size:12px;">
      Private &amp; confidential &mdash; DAMR Automated Utility Billing
    </div>
  </div>`;
}

function paymentInstructionsHTML({ paybillShortCode, accountNumber }) {
  if (!paybillShortCode || !accountNumber) {
    return `<p>Payment details for this facility haven't been set up yet — please contact your facility manager.</p>`;
  }
  return `
    <div style="background:#f5f7fa; border:1px solid #e0e4e8; border-radius:6px; padding:14px 16px; margin:16px 0;">
      <p style="margin:0 0 8px 0; font-weight:bold;">How to pay (M-Pesa Paybill)</p>
      <table style="width:100%; border-collapse:collapse;">
        <tr><td style="padding:4px 0; color:#666;">Paybill</td><td style="padding:4px 0; text-align:right;"><strong>${paybillShortCode}</strong></td></tr>
        <tr><td style="padding:4px 0; color:#666;">Account Number</td><td style="padding:4px 0; text-align:right;"><strong>${accountNumber}</strong></td></tr>
      </table>
    </div>`;
}

function paymentInstructionsSmsText({ paybillShortCode, accountNumber }) {
  if (!paybillShortCode || !accountNumber) return "";
  return ` Pay via M-Pesa Paybill ${paybillShortCode}, Account ${accountNumber}.`;
}

function billLinkHTML(billLink) {
  if (!billLink) return "";
  return `
    <div style="text-align:center; margin:20px 0;">
      <a href="${billLink}" style="background:#0d3b66; color:#ffffff; text-decoration:none; padding:10px 20px; border-radius:6px; display:inline-block; font-weight:bold;">View &amp; Pay Bill Online</a>
    </div>
    <p style="font-size:12px; color:#888; text-align:center;">Or open this link: <a href="${billLink}">${billLink}</a></p>`;
}

function billLinkSmsText(billLink) {
  return billLink ? ` View/pay online: ${billLink}` : "";
}

function statementLinkHTML(statementLink) {
  if (!statementLink) return "";
  return `
    <p style="font-size:12px; color:#888; text-align:center; margin-top:16px;">
      <a href="${statementLink}">View your full statement of account</a> (every bill and payment)
    </p>`;
}

function statementLinkSmsText(statementLink) {
  return statementLink ? ` Full statement: ${statementLink}` : "";
}

function validationStatusRowHTML(validationStatus) {
  if (!validationStatus) return "";
  const colorByStatus = {
    passed: "#2e7d32",
    cleared: "#2e7d32",
    flagged: "#c0392b",
    unavailable: "#666",
  };
  const color = colorByStatus[validationStatus.status] || "#666";
  return `<tr><td style="padding:6px 0; color:#666;">AI Validation</td><td style="padding:6px 0; text-align:right; color:${color}; font-weight:bold;">${validationStatus.label}</td></tr>`;
}

function validationStatusSmsText(validationStatus) {
  if (!validationStatus) return "";
  return ` AI validation: ${validationStatus.label}.`;
}

function invoiceEmailHTML({
  residentName,
  invoiceId,
  periodStart,
  periodEnd,
  totalAmount,
  consumption,
  dueDate,
  paybillShortCode,
  accountNumber,
  billLink,
  validationStatus,
  statementLink,
}) {
  return baseEmailWrapper(
    "Your Water Bill is Ready",
    `
    <p>Hi ${residentName || "there"},</p>
    <p>Your water bill for the period <strong>${periodStart} &ndash; ${periodEnd}</strong> has been generated.</p>
    <table style="width:100%; border-collapse:collapse; margin:16px 0;">
      <tr><td style="padding:6px 0; color:#666;">Invoice ID</td><td style="padding:6px 0; text-align:right;"><strong>${invoiceId}</strong></td></tr>
      <tr><td style="padding:6px 0; color:#666;">Consumption</td><td style="padding:6px 0; text-align:right;">${consumption} m&sup3;</td></tr>
      <tr><td style="padding:6px 0; color:#666;">Due date</td><td style="padding:6px 0; text-align:right;">${dueDate}</td></tr>
      ${validationStatusRowHTML(validationStatus)}
      <tr><td style="padding:10px 0; font-weight:bold; border-top:1px solid #eee;">Total Payable</td><td style="padding:10px 0; text-align:right; font-weight:bold; border-top:1px solid #eee;">KES ${Number(totalAmount || 0).toLocaleString()}</td></tr>
    </table>
    ${billLinkHTML(billLink)}
    ${paymentInstructionsHTML({ paybillShortCode, accountNumber })}
    ${statementLinkHTML(statementLink)}
  `,
  );
}

function invoiceSmsText({ invoiceId, totalAmount, dueDate, billLink }) {
  const base = `DAMR: Water bill ${invoiceId}, KES ${Number(totalAmount || 0).toLocaleString()}, due ${dueDate}.`;
  return capSmsText(appendLinkIfFits(base, "Pay", billLink));
}

function upcomingDueEmailHTML({
  residentName,
  invoiceId,
  totalAmount,
  dueDate,
  daysUntilDue,
  paybillShortCode,
  accountNumber,
}) {
  const heading =
    daysUntilDue <= 0
      ? "Your Water Bill Is Due Today"
      : "Your Water Bill Is Due Soon";
  const dueLine =
    daysUntilDue <= 0
      ? "is due <strong>today</strong>"
      : `is due in <strong>${daysUntilDue} day(s)</strong> (${dueDate})`;
  return baseEmailWrapper(
    heading,
    `
    <p>Hi ${residentName || "there"},</p>
    <p>Your water bill <strong>${invoiceId}</strong> ${dueLine}.</p>
    <p style="font-size:20px; font-weight:bold;">KES ${Number(totalAmount || 0).toLocaleString()}</p>
    <p>Please make payment on time to avoid late fees or service interruption.</p>
    ${paymentInstructionsHTML({ paybillShortCode, accountNumber })}
  `,
  );
}

function upcomingDueSmsText({ invoiceId, totalAmount, dueDate, daysUntilDue }) {
  const dueLine =
    daysUntilDue <= 0
      ? "due today"
      : `due in ${daysUntilDue} day(s) (${dueDate})`;
  return capSmsText(
    `DAMR: Water bill ${invoiceId}, KES ${Number(totalAmount || 0).toLocaleString()}, ${dueLine}.`,
  );
}

function overdueEmailHTML({
  residentName,
  invoiceId,
  totalAmount,
  daysOverdue,
  paybillShortCode,
  accountNumber,
}) {
  return baseEmailWrapper(
    "Overdue Water Bill",
    `
    <p>Hi ${residentName || "there"},</p>
    <p>Your water bill <strong>${invoiceId}</strong> is now <strong>${daysOverdue} day(s) overdue</strong>.</p>
    <p style="font-size:20px; font-weight:bold; color:#dc3545;">KES ${Number(totalAmount || 0).toLocaleString()}</p>
    <p>Please make payment as soon as possible to avoid service interruption.</p>
    ${paymentInstructionsHTML({ paybillShortCode, accountNumber })}
  `,
  );
}

function receiptEmailHTML({
  residentName,
  invoiceId,
  amountPaid,
  mpesaCode,
  balance,
  status,
}) {
  return baseEmailWrapper(
    "Payment Received — Receipt",
    `
    <p>Hi ${residentName || "there"},</p>
    <p>We've received your M-Pesa payment for invoice <strong>${invoiceId}</strong>.</p>
    <table style="width:100%; border-collapse:collapse; margin:16px 0;">
      <tr><td style="padding:6px 0; color:#666;">Amount paid</td><td style="padding:6px 0; text-align:right;"><strong>KES ${Number(amountPaid || 0).toLocaleString()}</strong></td></tr>
      <tr><td style="padding:6px 0; color:#666;">M-Pesa receipt</td><td style="padding:6px 0; text-align:right;">${mpesaCode || "—"}</td></tr>
      <tr><td style="padding:6px 0; color:#666;">Remaining balance</td><td style="padding:6px 0; text-align:right;">KES ${Number(balance || 0).toLocaleString()}</td></tr>
      <tr><td style="padding:10px 0; font-weight:bold; border-top:1px solid #eee;">Status</td><td style="padding:10px 0; text-align:right; font-weight:bold; border-top:1px solid #eee;">${status}</td></tr>
    </table>
    <p>Thank you for your payment.</p>
  `,
  );
}

function receiptSmsText({ invoiceId, amountPaid, mpesaCode, balance, status }) {
  const balanceLine =
    status === "Paid"
      ? "Balance KES 0, fully paid."
      : `Balance KES ${Number(balance || 0).toLocaleString()}.`;
  return capSmsText(
    `DAMR Receipt: KES ${Number(amountPaid || 0).toLocaleString()} for Inv ${invoiceId} (M-Pesa ${mpesaCode || "N/A"}). ${balanceLine}`,
  );
}
function welcomeResidentEmailHTML({
  residentName,
  facilityName,
  blockName,
  unitName,
  meterSerial,
  initialReading,
}) {
  const location =
    [facilityName, blockName].filter(Boolean).join(", ") || "your new home";
  const meterLine = meterSerial
    ? `Your meter number is <strong>${meterSerial}</strong>, with an initial reading of <strong>${initialReading ?? 0} m&sup3;</strong> as your starting point.`
    : `A water meter will be assigned to your unit shortly.`;
  return baseEmailWrapper(
    `Welcome to ${facilityName || "your new home"}`,
    `
    <p>Dear ${residentName || "Resident"},</p>
    <p>Welcome to <strong>${location}</strong>, Unit <strong>${unitName || "N/A"}</strong>. We're delighted to have you join us. ${meterLine} You'll receive your bills and payment reminders here too. Please reach out to your facility team anytime you need help. Welcome home!</p>
  `,
  );
}

function welcomeResidentSmsText({
  residentName,
  facilityName,
  blockName,
  unitName,
  meterSerial,
  initialReading,
}) {
  const location =
    [facilityName, blockName].filter(Boolean).join(", ") || "your new home";
  const meterLine = meterSerial
    ? `Your meter number is ${meterSerial}, with an initial reading of ${initialReading ?? 0} cubic meters as your starting point.`
    : `A water meter will be assigned to your unit shortly.`;
  return `Dear ${residentName || "Resident"}, welcome to ${location}, Unit ${unitName || "N/A"}. We're delighted to have you join us. ${meterLine} You'll receive your bills and payment reminders here too. Please reach out to your facility team anytime you need help. Welcome home!`;
}

function meterAssignedEmailHTML({ residentName, meterSerial, initialReading }) {
  return baseEmailWrapper(
    "Water Meter Assigned",
    `
    <p>Dear ${residentName || "Resident"},</p>
    <p>A water meter has been assigned to your unit. Your meter number is <strong>${meterSerial}</strong>, with an initial reading of <strong>${initialReading ?? 0} m&sup3;</strong> as your starting point. Future bills will be based on your actual readings. If anything looks unusual, please contact your facility team. Welcome to hassle-free water management!</p>
  `,
  );
}

function meterAssignedSmsText({ residentName, meterSerial, initialReading }) {
  return `Dear ${residentName || "Resident"}, a water meter has been assigned to your unit. Your meter number is ${meterSerial}, with an initial reading of ${initialReading ?? 0} cubic meters as your starting point. Future bills will be based on your actual readings. If anything looks unusual, please contact your facility team. Welcome to hassle-free water management!`;
}

const FLAG_TYPE_LABELS = {
  SPIKE: "Unusually High Consumption",
  DROP: "Unusually Low Consumption",
  ZERO_FLOW: "No Flow Detected",
  OVERNIGHT_LEAK: "Possible Overnight Leak",
  ERRATIC: "Erratic Consumption Pattern",
  CRITICAL: "Critical — Possible Major Leak",
  missing_reading: "Missing Reading",
  ocr_mismatch: "OCR/Keyed Value Mismatch",
  duplicate_submission: "Duplicate Reading Submitted",
};

function flagAlertEmailHTML({
  flagType,
  meterSerial,
  facilityName,
  unitName,
  description,
}) {
  const label = FLAG_TYPE_LABELS[flagType] || flagType;
  return baseEmailWrapper(
    `⚠️ DAMR Alert: ${label}`,
    `
    <p>A flag was raised on meter <strong>${meterSerial || "—"}</strong>${facilityName ? ` at <strong>${facilityName}</strong>` : ""}${unitName ? ` (Unit ${unitName})` : ""}.</p>
    <p style="font-weight:bold;">${label}</p>
    <p>${description || ""}</p>
    <p>Please log in to DAMR to review and resolve this flag.</p>
  `,
  );
}

function flagAlertSmsText({ flagType, meterSerial, facilityName, unitName }) {
  const label = FLAG_TYPE_LABELS[flagType] || flagType;
  const base = `DAMR Alert: ${label} on meter ${meterSerial || "—"}. Review in DAMR.`;
  const location = [facilityName, unitName ? `Unit ${unitName}` : null]
    .filter(Boolean)
    .join(", ");
  const withLocation = location
    ? `DAMR Alert: ${label} on meter ${meterSerial || "—"} (${location}). Review in DAMR.`
    : base;
  return capSmsText(withLocation.length <= SMS_MAX_CHARS ? withLocation : base);
}
function residentLeakAlertSmsText({ residentName, meterSerial }) {
  return capSmsText(
    `Dear ${residentName || "Resident"}, your meter (${meterSerial || "—"}) shows unusual flow, possible leak. Check taps/pipes or contact your facility team.`,
  );
}

module.exports = {
  sendEmail,
  sendSMS,
  sendWhatsApp,
  formatKenyanPhone,
  wrapPlainTextEmail,
  FLAG_TYPE_LABELS,
  invoiceEmailHTML,
  invoiceSmsText,
  upcomingDueEmailHTML,
  upcomingDueSmsText,
  overdueEmailHTML,
  receiptEmailHTML,
  receiptSmsText,
  paymentInstructionsSmsText,
  capSmsText,
  welcomeResidentEmailHTML,
  welcomeResidentSmsText,
  meterAssignedEmailHTML,
  meterAssignedSmsText,
  flagAlertEmailHTML,
  flagAlertSmsText,
  residentLeakAlertSmsText,
};
