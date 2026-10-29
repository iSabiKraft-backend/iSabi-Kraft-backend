import jwt from "jsonwebtoken";

// The session JWT travels in an HttpOnly cookie, so page JavaScript (and therefore any XSS)
// can never read it. The token is still returned in the JSON body unless AUTH_RETURN_TOKEN=false,
// and a Bearer header still works, so mobile apps and API clients keep working unchanged.
export const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "isk_session";

const isProd = () => process.env.NODE_ENV === "production";

function cookieOptions() {
  // lax = sent on same-site requests and top-level navigations; use COOKIE_SAMESITE=none when the
  // frontend lives on a different site (that REQUIRES secure, and the Origin check below).
  const sameSite = (process.env.COOKIE_SAMESITE || "lax").toLowerCase();
  const secure = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : isProd() || sameSite === "none";
  return {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    ...(process.env.COOKIE_DOMAIN && { domain: process.env.COOKIE_DOMAIN }),
  };
}

// "Remember me" -> persistent cookie that lives as long as the token; otherwise a session cookie
// (cleared when the browser closes) that the token's own 1-day expiry also bounds.
export function setAuthCookie(res, token, { rememberMe = false } = {}) {
  const options = cookieOptions();
  if (rememberMe) {
    const exp = jwt.decode(token)?.exp;
    if (exp) options.maxAge = Math.max(exp * 1000 - Date.now(), 0);
  }
  res.cookie(COOKIE_NAME, token, options);
}

export function clearAuthCookie(res) {
  const { maxAge, ...options } = cookieOptions();
  res.clearCookie(COOKIE_NAME, options);
}

// Minimal Cookie-header parser (no extra dependency).
export function readCookie(req, name = COOKIE_NAME) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

// CSRF defence for cookie-authenticated, state-changing requests: browsers always attach the
// cookie, so require the request to come from our own frontend (Origin, else Referer).
export function originAllowed(req) {
  const allowed = (process.env.CLIENT_URL || "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
  const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer, "http://x").origin : null);
  if (!origin) return false;
  return allowed.includes(origin.replace(/\/$/, ""));
}

export const returnTokenInBody = () => process.env.AUTH_RETURN_TOKEN !== "false";
