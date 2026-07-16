const axios = require("axios");
const {
  getFacilitySettings: getFacilitySettingsModel,
  getStkPushRequest: getStkPushRequestModel,
  getMpesaTransaction: getMpesaTransactionModel,
} = require("../utils/damrSchemas");

function getBaseUrl() {
  const env = (process.env.MPESA_ENV || "sandbox").toLowerCase();
  return env === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

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
async function getCredentials(facilityId) {
  let settings = null;
  if (facilityId) {
    const FacilitySettings = getFacilitySettingsModel();
    settings = await FacilitySettings.findOne({ facilityId }).lean();
  }

  const shortCode = settings?.mpesaShortCode || process.env.MPESA_SHORTCODE;
  const consumerKey =
    settings?.mpesaConsumerKey || process.env.MPESA_CONSUMER_KEY;
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
function describeAxiosError(err) {
  const status = err.response?.status;
  const data = err.response?.data;
  let detail;
  if (data?.errorMessage) detail = data.errorMessage;
  else if (data?.error_description) detail = data.error_description;
  else if (typeof data === "string" && data.trim())
    detail = data.trim().slice(0, 300);
  else if (data) detail = JSON.stringify(data).slice(0, 300);
  else detail = err.message;
  return status ? `HTTP ${status} — ${detail}` : detail;
}

async function getAccessToken({ consumerKey, consumerSecret }) {
  const cached = tokenCache.get(consumerKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString(
    "base64",
  );
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

    tokenCache.set(consumerKey, {
      token,
      expiresAt: Date.now() + expiresInMs - 30000,
    });
    return token;
  } catch (err) {
    throw new Error(
      `Failed to get M-Pesa access token: ${describeAxiosError(err)}`,
    );
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

function formatMsisdn(phone) {
  let cleaned = String(phone || "").replace(/\D/g, "");
  if (cleaned.startsWith("0")) cleaned = "254" + cleaned.slice(1);
  else if (!cleaned.startsWith("254")) cleaned = "254" + cleaned;
  return cleaned;
}
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
    throw new Error(
      "A valid Safaricom phone number is required (e.g. 0712345678)",
    );
  }
  const roundedAmount = Math.ceil(Number(amount));
  if (!roundedAmount || roundedAmount <= 0) {
    throw new Error("A positive amount is required");
  }

  const { shortCode, consumerKey, consumerSecret, passkey } =
    await getCredentials(facilityId);
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
    throw new Error(
      response.data?.errorMessage ||
        "Safaricom did not return a CheckoutRequestID",
    );
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

async function recordStkCallback(body) {
  const stkCallback = body?.Body?.stkCallback;
  if (!stkCallback?.CheckoutRequestID) {
    throw new Error(
      "Malformed STK callback payload — missing Body.stkCallback.CheckoutRequestID",
    );
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
    record.mpesaReceiptNumber = findItem("MpesaReceiptNumber")
      ? String(findItem("MpesaReceiptNumber"))
      : null;
    record.transactionDate = findItem("TransactionDate")
      ? String(findItem("TransactionDate"))
      : null;
    const paidAmount = findItem("Amount");
    if (paidAmount != null) record.amount = Number(paidAmount);
  } else {
    // 1032 = cancelled by user, everything else is a generic failure.
    record.status = resultCode === 1032 ? "cancelled" : "failed";
  }

  await record.save();
  return record;
}
async function registerC2BUrls({ facilityId }) {
  const { shortCode, consumerKey, consumerSecret } =
    await getCredentials(facilityId);
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
async function recordC2BConfirmation(body) {
  const transId = body?.TransID;
  const accountNumber = body?.BillRefNumber;
  const amount = Number(body?.TransAmount);

  if (!transId || !accountNumber || !amount) {
    throw new Error(
      "Malformed C2B confirmation payload — missing TransID/BillRefNumber/TransAmount",
    );
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
