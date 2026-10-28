import Escrow from "../models/escrow.js";
import EscrowTransaction from "../models/escrowTransaction.js";
import ArtisanProfile from "../models/artisanProfileModel.js";
import Job from "../models/jobModel.js";
import Payment from "../models/payment.js";

import {
    verifyPayment,
    transferToArtisan,
} from "./paystackService.js";
import { notifyUser } from "./notificationService.js";

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const toKobo = (naira) => Math.round(Number(naira) * 100);

// Deterministic reference per payout ATTEMPT (escrow + leg + number of earlier failed attempts).
// Parallel requests all read the same attempt number, so they compute the SAME reference and the
// unique index on EscrowTransaction.reference lets exactly one through — a double payout is
// impossible even if the status claim below were to race. (Paystack also rejects a repeated
// transfer reference.) After a failure the counter is bumped, so a retry gets a fresh reference.
// Paystack references allow a-z 0-9 - _ = and 16-50 chars.
// `escrow` must be the document read BEFORE claiming.
const startTransaction = async (escrow, transactionType, amount) => {
  const material = transactionType === "material_payment";
  const attempt = (material ? escrow.materialAttempts : escrow.balanceAttempts) ?? 0;
  const reference = `isk_${escrow._id}_${material ? "m" : "b"}${attempt}`;
  try {
    await EscrowTransaction.create({
      escrowID: escrow._id,
      transactionType,
      amount,
      currency: escrow.currency,
      reference,
      status: "pending",
    });
  } catch (error) {
    if (error.code === 11000) throw httpError("A transfer for this escrow is already in progress", 409);
    throw error;
  }
  return reference;
};

// paystackRecipientCode is select:false on the profile, so ask for it explicitly.
const getArtisanRecipientCode = async (artisanID) => {
  const artisan = await ArtisanProfile.findOne({ userId: artisanID }).select("+paystackRecipientCode");
  return artisan?.paystackRecipientCode || null;
};

// Called once a customer payment has been verified (webhook charge.success or
// /transaction/verify). `payment` = { reference, amount (in kobo) }.
const fundEscrowAccount = async (escrowId, payment) => {
  const existing = await Escrow.findById(escrowId);
  if (!existing) throw httpError("Escrow not found", 404);

  // Already funded (webhooks are delivered more than once) — nothing to do
  if (existing.status !== "pending") return existing;

  if (payment.amount !== undefined && Number(payment.amount) !== toKobo(existing.totalAmount)) {
    throw httpError("Paid amount does not match the escrow total", 400);
  }
  if (payment.currency && payment.currency !== existing.currency) {
    throw httpError("Paid currency does not match the escrow currency", 400);
  }

  if (payment.reference) {
    const duplicateReference = await Escrow.findOne({
      paystackReference: payment.reference,
      _id: { $ne: escrowId },
    });
    if (duplicateReference) throw httpError("This payment reference has already been used", 409);
  }

  // Atomic compare-and-set: only ONE concurrent caller moves pending -> payment_confirmed
  const escrow = await Escrow.findOneAndUpdate(
    { _id: escrowId, status: "pending" },
    {
      $set: {
        status: "payment_confirmed",
        heldAmount: existing.totalAmount,
        ...(payment.reference && { paystackReference: payment.reference }),
      },
    },
    { new: true }
  );
  if (!escrow) return Escrow.findById(escrowId); // lost the race; the winner does the rest

  await Job.updateOne(
    { _id: escrow.jobId, status: { $in: ["quote_accepted", "in_progress"] } },
    {
      $set: { status: "in_progress", paymentStatus: "paid" },
      $push: {
        passportEvents: {
          type: "escrow_funded",
          message: "Escrow funding was confirmed.",
          metadata: { escrowID: escrow._id, reference: payment.reference },
          createdAt: new Date(),
        },
      },
    }
  );

  await EscrowTransaction.updateOne(
    { reference: payment.reference },
    {
      $setOnInsert: {
        escrowID: escrow._id,
        transactionType: "funding",
        amount: escrow.totalAmount,
        currency: escrow.currency,
        status: "completed",
        paidAt: new Date(),
      },
    },
    { upsert: true }
  );

  // Funds are in: pay the artisan's material allowance straight away
  try {
    return await releaseMaterial(escrow._id);
  } catch (error) {
    // Escrow is still correctly funded; the material leg is marked failed and can be retried.
    console.error("Material release failed after funding:", error.message);
    return Escrow.findById(escrow._id);
  }
};

// Material payment release (also used to retry a failed one)
const releaseMaterial = async (escrowId) => {
  const current = await Escrow.findById(escrowId);
  if (!current) throw httpError("Escrow not found", 404);
  if (current.status !== "payment_confirmed") throw httpError("Escrow is not funded", 409);

  const claimable = {
    _id: escrowId,
    status: "payment_confirmed",
    materialPaymentStatus: { $in: ["pending", "failed"] },
  };

  // No material payment agreed: skip straight to the "material done" state
  if (current.materialAmount === 0) {
    const skipped = await Escrow.findOneAndUpdate(
      claimable,
      { materialPaymentStatus: "not_applicable", status: "material_payment_made" },
      { new: true }
    );
    if (!skipped) throw httpError("Material payment already processed", 409);
    return skipped;
  }

  const recipient = await getArtisanRecipientCode(current.artisanId);
  if (!recipient) {
    await Escrow.updateOne(claimable, { materialPaymentStatus: "failed" });
    throw httpError("Artisan does not have a valid Paystack recipient code", 422);
  }

  // Atomic claim: a double click / duplicate webhook can't start a second transfer
  const escrow = await Escrow.findOneAndUpdate(claimable, { materialPaymentStatus: "processing" }, { new: true });
  if (!escrow) throw httpError("Material payment already processed or in progress", 409);

  const reference = await startTransaction(current, "material_payment", escrow.materialAmount);

  try {
    const transfer = await transferToArtisan({
      source: "balance",
      amount: toKobo(escrow.materialAmount),
      recipient,
      reference,
      reason: "iSabiKraft material payment",
    });
    await Escrow.updateOne({ _id: escrow._id }, { $set: { materialTransferCode: transfer.transfer_code } });
    // Final success/failure arrives through the transfer.* webhook.
    return escrow;
  } catch (error) {
    await EscrowTransaction.updateOne({ reference }, { status: "failed", metadata: { error: error.message } });
    escrow.materialPaymentStatus = "failed";
    escrow.materialAttempts = (current.materialAttempts ?? 0) + 1;
    await escrow.save();
    throw error;
  }
};

// After the customer confirms the job is complete: release the balance
const confirmCompletion = async (jobID, escrowId, customerID) => {
  const claimable = {
    _id: escrowId,
    jobId: jobID,
    customerId: customerID,
    status: "material_payment_made",
    balancePaymentStatus: { $in: ["pending", "failed"] },
  };

  const current = await Escrow.findOne({ _id: escrowId, jobId: jobID, customerId: customerID });
  if (!current) throw httpError("Escrow not found", 404);
  if (current.status !== "material_payment_made") throw httpError("Escrow not ready for balance release", 409);

  // Nothing left to pay out
  if (current.remainingAmount === 0) {
    const done = await Escrow.findOneAndUpdate(
      claimable,
      { balancePaymentStatus: "completed", status: "balance_released", completedAt: new Date() },
      { new: true }
    );
    if (!done) throw httpError("Balance payment is not pending", 409);
    return done;
  }

  const recipient = await getArtisanRecipientCode(current.artisanId);
  if (!recipient) {
    await Escrow.updateOne(claimable, { balancePaymentStatus: "failed" });
    throw httpError("Artisan does not have a valid Paystack recipient code", 422);
  }

  const escrow = await Escrow.findOneAndUpdate(claimable, { balancePaymentStatus: "processing" }, { new: true });
  if (!escrow) throw httpError("Balance payment is not pending", 409);

  const reference = await startTransaction(current, "balance_release", escrow.remainingAmount);

  try {
    const transfer = await transferToArtisan({
      source: "balance",
      amount: toKobo(escrow.remainingAmount),
      recipient,
      reference,
      reason: "iSabiKraft job balance",
    });
    await Escrow.updateOne({ _id: escrow._id }, { $set: { finalTransferCode: transfer.transfer_code } });
    return escrow;
  } catch (error) {
    await EscrowTransaction.updateOne({ reference }, { status: "failed", metadata: { error: error.message } });
    escrow.balancePaymentStatus = "failed";
    escrow.balanceAttempts = (current.balanceAttempts ?? 0) + 1;
    await escrow.save();
    throw error;
  }
};

// Verified Paystack webhook events
const handlePaystackWebhook = async (event, data) => {
  if (event === "charge.success") {
    const payment = await Payment.findOne({ reference: data.reference, status: "pending" });
    if (
      payment &&
      Number(data.amount) === Number(payment.amount) &&
      data.currency === payment.currency
    ) {
      const completed = await Payment.findOneAndUpdate(
        { _id: payment._id, status: "pending" },
        { $set: { status: "completed", paidAt: new Date() } },
        { new: true }
      );
      if (completed) {
        await Job.updateOne(
          { _id: completed.jobID, status: { $in: ["quote_accepted", "in_progress"] } },
          {
            $set: { status: "in_progress", paymentStatus: "paid" },
            $push: {
              passportEvents: {
                type: "payment_completed",
                message: "Payment was confirmed by Paystack.",
                metadata: { paymentID: completed._id, reference: completed.reference },
                createdAt: new Date(),
              },
            },
          }
        );
      }
    }

    const escrow = await Escrow.findOne({
      $or: [{ reference: data.reference }, { paystackReference: data.reference }],
    });
    if (escrow) {
      await fundEscrowAccount(escrow._id, {
        reference: data.reference,
        amount: data.amount,
        currency: data.currency,
      });
    }
    return;
  }

  // Customer payment succeeded -> fund the escrow that carries this reference
  // Paystack's transfer events are transfer.success / transfer.failed / transfer.reversed
  const succeeded = event === "transfer.success";
  const failed = event === "transfer.failed" || event === "transfer.reversed";
  if (!succeeded && !failed) return;

  // Atomic: only the first delivery of this webhook finds the transaction still "pending"
  const transaction = await EscrowTransaction.findOneAndUpdate(
    { reference: data.reference, status: "pending" },
    { status: succeeded ? "completed" : "failed", paidAt: succeeded ? new Date() : undefined, metadata: data },
    { new: true }
  );
  if (!transaction) return; // unknown reference or already handled

  // On failure the escrow status is left as-is (funds are still held) so the
  // failed leg can simply be retried.
  if (transaction.transactionType === "material_payment") {
    await Escrow.updateOne(
      { _id: transaction.escrowID },
      succeeded
        ? { $set: { materialPaymentStatus: "completed" } }
        : { $set: { materialPaymentStatus: "failed" }, $inc: { materialAttempts: 1 } }
    );
    if (succeeded) {
      const updated = await Escrow.findOneAndUpdate(
        { _id: transaction.escrowID, status: { $ne: "disputed" } },
        { $set: { status: "material_payment_made" } },
        { new: true }
      );
      if (updated) {
        await notifyUser({
          recipientID: updated.artisanId,
          type: "material_payment",
          title: "Material payment received",
          message: `Material payment of ₦${Number(updated.materialAmount).toLocaleString()} has been released for your job.`,
          jobID: updated.jobId,
          escrowID: updated._id,
          metadata: { amount: updated.materialAmount, reference: transaction.reference },
        });
      }
    }
  } else if (transaction.transactionType === "balance_release") {
    await Escrow.updateOne(
      { _id: transaction.escrowID },
      succeeded
        ? { $set: { balancePaymentStatus: "completed", completedAt: new Date() } }
        : { $set: { balancePaymentStatus: "failed" }, $inc: { balanceAttempts: 1 } }
    );
    if (succeeded) {
      const updated = await Escrow.findOneAndUpdate(
        { _id: transaction.escrowID, status: { $ne: "disputed" } },
        { $set: { status: "balance_released" } },
        { new: true }
      );
      if (updated) {
        await notifyUser({
          recipientID: updated.artisanId,
          type: "balance_payment",
          title: "Final balance paid",
          message: `The remaining balance of ₦${Number(updated.remainingAmount).toLocaleString()} has been released for your job.`,
          jobID: updated.jobId,
          escrowID: updated._id,
          metadata: { amount: updated.remainingAmount, reference: transaction.reference },
        });
      }
    }
  }
};

export { fundEscrowAccount, releaseMaterial, confirmCompletion, handlePaystackWebhook };
