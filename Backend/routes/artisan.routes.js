import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as artisan from "../controllers/artisan.controller.js";
import * as earnings from "../controllers/earnings.controller.js";

const router = Router();
router.use(requireAuth, requireRole("artisan"));

router.get("/banks", artisan.banks);
router.get("/me", artisan.myPayoutStatus);
router.put("/me/bank", artisan.saveBank);
router.post("/bank/resolve", artisan.resolveBank);
router.get("/earnings", earnings.summary);
router.get("/transactions", earnings.transactions);
router.get("/transactions/:id", earnings.transaction);
router.put("/me/profile", artisan.saveProfile);

export default router;
