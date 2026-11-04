import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as d from "../controllers/discovery.controller.js";

const router = Router();
router.use(requireAuth);

router.post("/", requireRole("customer"), d.createReview);
router.get("/mine", requireRole("artisan"), d.myReviews);

export default router;
