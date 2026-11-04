import mongoose from "mongoose";
import { httpError } from "./httpError.js";

export const objectId = (value, label = "id") => {
  if (!mongoose.isValidObjectId(value)) throw httpError(400, `Invalid ${label}`);
  return String(value);
};

export const text = (value, { label, min = 1, max = 2000, required = true } = {}) => {
  if (value === undefined || value === null || value === "") {
    if (required) throw httpError(400, `${label} is required`);
    return undefined;
  }
  const clean = String(value).trim();
  if (clean.length < min || clean.length > max) {
    throw httpError(400, `${label} must be between ${min} and ${max} characters`);
  }
  return clean;
};

// Whole-naira amounts only.
export const naira = (value, { label, min = 0 } = {}) => {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > 100_000_000) {
    throw httpError(400, `${label} must be a whole amount of at least ${min}`);
  }
  return n;
};

export const toKobo = (amount) => Math.round(Number(amount) * 100);

export const sameId = (a, b) => String(a?._id ?? a) === String(b?._id ?? b);
