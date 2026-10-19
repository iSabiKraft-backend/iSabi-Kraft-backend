import mongoose from "mongoose";
import Payment from "../models/payment.js";
import Job from "../models/jobModel.js";
import Quote from "../models/quoteModel.js";
import User from "../models/userModel.js";

import {
  initializePayment as initializePaystackPayment,
  verifyPayment as verifyPaystackPayment,
} from "../services/paystackService.js";

// Initialize payment
const initializePaymentController = async (req, res) => {
  try {
    const { jobId } = req.body ?? {};

    if (!mongoose.isValidObjectId(jobId)) {
      return res.status(400).json({
        success: false,
        message: "A valid job ID is required",
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
    if (String(job.customerID) !== String(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to pay for this job",
      });
    }

    if (job.status !== "quote_accepted") {
      return res.status(409).json({
        success: false,
        message: "A quote must be accepted before payment",
      });
    }

    const [acceptedQuote, completedPayment, existingPayment, customer] = await Promise.all([
      Quote.findOne({ jobID: job._id, artisanID: job.artisanID, status: "accepted" }),
      Payment.findOne({ jobID: job._id, customerID: req.user.id, status: "completed" }),
      Payment.findOne({ jobID: job._id, customerID: req.user.id, status: "pending" }),
      User.findById(req.user.id).select("email"),
    ]);

    if (!acceptedQuote) {
      return res.status(409).json({ success: false, message: "No accepted quote was found for this job" });
    }
    if (completedPayment) {
      return res.status(409).json({ success: false, message: "Payment for this job has already been completed" });
    }
    if (existingPayment) {
      return res.status(409).json({ success: false, message: "A pending payment already exists for this job" });
    }
    if (!customer?.email) {
      return res.status(400).json({ success: false, message: "An email address is required to initialize payment" });
    }

    // Quotes are stored in naira; Paystack expects kobo.
    const agreedAmount = Number(job.agreement?.totalAmount ?? acceptedQuote.totalAmount);
    const amount = Math.round(agreedAmount * 100);

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment amount",
      });
    }

    // The Paystack service unwraps and returns the `data` object directly.
    const paymentResponse = await initializePaystackPayment({
      email: customer.email,
      amount,
      currency: "NGN",
      metadata: {
        jobId: String(job._id),
        customerId: String(req.user.id),
      },
    });

    if (
      !paymentResponse?.reference ||
      !paymentResponse?.authorization_url
    ) {
      return res.status(502).json({
        success: false,
        message: "Unable to initialize payment",
      });
    }

    const paymentRecord = await Payment.create({
      jobID: job._id,
      customerID: req.user.id,
      amount,
      currency: "NGN",
      reference: paymentResponse.reference,
      authorizationUrl: paymentResponse.authorization_url,
      status: "pending",
    });

    job.paymentStatus = "pending";
    job.passportEvents.push({
      type: "payment_initialized",
      actorID: req.user.id,
      message: "Customer initialized payment for the accepted agreement.",
      metadata: { paymentID: paymentRecord._id, reference: paymentRecord.reference, amount },
    });
    await job.save();

    return res.status(201).json({
      success: true,
      message: "Payment initialized successfully",
      data: {
        paymentId: paymentRecord._id,
        reference: paymentRecord.reference,
        authorizationUrl: paymentResponse.authorization_url,
        amount: paymentRecord.amount,
        currency: paymentRecord.currency,
        status: paymentRecord.status,
      },
    });
  } catch (error) {
    console.error("Initialize payment error:", error.message);
    if (error.statusCode) {
      return res.status(502).json({
        success: false,
        message: "Unable to initialize payment with Paystack",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to initialize payment",
    });
  }
};

// Verify payment with the Paystack service.
const verifyPaymentController = async (req, res) => {
  try {
    const reference = req.params.reference?.trim();

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
    if (String(paymentRecord.customerID) !== String(req.user.id)) {
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

    // This service returns the verified transaction object directly.
    const transaction = await verifyPaystackPayment(reference);
    if (transaction?.status !== "success") {
      if (["failed", "abandoned"].includes(transaction?.status)) {
        paymentRecord.status = "failed";
        await paymentRecord.save();
      }
      return res.status(400).json({
        success: false,
        message: "Payment has not been completed successfully",
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

    // Compare-and-set prevents concurrent verification from processing twice.
    const updatedPayment = await Payment.findOneAndUpdate(
      { _id: paymentRecord._id, status: "pending" },
      { $set: { status: "completed", paidAt: new Date() } },
      { new: true, runValidators: true }
    );
    const finalPayment = updatedPayment ?? await Payment.findById(paymentRecord._id);
    if (finalPayment?.status !== "completed") {
      return res.status(409).json({
        success: false,
        message: "Payment status changed; please verify again",
      });
    }

    await Job.updateOne(
      { _id: finalPayment.jobID, status: "quote_accepted" },
      {
        $set: { status: "in_progress", paymentStatus: "paid" },
        $push: {
          passportEvents: {
            type: "payment_completed",
            actorID: req.user.id,
            message: "Payment was verified successfully.",
            metadata: { paymentID: finalPayment._id, reference: finalPayment.reference },
            createdAt: new Date(),
          },
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      data: {
        paymentId: finalPayment._id,
        reference: finalPayment.reference,
        status: finalPayment.status,
        amount: finalPayment.amount,
        currency: finalPayment.currency,
      },
    });
  } catch (error) {
    console.error("Verify payment error:", error.message);
    if (error.statusCode) {
      return res.status(502).json({
        success: false,
        message: "Unable to verify payment with Paystack",
      });
    }

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
      customerID: req.user.id,
    })
      .populate("jobID", "title status")
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
    if (!mongoose.isValidObjectId(paymentId)) {
      return res.status(400).json({
        success: false,
        message: "A valid payment ID is required",
      });
    }

    const paymentRecord = await Payment.findOne({
      _id: paymentId,
      customerID: req.user.id,
    })
      .populate("jobID", "title status")
      .populate("customerID", "firstName lastName email");

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
