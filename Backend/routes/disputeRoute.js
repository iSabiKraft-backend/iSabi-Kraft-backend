
import express from "express";

import {
    createDispute,
    getDispute,
    disputeStatus,
    addDisputeEvidence
} from "../controllers/disputeController.js";

import {
    authenticateUser
} from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes require authentication
router.use(authenticateUser);

// Create a dispute for a job
router.post("/", createDispute);

// Get the authenticated user's disputes
router.get("/", disputeStatus);

// Get a single dispute by ID
router.get("/:id", getDispute);

// Add evidence to an existing dispute
router.patch("/:id/evidence", addDisputeEvidence);

export default router;
