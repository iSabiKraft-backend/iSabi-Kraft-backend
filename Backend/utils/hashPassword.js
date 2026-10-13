import bcrypt from "bcrypt";

// used when hashing the password
const SALT_ROUNDS = 10;

// Hash a plain-text password
export async function hashPassword(password) {
  return await bcrypt.hash(password, SALT_ROUNDS);
}

// compare a plain-text password with a hashed password
export async function comparePassword(password, hashedPassword) {
  return await bcrypt.compare(password, hashedPassword);
}
