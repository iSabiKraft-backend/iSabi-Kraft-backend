import * as authService from "../services/authService.js";
import { setAuthCookie, clearAuthCookie, returnTokenInBody } from "../utils/authCookie.js";

const handler = (fn, status, message) => async (req, res, next) => {
  try {
    const data = await fn(req);
    if (data?.token) {
      setAuthCookie(res, data.token, { rememberMe: req.body?.rememberMe === true });
      if (!returnTokenInBody()) {
        delete data.token;
        delete data.refreshToken;
      }
    }
    return res.status(status).json({ success: true, ...(message && { message }), data });
  } catch (error) {
    next(error);
  }
};

export const register = handler(
  (req) => authService.registerUser(req.body),
  201,
  "Account created. Check your email for confirmation."
);
export const verify = handler(
  (req) => authService.verifyAccount(req.body),
  200,
  "Account verified."
);
export const resendVerification = handler(
  (req) => authService.resendVerification(req.body),
  200,
  "If the account requires confirmation, an email has been sent."
);
export const login = handler(
  (req) => authService.loginUser(req.body), 
  200, 
  "Login successful.");
export const forgotPassword = handler(
  (req) => authService.forgotPassword(req.body), 
  200, 
  "If the account exists, a recovery email has been sent.");
export const resetPassword = handler(
  (req) => authService.resetPassword(
    { 
      ...req.body, 
      accessToken: req.supabaseAccessToken 
    }), 
    200, 
    "Password reset successfully.");
export const syncProfile = handler(
  (req) => authService.syncProfile(
    req.headers.authorization?.split(" ")[1], 
    req.body), 
    200, 
    "Marketplace profile synchronized.");
export const social = handler(
  (req) => authService.socialLogin(req.body), 
  200, 
  "Use Supabase Auth for social sign-in.");

export const logout = (_req, res) => {
  clearAuthCookie(res);
  return res.status(200).json({ success: true, message: "Signed out. Clear the Supabase session in the mobile app." });
};
