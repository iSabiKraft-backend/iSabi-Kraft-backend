import { createRemoteJWKSet, jwtVerify } from "jose";
import User from "../models/user.js";
import { httpError } from "../utils/httpError.js";

let verifier;

const getVerifier = () => {
  if (verifier) return verifier;

  const supabaseUrl = process.env.SUPABASE_URL;

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL is missing from environment variables");
  }

  const issuer = `${supabaseUrl.replace(/\/$/, "")}/auth/v1`;
  const options = {
    issuer,
    audience: "authenticated",
  };

  if (process.env.SUPABASE_JWT_SECRET) {
    const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET);

    verifier = (token) =>
      jwtVerify(token, secret, {
        ...options,
        algorithms: ["HS256"],
      });
  } else {
    const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

    verifier = (token) => jwtVerify(token, jwks, options);
  }

  return verifier;
};

const findOrCreateUser = async (payload) => {
  const supabaseId = payload.sub;

  if (!supabaseId) {
    throw httpError(401, "Invalid authentication token");
  }

  let user = await User.findOne({ supabaseId });

  if (user) {
    let changed = false;
    if (payload.email && user.email !== payload.email) {
      user.email = payload.email;
      changed = true;
    }
    if (payload.phone && user.phone !== payload.phone) {
      user.phone = payload.phone;
      changed = true;
    }
    if (changed) await user.save();
    return user;
  }

  const role =
    payload.user_metadata?.role === "artisan" ? "artisan" : "customer";

  try {
    user = await User.create({
      supabaseId,
      role,
      email: payload.email || undefined,
      phone: payload.phone || undefined,
      fullName: payload.user_metadata?.full_name || undefined,
    });

    return user;
  } catch (error) {
    if (error.code === 11000) {
      user = await User.findOne({ supabaseId });

      if (user) {
        return user;
      }
    }

    throw error;
  }
};

export const requireAuth = async (req, _res, next) => {
  try {
    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
      throw httpError(401, "Sign in required");
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      throw httpError(401, "Sign in required");
    }

    let payload;

    try {
      const verified = await getVerifier()(token);
      payload = verified.payload;
    } catch (error) {
      console.error("Supabase token verification failed:", error.message);

      throw httpError(
        401,
        "Your session is invalid or expired. Please sign in again.",
      );
    }

    const user = await findOrCreateUser(payload);

    if (!user) {
      throw httpError(401, "Marketplace account could not be loaded");
    }

    req.user = user;

    req.role =
      payload.app_metadata?.role === "admin"
        ? "admin"
        : user.role || "customer";

    return next();
  } catch (error) {
    return next(error);
  }
};

export const requireRole = (...roles) => {
  return (req, _res, next) => {
    if (!req.user) {
      return next(httpError(401, "Sign in required"));
    }

    if (!roles.includes(req.role)) {
      return next(httpError(403, "You are not allowed to do this"));
    }

    return next();
  };
};
