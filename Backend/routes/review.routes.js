import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as d from "../controllers/discovery.controller.js";

const router = Router();
router.use(requireAuth);

router.post("/", requireRole("customer"), d.createReview);
router.get("/mine", requireRole("artisan"), d.myReviews);
router.get("/job/:jobId", requireRole("customer"), d.reviewForJob);
router.patch("/job/:jobId", requireRole("customer"), d.updateReview);

export default router;
