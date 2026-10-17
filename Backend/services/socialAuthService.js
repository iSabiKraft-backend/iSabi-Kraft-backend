import { createRemoteJWKSet, jwtVerify } from "jose";
import { httpError } from "../utils/httpError.js";

// "Continue with Google" / "Continue with Apple": the mobile/web app signs the
// user in with the provider SDK and sends us the resulting ID token (a JWT).
// We verify its signature against the provider's public keys, plus issuer and
// audience (= our client ID), then trust its claims.
const PROVIDERS = {
  google: {
    issuers: ["https://accounts.google.com", "accounts.google.com"],
    jwksUrl: () => process.env.GOOGLE_JWKS_URL || "https://www.googleapis.com/oauth2/v3/certs",
    audience: () => process.env.GOOGLE_CLIENT_ID,
  },
  apple: {
    issuers: ["https://appleid.apple.com"],
    jwksUrl: () => process.env.APPLE_JWKS_URL || "https://appleid.apple.com/auth/keys",
    audience: () => process.env.APPLE_CLIENT_ID,
  },
};

const jwksCache = new Map();
const getJwks = (url) => {
  if (!jwksCache.has(url)) jwksCache.set(url, createRemoteJWKSet(new URL(url)));
  return jwksCache.get(url);
};

// Returns { providerId, email, emailVerified, name, picture }
export async function verifySocialToken(provider, idToken) {
  const config = PROVIDERS[provider];
  const audience = config?.audience()?.split(",").map((s) => s.trim()).filter(Boolean);
  if (!config || !audience?.length) {
    throw httpError(`Sign in with ${provider} is not configured on the server.`, 503);
  }

  try {
    const { payload } = await jwtVerify(idToken, getJwks(config.jwksUrl()), { issuer: config.issuers, audience });
    return {
      providerId: payload.sub,
      email: payload.email ? String(payload.email).toLowerCase() : null,
      emailVerified: payload.email_verified === true || payload.email_verified === "true",
      name: payload.name || null,
      picture: payload.picture || null,
    };
  } catch (error) {
    throw httpError("Invalid or expired sign-in token.", 401);
  }
}
