import fs from "node:fs";
import * as service from "../services/selfieVerificationService.js";

const handler = (fn, status, message) => async (req, res, next) => {
  try {
    const data = await fn(req);
    return res.status(status).json({ success: true, ...(message && { message }), data });
  } catch (error) {
    next(error);
  }
};

// POST /verification/selfie/sessions
export const startSession = handler((req) => service.createSession(req.user.id), 201, "Verification started. Complete each step on camera.");

// POST /verification/selfie/sessions/:id/frames  (multipart: challenge + frame)
export const uploadFrame = handler((req) => service.addFrame(req.selfieSession, req.file, req.body.challenge), 201, "Step captured.");

// POST /verification/selfie/sessions/:id/submit
export const submit = handler((req) => service.submitSession(req.selfieSession), 202, "Selfie submitted for review.");

// GET /verification/selfie/status
export const status = handler((req) => service.getStatus(req.user.id), 200);

// --- admin ---
export const queue = handler(() => service.listPendingReviews(), 200);

export const review = handler((req) => service.reviewSession(req.params.id, req.user.id, req.body), 200, "Decision recorded.");

// GET /verification/selfie/:id/frames/:index — streams the image to an admin (never cached)
export const frameImage = async (req, res, next) => {
  try {
    const { file, mimeType } = await service.getFrameFile(req.params.id, req.params.index);
    console.info(`[selfie] admin ${req.user.id} viewed frame ${req.params.index} of session ${req.params.id}`);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const stream = fs.createReadStream(file);
    stream.on("error", () => (res.headersSent ? res.end() : res.status(404).json({ success: false, message: "Frame no longer available." })));
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
};
