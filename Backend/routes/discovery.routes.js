import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as d from "../controllers/discovery.controller.js";

const router = Router();
router.use(requireAuth);
router.get("/diagnostics", d.discoveryDiagnostics);

router.get("/", d.search);
router.get("/saved", requireRole("customer"), d.listSaved);
router.get("/:id", d.profile);
router.get("/:id/reviews", d.reviewsFor);
router.put("/:id/save", requireRole("customer"), d.save);
router.delete("/:id/save", requireRole("customer"), d.unsave);

export default router;
