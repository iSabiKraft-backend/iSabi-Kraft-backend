import crypto from "node:crypto";
import { paystackRequest } from "../config/paystack.js";

export const makeReference = (prefix = "isk") =>
  `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;

export const initializePayment = (data) =>
  paystackRequest("/transaction/initialize", "POST", data);

export const verifyPayment = (reference) =>
  paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);

export const listBanks = async () => {
  const banks = [];
  let next = null;
  for (let page = 0; page < 10; page += 1) {
    const qs = `country=nigeria&currency=NGN&use_cursor=true&perPage=100${next ? `&next=${encodeURIComponent(next)}` : ""}`;
    const result = await paystackRequest(`/bank?${qs}`, "GET", null, {
      raw: true,
    });
    banks.push(...result.data);
    next = result.meta?.next;
    if (!next) break;
  }
  return banks
    .filter((b) => b.active !== false)
    .map((b) => ({ name: b.name, code: b.code }));
};

export const resolveAccount = (accountNumber, bankCode) =>
  paystackRequest(
    `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
  );

export const createTransferRecipient = (data) =>
  paystackRequest("/transferrecipient", "POST", data);

export const transferToArtisan = (data) =>
  paystackRequest("/transfer", "POST", data);

export const verifyTransfer = (reference) =>
  paystackRequest(`/transfer/verify/${encodeURIComponent(reference)}`);

export const refundTransaction = (data) =>
  paystackRequest("/refund", "POST", data);

export const isValidWebhookSignature = (rawBody, signature) => {
  if (!signature || !Buffer.isBuffer(rawBody)) return false;
  const expected = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
