import User from "../models/user.js";
import * as supabaseAdmin from "./supabaseAdmin.js";
import { normalizeTrade, normalizeCategory } from "../utils/trade.js";

export const syncArtisanFromSupabase = async (userId) => {
  const [{ profile, artisan }, verification] = await Promise.all([
    supabaseAdmin.artisanProfile(userId),
    supabaseAdmin.artisanVerification(userId),
  ]);
  const status = verification?.status || "pending";
  const trade = normalizeTrade(artisan?.trade);
  const set = {
    supabaseId: userId,
    role: profile
      ? profile.role === "artisan"
        ? "artisan"
        : "customer"
      : artisan
        ? "artisan"
        : "customer",
    verified: status === "approved",
    verificationStatus: ["pending", "approved", "rejected"].includes(status)
      ? status
      : "pending",
  };
  if (profile?.full_name) set.fullName = profile.full_name;
  if (profile?.avatar_url && /^https:\/\//.test(profile.avatar_url))
    set.avatarUrl = profile.avatar_url;
  if (profile?.email) set.email = profile.email;
  if (profile?.phone) set.phone = profile.phone;
  if (trade) {
    set["artisan.trade"] = trade;
    set["artisan.category"] = normalizeCategory(artisan?.category, trade);
    set["artisan.services"] =
      Array.isArray(artisan?.services) && artisan.services.length
        ? artisan.services.map(normalizeTrade).filter(Boolean).slice(0, 12)
        : [trade];
    set["artisan.bio"] = artisan?.bio || "";
    const years = Number(artisan?.experience);
    if (Number.isFinite(years) && years >= 0 && years <= 60)
      set["artisan.experienceYears"] = years;
    set["artisan.state"] = profile?.state || "";
    set["artisan.lga"] = profile?.lga || "";
  }
  const update = { $set: set };
  if (!trade) {
    update.$unset = {
      "artisan.trade": 1,
      "artisan.category": 1,
      "artisan.services": 1,
      "artisan.bio": 1,
      "artisan.experienceYears": 1,
      "artisan.state": 1,
      "artisan.lga": 1,
    };
  }
  const user = await User.findOneAndUpdate({ supabaseId: userId }, update, {
    upsert: true,
    returnDocument: "after",
    runValidators: true,
    setDefaultsOnInsert: true,
  });
  return { user, status, published: Boolean(trade) };
};
