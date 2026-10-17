import crypto from "node:crypto";
import { paystackRequest } from "../config/paystack.js";

// Generate a unique reference for a transaction / transfer
const makeReference = () => `isk_${crypto.randomUUID()}`;

// paystackRequest(path, method, body) already unwraps Paystack's `data`
// field and throws an Error with a statusCode on failure.
async function initializePayment(data) {
  // amount must be in kobo; callers may pass their own reference so they can store it first
  return paystackRequest("/transaction/initialize", "POST", {
    ...data,
    reference: data.reference || makeReference(),
  });
}

const verifyPayment = async (reference) =>
  paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);

const createTransferRecipient = async (data) => paystackRequest("/transferrecipient", "POST", data);

// Transfer to artisan
const transferToArtisan = async (data) => paystackRequest("/transfer", "POST", data);

// Validate Paystack webhook signature. Must be given the RAW request body
// (Buffer/string) exactly as received — re-serialising parsed JSON breaks the HMAC.
function validWebHookSignature(rawBody, signature) {
  if (!signature || !rawBody) return false;
  const hash = crypto.createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
  const a = Buffer.from(hash);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export {
  makeReference,
  initializePayment,
  verifyPayment,
  createTransferRecipient,
  transferToArtisan,
  validWebHookSignature,
};
