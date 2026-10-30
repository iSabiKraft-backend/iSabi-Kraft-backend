import "../config/env.js";
import mongoose from "mongoose";
import { createClient } from "@supabase/supabase-js";
import User from "../models/userModel.js";

const seedAdmin = async () => {
  const { MONGODB_URI, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!MONGODB_URI || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("Set MONGODB_URI, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD in .env");
  }
  if (ADMIN_PASSWORD.length < 12) throw new Error("ADMIN_PASSWORD must contain at least 12 characters");

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await mongoose.connect(MONGODB_URI);
  try {
    const email = ADMIN_EMAIL.trim().toLowerCase();
    const { data: listed, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) throw listError;

    let authUser = listed.users.find((item) => item.email?.toLowerCase() === email);
    if (!authUser) {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: ADMIN_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: ADMIN_NAME.trim(), first_name: ADMIN_NAME.trim().split(/\s+/)[0], role: "admin" },
      });
      if (error) throw error;
      authUser = data.user;
    } else if (!authUser.email_confirmed_at) {
      const { data, error } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, { email_confirm: true });
      if (error) throw error;
      authUser = data.user;
    }

    let profile = await User.findOne({ $or: [{ supabaseUserId: authUser.id }, { email }] });
    const nameParts = ADMIN_NAME.trim().split(/\s+/);
    if (!profile) {
      profile = await User.create({
        firstName: nameParts[0],
        lastName: nameParts.slice(1).join(" "),
        email,
        supabaseUserId: authUser.id,
        role: "admin",
        emailVerified: true,
      });
    } else {
      if (profile.supabaseUserId && profile.supabaseUserId !== authUser.id) {
        throw new Error("The admin email is already linked to a different Supabase user.");
      }
      profile.supabaseUserId = authUser.id;
      profile.email = email;
      profile.role = "admin";
      profile.emailVerified = true;
      await profile.save();
    }

    console.log("Supabase Auth admin and MongoDB admin profile are ready.");
    console.log("If the Supabase user already existed, its password was not changed by this seed.");
  } finally {
    await mongoose.disconnect();
  }
};

seedAdmin().catch((error) => {
  console.error("Admin seed failed:", error.message);
  process.exitCode = 1;
});
