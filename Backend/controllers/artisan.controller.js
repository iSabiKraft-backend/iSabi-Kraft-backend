import Escrow from "../models/escrow.js";
import User from "../models/user.js";
import * as paystack from "../services/paystackService.js";
import { httpError } from "../utils/httpError.js";
import { text } from "../utils/validate.js";

import { normalizeCategory, normalizeTrade } from "../utils/trade.js";

export const banks = async (_req, res) =>
  res.json({ banks: await paystack.listBanks() });

const ACTIVE_ESCROW = [
  "payment_confirmed",
  "material_payment_made",
  "disputed",
];

export const myPayoutStatus = async (req, res) => {
  const bankLocked = Boolean(
    await Escrow.exists({
      artisanID: req.user._id,
      status: { $in: ACTIVE_ESCROW },
    }),
  );
  res.json({
    verified: req.user.verified,
    hasPayoutAccount: Boolean(req.user.paystackRecipientCode),
    bank: req.user.bank || null,

    published: Boolean(req.user.artisan?.trade),

    bankLocked,
  });
};

export const resolveBank = async (req, res) => {
  const accountNumber = String(req.body.accountNumber || "").replace(/\s/g, "");
  const bankCode = String(req.body.bankCode || "").trim();
  if (!/^\d{10}$/.test(accountNumber))
    throw httpError(400, "Account number must be 10 digits");
  if (!/^\d{3,6}$/.test(bankCode)) throw httpError(400, "Choose a bank");
  const resolved = await paystack.resolveAccount(accountNumber, bankCode);
  res.json({ accountName: resolved.account_name });
};

export const saveBank = async (req, res) => {
  const accountNumber = String(req.body.accountNumber || "").replace(/\s/g, "");
  const bankCode = String(req.body.bankCode || "").trim();
  if (!/^\d{10}$/.test(accountNumber))
    throw httpError(400, "Account number must be 10 digits");
  if (!/^\d{3,6}$/.test(bankCode)) throw httpError(400, "Choose a bank");

  const active = await Escrow.exists({
    artisanID: req.user._id,
    status: { $in: ["payment_confirmed", "material_payment_made", "disputed"] },
  });
  if (active)
    throw httpError(
      409,
      "Finish your active jobs before changing your payout account",
    );

  const resolved = await paystack.resolveAccount(accountNumber, bankCode);
  const recipient = await paystack.createTransferRecipient({
    type: "nuban",
    name: resolved.account_name,
    account_number: accountNumber,
    bank_code: bankCode,
    currency: "NGN",
  });

  req.user.paystackRecipientCode = recipient.recipient_code;
  req.user.bank = {
    bankCode,
    bankName: recipient.details?.bank_name,
    accountName: resolved.account_name,
    accountLast4: accountNumber.slice(-4),
  };
  await req.user.save();
  res.json({ bank: req.user.bank, hasPayoutAccount: true });
};

export const saveProfile = async (req, res) => {
  const b = req.body || {};
  const trade = normalizeTrade(text(b.trade, { label: "Trade", max: 60 }));
  const services = Array.isArray(b.services)
    ? [...new Set(b.services.map((s) => String(s).trim()).filter(Boolean))]
        .slice(0, 12)
        .map((s) => s.slice(0, 60))
    : [];
  const years =
    b.experienceYears === undefined || b.experienceYears === ""
      ? undefined
      : Number(b.experienceYears);
  if (
    years !== undefined &&
    (!Number.isFinite(years) || years < 0 || years > 60)
  )
    throw httpError(400, "Experience must be 0 to 60 years");
  const lat = Number(b.location?.lat);
  const lng = Number(b.location?.lng);
  const httpsOnly = (list) =>
    Array.isArray(list)
      ? list.filter((u) => /^https:\/\//.test(String(u))).slice(0, 24)
      : undefined;

  const category = normalizeCategory(b.category, trade);
  const next = {
    ...(req.user.toObject().artisan || {}),
    trade,
    category,
    services,
    bio: text(b.bio, { label: "Bio", max: 1500, required: false }),
    experienceYears: years,
    state: text(b.state, { label: "State", max: 60, required: false }),
    lga: text(b.lga, { label: "Area", max: 60, required: false }),
  };
  if (Number.isFinite(lat) && Number.isFinite(lng) && b.location)
    next.location = { lat, lng };
  const portfolio = httpsOnly(b.portfolio);
  if (portfolio) next.portfolio = portfolio;
  if (typeof b.available === "boolean") next.available = b.available;

  req.user.artisan = next;
  if (b.fullName)
    req.user.fullName = text(b.fullName, { label: "Name", max: 80 });
  if (b.avatarUrl && /^https:\/\//.test(String(b.avatarUrl)))
    req.user.avatarUrl = String(b.avatarUrl);
  await req.user.save();
  res.json({ artisan: req.user.artisan });
};
