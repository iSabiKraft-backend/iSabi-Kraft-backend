import { timingSafeEqual } from "node:crypto";
import { httpError } from "../utils/httpError.js";
import { enqueueArtisanSync } from "../services/artisanSyncQueue.js";

const secretMatches = (provided, expected) => {
  if (!provided || !expected) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
};

export const verificationChanged = async (req, res) => {
  if (
    !secretMatches(
      req.get("x-supabase-webhook-secret"),
      process.env.SUPABASE_WEBHOOK_SECRET,
    )
  ) {
    throw httpError(401, "Invalid webhook authentication");
  }
  const record =
    req.body?.record ||
    req.body?.new ||
    req.body?.old_record ||
    req.body?.old ||
    req.body;
  const userId = record?.user_id || record?.id;
  if (
    !userId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      userId,
    )
  ) {
    throw httpError(400, "Webhook payload is missing a valid user_id");
  }

  await enqueueArtisanSync(userId);
  res
    .status(202)
    .json({
      received: true,
      queued: true,
      message: "Artisan synchronization has been queued.",
    });
};
