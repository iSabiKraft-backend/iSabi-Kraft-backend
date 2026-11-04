import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as admin from "../controllers/admin.controller.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));

router.get("/verifications", admin.listVerifications);
router.patch("/verifications/:userId", admin.reviewVerification);
router.get("/disputes", admin.listDisputes);
router.post("/disputes/:id/resolve", admin.resolve);
router.post("/transfers/reconcile", admin.reconcile);
router.post("/transfers/:reference/reconcile", admin.reconcile);

router.get("/artisan-discovery-diagnostics", admin.artisanDiscoveryDiagnostics);
router.post("/artisan-discovery-reconcile", admin.reconcileArtisanMarketplace);
router.get("/artisan-sync-queue", admin.artisanSyncQueueStatus);
router.post("/artisan-sync-queue/retry", admin.retryArtisanSyncQueue);

export default router;
