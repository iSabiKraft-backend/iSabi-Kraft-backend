import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import User from "../models/userModel.js";

dotenv.config();

export const authenticateUser = async (req, res, next) => {
  try {
    // Get Authorization header
    const authHeader = req.headers.authorization;

    // Check if header exists
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided.",
      });
    }

    // Expected format: Bearer <token>
    const [bearer, token] = authHeader.split(" ");

    if (bearer !== "Bearer" || !token) {
      return res.status(401).json({
        success: false,
        message: "Invalid authorization format.",
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

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
