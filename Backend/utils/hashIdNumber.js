import crypto from "crypto";

// One-way hash for NIN/BVN. Keyed with a
// server-side pepper so the hash alone isn't reversible even if the
// database leaks.
export function hashIdNumber(rawValue) {
  const pepper = process.env.ID_HASH_PEPPER || "change-me-in-env";
  return crypto.createHmac("sha256", pepper).update(rawValue).digest("hex");
}

export function lastFourDigits(rawValue) {
  return String(rawValue).slice(-4);
}
