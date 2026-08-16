const mongoose = require('mongoose');

/**
 * Connect to MongoDB using MONGODB_URI from the environment.
 * Fails fast with a helpful message if the URI is missing.
 */
const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error(
      '\n❌ MONGODB_URI is not set.\n' +
        '  1. Copy server/.env.example to server/.env\n' +
        '  2. Paste your MongoDB connection string (Atlas or local).\n'
    );
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(uri);
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`❌ MongoDB connection failed: ${err.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
