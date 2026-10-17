import express from "express";
import rateLimit from "express-rate-limit";
import { startSession, uploadFrame, submit, status, queue, review, frameImage } from "../controllers/selfieVerificationController.js";
import { authenticateUser } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { validateRequest } from "../middleware/validationMiddleware.js";
import { uploadFrame as frameUpload } from "../middleware/selfieUploadMiddleware.js";
import { requireActiveSession } from "../services/selfieVerificationService.js";
import {
  startSessionValidator,
  sessionIdValidator,
  frameParamsValidator,
  reviewSelfieValidator,
} from "../validators/selfieVerificationValidator.js";

const route = express.Router();

route.use(authenticateUser);

// --- User: live selfie flow (consent -> camera steps -> submit -> status) ---
route.post("/sessions", startSessionValidator, validateRequest, startSession);
route.get("/status", status);
route.post(
  "/sessions/:id/frames",
  rateLimit({ windowMs: 5 * 60 * 1000, limit: Number(process.env.SELFIE_FRAME_RATE_LIMIT || 30), message: { success: false, message: "Too many uploads. Please wait." } }),
  sessionIdValidator,
  validateRequest,
  requireActiveSession, // ownership/state checked before anything is written to disk
  ...frameUpload,
  uploadFrame
);
route.post("/sessions/:id/submit", sessionIdValidator, validateRequest, requireActiveSession, submit);

// --- Admin: review queue (declared before "/:id" routes) ---
route.get("/queue", authorizeRoles("admin"), queue);
route.get("/:id/frames/:index", authorizeRoles("admin"), frameParamsValidator, validateRequest, frameImage);
route.patch("/:id", authorizeRoles("admin"), reviewSelfieValidator, validateRequest, review);

export default route;
