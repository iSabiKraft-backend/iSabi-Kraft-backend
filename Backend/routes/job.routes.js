import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as jobs from "../controllers/job.controller.js";
import * as recommendations from "../controllers/recommendation.controller.js";

const router = Router();
router.use(requireAuth);

router.post("/", requireRole("customer"), jobs.createJob);
router.get("/", jobs.listJobs);
router.get("/:id", jobs.getJob);
router.post("/:id/recommendations", requireRole("customer"), recommendations.recommendationsForJob);
router.post("/:id/quotes", requireRole("artisan"), jobs.submitQuote);
router.post("/:id/quotes/:quoteId/accept", requireRole("customer"), jobs.acceptQuote);
router.post("/:id/quotes/:quoteId/decline", requireRole("customer"), jobs.declineQuote);
router.post("/:id/quotes/:quoteId/changes", requireRole("customer"), jobs.requestQuoteChange);
router.post("/:id/progress", requireRole("artisan"), jobs.postProgress);
router.post("/:id/changes", requireRole("customer", "artisan"), jobs.requestChange);
router.patch("/:id/changes/:changeId", requireRole("customer", "artisan"), jobs.respondChange);
router.post("/:id/invite", requireRole("customer"), jobs.inviteArtisan);
router.post("/:id/cancel", requireRole("customer"), jobs.cancelJob);

export default router;
