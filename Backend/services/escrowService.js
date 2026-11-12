import Escrow from "../models/escrow.js";
import EscrowTransaction from "../models/escrowTransaction.js";
import Payment from "../models/payment.js";
import Job from "../models/job.js";
import User from "../models/user.js";
import Dispute from "../models/dispute.js";
import * as paystack from "./paystackService.js";
import { httpError } from "../utils/httpError.js";
import { sameId, toKobo } from "../utils/validate.js";

const HELD_STATES = ["payment_confirmed", "material_payment_made"];

export const startPayment = async (job, customer) => {
  if (job.status !== "booked")
    throw httpError(409, "Accept a quote before paying");
  const quote = job.quotes.id(job.acceptedQuoteID);
  if (!quote) throw httpError(409, "No accepted quote for this job");

  const artisan = await User.findById(job.artisanID);
  if (!artisan?.paystackRecipientCode) {
    throw httpError(
      409,
      "This artisan has not added payout details yet, so payment cannot start",
    );
  }

  let escrow = await Escrow.findOne({ jobID: job._id });
  if (escrow && escrow.status !== "pending")
    throw httpError(409, "This job has already been paid for");

  if (!escrow) {
    try {
      escrow = await Escrow.create({
        customerID: customer._id,
        artisanID: job.artisanID,
        jobID: job._id,
        totalAmount: quote.total,
        materialAmount: quote.materials,
        remainingAmount: quote.total - quote.materials,
        reference: paystack.makeReference("isk_esc"),
        materialPaymentStatus:
          quote.materials > 0 ? "pending" : "not_applicable",
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      escrow = await Escrow.findOne({ jobID: job._id });
      if (!escrow) {
        // Duplicate key on something other than jobID (e.g. a stale unique
        // index in MongoDB). Surface the real cause instead of crashing later.
        console.error("Escrow create duplicate key:", error.keyPattern, error.keyValue);
        throw error;
      }
    }
  }

  const existingPayment = await Payment.findOne({
    escrowID: escrow._id,
    status: "pending",
    authorizationUrl: { $exists: true, $ne: "" },
  }).sort({ createdAt: -1 });
  if (existingPayment) {
    return { payment: existingPayment, escrow, accessCode: undefined };
  }

  const payment = await Payment.create({
    customerID: customer._id,
    jobID: job._id,
    escrowID: escrow._id,
    amount: escrow.totalAmount,
    reference: paystack.makeReference("isk_pay"),
  });

  const domain =
    process.env.PAYSTACK_FALLBACK_EMAIL_DOMAIN || "users.isabikraft.com";
  try {
    const init = await paystack.initializePayment({
      email: customer.email || `${customer.supabaseId}@${domain}`,
      amount: toKobo(escrow.totalAmount),
      currency: "NGN",
      reference: payment.reference,
      callback_url: callbackUrl(),
      metadata: {
        jobId: String(job._id),
        escrowId: String(escrow._id),
        paymentId: String(payment._id),
      },
    });
    payment.authorizationUrl = init.authorization_url;
    await payment.save();
    return { payment, escrow, accessCode: init.access_code };
  } catch (error) {
    payment.status = "failed";
    await payment.save();
    throw error;
  }
};

// Always send Paystack a callback so the customer is bounced back to the app.
// Prefer PAYSTACK_CALLBACK_URL; otherwise derive it from the public API URL
// (Render sets RENDER_EXTERNAL_URL automatically).
const callbackUrl = () => {
  if (process.env.PAYSTACK_CALLBACK_URL) return process.env.PAYSTACK_CALLBACK_URL;
  const base = (
    process.env.PUBLIC_API_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "https://isabikraft.onrender.com"
  ).replace(/\/+$/, "");
  return `${base}/api/payments/callback`;
};

export const confirmPayment = async (reference, tx) => {
  const safeReference = String(reference);
  const payment = await Payment.findOne({ reference: { $eq: safeReference } });
  if (!payment) return null;

  if (payment.status === "pending") {
    if (tx.status !== "success") {
      if (["failed", "abandoned", "reversed"].includes(tx.status)) {
        payment.status = "failed";
        await payment.save();
      }
      return payment;
    }
    if (
      tx.reference !== safeReference ||
      tx.amount !== toKobo(payment.amount) ||
      tx.currency !== "NGN"
    ) {
      payment.status = "failed";
      payment.note = "amount_mismatch";
      await payment.save();
      console.error("Paystack amount mismatch", {
        reference: safeReference,
        paid: tx.amount,
        expected: toKobo(payment.amount),
      });
      throw httpError(409, "Payment amount does not match the booking");
    }
    await Payment.updateOne(
      { _id: payment._id, status: "pending" },
      {
        $set: {
          status: "completed",
          paidAt: tx.paid_at ? new Date(tx.paid_at) : new Date(),
        },
      },
    );
  }

  const current = await Payment.findById(payment._id);
  if (current.status !== "completed") return current;

  await Escrow.updateOne(
    { _id: current.escrowID, status: "pending" },
    {
      $set: {
        status: "payment_confirmed",
        heldAmount: current.amount,
        paymentReference: current.reference,
      },
    },
  );

  const escrow = await Escrow.findById(current.escrowID);
  if (escrow?.paymentReference === current.reference) {
    await Job.updateOne(
      { _id: current.jobID, status: "booked" },
      { $set: { status: "funded" } },
    );
  } else if (!current.note) {
    await Payment.updateOne(
      { _id: current._id },
      { $set: { note: "duplicate_payment_needs_refund" } },
    );
    console.warn("Payment needs manual refund", current.reference);
  }
  return Payment.findById(current._id);
};

const assertParticipant = (escrow, user) => {
  if (!escrow) throw httpError(404, "Escrow not found");
  if (
    !sameId(escrow.customerID, user._id) &&
    !sameId(escrow.artisanID, user._id)
  ) {
    throw httpError(404, "Escrow not found");
  }
};

const payOut = async (escrow, kind, { allowedStatuses, amount }) => {
  const isMaterial = kind === "material_payment";
  const field = isMaterial ? "materialPaymentStatus" : "balancePaymentStatus";
  const payAmount =
    amount ?? (isMaterial ? escrow.materialAmount : escrow.remainingAmount);

  const artisan = await User.findById(escrow.artisanID);
  if (!artisan?.paystackRecipientCode)
    throw httpError(409, "Artisan has no payout account");

  const claimed = await Escrow.findOneAndUpdate(
    {
      _id: escrow._id,
      status: { $in: allowedStatuses },
      [field]: { $in: ["pending", "failed"] },
      [isMaterial ? "materialApprovalStatus" : "balanceApprovalStatus"]: "approved",
    },
    { $set: { [field]: "processing", [isMaterial ? "materialApprovalStatus" : "balanceApprovalStatus"]: "processing" } },
    { returnDocument: 'after' },
  );
  if (!claimed)
    throw httpError(
      409,
      "This payout is already in progress, completed, or not allowed right now",
    );

  const reference = paystack.makeReference("isk_tr");
  await EscrowTransaction.create({
    escrowID: escrow._id,
    transactionType: kind,
    amount: payAmount,
    reference,
    status: "pending",
  });

  let transfer;
  try {
    transfer = await paystack.transferToArtisan({
      source: "balance",
      amount: toKobo(payAmount),
      recipient: artisan.paystackRecipientCode,
      reference,
      reason: `iSabiKraft ${isMaterial ? "materials" : "job payment"} ${escrow.reference}`,
    });
  } catch (error) {
    if (error.paystackStatus >= 400 && error.paystackStatus < 500) {
      await finalizeTransfer(reference, false, { error: error.message });
      throw httpError(502, `Payout was rejected: ${error.message}`);
    }
    console.error("Transfer outcome unknown", reference, error.message);
    throw httpError(
      502,
      "We could not confirm the payout. It will be settled automatically; please do not retry.",
    );
  }

  if (transfer.status === "success")
    await finalizeTransfer(reference, true, transfer);
  else if (["failed", "reversed"].includes(transfer.status))
    await finalizeTransfer(reference, false, transfer);
  else if (transfer.status === "otp") {
    await finalizeTransfer(reference, false, { error: "otp_required" });
    throw httpError(
      502,
      "Payout needs OTP approval. Disable transfer OTP in the Paystack dashboard.",
    );
  }

  return Escrow.findById(escrow._id);
};

export const requestMaterialApproval = async (escrowId, artisan, note, evidencePhotoUrls = []) => {
  const escrow = await Escrow.findById(escrowId);
  if (!escrow || !sameId(escrow.artisanID, artisan._id))
    throw httpError(404, "Escrow not found");
  if (escrow.materialPaymentStatus === "not_applicable")
    throw httpError(409, "This job has no material payment");
  if (escrow.status !== "payment_confirmed")
    throw httpError(409, "Material payment cannot be requested at this stage");
  if (escrow.materialPaymentStatus === "completed")
    throw httpError(409, "Material payment has already been released");
  if (!Array.isArray(evidencePhotoUrls) || evidencePhotoUrls.length > 10)
    throw httpError(400, "Provide no more than 10 evidence photo URLs");

  const updated = await Escrow.findOneAndUpdate(
    { _id: escrow._id, materialApprovalStatus: { $in: ["not_requested", "rejected", "failed"] }, materialPaymentStatus: { $in: ["pending", "failed"] } },
    { $set: {
      materialApprovalStatus: "awaiting_approval",
      materialApprovalRequestedAt: new Date(),
      materialApprovalReviewedAt: null,
      materialRequestNote: note,
      materialEvidenceUrls: evidencePhotoUrls,
      materialReviewedBy: null,
      materialRejectionReason: null,
      materialApprovalAdminID: null,
      materialApprovalReason: null,
    } },
    { returnDocument: "after" },
  );
  if (!updated) throw httpError(409, "A material payment approval is already pending or processing");
  return updated;
};

export const approveMaterialRelease = async (escrowId, admin) => {
  const escrow = await Escrow.findById(escrowId);
  if (!escrow || escrow.materialApprovalStatus !== "awaiting_approval")
    throw httpError(409, "No material payment approval is awaiting review");
  const approved = await Escrow.findOneAndUpdate(
    { _id: escrow._id, materialApprovalStatus: "awaiting_approval" },
    { $set: { materialApprovalStatus: "approved", materialReviewedBy: admin._id, materialApprovalAdminID: admin._id, materialApprovalReviewedAt: new Date(), materialRejectionReason: null, materialApprovalReason: null } },
    { returnDocument: "after" },
  );
  if (!approved) throw httpError(409, "This request has already been reviewed");
  try {
    return await payOut(approved, "material_payment", { allowedStatuses: ["payment_confirmed"] });
  } catch (error) {
    await Escrow.updateOne({ _id: approved._id, materialApprovalStatus: "approved" }, { $set: { materialApprovalStatus: "awaiting_approval" } });
    throw error;
  }
};

export const rejectMaterialRelease = async (escrowId, admin, reason) => {
  const updated = await Escrow.findOneAndUpdate(
    { _id: escrowId, materialApprovalStatus: "awaiting_approval" },
    { $set: { materialApprovalStatus: "rejected", materialReviewedBy: admin._id, materialApprovalAdminID: admin._id, materialApprovalReviewedAt: new Date(), materialRejectionReason: reason, materialApprovalReason: reason } },
    { returnDocument: "after" },
  );
  if (!updated) throw httpError(409, "No material payment approval is awaiting review");
  return updated;
};

export const markCompleted = async (escrowId, artisan, note, photos = []) => {
  if (!Array.isArray(photos) || photos.length === 0) {
    throw httpError(400, "At least one completion photo is required");
  }
  const escrow = await Escrow.findById(escrowId);
  if (!escrow || !sameId(escrow.artisanID, artisan._id))
    throw httpError(404, "Escrow not found");
  if (!HELD_STATES.includes(escrow.status))
    throw httpError(409, "This job is not in progress");

  const completionSubmittedAt = new Date();
  const disputeWindowEndsAt = new Date(completionSubmittedAt.getTime() + 3 * 24 * 60 * 60 * 1000);
  const job = await Job.findOneAndUpdate(
    { _id: escrow.jobID, status: "funded" },
    {
      $set: {
        status: "awaiting_confirmation",
        completionNote: note,
        completionPhotos: photos,
        completionMarkedAt: new Date(),
        progress: 100,
      },
    },
    { returnDocument: 'after' },
  );
  if (!job) throw httpError(409, "Job is not ready to be marked as completed");
  await Escrow.updateOne({ _id: escrow._id }, { $set: { disputeWindowEndsAt } });
  return Escrow.findById(escrow._id);
};

export const confirmCompletion = async (escrowId, customer) => {
  const escrow = await Escrow.findById(escrowId);
  if (!escrow || !sameId(escrow.customerID, customer._id))
    throw httpError(404, "Escrow not found");
  const job = await Job.findById(escrow.jobID);
  if (job?.status !== "awaiting_confirmation")
    throw httpError(409, "The artisan has not marked this job as completed");
  const materialsSettled =
    escrow.status === "material_payment_made" ||
    (escrow.status === "payment_confirmed" && escrow.materialPaymentStatus === "not_applicable");
  if (!materialsSettled)
    throw httpError(409, "Material payment must be settled before confirming completion");

  if (escrow.remainingAmount <= 0) {
    const done = await Escrow.findOneAndUpdate(
      { _id: escrow._id, status: { $in: HELD_STATES }, balancePaymentStatus: "pending" },
      { $set: { status: "balance_released", balancePaymentStatus: "completed", balanceApprovalStatus: "completed", completedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (done) await Job.updateOne({ _id: job._id }, { $set: { status: "completed" } });
    return done || Escrow.findById(escrow._id);
  }

  const requested = await Escrow.findOneAndUpdate(
    { _id: escrow._id, status: { $in: HELD_STATES }, balancePaymentStatus: { $in: ["pending", "failed"] }, balanceApprovalStatus: { $in: ["not_requested", "rejected", "failed"] } },
    { $set: { balanceApprovalStatus: "awaiting_approval", balanceApprovalRequestedAt: new Date(), balanceApprovalReason: null } },
    { returnDocument: "after" },
  );
  if (!requested) {
    const current = await Escrow.findById(escrow._id);
    if (current?.balanceApprovalStatus === "awaiting_approval") return current;
    throw httpError(409, "The final payment is already under review or has been released");
  }
  return requested;
};

export const approveBalanceRelease = async (escrowId, admin) => {
  const escrow = await Escrow.findById(escrowId);
  if (!escrow || escrow.balanceApprovalStatus !== "awaiting_approval")
    throw httpError(409, "No final payment approval is awaiting review");
  const job = await Job.findById(escrow.jobID);
  if (job?.status !== "awaiting_confirmation")
    throw httpError(409, "Customer confirmation is required before final payment approval");
  if (escrow.status === "disputed")
    throw httpError(409, "This escrow is disputed and cannot be released");
  const disputeWindowEndsAt = escrow.disputeWindowEndsAt ||
    (job.completionMarkedAt ? new Date(new Date(job.completionMarkedAt).getTime() + 3 * 24 * 60 * 60 * 1000) : null);
  if (!disputeWindowEndsAt || Date.now() < new Date(disputeWindowEndsAt).getTime()) {
    throw httpError(409, "The three-day dispute window has not ended");
  }
  const approved = await Escrow.findOneAndUpdate(
    { _id: escrow._id, balanceApprovalStatus: "awaiting_approval" },
    { $set: { balanceApprovalStatus: "approved", balanceApprovalAdminID: admin._id, balanceApprovalReviewedAt: new Date(), balanceApprovalReason: null } },
    { returnDocument: "after" },
  );
  if (!approved) throw httpError(409, "This request has already been reviewed");
  try {
    return await payOut(approved, "balance_release", { allowedStatuses: HELD_STATES });
  } catch (error) {
    await Escrow.updateOne({ _id: approved._id, balanceApprovalStatus: "approved" }, { $set: { balanceApprovalStatus: "awaiting_approval" } });
    throw error;
  }
};

export const rejectBalanceRelease = async (escrowId, admin, reason) => {
  const updated = await Escrow.findOneAndUpdate(
    { _id: escrowId, balanceApprovalStatus: "awaiting_approval" },
    { $set: { balanceApprovalStatus: "rejected", balanceApprovalAdminID: admin._id, balanceApprovalReviewedAt: new Date(), balanceApprovalReason: reason } },
    { returnDocument: "after" },
  );
  if (!updated) throw httpError(409, "No final payment approval is awaiting review");
  return updated;
};

export const finalizeTransfer = async (reference, success, data) => {
  const txn = await EscrowTransaction.findOneAndUpdate(
    {
      reference,
      status: "pending",
      transactionType: { $in: ["material_payment", "balance_release"] },
    },
    {
      $set: {
        status: success ? "completed" : "failed",
        metadata: data,
        ...(success ? { paidAt: new Date() } : {}),
      },
    },
    { returnDocument: 'after' },
  );
  if (!txn) return null;

  const transferCode = data?.transfer_code;
  if (txn.transactionType === "material_payment") {
    await Escrow.updateOne(
      { _id: txn.escrowID },
      {
        $set: {
          materialPaymentStatus: success ? "completed" : "failed",
          materialApprovalStatus: success ? "completed" : "failed",
          ...(transferCode ? { materialTransferCode: transferCode } : {}),
        },
      },
    );
    if (success) {
      await Escrow.updateOne(
        { _id: txn.escrowID, status: "payment_confirmed" },
        { $set: { status: "material_payment_made" } },
      );
    }
  } else {
    await Escrow.updateOne(
      { _id: txn.escrowID },
      {
        $set: {
          balancePaymentStatus: success ? "completed" : "failed",
          balanceApprovalStatus: success ? "completed" : "failed",
          ...(transferCode ? { finalTransferCode: transferCode } : {}),
        },
      },
    );
    if (success) {
      const escrow = await Escrow.findOneAndUpdate(
        { _id: txn.escrowID, status: { $in: [...HELD_STATES, "disputed"] } },
        { $set: { status: "balance_released", completedAt: new Date() } },
        { returnDocument: 'after' },
      );
      if (escrow)
        await Job.updateOne(
          { _id: escrow.jobID },
          { $set: { status: "completed" } },
        );
    }
  }
  return txn;
};

export const handleTransferEvent = async (event, data) => {
  if (event === "transfer.success")
    return finalizeTransfer(data.reference, true, data);
  if (event === "transfer.failed" || event === "transfer.reversed")
    return finalizeTransfer(data.reference, false, data);
  return null;
};

export const reconcileTransfer = async (reference) => {
  const data = await paystack.verifyTransfer(reference);
  if (data.status === "success") return finalizeTransfer(reference, true, data);
  if (["failed", "reversed"].includes(data.status))
    return finalizeTransfer(reference, false, data);
  return null;
};

export const reconcilePendingTransfers = async (olderThanMinutes = 10) => {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  const pending = await EscrowTransaction.find({
    status: "pending",
    transactionType: { $in: ["material_payment", "balance_release"] },
    createdAt: { $lt: cutoff },
  }).limit(50);
  const results = [];
  for (const txn of pending) {
    try {
      const settled = await reconcileTransfer(txn.reference);
      results.push({ reference: txn.reference, settled: Boolean(settled) });
    } catch (error) {
      results.push({ reference: txn.reference, error: error.message });
    }
  }
  return results;
};

export const openDispute = async (escrowId, user, reason, evidence = []) => {
  const escrow = await Escrow.findById(escrowId);
  assertParticipant(escrow, user);
  if (escrow.disputeWindowEndsAt && Date.now() > new Date(escrow.disputeWindowEndsAt).getTime()) {
    throw httpError(409, "The three-day dispute window has ended");
  }
  if (!HELD_STATES.includes(escrow.status))
    throw httpError(409, "Only paid, unsettled jobs can be disputed");
  if (
    escrow.materialPaymentStatus === "processing" ||
    escrow.balancePaymentStatus === "processing"
  ) {
    throw httpError(
      409,
      "A payout is in progress. Try again in a few minutes.",
    );
  }

  const frozen = await Escrow.findOneAndUpdate(
    { _id: escrow._id, status: escrow.status },
    { $set: { status: "disputed", statusBeforeDispute: escrow.status } },
    { returnDocument: 'after' },
  );
  if (!frozen)
    throw httpError(
      409,
      "This job changed while you were filing. Please try again.",
    );

  await Job.updateOne({ _id: escrow.jobID }, { $set: { status: "disputed" } });
  return Dispute.create({
    escrowID: escrow._id,
    jobID: escrow.jobID,
    raisedBy: user._id,
    reason,
    evidence: evidence.map((e) => ({ ...e, addedBy: user._id })),
  });
};

const heldNow = (escrow) =>
  escrow.totalAmount -
  (escrow.materialPaymentStatus === "completed" ? escrow.materialAmount : 0);

export const resolveDispute = async (disputeId, resolution, adminNote) => {
  const dispute = await Dispute.findById(disputeId);
  if (!dispute || !["open", "in_review"].includes(dispute.status))
    throw httpError(404, "Open dispute not found");
  const escrow = await Escrow.findById(dispute.escrowID);
  if (!escrow || escrow.status !== "disputed")
    throw httpError(409, "Escrow is not frozen for dispute");
  const amount = heldNow(escrow);
  if (amount <= 0) throw httpError(409, "Nothing is held for this job");

  if (resolution === "release") {
    await Escrow.updateOne({ _id: escrow._id, status: "disputed" }, { $set: { balanceApprovalStatus: "approved" } });
    await payOut(escrow, "balance_release", {
      allowedStatuses: ["disputed"],
      amount,
    });
  } else {
    await refundHeld(escrow, amount);
  }

  dispute.status = "resolved";
  dispute.resolution = resolution;
  dispute.adminNote = adminNote;
  dispute.resolvedAt = new Date();
  await dispute.save();
  return dispute;
};

const refundHeld = async (escrow, amount) => {
  const frozen = await Escrow.findOneAndUpdate(
    { _id: escrow._id, status: "disputed" },
    { $set: { status: "refunded", refundedAmount: amount } },
    { returnDocument: 'after' },
  );
  if (!frozen) throw httpError(409, "Escrow is no longer in dispute");

  const reference = paystack.makeReference("isk_rf");
  await EscrowTransaction.create({
    escrowID: escrow._id,
    transactionType: "refund",
    amount,
    reference,
    status: "pending",
    metadata: { paymentReference: escrow.paymentReference },
  });
  try {
    await paystack.refundTransaction({
      transaction: escrow.paymentReference,
      amount: toKobo(amount),
    });
  } catch (error) {
    await finalizeRefund(escrow.paymentReference, false, {
      error: error.message,
    });
    throw httpError(502, `Refund was not accepted: ${error.message}`);
  }
  await Job.updateOne({ _id: escrow.jobID }, { $set: { status: "cancelled" } });
};

export const finalizeRefund = async (paymentReference, success, data) => {
  const txn = await EscrowTransaction.findOneAndUpdate(
    {
      transactionType: "refund",
      status: "pending",
      "metadata.paymentReference": paymentReference,
    },
    {
      $set: {
        status: success ? "completed" : "failed",
        ...(success ? { paidAt: new Date() } : {}),
        "metadata.result": data,
      },
    },
    { returnDocument: 'after' },
  );
  if (!txn || success) return txn;

  await Escrow.updateOne(
    { _id: txn.escrowID, status: "refunded" },
    { $set: { status: "disputed", refundedAmount: 0 } },
  );
  await Dispute.updateOne(
    { escrowID: txn.escrowID, status: "resolved", resolution: "refund" },
    { $set: { status: "open" } },
  );
  await Job.updateOne(
    { _id: (await Escrow.findById(txn.escrowID))?.jobID },
    { $set: { status: "disputed" } },
  );
  return txn;
};

export const handleRefundEvent = async (event, data) => {
  const paymentReference = data.transaction_reference;
  if (!paymentReference) return null;
  if (event === "refund.processed")
    return finalizeRefund(paymentReference, true, data);
  if (event === "refund.failed")
    return finalizeRefund(paymentReference, false, data);
  return null;
};
