import ArtisanSyncJob from "../models/artisanSyncJob.js";
import { syncArtisanFromSupabase } from "./artisanSync.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000;
let timer;
let running = false;

export async function enqueueArtisanSync(userId) {
  if (typeof userId !== "string" || !UUID.test(userId))
    throw new Error("Invalid Supabase user id for artisan synchronization");

  const active = await ArtisanSyncJob.findOneAndUpdate(
    { supabaseId: userId, status: "processing" },
    { $set: { rerunRequested: true, updatedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (active) return active;

  try {
    return await ArtisanSyncJob.findOneAndUpdate(
      { supabaseId: userId },
      {
        $set: {
          status: "pending",
          attempts: 0,
          rerunRequested: false,
          nextRunAt: new Date(),
          lockedAt: null,
          lastError: "",
          completedAt: null,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return ArtisanSyncJob.findOneAndUpdate(
      { supabaseId: userId, status: { $ne: "processing" } },
      {
        $set: {
          status: "pending",
          attempts: 0,
          rerunRequested: false,
          nextRunAt: new Date(),
          lockedAt: null,
          lastError: "",
          completedAt: null,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' },
    );
  }
}

async function processOne() {
  const now = new Date();
  const staleLock = new Date(now.getTime() - LOCK_TIMEOUT_MS);
  const job = await ArtisanSyncJob.findOneAndUpdate(
    {
      $or: [
        { status: "pending", nextRunAt: { $lte: now } },
        { status: "processing", lockedAt: { $lte: staleLock } },
      ],
    },
    {
      $set: { status: "processing", lockedAt: now, updatedAt: now },
      $inc: { attempts: 1 },
    },
    { sort: { nextRunAt: 1, createdAt: 1 }, returnDocument: 'after' },
  );
  if (!job) return false;

  try {
    await syncArtisanFromSupabase(job.supabaseId);
    const rerun = await ArtisanSyncJob.updateOne(
      { _id: job._id, status: "processing", rerunRequested: true },
      {
        $set: {
          status: "pending",
          attempts: 0,
          rerunRequested: false,
          nextRunAt: new Date(),
          completedAt: null,
          lockedAt: null,
          lastError: "",
          updatedAt: new Date(),
        },
      },
    );
    if (!rerun.modifiedCount) {
      await ArtisanSyncJob.updateOne(
        { _id: job._id, status: "processing" },
        {
          $set: {
            status: "completed",
            completedAt: new Date(),
            lockedAt: null,
            lastError: "",
            updatedAt: new Date(),
          },
        },
      );
    }
  } catch (error) {
    const delay = Math.min(
      30_000 * 2 ** Math.min(job.attempts - 1, 10),
      MAX_BACKOFF_MS,
    );
    const exhausted = job.attempts >= 12;
    await ArtisanSyncJob.updateOne(
      { _id: job._id, status: "processing" },
      {
        $set: {
          status: exhausted ? "failed" : "pending",
          lockedAt: null,
          nextRunAt: exhausted
            ? new Date("9999-12-31T00:00:00.000Z")
            : new Date(Date.now() + delay),
          lastError: String(error?.message || "Synchronization failed").slice(
            0,
            1000,
          ),
          updatedAt: new Date(),
        },
      },
    );
    console.error(
      `Artisan sync failed for ${job.supabaseId}; ${exhausted ? "manual retry required after 12 attempts" : "retry scheduled"}`,
      error?.message || error,
    );
  }
  return true;
}

export async function drainArtisanSyncQueue({ maxJobs = 10 } = {}) {
  if (running) return { processed: 0, skipped: true };
  running = true;
  let processed = 0;
  try {
    while (processed < maxJobs && (await processOne())) processed += 1;
  } finally {
    running = false;
  }
  return { processed, skipped: false };
}

export function startArtisanSyncWorker({
  intervalMs = 15_000,
  batchSize = 5,
} = {}) {
  if (timer) return;

  void drainArtisanSyncQueue({ maxJobs: batchSize });
  timer = setInterval(() => {
    void drainArtisanSyncQueue({ maxJobs: batchSize }).catch((error) =>
      console.error("Artisan sync worker error", error),
    );
  }, intervalMs);
  timer.unref?.();
}

export async function artisanSyncQueueDiagnostics() {
  const [pending, processing, failed, completed, recentFailures] =
    await Promise.all([
      ArtisanSyncJob.countDocuments({ status: "pending" }),
      ArtisanSyncJob.countDocuments({ status: "processing" }),
      ArtisanSyncJob.countDocuments({ status: "failed" }),
      ArtisanSyncJob.countDocuments({ status: "completed" }),
      ArtisanSyncJob.find({
        status: { $in: ["pending", "failed"] },
        attempts: { $gt: 0 },
        lastError: { $ne: "" },
      })
        .sort({ updatedAt: -1 })
        .limit(20)
        .select("supabaseId status attempts nextRunAt lastError updatedAt -_id")
        .lean(),
    ]);
  return { pending, processing, failed, completed, recentFailures };
}

export async function retryFailedArtisanSyncJobs() {
  const result = await ArtisanSyncJob.updateMany(
    { status: "failed" },
    {
      $set: {
        status: "pending",
        attempts: 0,
        nextRunAt: new Date(),
        lockedAt: null,
        lastError: "",
        updatedAt: new Date(),
      },
    },
  );
  return result.modifiedCount || 0;
}
