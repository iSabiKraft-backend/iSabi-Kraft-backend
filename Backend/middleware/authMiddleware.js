
import { supabase } from "../config/supabase.js";

export const authenticateUser = async (req, res, next) => {
  try {
    // Get Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided.",
      });
    }

    // Expected format: Bearer <token>
    const [bearer, token, ...extra] = authHeader.split(" ");

    if (bearer !== "Bearer" || !token || extra.length > 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid authorization format.",
      });
    }

    // Validate the Supabase access token
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token.",
      });
    }

    // Fetch current role and account status from Supabase
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return res.status(401).json({
        success: false,
        message: "Account profile not found.",
      });
    }

    if (!profile.is_active) {
      return res.status(401).json({
        success: false,
        message: "Account is inactive or no longer exists.",
      });
    }

    // Use the current role from the database
    req.user = {
      id: user.id,
      role: profile.role,
      email: user.email,
    };

    return next();
  } catch (error) {
    console.error("Authentication error:", error);

    return res.status(401).json({
      success: false,
      message: "Authentication failed.",
    });
  }
};
