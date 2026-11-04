import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as disputes from "../controllers/dispute.controller.js";

const router = Router();
router.use(requireAuth);

router.post("/", requireRole("customer", "artisan"), disputes.create);
router.get("/", disputes.list);
router.get("/:id", disputes.get);
router.patch("/:id/evidence", disputes.addEvidence);
router.post("/:id/response", requireRole("customer", "artisan"), disputes.respond);

export default router;
