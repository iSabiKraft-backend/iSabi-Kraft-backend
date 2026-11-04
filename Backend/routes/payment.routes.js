import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as payments from "../controllers/payment.controller.js";

const router = Router();
router.use(requireAuth);

router.post("/initialize", requireRole("customer"), payments.initialize);
router.get("/verify/:reference", payments.verify);
router.get("/history", payments.history);
router.get("/:id", payments.getPayment);

export default router;
