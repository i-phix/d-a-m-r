process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.FRONTEND_BASE_URL =
  process.env.FRONTEND_BASE_URL || "http://localhost:3000";
process.env.AI_MESSAGES_ENABLED = "false";
jest.setTimeout(30000);
