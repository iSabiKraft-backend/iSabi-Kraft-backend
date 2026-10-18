import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

// rememberMe = the "Remember me" checkbox on the login screen -> longer-lived token
export function generateToken(user, { rememberMe = false } = {}) {
  const expiresIn = rememberMe
    ? process.env.JWT_REMEMBER_EXPIRES_IN || "30d"
    : process.env.JWT_EXPIRES_IN || "1d";

  return jwt.sign(
    {
      // data stored in the token payload
      id: user.id,
      role: user.role,
      // password version: a reset changes passwordChangedAt, which invalidates every older token
      pwv: user.passwordChangedAt ? user.passwordChangedAt.getTime() : 0,
    },
    process.env.JWT_SECRET,
    { expiresIn }
  );
}
