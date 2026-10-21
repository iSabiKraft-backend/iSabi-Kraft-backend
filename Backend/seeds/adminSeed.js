
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

import User from "../models/userModel.js";

const seedAdmin = async () => {
  const { MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } =
    process.env;

  if (!MONGODB_URI || !ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      "Set MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD in .env"
    );
  }

  if (ADMIN_PASSWORD.length < 12) {
    throw new Error("ADMIN_PASSWORD must contain at least 12 characters");
  }

  await mongoose.connect(MONGODB_URI);

  try {
    const email = ADMIN_EMAIL.trim().toLowerCase();

    const existingAdmin = await User.findOne({ email });

    if (existingAdmin) {
      console.log(
        "An account with this email already exists. No changes made."
      );
      return;
    }

    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);

    await User.create({
      name: ADMIN_NAME.trim(),
      email,
      password: hashedPassword,
      role: "admin",
    });

    console.log("Initial admin account created successfully.");
  } finally {
    await mongoose.disconnect();
  }
};

seedAdmin().catch((error) => {
  console.error("Admin seed failed:", error.message);
  process.exitCode = 1;
});
