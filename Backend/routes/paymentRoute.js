
import express from "express";

import {
    initializePaymentController,
    verifyPaymentController,
    getPaymentHistory,
    getPayment
} from "../controllers/paymentController.js";

import { authenticateUser } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { requireTermsAccepted } from "../middleware/termsMiddleware.js";

const router = express.Router();

// Initialize payment for a job
router.post(
    "/initialize",
    authenticateUser,
    authorizeRoles("customer"),
    requireTermsAccepted,
    initializePaymentController
);

// Verify a Paystack payment
router.get(
    "/verify/:reference",
    authenticateUser,
    authorizeRoles("customer"),
    verifyPaymentController
);

// Get payment history
router.get(
    "/history",
    authenticateUser,
    authorizeRoles("customer"),
    getPaymentHistory
);

// Get a single payment by ID
router.get(
    "/:paymentId",
    authenticateUser,
    authorizeRoles("customer"),
    getPayment
);

export default router;
