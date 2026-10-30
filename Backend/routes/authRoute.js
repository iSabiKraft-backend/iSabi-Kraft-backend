import express from "express";
import rateLimit from "express-rate-limit";

import {
  register,
  verify,
  resendVerification,
  login,
  logout,
  forgotPassword,
  resetPassword,
  social,
  syncProfile,
} from "../controllers/authController.js";
import { authenticateUser } from "../middleware/authMiddleware.js";

import {
    registerValidator,
    verifyValidator,
    resendVerificationValidator,
    loginValidator,
    forgotPasswordValidator,
    resetPasswordValidator,
    socialLoginValidator,
} from "../validators/authValidator.js";

import { validateRequest } from "../middleware/validationMiddleware.js";

const route = express.Router();

// Authentication rate limiter
route.use(
    rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: Number(process.env.AUTH_RATE_LIMIT || 30),
        message: {
            success: false,
            message: "Too many attempts. Please try again later.",
        },
    })
);

// Registration and verification
route.post("/register", registerValidator, validateRequest, register);
route.post("/verify", verifyValidator, validateRequest, verify);
route.post("/resend-verification", resendVerificationValidator, validateRequest, resendVerification);

// Login
route.post("/login", loginValidator, validateRequest, login);
route.post("/logout", logout);
route.post("/social", socialLoginValidator, validateRequest, social);
// Call after signup/login performed directly with the Supabase mobile SDK.
route.post("/sync-profile", syncProfile);

// Password recovery
route.post("/forgot-password", forgotPasswordValidator, validateRequest, forgotPassword);
route.post("/reset-password", authenticateUser, resetPasswordValidator, validateRequest, resetPassword);

export default route;
