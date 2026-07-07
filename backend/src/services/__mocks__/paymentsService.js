// Manual Jest mock — activated per test file via jest.mock("../../src/services/paymentsService").
// provisionAccount is the only function the three cron jobs under test
// actually call; it normally POSTs to PayServe's real (sandboxed) Payments
// microservice, which integration tests must never touch. Returns just
// enough shape (accountNumber) for the crons' notification text to build.
const actual = jest.requireActual("../paymentsService");

module.exports = {
  ...actual,
  provisionAccount: jest.fn().mockResolvedValue({
    accountNumber: "DTESTACCOUNT1",
    residentId: null,
    facilityId: null,
  }),
};
