const {
  registerFacilityPaymentDetails,
} = require("../../services/paymentsService");
const registerPaymentDetails = async (req, res) => {
  try {
    const { facilityId, shortCode } = req.body;
    const passkey = req.body.passkey || process.env.MPESA_PASSKEY;
    const consumerKey = req.body.consumerKey || process.env.MPESA_CONSUMER_KEY;
    const consumerSecret =
      req.body.consumerSecret || process.env.MPESA_CONSUMER_SECRET;

    if (!facilityId || !shortCode) {
      return res.status(400).send({
        error: "facilityId and shortCode are required",
      });
    }
    if (!passkey || !consumerKey || !consumerSecret) {
      return res.status(400).send({
        error:
          "No credentials supplied and no default Daraja credentials are configured (MPESA_CONSUMER_KEY/MPESA_CONSUMER_SECRET/MPESA_PASSKEY in .env)",
      });
    }

    const usingDefaults =
      !req.body.consumerKey && !req.body.consumerSecret && !req.body.passkey;

    const result = await registerFacilityPaymentDetails({
      facilityId,
      shortCode,
      passkey,
      consumerKey,
      consumerSecret,
    });

    return res.status(200).send({
      message: usingDefaults
        ? "Payment details saved using the default Daraja credentials, and C2B URLs registered with Safaricom"
        : "Payment details saved and C2B URLs registered with Safaricom",
      usingDefaults,
      result,
    });
  } catch (err) {
    console.error("Error in registerPaymentDetails:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = { registerPaymentDetails };
