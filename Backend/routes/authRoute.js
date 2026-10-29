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
} from "../controllers/authController.js";
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

// Tighter than the global limiter: these endpoints send SMS/email and guess-able secrets
route.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.AUTH_RATE_LIMIT || 30),
    message: { success: false, message: "Too many attempts. Please try again later." },
  })
);

// --- Onboarding (Create account -> Verify -> Account Verified) ---
route.post("/register", registerValidator, validateRequest, register);
route.post("/verify", verifyValidator, validateRequest, verify);
route.post("/resend-verification", resendVerificationValidator, validateRequest, resendVerification);

// --- Sign in ---
route.post("/login", loginValidator, validateRequest, login);
route.post("/logout", logout);
route.post("/social", socialLoginValidator, validateRequest, social);

// --- Forgot password -> Check your email/SMS -> Enter code -> Create new password -> Password reset ---
route.post("/forgot-password", forgotPasswordValidator, validateRequest, forgotPassword);
route.post("/reset-password", resetPasswordValidator, validateRequest, resetPassword);

export default route;
