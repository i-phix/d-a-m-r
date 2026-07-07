const actual = jest.requireActual("../emailSmsService");

module.exports = {
  ...actual,
  sendEmail: jest.fn().mockResolvedValue({ mocked: true }),
  sendSMS: jest.fn().mockResolvedValue({ mocked: true }),
  sendWhatsApp: jest.fn().mockResolvedValue({ mocked: true }),
};
