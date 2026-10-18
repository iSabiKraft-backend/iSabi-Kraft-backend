
import express from "express";

import {
    createEscrow,
    fundEscrow,
    initiateMaterialPayment,
    markJobCompleted,
    confirmJobCompletion,
    getEscrowById
} from "../controllers/escrowController.js";

import { authenticateUser } from "../middleware/authMiddleware.js";

const router = express.Router();

// All escrow routes require authentication
router.use(authenticateUser);

// Create an escrow for a job
router.post("/", createEscrow);

// Fund escrow after Paystack payment
router.post("/:escrowId/fund", fundEscrow);

// Initiate materials payment
router.post("/:escrowId/materials", initiateMaterialPayment);

// Artisan marks the job as completed
router.patch("/:escrowId/complete", markJobCompleted);

// Customer confirms job completion
router.patch("/:escrowId/confirm-completion", confirmJobCompletion);

// Get escrow details
router.get("/:escrowId", getEscrowById);

export default router;
