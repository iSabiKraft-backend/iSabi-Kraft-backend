import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import User from "../models/userModel.js";
import { readCookie, originAllowed } from "../utils/authCookie.js";

dotenv.config();

export const authenticateUser = async (req, res, next) => {
  try {
    // Credentials: a Bearer header wins (mobile / API clients); otherwise the HttpOnly session cookie.
    const authHeader = req.headers.authorization;
    let token;

    if (authHeader) {
      const [bearer, value] = authHeader.split(" ");
      if (bearer !== "Bearer" || !value) {
        return res.status(401).json({ success: false, message: "Invalid authorization format." });
      }
      token = value;
    } else {
      token = readCookie(req);
      if (!token) {
        return res.status(401).json({ success: false, message: "Access denied. No token provided." });
      }
      // Cookies are attached automatically by the browser, so state-changing requests that rely on
      // one must come from our own frontend (CSRF protection; Bearer requests are not affected).
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !originAllowed(req)) {
        return res.status(403).json({ success: false, message: "Request origin not allowed.", code: "BAD_ORIGIN" });
      }
    }

    // Verify token
     const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });

    const user = await User.findById(decoded.id).select("role isActive passwordChangedAt");
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Account is inactive or no longer exists.",
      });
    }

    // A password reset signs out every session issued before it
    if ((decoded.pwv ?? 0) !== (user.passwordChangedAt ? user.passwordChangedAt.getTime() : 0)) {
      return res.status(401).json({
        success: false,
        message: "Password was changed. Please sign in again.",
      });
    }

    // Use the role currently in the database, not the one frozen in the token
    req.user = { id: user.id, role: user.role };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }
};

//*Note: Authentication tells us who the user is
