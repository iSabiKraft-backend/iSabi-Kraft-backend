import Dispute from "../models/dispute.js";
import User from "../models/user.js";
import * as supabaseAdmin from "../services/supabaseAdmin.js";
import {
  reconcilePendingTransfers,
  reconcileTransfer,
  resolveDispute,
} from "../services/escrowService.js";
import { httpError } from "../utils/httpError.js";
import { objectId, text } from "../utils/validate.js";
import {
  enqueueArtisanSync,
  artisanSyncQueueDiagnostics,
  retryFailedArtisanSyncJobs,
  drainArtisanSyncQueue,
} from "../services/artisanSyncQueue.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const listVerifications = async (_req, res) => {
  const rows = await supabaseAdmin.pendingVerifications();
  const verifications = await Promise.all(
    rows.map(async (r) => ({
      ...r,
      front_url: await supabaseAdmin.signedUrl("identity-docs", r.front_path),
      back_url: await supabaseAdmin.signedUrl("identity-docs", r.back_path),
      selfie_url: await supabaseAdmin.signedUrl("identity-docs", r.selfie_path),
    })),
  );
  res.json({ verifications });
};

export const reviewVerification = async (req, res) => {
  const { userId } = req.params;
  if (!UUID.test(userId)) throw httpError(400, "Invalid user id");
  const status = req.body.status;
  if (!["approved", "rejected"].includes(status))
    throw httpError(400, "Status must be approved or rejected");
  const reason =
    status === "rejected"
      ? text(req.body.reason, { label: "Rejection reason", max: 500 })
      : null;

  const verification = await supabaseAdmin.setVerificationStatus(
    userId,
    status,
    reason,
  );
  await enqueueArtisanSync(userId);
  const worker = await drainArtisanSyncQueue({ maxJobs: 5 });
  const queue = await artisanSyncQueueDiagnostics();
  res.status(202).json({
    verification,
    synchronizationQueued: queue.pending > 0 || queue.processing > 0,
    processedImmediately: worker.processed,
    queue,
  });
};

export const listDisputes = async (req, res) => {
  const filter = req.query.status ? { status: String(req.query.status) } : {};
  res.json({
    disputes: await Dispute.find(filter).sort({ createdAt: -1 }).limit(100),
  });
};

export const resolve = async (req, res) => {
  const resolution = req.body.resolution;
  if (!["release", "refund"].includes(resolution))
    throw httpError(400, "Resolution must be release or refund");
  const note = text(req.body.adminNote, {
    label: "Admin note",
    max: 1000,
    required: false,
  });
  res.json({
    dispute: await resolveDispute(
      objectId(req.params.id, "dispute id"),
      resolution,
      note,
    ),
  });
};

export const reconcile = async (req, res) => {
  if (req.params.reference) {
    const settled = await reconcileTransfer(String(req.params.reference));
    return res.json({ settled: Boolean(settled) });
  }
  res.json({ results: await reconcilePendingTransfers() });
};

export const artisanDiscoveryDiagnostics = async (_req, res) => {
  try {
    const [
      totalArtisans,
      verifiedArtisans,
      withTrade,
      availableArtisans,
      discoverableArtisans,
    ] = await Promise.all([
      User.countDocuments({ role: "artisan" }),

      User.countDocuments({
        role: "artisan",
        verified: true,
      }),

      User.countDocuments({
        role: "artisan",
        "artisan.trade": { $exists: true, $ne: "" },
      }),

      User.countDocuments({
        role: "artisan",
        "artisan.available": { $ne: false },
      }),

      User.countDocuments({
        role: "artisan",
        verified: true,
        "artisan.trade": { $exists: true, $ne: "" },
        "artisan.available": { $ne: false },
      }),
    ]);

    return res.json({
      diagnostics: {
        totalArtisans,
        verifiedArtisans,
        withTrade,
        availableArtisans,
        discoverableArtisans,
      },
    });
  } catch (error) {
    console.error("Artisan discovery diagnostics error:", error);

    return res.status(500).json({
      message: "Unable to retrieve artisan discovery diagnostics",
    });
  }
};

export const reconcileArtisanMarketplace = async (_req, res) => {
  const userIds = await supabaseAdmin.artisanUserIds();
  const results = { scanned: userIds.length, queued: 0, enqueueFailures: [] };
  for (let index = 0; index < userIds.length; index += 25) {
    const batch = userIds.slice(index, index + 25);
    const settled = await Promise.allSettled(
      batch.map((userId) => enqueueArtisanSync(userId)),
    );
    settled.forEach((result, offset) => {
      if (result.status === "fulfilled") results.queued += 1;
      else
        results.enqueueFailures.push({
          userId: batch[offset],
          message: result.reason?.message || "Unable to queue",
        });
    });
  }
  const worker = await drainArtisanSyncQueue({ maxJobs: 10 });
  const queue = await artisanSyncQueueDiagnostics();
  res.status(results.enqueueFailures.length ? 207 : 202).json({
    ...results,
    processedImmediately: worker.processed,
    queue,
    complete:
      results.enqueueFailures.length === 0 &&
      queue.pending === 0 &&
      queue.processing === 0,
    message:
      "Reconciliation jobs have been queued. Check queue diagnostics until pending jobs reach zero.",
  });
};

export const artisanSyncQueueStatus = async (_req, res) => {
  res.json({ queue: await artisanSyncQueueDiagnostics() });
};

export const retryArtisanSyncQueue = async (_req, res) => {
  const retried = await retryFailedArtisanSyncJobs();
  const worker = await drainArtisanSyncQueue({ maxJobs: 10 });
  res.json({
    retried,
    processedImmediately: worker.processed,
    queue: await artisanSyncQueueDiagnostics(),
  });
};
