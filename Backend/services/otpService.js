import crypto from "node:crypto";
import Otp from "../models/otpModel.js";
import { send } from "./notificationService.js";
import { httpError } from "../utils/httpError.js";

// Screen copy: "Code expires in 02:45" and "Resend available in 00:59".
export const OTP_TTL_SECONDS = Number(process.env.OTP_TTL_SECONDS || 180);
export const RESEND_COOLDOWN_SECONDS = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60);
export const RESET_TTL_SECONDS = Number(process.env.RESET_TOKEN_TTL_SECONDS || 1800);
const MAX_ATTEMPTS = 5;

const secret = () => process.env.OTP_PEPPER || process.env.JWT_SECRET;
const hash = (value) => crypto.createHmac("sha256", secret()).update(String(value)).digest("hex");
const safeEqual = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const cooldownLeft = (record) =>
  record ? Math.max(0, RESEND_COOLDOWN_SECONDS - Math.floor((Date.now() - record.lastSentAt.getTime()) / 1000)) : 0;

const upsert = (userId, purpose, channel, destination, codeHash, ttl) =>
  Otp.findOneAndUpdate(
    { userId, purpose },
    { channel, destination, codeHash, attempts: 0, lastSentAt: new Date(), expiresAt: new Date(Date.now() + ttl * 1000) },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

// Create + send a 6-digit verification code. Throws 429 during the resend cooldown.
export async function issueVerificationCode(user, channel, destination) {
  const existing = await Otp.findOne({ userId: user._id, purpose: "verify" });
  const wait = cooldownLeft(existing);
  if (wait > 0) {
    throw httpError(`Please wait ${wait}s before requesting another code.`, 429, { resendAvailableInSeconds: wait });
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await upsert(user._id, "verify", channel, destination, hash(code), OTP_TTL_SECONDS);

  await send(channel, destination, {
    subject: "Your iSabiKraft verification code",
    text: `Your iSabiKraft verification code is ${code}. It expires in ${Math.round(OTP_TTL_SECONDS / 60)} minutes. Don't share it with anyone.`,
  });

  return { channel, destination, expiresInSeconds: OTP_TTL_SECONDS, resendAvailableInSeconds: RESEND_COOLDOWN_SECONDS, code };
}

// Check a submitted code. Returns the OTP record's channel on success.
export async function consumeVerificationCode(userId, code) {
  const invalid = () => httpError("Invalid or expired code.", 400);
  const record = await Otp.findOne({ userId, purpose: "verify" });
  if (!record || record.expiresAt <= new Date()) throw invalid();
  if (record.attempts >= MAX_ATTEMPTS) {
    throw httpError("Too many incorrect attempts. Please request a new code.", 429);
  }

  if (!safeEqual(record.codeHash, hash(code))) {
    await Otp.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
    throw invalid();
  }

  // Atomic delete: a code can only be redeemed once, even with parallel requests
  const deleted = await Otp.findOneAndDelete({ _id: record._id });
  if (!deleted) throw invalid();
  return record.channel;
}

export async function getVerificationCooldown(userId) {
  return cooldownLeft(await Otp.findOne({ userId, purpose: "verify" }));
}

// Create + send a 6-digit password-reset code. Returns { resendAvailableInSeconds, code }.
export async function issueResetCode(user, channel, destination) {
  const existing = await Otp.findOne({ userId: user._id, purpose: "reset" });
  const wait = cooldownLeft(existing);
  if (wait > 0) return { resendAvailableInSeconds: wait, code: null };

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await upsert(user._id, "reset", channel, destination, hash(code), RESET_TTL_SECONDS);

  await send(channel, destination, {
    subject: "Reset your iSabiKraft password",
    text: `Your iSabiKraft reset code is ${code}. It expires in ${Math.round(RESET_TTL_SECONDS / 60)} minutes. Don't share it with anyone.`,
  });

  return { resendAvailableInSeconds: RESEND_COOLDOWN_SECONDS, code };
}

// Look up a reset code for a specific user without consuming it.
export async function findResetCode(userId, code) {
  const record = await Otp.findOne({ userId, purpose: "reset" });
  if (!record || record.expiresAt <= new Date()) {
    throw httpError("This reset code is invalid or has expired.", 400);
  }

  if (!safeEqual(record.codeHash, hash(code))) {
    await Otp.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
    throw httpError("This reset code is invalid or has expired.", 400);
  }

  return record;
}

export async function deleteUserCodes(userId, purpose) {
  await Otp.deleteMany({ userId, ...(purpose && { purpose }) });
}
