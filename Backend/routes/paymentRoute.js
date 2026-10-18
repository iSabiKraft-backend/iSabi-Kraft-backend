
import express from "express";

import {
    initializePaymentController,
    verifyPayment,
    getPaymentHistory,
    getPayment
} from "../controllers/paymentController.js";

import { authenticateUser } from "../middleware/authMiddleware.js";

const router = express.Router();

// Initialize payment for a job
router.post(
    "/initialize",
    authenticateUser,
    initializePaymentController
);

// Verify a Paystack payment
router.get(
    "/verify/:reference",
    authenticateUser,
    verifyPayment
);

// Get payment history
router.get(
    "/history/:userId",
    authenticateUser,
    getPaymentHistory
);

// Get a single payment by ID
router.get(
    "/:paymentId",
    authenticateUser,
    getPayment
);

export default router;
