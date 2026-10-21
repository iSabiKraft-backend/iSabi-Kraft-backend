
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
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { requireTermsAccepted } from "../middleware/termsMiddleware.js";

const router = express.Router();

// All escrow routes require authentication
router.use(authenticateUser);

// Create an escrow for a job
router.post("/", authorizeRoles("customer"), requireTermsAccepted, createEscrow);

// Fund escrow after Paystack payment
router.post("/:escrowId/fund", authorizeRoles("customer"), requireTermsAccepted, fundEscrow);

// Initiate materials payment
router.post("/:escrowId/materials", authorizeRoles("customer"), initiateMaterialPayment);

// Artisan marks the job as completed
router.patch("/:escrowId/complete", authorizeRoles("artisan"), markJobCompleted);

// Customer confirms job completion
router.patch("/:escrowId/confirm-completion", authorizeRoles("customer"), confirmJobCompletion);

// Get escrow details
router.get("/:escrowId", getEscrowById);

export default router;
