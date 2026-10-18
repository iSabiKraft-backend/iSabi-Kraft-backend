import Payment from "../models/payment.js";
import Job from "../models/job.js";
//import { createNotification } from "../services/notificationService.js";

import {
  initializePayment as initializePaystackPayment,
  verifyPayment as verifyPaystackPayment,
  validateVerifiedPaymentData,
} from "../services/paystackService.js";

// Initialize payment
const initializePaymentController = async (req, res) => {
  try {
    const { jobId } = req.body;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: "Job ID is required",
      });
    }

    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    // Confirm that the authenticated customer owns the job.
    if (String(job.customerId) !== String(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to pay for this job",
      });
    }

    if (job.paymentStatus === "completed") {
      return res.status(409).json({
        success: false,
        message: "Payment for this job has already been completed",
      });
    }

    // Assumes job.totalAmount is stored in naira.
    const amount = Math.round(Number(job.totalAmount) * 100);

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment amount",
      });
    }

    const existingPayment = await Payment.findOne({
      jobId: job._id,
      status: "pending",
    });

    if (existingPayment) {
      return res.status(409).json({
        success: false,
        message: "A pending payment already exists for this job",
      });
    }

    // Initialize the transaction through the Paystack service.
    const paymentResponse = await initializePaystackPayment({
      email: req.user.email,
      amount,
      currency: "NGN",
      metadata: {
        jobId: String(job._id),
        customerId: String(req.user.id),
      },
    });

    if (
      paymentResponse?.status !== true ||
      !paymentResponse.data?.reference ||
      !paymentResponse.data?.authorization_url
    ) {
      return res.status(502).json({
        success: false,
        message: "Unable to initialize payment",
      });
    }

    // Keep the existing schema's "costumerId" field if that is
    // how it is defined in your Payment model.
    const paymentRecord = await Payment.create({
      jobId: job._id,
      costumerId: req.user.id,
      amount,
      currency: "NGN",
      reference: paymentResponse.data.reference,
      status: "pending",
    });

    try {
      await createNotification({
        userId: req.user.id,
        title: "Payment Initialized",
        message:
          "Your payment has been initialized. Complete the payment to proceed with your artisan job.",
        type: "payment",
      });
    } catch (error) {
      console.error("Payment notification error:", error.message);
    }

    return res.status(201).json({
      success: true,
      message: "Payment initialized successfully",
      data: {
        paymentId: paymentRecord._id,
        reference: paymentRecord.reference,
        authorizationUrl: paymentResponse.data.authorization_url,
        amount: paymentRecord.amount,
        currency: paymentRecord.currency,
        status: paymentRecord.status,
      },
    });
  } catch (error) {
    console.error("Initialize payment error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to initialize payment",
    });
  }
};

// Verify payment with the Paystack service.
const verifyPaymentController = async (req, res) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: "Payment reference is required",
      });
    }

    // Find the payment before contacting Paystack.
    const paymentRecord = await Payment.findOne({ reference });

    if (!paymentRecord) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found",
      });
    }

    // Only the customer who initiated this payment can verify it.
    if (String(paymentRecord.costumerId) !== String(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to verify this payment",
      });
    }

    // An already completed payment should not be processed again.
    if (paymentRecord.status === "completed") {
      return res.status(200).json({
        success: true,
        message: "Payment has already been verified",
        data: {
          paymentId: paymentRecord._id,
          reference: paymentRecord.reference,
          status: paymentRecord.status,
          amount: paymentRecord.amount,
          currency: paymentRecord.currency,
        },
      });
    }

    // The service handles communication with Paystack.
    const verificationResponse = await verifyPaystackPayment(reference);

    // Expected service contract: Paystack's full response object,
    // including status and data.transaction fields.
    if (
      verificationResponse?.status !== true ||
      verificationResponse.data?.status !== "success"
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment has not been verified successfully",
      });
    }

    const transaction = verificationResponse.data;

    // Validate the verified transaction against the local payment.
    // This assumes the helper accepts (transaction, paymentRecord).
    const validation = await validateVerifiedPaymentData(
      transaction,
      paymentRecord
    );

    if (validation === false) {
      return res.status(400).json({
        success: false,
        message: "Verified transaction does not match the payment record",
      });
    }

    // Independently enforce the expected reference, amount and currency.
    if (
      transaction.reference !== paymentRecord.reference ||
      Number(transaction.amount) !== Number(paymentRecord.amount) ||
      transaction.currency !== paymentRecord.currency
    ) {
      return res.status(400).json({
        success: false,
        message: "Transaction reference, amount, or currency does not match",
      });
    }

    // Update payment only after successful verification.
    paymentRecord.status = "completed";
    paymentRecord.paidAt = new Date();
    await paymentRecord.save();

    const job = await Job.findById(paymentRecord.jobId);

    if (job) {
      job.paymentStatus = "completed";
      await job.save();
    }

    try {
      await createNotification({
        userId: paymentRecord.costumerId,
        title: "Payment Successful",
        message: "Your payment has been successfully verified.",
        type: "payment",
      });
    } catch (error) {
      console.error("Payment notification error:", error.message);
    }

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      data: {
        paymentId: paymentRecord._id,
        reference: paymentRecord.reference,
        status: paymentRecord.status,
        amount: paymentRecord.amount,
        currency: paymentRecord.currency,
      },
    });
  } catch (error) {
    console.error("Verify payment error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to verify payment",
    });
  }
};

// Get the authenticated customer's payment history.
const getPaymentHistory = async (req, res) => {
  try {
    const payments = await Payment.find({
      costumerId: req.user.id,
    })
      .populate("jobId", "title status")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "Payment history retrieved successfully",
      data: payments,
    });
  } catch (error) {
    console.error("Get payment history error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve payment history",
    });
  }
};

// Get one payment belonging to the authenticated customer.
const getPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const paymentRecord = await Payment.findOne({
      _id: paymentId,
      costumerId: req.user.id,
    })
      .populate("jobId", "title status")
      .populate("costumerId", "name email");

    if (!paymentRecord) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payment retrieved successfully",
      data: paymentRecord,
    });
  } catch (error) {
    console.error("Get payment error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve payment",
    });
  }
};

export {
  initializePaymentController,
  verifyPaymentController,
  getPaymentHistory,
  getPayment,
};
