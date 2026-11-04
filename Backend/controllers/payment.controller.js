import Payment from "../models/payment.js";
import Escrow from "../models/escrow.js";
import Job from "../models/job.js";
import * as paystack from "../services/paystackService.js";
import {
  confirmPayment,
  startPayment,
  handleTransferEvent,
  handleRefundEvent,
} from "../services/escrowService.js";
import { httpError } from "../utils/httpError.js";
import { objectId, sameId } from "../utils/validate.js";

export const initialize = async (req, res) => {
  const job = await Job.findById(objectId(req.body.jobId, "job id"));
  if (!job || !sameId(job.customerID, req.user._id))
    throw httpError(404, "Job not found");

  const { payment, escrow, accessCode } = await startPayment(job, req.user);
  res.status(201).json({
    authorizationUrl: payment.authorizationUrl,
    accessCode,
    reference: payment.reference,
    paymentId: payment._id,
    amount: payment.amount,
    escrowId: escrow._id,
  });
};

export const verify = async (req, res) => {
  const payment = await Payment.findOne({
    reference: String(req.params.reference),
  });
  if (!payment || !sameId(payment.customerID, req.user._id))
    throw httpError(404, "Payment not found");

  if (payment.status === "pending") {
    const tx = await paystack.verifyPayment(payment.reference);
    await confirmPayment(payment.reference, tx);
  }
  const fresh = await Payment.findById(payment._id);
  res.json({ payment: fresh, escrow: await Escrow.findById(fresh.escrowID) });
};

export const history = async (req, res) => {
  const filter =
    req.role === "admin" && req.query.userId
      ? { customerID: objectId(req.query.userId, "user id") }
      : { customerID: req.user._id };
  if (req.query.status) filter.status = String(req.query.status);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const payments = await Payment.find(filter)
    .populate("jobID", "title")
    .sort({ createdAt: -1 })
    .limit(limit);
  res.json({ payments });
};

export const getPayment = async (req, res) => {
  const payment = await Payment.findById(objectId(req.params.id, "payment id"));
  if (
    !payment ||
    (!sameId(payment.customerID, req.user._id) && req.role !== "admin")
  ) {
    throw httpError(404, "Payment not found");
  }
  res.json({ payment });
};

export const webhook = async (req, res) => {
  if (
    !paystack.isValidWebhookSignature(req.body, req.get("x-paystack-signature"))
  ) {
    return res.sendStatus(401);
  }
  let event;
  try {
    event = JSON.parse(req.body.toString("utf8"));
  } catch {
    return res.sendStatus(400);
  }

  try {
    const name = String(event?.event || "");
    const data = event?.data || {};
    if (name === "charge.success") await confirmPayment(data.reference, data);
    else if (name.startsWith("transfer."))
      await handleTransferEvent(name, data);
    else if (name.startsWith("refund.")) await handleRefundEvent(name, data);
    return res.sendStatus(200);
  } catch (error) {
    console.error("Webhook processing failed:", error.message);

    return res.sendStatus(
      error.statusCode >= 400 && error.statusCode < 500 ? 200 : 500,
    );
  }
};
