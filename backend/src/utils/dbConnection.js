const mongoose = require("mongoose");
const db = require("./coreSchemas");

require("dotenv").config();

let isConnected = false;
const connectDB = async () => {
  if (isConnected) {
    return db;
  }

  const dbName = process.env.MONGODB_DB_NAME || "damr_database";
  const secured = process.env.MONGODB_SECURED === "true";
  const username = process.env.MONGODB_USER;
  const password = process.env.MONGODB_PASSWORD;
  const host = process.env.MONGODB_HOST || "127.0.0.1";
  const port = process.env.MONGODB_PORT || "27017";

  try {
    if (!secured) {
      const connectionString = `mongodb://${host}:${port}/${dbName}`;
      await mongoose.connect(connectionString);
    } else {
      const source = "?authSource=admin";
      const connectionString = `mongodb://${username}:${password}@${host}:${port}/${dbName}${source}`;
      await mongoose.connect(connectionString);
    }
  } catch (err) {
    console.error("Error connecting to MongoDB:", err);
    throw err;
  }

  isConnected = true;
  console.log(`DAMR connected to MongoDB database "${dbName}"`);

  return db;
};

module.exports = { connectDB };
