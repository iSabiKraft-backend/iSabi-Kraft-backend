import User from "../models/userModel.js";
import { supabase } from "../config/supabase.js";

export const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, message: "Access denied. No token provided." });
    }

    const [scheme, token, ...extra] = authHeader.split(" ");
    if (scheme !== "Bearer" || !token || extra.length > 0) {
      return res.status(401).json({ success: false, message: "Invalid authorization format." });
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({ success: false, message: "Invalid or expired Supabase token." });
    }

    const authUser = data.user;
    const email = authUser.email?.trim().toLowerCase();
    if (email && !authUser.email_confirmed_at && !authUser.confirmed_at) {
      return res.status(403).json({ success: false, message: "Please verify your email address before using the API." });
    }
    let profile = await User.findOne({ supabaseUserId: authUser.id });

    // Link older MongoDB accounts by email only after Supabase has authenticated
    // the user. This lets existing marketplace data survive the Auth migration.
    if (!profile && email) {
      profile = await User.findOne({ email });
      if (profile) {
        if (profile.supabaseUserId && profile.supabaseUserId !== authUser.id) {
          return res.status(403).json({ success: false, message: "This email is linked to another authentication account." });
        }
        profile.supabaseUserId = authUser.id;
        profile.emailVerified = Boolean(authUser.email_confirmed_at || authUser.confirmed_at) || profile.emailVerified;
        await profile.save();
      }
    }

    if (!profile) {
      return res.status(404).json({ success: false, message: "Marketplace profile not found. Call POST /api/auth/sync-profile first." });
    }
    if (!profile.isActive) {
      return res.status(401).json({ success: false, message: "Account is inactive or no longer exists." });
    }

    req.supabaseAccessToken = token;
    req.supabaseUser = authUser;
    req.user = {
      id: String(profile._id),
      supabaseUserId: authUser.id,
      role: profile.role,
      email: profile.email,
    };
    return next();
  } catch (error) {
    console.error("Authentication error:", error.message);
    return res.status(401).json({ success: false, message: "Authentication failed." });
  }
};
