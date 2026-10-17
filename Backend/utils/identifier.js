// Helpers for the "Email or Phone Number" fields on the auth screens.

export const isEmail = (value) => typeof value === "string" && value.includes("@");

export const normalizeEmail = (value) => String(value).trim().toLowerCase();

// "+234 809 456 7892", "0809 456 7892", "2348094567892" -> "+2348094567892"
export const normalizePhone = (value) => {
  let digits = String(value).trim().replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) return /^\+\d{10,15}$/.test(digits) ? digits : null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (/^0\d{10}$/.test(digits)) digits = "234" + digits.slice(1); // Nigerian local format
  return /^\d{10,15}$/.test(digits) ? "+" + digits : null;
};

// Returns { type: "email" | "phone", value } or null if it is neither.
export const parseIdentifier = (raw) => {
  if (typeof raw !== "string" || !raw.trim()) return null;
  if (isEmail(raw)) {
    const value = normalizeEmail(raw);
    return /^\S+@\S+\.\S+$/.test(value) ? { type: "email", value } : null;
  }
  const value = normalizePhone(raw);
  return value ? { type: "phone", value } : null;
};

// Mongo filter for a parsed identifier
export const identifierQuery = (parsed) => (parsed.type === "email" ? { email: parsed.value } : { phone: parsed.value });

// "Okafor Chidinma" -> { firstName: "Okafor", lastName: "Chidinma" } (single names are fine)
export const splitFullName = (fullName) => {
  const parts = String(fullName).trim().split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
};
