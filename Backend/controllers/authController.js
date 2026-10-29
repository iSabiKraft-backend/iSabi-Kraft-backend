import * as authService from "../services/authService.js";
import { setAuthCookie, clearAuthCookie, returnTokenInBody } from "../utils/authCookie.js";

// Wraps a service function as an Express handler: { status, message } -> JSON response.
// Responses that carry a session token (verify, login, social) also set the HttpOnly session cookie.
const handler = (fn, status, message) => async (req, res, next) => {
  try {
    const data = await fn(req);
    if (data?.token) {
      setAuthCookie(res, data.token, { rememberMe: req.body?.rememberMe === true });
      if (!returnTokenInBody()) delete data.token;
    }
    return res.status(status).json({ success: true, ...(message && { message }), data });
  } catch (error) {
    next(error);
  }
};

// POST /auth/register — step 1 of 2, sends the verification code
export const register = handler((req) => authService.registerUser(req.body), 201, "Account created. Verification code sent.");

// POST /auth/verify — "Verify Your Account"
export const verify = handler((req) => authService.verifyAccount(req.body), 200, "Account verified.");

// POST /auth/resend-verification — "Resend Code"
export const resendVerification = handler((req) => authService.resendVerification(req.body), 200, "If the account exists, a new code has been sent.");

// POST /auth/login
export const login = handler((req) => authService.loginUser(req.body), 200, "Login successful.");

// POST /auth/forgot-password — "Send Reset Link"
export const forgotPassword = handler((req) => authService.forgotPassword(req.body), 200, "If the account exists, a reset link has been sent.");

// GET /auth/reset-password/validate?token=...
export const validateResetToken = handler((req) => authService.validateResetToken(req.query.token), 200);

// POST /auth/reset-password — "Reset Password"
export const resetPassword = handler((req) => authService.resetPassword(req.body), 200, "Password reset successfully.");

// POST /auth/social — "Continue with Google / Apple"
export const social = handler((req) => authService.socialLogin(req.body), 200, "Login successful.");

// POST /auth/logout — clears the session cookie. Safe to call when already signed out.
// (Tokens are stateless, so a copy of the token taken earlier stays valid until it expires or the
// password is reset; the cookie being HttpOnly is what keeps that copy out of page scripts.)
export const logout = (_req, res) => {
  clearAuthCookie(res);
  return res.status(200).json({ success: true, message: "Logged out." });
};
