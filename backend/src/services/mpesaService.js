const axios = require("axios");
const {
  getFacilitySettings: getFacilitySettingsModel,
  getStkPushRequest: getStkPushRequestModel,
  getMpesaTransaction: getMpesaTransactionModel,
} = require("../utils/damrSchemas");

// ─────────────────────────────────────────────────────────────────────────
// Native Safaricom Daraja client. DAMR used to delegate all of this to
// PayServe's shared Payments microservice (see git history / the old
// paymentsService.js header comment) — this talks to Safaricom directly:
//   - OAuth token generation (cached per credential set)
//   - STK Push ("Lipa Na M-Pesa Online") for invoice-specific "Pay Now"
//   - C2B URL registration + confirmation persistence, for the Paybill
//     top-up model (a resident pays into their sub-account whenever, no
//     push involved)
//
// This module only knows how to talk to Safaricom and persist the raw
// results (StkPushRequest / MpesaTransaction). It does NOT touch Invoice or
// decide what a payment means for DAMR's business logic — that orchestration
// (applying an amount to an invoice, sending receipts, etc.) lives in
// paymentsService.js, which calls into this module rather than the other
// way round.
// ─────────────────────────────────────────────────────────────────────────

function getBaseUrl() {
  const env = (process.env.MPESA_ENV || "sandbox").toLowerCase();
  return env === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

// Safaricom's sandbox sits behind an Imperva/Incapsula WAF that has, in
// practice, returned bare empty-body 400s (content-length: 0, x-cdn:
// Imperva, incap_ses/visid_incap cookies set) to plain axios requests —
// no errorMessage, no JSON, nothing — which looks identical to a bad-
// credentials response unless you inspect the headers. A generic
// scripting-library default User-Agent (axios's is literally "axios/x.y.z")
// is a common trigger for this kind of bot filter, so every Daraja request
// sends a normal browser-shaped one instead. This is a legitimate attempt
// to get past the WAF, not to evade any actual API restriction — the
// request itself is a correctly authenticated, documented Daraja call.
const DARAJA_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json",
};

function getCallbackBaseUrl() {
  const url = process.env.MPESA_CALLBACK_BASE_URL;
  if (!url) {
    throw new Error(
      "MPESA_CALLBACK_BASE_URL is not set in .env — Safaricom needs a public HTTPS URL to call back with results. Point it at your deployed backend or a tunnel (ngrok/cloudflared) while testing.",
    );
  }
  return url.replace(/\/+$/, ""); // strip trailing slash
}

/**
 * Resolves the Daraja credentials to use for a facility: its own row in
 * FacilitySettings if fully configured, otherwise the shared app-wide
 * defaults in .env (MPESA_CONSUMER_KEY/MPESA_CONSUMER_SECRET/
 * MPESA_SHORTCODE/MPESA_PASSKEY). Every facility in this codebase's test
 * data uses the shared defaults today — the per-facility override exists
 * for facilities that register their own Paybill down the line.
 */
async function getCredentials(facilityId) {
  let settings = null;
  if (facilityId) {
    const FacilitySettings = getFacilitySettingsModel();
    settings = await FacilitySettings.findOne({ facilityId }).lean();
  }

  const shortCode = settings?.mpesaShortCode || process.env.MPESA_SHORTCODE;
  const consumerKey = settings?.mpesaConsumerKey || process.env.MPESA_CONSUMER_KEY;
  const consumerSecret =
    settings?.mpesaConsumerSecret || process.env.MPESA_CONSUMER_SECRET;
  const passkey = settings?.mpesaPasskey || process.env.MPESA_PASSKEY;

  if (!shortCode || !consumerKey || !consumerSecret || !passkey) {
    throw new Error(
      "No M-Pesa credentials available for this facility — set MPESA_CONSUMER_KEY/MPESA_CONSUMER_SECRET/MPESA_SHORTCODE/MPESA_PASSKEY in .env, or register facility-specific ones via POST /facility/payment-details",
    );
  }

  return { shortCode, consumerKey, consumerSecret, passkey };
}

// OAuth tokens are valid ~3599s; cached per consumerKey so a burst of
// requests (e.g. several STK pushes in a row) doesn't re-auth every time.
const tokenCache = new Map(); // consumerKey -> { token, expiresAt }

/**
 * Extracts a useful, human-readable detail string out of an axios error —
 * Safaricom's own error bodies use {errorMessage}/{error_description}, but
 * a network intermediary (proxy/WAF/captive portal) in front of Safaricom's
 * sandbox can just as easily return plain text or HTML, which axios's own
 * err.message ("Request failed with status code 400") hides entirely.
 * Surfacing the raw status + body makes that distinction visible instead of
 * every failure looking identical.
 */
function describeAxiosError(err) {
  const status = err.response?.status;
  const data = err.response?.data;
  let detail;
  if (data?.errorMessage) detail = data.errorMessage;
  else if (data?.error_description) detail = data.error_description;
  else if (typeof data === "string" && data.trim()) detail = data.trim().slice(0, 300);
  else if (data) detail = JSON.stringify(data).slice(0, 300);
  else detail = err.message;
  return status ? `HTTP ${status} — ${detail}` : detail;
}

async function getAccessToken({ consumerKey, consumerSecret }) {
  const cached = tokenCache.get(consumerKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  try {
    const response = await axios.get(
      `${getBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: { ...DARAJA_HEADERS, Authorization: `Basic ${auth}` },
        timeout: 15000,
      },
    );
    const token = response.data.access_token;
    const expiresInMs = (Number(response.data.expires_in) || 3599) * 1000;
    // Refresh a little early rather than exactly on expiry.
    tokenCache.set(consumerKey, { token, expiresAt: Date.now() + expiresInMs - 30000 });
    return token;
  } catch (err) {
    throw new Error(`Failed to get M-Pesa access token: ${describeAxiosError(err)}`);
  }
}

function getDarajaTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function buildPassword(shortCode, passkey, timestamp) {
  return Buffer.from(`${shortCode}${passkey}${timestamp}`).toString("base64");
}

/**
 * Formats a Kenyan phone number to the 2547XXXXXXXX shape Daraja expects.
 * Accepts 07XXXXXXXX, 7XXXXXXXX, or already-254-prefixed input.
 */
function formatMsisdn(phone) {
  let cleaned = String(phone || "").replace(/\D/g, "");
  if (cleaned.startsWith("0")) cleaned = "254" + cleaned.slice(1);
  else if (!cleaned.startsWith("254")) cleaned = "254" + cleaned;
  return cleaned;
}

/**
 * Initiates a Lipa Na M-Pesa Online (STK Push) request — sends a payment
 * prompt straight to the resident's phone for a specific invoice amount.
 * Persists a StkPushRequest row immediately so the frontend has something
 * to poll and stk_callback has somewhere to write its result, even if the
 * callback is slow or (in a sandbox/dev network) never arrives.
 */
async function initiateStkPush({
  facilityId,
  invoiceId,
  residentId,
  phone,
  amount,
  accountReference,
  transactionDesc,
}) {
  const msisdn = formatMsisdn(phone);
  if (!/^254\d{9}$/.test(msisdn)) {
    throw new Error("A valid Safaricom phone number is required (e.g. 0712345678)");
  }
  const roundedAmount = Math.ceil(Number(amount));
  if (!roundedAmount || roundedAmount <= 0) {
    throw new Error("A positive amount is required");
  }

  const { shortCode, consumerKey, consumerSecret, passkey } = await getCredentials(facilityId);
  const token = await getAccessToken({ consumerKey, consumerSecret });
  const timestamp = getDarajaTimestamp();
  const password = buildPassword(shortCode, passkey, timestamp);

  const payload = {
    BusinessShortCode: shortCode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: roundedAmount,
    PartyA: msisdn,
    PartyB: shortCode,
    PhoneNumber: msisdn,
    CallBackURL: `${getCallbackBaseUrl()}/api/v1/damr/mpesa/stk-callback`,
    AccountReference: (accountReference || "DAMR").slice(0, 12),
    TransactionDesc: transactionDesc || "Water bill payment",
  };

  let response;
  try {
    response = await axios.post(
      `${getBaseUrl()}/mpesa/stkpush/v1/processrequest`,
      payload,
      {
        headers: { ...DARAJA_HEADERS, Authorization: `Bearer ${token}` },
        timeout: 20000,
      },
    );
  } catch (err) {
    throw new Error(`Failed to initiate STK push: ${describeAxiosError(err)}`);
  }

  if (!response.data?.CheckoutRequestID) {
    throw new Error(response.data?.errorMessage || "Safaricom did not return a CheckoutRequestID");
  }

  const StkPushRequest = getStkPushRequestModel();
  const record = await StkPushRequest.create({
    invoiceId,
    residentId: residentId || null,
    facilityId: facilityId || null,
    phone: msisdn,
    amount: roundedAmount,
    accountReference: payload.AccountReference,
    merchantRequestId: response.data.MerchantRequestID,
    checkoutRequestId: response.data.CheckoutRequestID,
    status: "pending",
  });

  return record;
}

/**
 * Parses and persists Safaricom's async STK callback (POST /mpesa/stk-callback).
 * Pure recording — does not touch Invoice. Returns the updated StkPushRequest,
 * or null if the CheckoutRequestID doesn't match anything we initiated (e.g.
 * a stale/duplicate delivery after the record was somehow removed).
 *
 * Callback shape (success):
 *   { Body: { stkCallback: { MerchantRequestID, CheckoutRequestID, ResultCode: 0,
 *     ResultDesc, CallbackMetadata: { Item: [ {Name:"Amount",Value}, {Name:"MpesaReceiptNumber",Value},
 *     {Name:"TransactionDate",Value}, {Name:"PhoneNumber",Value} ] } } } }
 * Callback shape (failure/cancel): same but ResultCode != 0 and no CallbackMetadata.
 */
async function recordStkCallback(body) {
  const stkCallback = body?.Body?.stkCallback;
  if (!stkCallback?.CheckoutRequestID) {
    throw new Error("Malformed STK callback payload — missing Body.stkCallback.CheckoutRequestID");
  }

  const StkPushRequest = getStkPushRequestModel();
  const record = await StkPushRequest.findOne({
    checkoutRequestId: stkCallback.CheckoutRequestID,
  });
  if (!record) return null;

  const resultCode = Number(stkCallback.ResultCode);
  record.resultCode = resultCode;
  record.resultDesc = stkCallback.ResultDesc || null;

  if (resultCode === 0) {
    const items = stkCallback.CallbackMetadata?.Item || [];
    const findItem = (name) => items.find((i) => i.Name === name)?.Value;
    record.status = "success";
    record.mpesaReceiptNumber = findItem("MpesaReceiptNumber") ? String(findItem("MpesaReceiptNumber")) : null;
    record.transactionDate = findItem("TransactionDate") ? String(findItem("TransactionDate")) : null;
    const paidAmount = findItem("Amount");
    if (paidAmount != null) record.amount = Number(paidAmount);
  } else {
    // 1032 = cancelled by user, everything else is a generic failure.
    record.status = resultCode === 1032 ? "cancelled" : "failed";
  }

  await record.save();
  return record;
}

/**
 * Registers this facility's ValidationURL/ConfirmationURL with Safaricom
 * (POST /mpesa/c2b/v1/registerurl) so Paybill top-ups on its shortcode get
 * pushed to DAMR directly instead of requiring a pull. One-time action per
 * shortcode — safe to call again (Safaricom just overwrites the URLs).
 */
async function registerC2BUrls({ facilityId }) {
  const { shortCode, consumerKey, consumerSecret } = await getCredentials(facilityId);
  const token = await getAccessToken({ consumerKey, consumerSecret });

  let response;
  try {
    response = await axios.post(
      `${getBaseUrl()}/mpesa/c2b/v1/registerurl`,
      {
        ShortCode: shortCode,
        ResponseType: "Completed",
        ConfirmationURL: `${getCallbackBaseUrl()}/api/v1/damr/mpesa/c2b-confirmation`,
        ValidationURL: `${getCallbackBaseUrl()}/api/v1/damr/mpesa/c2b-validation`,
      },
      {
        headers: { ...DARAJA_HEADERS, Authorization: `Bearer ${token}` },
        timeout: 20000,
      },
    );
  } catch (err) {
    throw new Error(`Failed to register C2B URLs: ${describeAxiosError(err)}`);
  }

  if (facilityId) {
    const FacilitySettings = getFacilitySettingsModel();
    await FacilitySettings.updateOne(
      { facilityId },
      { $set: { mpesaC2bRegistered: true } },
      { upsert: true },
    );
  }

  return response.data;
}

/**
 * Persists a completed C2B transaction from Safaricom's confirmation webhook
 * (POST /mpesa/c2b-confirmation). Idempotent on TransID — Safaricom's docs
 * say confirmation delivery is at-least-once, and the unique index on
 * MpesaTransaction.transId means a duplicate delivery just fails the insert
 * (caught and treated as already-recorded) rather than double-crediting.
 *
 * Payload fields (subset actually used): TransID, TransTime, TransAmount,
 * BusinessShortCode, BillRefNumber (the Paybill account number — this IS
 * DAMR's PaymentAccount.accountNumber, generated deterministically from
 * residentId+facilityId, so no separate shortcode->facility lookup is
 * needed here), MSISDN.
 */
async function recordC2BConfirmation(body) {
  const transId = body?.TransID;
  const accountNumber = body?.BillRefNumber;
  const amount = Number(body?.TransAmount);

  if (!transId || !accountNumber || !amount) {
    throw new Error("Malformed C2B confirmation payload — missing TransID/BillRefNumber/TransAmount");
  }

  const MpesaTransaction = getMpesaTransactionModel();
  try {
    return await MpesaTransaction.create({
      transId: String(transId),
      accountNumber: String(accountNumber).trim(),
      amount,
      msisdn: body?.MSISDN || null,
      transTime: body?.TransTime || null,
      shortCode: body?.BusinessShortCode || null,
      source: "mpesa-c2b",
      rawPayload: body,
    });
  } catch (err) {
    if (err.code === 11000) {
      // Already recorded (duplicate webhook delivery) — return the existing row.
      return await MpesaTransaction.findOne({ transId: String(transId) });
    }
    throw err;
  }
}

module.exports = {
  getBaseUrl,
  getCredentials,
  getAccessToken,
  formatMsisdn,
  initiateStkPush,
  recordStkCallback,
  registerC2BUrls,
  recordC2BConfirmation,
};
