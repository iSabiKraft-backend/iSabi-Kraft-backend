import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as admin from "../controllers/admin.controller.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));
router.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false }));

router.get("/dashboard", admin.dashboard);
router.get("/verifications", admin.listVerifications);
router.get("/verifications/:userId", admin.getVerification);
router.patch("/verifications/:userId", admin.reviewVerification);

router.get("/disputes", admin.listDisputes);
router.get("/disputes/:id", admin.getDispute);
router.post("/disputes/:id/start-review", admin.startDisputeReview);
router.post("/disputes/:id/notes", admin.addDisputeNote);
router.post("/disputes/:id/resolve", admin.resolve);

router.get("/artisans", admin.listArtisans);
router.get("/artisans/:id", admin.getArtisan);
router.get("/customers", admin.listCustomers);
router.get("/customers/:id", admin.getCustomer);
router.get("/jobs", admin.listJobsAdmin);
router.get("/jobs/:id", admin.getJobAdmin);

router.get("/categories", admin.listCategories);
router.post("/categories", admin.createCategory);
router.patch("/categories/:id", admin.updateCategory);

router.get("/audit", admin.adminAuditLog);
router.post("/transfers/reconcile", admin.reconcile);
router.post("/transfers/:reference/reconcile", admin.reconcile);

router.get("/artisan-discovery-diagnostics", admin.artisanDiscoveryDiagnostics);
router.post("/artisan-discovery-reconcile", admin.reconcileArtisanMarketplace);
router.get("/artisan-sync-queue", admin.artisanSyncQueueStatus);
router.post("/artisan-sync-queue/retry", admin.retryArtisanSyncQueue);

export default router;
