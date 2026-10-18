import Escrow from "../models/escrow.js";
import EscrowTransaction from "../models/escrowTransaction.js";
import User from "../models/userModel.js";
import Job from "../models/job.js";

import {
    makeReference,
    verifyPayment,
    validateVerifiedPaymentData,
    transferToArtisan,
} from "./paystackService.js";

// Your escrow amounts are assumed to be stored in naira.
// Paystack requires amounts in kobo.
const toKobo = (amount) => Math.round(Number(amount) * 100);

// FUND ESCROW AFTER VERIFYING THE CUSTOMER'S PAYMENT
const fundEscrowAccount = async (escrowId, paymentReference) => {
    try {
        const escrow = await Escrow.findById(escrowId);

        if (!escrow) {
            throw new Error("Escrow not found");
        }

        // Verify the payment directly with Paystack.
        const payment = await verifyPayment(paymentReference);

        validateVerifiedPaymentData(
            payment,
            escrow.totalAmount
        );

        // Ensure the verified reference is the one supplied.
        if (payment.reference !== paymentReference) {
            throw new Error("Paystack payment reference mismatch");
        }

        // Prevent a payment reference from funding another escrow.
        const existingTransaction = await EscrowTransaction.findOne({
            providerReference: payment.reference,
        });

        if (existingTransaction) {
            if (
                existingTransaction.escrowId.toString() !==
                escrow._id.toString()
            ) {
                throw new Error(
                    "Payment reference is already linked to another escrow"
                );
            }

            return escrow;
        }

        if (escrow.status !== "awaiting_payment") {
            throw new Error("Escrow is not awaiting payment");
        }

        // Record the verified incoming payment.
        await EscrowTransaction.create({
            escrowId: escrow._id,
            transactionType: "funding",
            amount: Number(payment.amount) / 100,
            status: "completed",
            providerReference: payment.reference,
            metadata: {
                transactionId: payment.id,
                currency: payment.currency,
            },
        });

        escrow.status = "funded";
        escrow.heldAmount = Number(escrow.totalAmount);

        await escrow.save();

        return escrow;
    } catch (error) {
        console.error("Error funding escrow:", error.message);
        throw error;
    }
};

// RELEASE MATERIAL MONEY TO THE ARTISAN
const releaseMaterial = async (escrowId) => {
    let reference;

    try {
        const escrow = await Escrow.findById(escrowId);

        if (!escrow) {
            throw new Error("Escrow not found");
        }

        if (escrow.materialPaymentStatus === "completed") {
            return escrow;
        }

        if (escrow.status !== "funded") {
            throw new Error("Escrow must be funded before materials are paid");
        }

        // Do not start another transfer while one is pending.
        const pendingTransaction = await EscrowTransaction.findOne({
            escrowId: escrow._id,
            transactionType: "material_payment",
            status: "pending",
        });

        if (pendingTransaction) {
            throw new Error(
                "Material payment is already awaiting confirmation"
            );
        }

        const materialAmount = Number(escrow.materialPaymentAmount);

        if (!Number.isFinite(materialAmount) || materialAmount < 0) {
            throw new Error("Invalid material payment amount");
        }

        if (materialAmount === 0) {
            escrow.materialPaymentStatus = "not_applicable";
            escrow.status = "material_payment_made";

            await escrow.save();
            return escrow;
        }

        if (materialAmount > Number(escrow.heldAmount)) {
            throw new Error("Insufficient escrow balance for materials");
        }

        const artisan = await User.findById(escrow.artisanId);

        if (!artisan?.paystackRecipientCode) {
            throw new Error(
                "Artisan does not have a valid Paystack recipient code"
            );
        }

        reference = makeReference();

        // Create the transaction before initiating the transfer.
        await EscrowTransaction.create({
            escrowId: escrow._id,
            transactionType: "material_payment",
            amount: materialAmount,
            status: "pending",
            providerReference: reference,
        });

        escrow.materialPaymentStatus = "pending";
        await escrow.save();

        // If this request errors or times out, leave the transaction
        // pending for reconciliation. Do not assume the transfer failed.
        const transfer = await transferToArtisan({
            source: "balance",
            amount: toKobo(materialAmount),
            recipient: artisan.paystackRecipientCode,
            reference,
        });

        escrow.materialTrasactionCode = transfer.transfer_code;
        await escrow.save();

        // The verified webhook will update the final transfer status.
        return escrow;
    } catch (error) {
        console.error("Error releasing material payment:", error.message);
        throw error;
    }
};

// CUSTOMER CONFIRMS JOB COMPLETION AND RELEASES THE REMAINING BALANCE
const confirmCompletion = async (jobId, escrowId, customerId) => {
    try {
        const job = await Job.findById(jobId);

        if (
            !job ||
            job.customerId?.toString() !== customerId.toString()
        ) {
            throw new Error(
                "Job not found or customer is not authorized"
            );
        }

        const escrow = await Escrow.findOne({
            _id: escrowId,
            jobId: jobId,
            customerId,
        });

        if (!escrow) {
            throw new Error("Escrow not found or access denied");
        }

        if (escrow.status === "balance_released") {
            return escrow;
        }

        if (escrow.status !== "material_payment_made") {
            throw new Error(
                "Escrow is not ready for final balance release"
            );
        }

        if (
            !["pending", "failed"].includes(
                escrow.balancePaymentStatus
            )
        ) {
            throw new Error(
                "Balance payment cannot be released in its current state"
            );
        }

        const remainingAmount = Number(escrow.remainingAmount);

        if (!Number.isFinite(remainingAmount) || remainingAmount < 0) {
            throw new Error("Invalid remaining balance");
        }

        if (remainingAmount === 0) {
            escrow.balancePaymentStatus = "completed";
            escrow.status = "balance_released";
            escrow.completedAt = new Date();

            await escrow.save();
            return escrow;
        }

        // Avoid starting a duplicate transfer.
        const pendingTransaction = await EscrowTransaction.findOne({
            escrowId: escrow._id,
            transactionType: "balance_release",
            status: "pending",
        });

        if (pendingTransaction) {
            throw new Error(
                "Balance transfer is already awaiting confirmation"
            );
        }

        if (remainingAmount > Number(escrow.heldAmount)) {
            throw new Error(
                "Insufficient escrow balance for final payment"
            );
        }

        const artisan = await User.findById(escrow.artisanId);

        if (!artisan?.paystackRecipientCode) {
            throw new Error(
                "Artisan does not have a valid Paystack recipient code"
            );
        }

        const reference = makeReference();

        await EscrowTransaction.create({
            escrowId: escrow._id,
            transactionType: "balance_release",
            amount: remainingAmount,
            status: "pending",
            providerReference: reference,
        });

        escrow.balancePaymentStatus = "pending";
        escrow.completedAt = new Date();

        await escrow.save();

        const transfer = await transferToArtisan({
            source: "balance",
            amount: toKobo(remainingAmount),
            recipient: artisan.paystackRecipientCode,
            reference,
        });

        escrow.finalTransferCode = transfer.transfer_code;
        await escrow.save();

        // Wait for the verified Paystack webhook before marking it paid.
        return escrow;
    } catch (error) {
        console.error("Error confirming job completion:", error.message);
        throw error;
    }
};

// HANDLE PAYSTACK TRANSFER WEBHOOK
// Call only after verifying the webhook signature in the controller.
const handlePaystackWebhook = async (event, data) => {
    try {
        const supportedEvents = [
            "transfer.success",
            "transfer.failed",
            "transfer.reversed",
        ];

        if (!supportedEvents.includes(event)) {
            return;
        }

        if (!data?.reference) {
            throw new Error("Paystack webhook has no transfer reference");
        }

        const transaction = await EscrowTransaction.findOne({
            providerReference: data.reference,
        });

        if (!transaction) {
            console.warn(
                "Escrow transaction not found:",
                data.reference
            );
            return;
        }

        const escrow = await Escrow.findById(transaction.escrowId);

        if (!escrow) {
            throw new Error("Escrow not found for this transaction");
        }

        // Ignore duplicate notifications for the same final result.
        if (
            transaction.status === "completed" &&
            event === "transfer.success"
        ) {
            return escrow;
        }

        if (
            ["failed", "reversed"].includes(transaction.status) &&
            event !== "transfer.reversed"
        ) {
            return escrow;
        }

        if (event === "transfer.success") {
            if (transaction.status !== "completed") {
                transaction.status = "completed";

                if (transaction.transactionType === "material_payment") {
                    escrow.heldAmount = Math.max(
                        0,
                        Number(escrow.heldAmount) -
                            Number(transaction.amount)
                    );

                    escrow.materialPaymentStatus = "completed";
                    escrow.status = "material_payment_made";
                }

                if (transaction.transactionType === "balance_release") {
                    escrow.heldAmount = Math.max(
                        0,
                        Number(escrow.heldAmount) -
                            Number(transaction.amount)
                    );

                    escrow.balancePaymentStatus = "completed";
                    escrow.status = "balance_released";
                }
            }
        } else if (event === "transfer.failed") {
            transaction.status = "failed";

            if (transaction.transactionType === "material_payment") {
                escrow.materialPaymentStatus = "failed";
                // Escrow remains funded so the transfer can be retried.
            }

            if (transaction.transactionType === "balance_release") {
                escrow.balancePaymentStatus = "failed";
                // The balance can be retried after checking transfer status.
            }
        } else if (event === "transfer.reversed") {
            // Restore the balance only if the transfer had been completed.
            if (transaction.status === "completed") {
                escrow.heldAmount =
                    Number(escrow.heldAmount) +
                    Number(transaction.amount);
            }

            transaction.status = "reversed";

            if (transaction.transactionType === "material_payment") {
                escrow.materialPaymentStatus = "failed";
                escrow.status = "funded";
            }

            if (transaction.transactionType === "balance_release") {
                escrow.balancePaymentStatus = "failed";
                escrow.status = "material_payment_made";
            }
        }

        transaction.metadata = data;

        await transaction.save();
        await escrow.save();

        return escrow;
    } catch (error) {
        console.error("Error handling Paystack webhook:", error.message);
        throw error;
    }
};

export {
    fundEscrowAccount,
    releaseMaterial,
    confirmCompletion,
    handlePaystackWebhook,
};
