import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { me, updateMe } from "../controllers/user.controller.js";

const router = Router();
router.get("/me", requireAuth, me);
router.patch("/me", requireAuth, updateMe);
export default router;
