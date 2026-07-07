const {
  applyStkCallback,
  applyC2BConfirmation,
} = require("../../services/paymentsService");

const ACK = { ResultCode: 0, ResultDesc: "Accepted" };
const stkCallback = async (req, res) => {
  try {
    await applyStkCallback(req.body);
  } catch (err) {
    console.error("Error in stkCallback:", err.message);
  }
  return res.status(200).send(ACK);
};
const c2bValidation = async (req, res) => {
  return res.status(200).send(ACK);
};
const c2bConfirmation = async (req, res) => {
  try {
    await applyC2BConfirmation(req.body);
  } catch (err) {
    console.error("Error in c2bConfirmation:", err.message);
  }
  return res.status(200).send(ACK);
};

module.exports = { stkCallback, c2bValidation, c2bConfirmation };
