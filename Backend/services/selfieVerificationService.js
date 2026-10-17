import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import SelfieVerification from "../models/selfieVerificationModel.js";
import User from "../models/userModel.js";
import { httpError } from "../utils/httpError.js";
import { selfieDir } from "../middleware/selfieUploadMiddleware.js";

// Everything is read at call time so it can be tuned from .env without code changes.
const cfg = () => ({
  ttlSeconds: Number(process.env.SELFIE_SESSION_TTL_SECONDS || 300), // time allowed to finish all steps
  steps: Number(process.env.SELFIE_CHALLENGE_COUNT || 3),
  minGapMs: Number(process.env.SELFIE_MIN_FRAME_GAP_MS || 1000), // frames closer than this aren't a real "do the action"
  maxSessionsPerDay: Number(process.env.SELFIE_MAX_SESSIONS_PER_DAY || 5),
  retentionDays: Number(process.env.SELFIE_RETENTION_DAYS || 30),
});

// The prompts the app shows over the camera preview ("Turn your head left", ...).
export const CHALLENGES = [
  { id: "blink", instruction: "Blink twice" },
  { id: "turn_left", instruction: "Slowly turn your head to the left" },
  { id: "turn_right", instruction: "Slowly turn your head to the right" },
  { id: "smile", instruction: "Smile" },
  { id: "look_up", instruction: "Look up" },
];

const randomChallenges = (count) => {
  const pool = [...CHALLENGES];
  const picked = [];
  while (picked.length < Math.min(count, pool.length)) {
    picked.push(pool.splice(crypto.randomInt(0, pool.length), 1)[0]); // crypto RNG: the order can't be guessed/pre-recorded
  }
  return picked;
};

const removeFiles = (sessionId) => fs.rm(selfieDir(sessionId), { recursive: true, force: true });

// --- user side ---------------------------------------------------------------------------

// "Start verification": the user has tapped continue on the consent screen.
export async function createSession(userId) {
  const { ttlSeconds, steps, maxSessionsPerDay, minGapMs } = cfg();

  const user = await User.findById(userId);
  if (!user) throw httpError("User not found.", 404);
  if (user.selfieStatus === "approved") throw httpError("Your selfie is already verified.", 409);
  if (user.selfieStatus === "pending_review") throw httpError("Your selfie is already being reviewed.", 409);

  const since = new Date(Date.now() - 24 * 3600 * 1000);
  if ((await SelfieVerification.countDocuments({ userId, createdAt: { $gte: since } })) >= maxSessionsPerDay) {
    throw httpError("Too many verification attempts today. Please try again tomorrow.", 429);
  }

  // Only one live attempt at a time: abandon any unfinished one
  const stale = await SelfieVerification.find({ userId, status: "in_progress" });
  for (const old of stale) {
    await SelfieVerification.updateOne({ _id: old._id }, { status: "expired", frames: [] });
    await removeFiles(old._id);
  }

  const session = await SelfieVerification.create({
    userId,
    consentAt: new Date(),
    challenges: randomChallenges(steps),
    expiresAt: new Date(Date.now() + ttlSeconds * 1000),
  });

  return {
    sessionId: session.id,
    challenges: session.challenges,
    expiresAt: session.expiresAt,
    expiresInSeconds: ttlSeconds,
    minFrameGapMs: minGapMs,
  };
}

// Express middleware: the session must belong to the caller, be in progress and not be expired.
// Runs BEFORE the upload so nothing is written to disk for an invalid request.
export async function requireActiveSession(req, _res, next) {
  try {
    const session = await SelfieVerification.findOne({ _id: req.params.id, userId: req.user.id });
    if (!session) throw httpError("Verification session not found.", 404);
    if (session.status !== "in_progress") throw httpError("This verification session is no longer active.", 409);
    if (session.expiresAt <= new Date()) {
      await SelfieVerification.updateOne({ _id: session._id }, { status: "expired", frames: [] });
      await removeFiles(session._id);
      throw httpError("This verification session has expired. Please start again.", 410);
    }
    req.selfieSession = session;
    next();
  } catch (error) {
    next(error);
  }
}

// One camera frame for the NEXT challenge. Must be uploaded in order, at human speed.
export async function addFrame(session, file, challengeId) {
  const discard = () => {
    if (!file?.path || typeof file.path !== "string") return Promise.resolve();
    const root = path.resolve(selfieDir);
    const target = path.resolve(file.path);
    if (target === root || target.startsWith(root + path.sep)) {
      return fs.rm(target, { force: true });
    }
    return Promise.resolve();
  };
  try {
    const index = session.frames.length;
    const expected = session.challenges[index];
    if (!expected) throw httpError("All steps are already captured. Submit the verification.", 409);
    if (challengeId !== expected.id) {
      throw httpError(`Expected the "${expected.id}" step next.`, 409, { expectedChallenge: expected });
    }

    const last = session.frames[index - 1]?.capturedAt || session.createdAt;
    if (Date.now() - last.getTime() < cfg().minGapMs) {
      throw httpError("That was too fast. Follow the on-screen instruction, then capture.", 429);
    }

    // Atomic append: only succeeds if this step hasn't been stored yet and the session is still open
    const updated = await SelfieVerification.findOneAndUpdate(
      { _id: session._id, status: "in_progress", expiresAt: { $gt: new Date() }, [`frames.${index}`]: { $exists: false } },
      {
        $push: {
          frames: {
            challenge: expected.id,
            filename: file.filename,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            sha256: file.sha256,
            capturedAt: new Date(),
          },
        },
      },
      { new: true }
    );
    if (!updated) throw httpError("That step was already captured or the session ended.", 409);

    const next = updated.challenges[updated.frames.length] || null;
    return { captured: expected.id, nextChallenge: next, remaining: updated.challenges.length - updated.frames.length };
  } catch (error) {
    await discard();
    throw error;
  }
}

// "Submit": every step is captured -> goes to the admin review queue.
export async function submitSession(session) {
  if (session.frames.length !== session.challenges.length) {
    throw httpError("Complete every step before submitting.", 400, { remaining: session.challenges.length - session.frames.length });
  }

  const submitted = await SelfieVerification.findOneAndUpdate(
    { _id: session._id, status: "in_progress" },
    { status: "pending_review", submittedAt: new Date() },
    { new: true }
  );
  if (!submitted) throw httpError("This session was already submitted.", 409);

  await User.updateOne({ _id: session.userId }, { selfieStatus: "pending_review" });
  return submitted;
}

// Drives the "Under review / Verified / Try again" screen
export async function getStatus(userId) {
  const [user, latest] = await Promise.all([
    User.findById(userId),
    SelfieVerification.findOne({ userId }).sort({ createdAt: -1 }),
  ]);
  if (!user) throw httpError("User not found.", 404);
  return {
    selfieStatus: user.selfieStatus,
    selfieVerified: user.selfieStatus === "approved",
    latestSession: latest
      ? { sessionId: latest.id, status: latest.status, rejectionReason: latest.rejectionReason ?? null, expiresAt: latest.expiresAt }
      : null,
  };
}

// --- admin side --------------------------------------------------------------------------

export async function listPendingReviews() {
  const sessions = await SelfieVerification.find({ status: "pending_review" }).sort({ submittedAt: 1 });
  const users = await User.find({ _id: { $in: sessions.map((s) => s.userId) } });
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return sessions.map((s) => {
    const u = byId.get(String(s.userId));
    return {
      ...s.toJSON(),
      challenges: s.challenges,
      user: u && { id: u.id, fullName: `${u.firstName} ${u.lastName}`.trim(), role: u.role, email: u.email, phone: u.phone, avatarUrl: u.avatarUrl },
    };
  });
}

// Resolves a stored frame to a file path for the protected download endpoint.
export async function getFrameFile(sessionId, index) {
  const session = await SelfieVerification.findById(sessionId);
  const frame = session?.frames[Number(index)];
  if (!frame) throw httpError("Frame not found.", 404);
  // filename is generated by us (hex + ext) — basename() is belt and braces against path tricks
  return { file: path.join(selfieDir(session._id), path.basename(frame.filename)), mimeType: frame.mimeType };
}

export async function reviewSession(sessionId, adminId, { decision, rejectionReason }) {
  const { retentionDays } = cfg();
  const approved = decision === "approved";

  const session = await SelfieVerification.findOneAndUpdate(
    { _id: sessionId, status: "pending_review" },
    {
      status: approved ? "approved" : "rejected",
      reviewedBy: adminId,
      reviewedAt: new Date(),
      rejectionReason: approved ? undefined : rejectionReason || "Verification unsuccessful",
      purgeAfter: new Date(Date.now() + (approved ? retentionDays * 24 * 3600 * 1000 : 0)),
    },
    { new: true }
  );
  if (!session) {
    const exists = await SelfieVerification.exists({ _id: sessionId });
    throw httpError(exists ? "This session has already been reviewed." : "Verification session not found.", exists ? 409 : 404);
  }

  await User.updateOne({ _id: session.userId }, { selfieStatus: decision === "approved" ? "approved" : "rejected", selfieReviewedAt: new Date() });

  // A rejected selfie is deleted straight away; an approved one is kept only for the audit window
  if (!approved) {
    await removeFiles(session._id);
    session.frames = [];
    await session.save();
  }
  return session;
}

// Daily housekeeping (see server.js): delete frames past retention and abandoned sessions.
export async function purgeExpired() {
  const now = new Date();
  let purged = 0;

  const abandoned = await SelfieVerification.find({ status: "in_progress", expiresAt: { $lte: now } });
  for (const s of abandoned) {
    await SelfieVerification.updateOne({ _id: s._id }, { status: "expired", frames: [] });
    await removeFiles(s._id);
    purged++;
  }

  const old = await SelfieVerification.find({ purgeAfter: { $lte: now }, "frames.0": { $exists: true } });
  for (const s of old) {
    await SelfieVerification.updateOne({ _id: s._id }, { frames: [] });
    await removeFiles(s._id);
    purged++;
  }
  return purged;
}
