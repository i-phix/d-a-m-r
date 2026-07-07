/**
 * DAMR — Seed Users Script
 * Creates: Admin, Facility Manager, Field Staff, Resident
 * Run once from the backend folder:
 *   node seed_users.js
 */

require("dotenv").config();
const bcrypt = require("bcryptjs");
const { connectDB } = require("./src/utils/dbConnection");
const db = require("./src/utils/coreSchemas");

const USERS = [
  {
    fullName: "DAMR Admin",
    email: "admin@damr.co.ke",
    phoneNumber: "0700000001",
    password: "Admin@1234",
    role: "admin",
    type: "Core",
    facilityId: null,
  },
  {
    fullName: "Facility Manager",
    email: "fm@damr.co.ke",
    phoneNumber: "0700000002",
    password: "Manager@1234",
    role: "editor",
    type: "Project Manager",
    facilityId: null,
  },
  {
    fullName: "Field Staff",
    email: "staff@damr.co.ke",
    phoneNumber: "0700000003",
    password: "Staff@1234",
    role: "Staff",
    type: "Universal",
    facilityId: null,
  },
  {
    fullName: "Test Resident",
    email: "resident@damr.co.ke",
    phoneNumber: "0700000004",
    password: "Resident@1234",
    role: "Staff",
    type: "Resident",
    facilityId: null,
  },
];

async function seedUsers() {
  console.log("\nConnecting to MongoDB...");
  await connectDB();
  console.log("Connected.\n");

  const results = [];

  for (const u of USERS) {
    try {
      const existing = await db.User.findOne({
        $or: [{ email: u.email }, { phoneNumber: u.phoneNumber }],
      });

      if (existing) {
        results.push({ status: "EXISTS", ...u });
        continue;
      }

      const hashedPassword = await bcrypt.hash(u.password, 10);

      await db.User.create({
        fullName: u.fullName,
        email: u.email,
        phoneNumber: u.phoneNumber,
        password: hashedPassword,
        role: u.role,
        type: u.type,
        facilityId: u.facilityId,
      });

      results.push({ status: "CREATED", ...u });
    } catch (err) {
      results.push({ status: "ERROR", error: err.message, ...u });
    }
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  DAMR Seeded Users");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  for (const r of results) {
    const icon =
      r.status === "CREATED" ? "✅" : r.status === "EXISTS" ? "⏭️ " : "❌";
    console.log(`\n${icon}  ${r.status} — ${r.fullName}`);
    console.log(`   Role    : ${r.role} (${r.type})`);
    console.log(`   Email   : ${r.email}`);
    console.log(`   Phone   : ${r.phoneNumber}`);
    console.log(`   Password: ${r.password}`);
    if (r.error) console.log(`   Error   : ${r.error}`);
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Login at: http://localhost:3000/login");
  console.log("  Change passwords after first login.");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  process.exit(0);
}

seedUsers().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
