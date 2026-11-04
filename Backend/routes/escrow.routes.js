import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as escrow from "../controllers/escrow.controller.js";

const router = Router();
router.use(requireAuth);

router.get("/:id", escrow.getEscrow);
router.post("/:id/materials", requireRole("customer"), escrow.payMaterials);
router.patch("/:id/complete", requireRole("artisan"), escrow.markCompleted);
router.patch("/:id/confirm-completion", requireRole("customer"), escrow.confirmCompletion);

export default router;
