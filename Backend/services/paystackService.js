import paystackRequest from "../config/paystack.js";
import crypto from "node:crypto";

// Generate a unique transaction reference.
const makeReference = () => `isk_${crypto.randomUUID()}`;

// Initialize a customer payment.
const initializePayment = async (data) => {
    try {
        const response = await paystackRequest(
            "/transaction/initialize",
            "POST",
            {
                ...data,
                reference: makeReference(),
            }
        );

        return response.data;
    } catch (error) {
        console.error("Error initializing payment:", error.message);
        throw new Error(
            error.response?.data?.message ||
            error.message ||
            "Failed to initialize payment"
        );
    }
};

// Verify a customer payment.
// Returns Paystack's transaction object in response.data.
const verifyPayment = async (reference) => {
    if (!reference) {
        throw new Error("Payment reference is required");
    }

    try {
        const response = await paystackRequest(
            `/transaction/verify/${encodeURIComponent(reference)}`
        );

        return response.data;
    } catch (error) {
        console.error("Error verifying payment:", error.message);
        throw new Error(
            error.response?.data?.message ||
            error.message ||
            "Failed to verify payment"
        );
    }
};

// Validate the transaction object returned by verifyPayment().
// expectedAmount is expressed in naira.
const validateVerifiedPaymentData = (
    paymentData,
    expectedAmount
) => {
    if (!paymentData || paymentData.status !== "success") {
        throw new Error("Payment was not successful");
    }

    if (paymentData.currency !== "NGN") {
        throw new Error("Payment currency must be NGN");
    }

    const amountInKobo = Number(paymentData.amount);
    const expectedAmountInNaira = Number(expectedAmount);

    if (
        !Number.isFinite(amountInKobo) ||
        !Number.isFinite(expectedAmountInNaira) ||
        expectedAmountInNaira <= 0
    ) {
        throw new Error("Invalid payment amount");
    }

    if (
        amountInKobo !== Math.round(expectedAmountInNaira * 100)
    ) {
        throw new Error("Payment amount does not match");
    }

    if (!paymentData.reference) {
        throw new Error("Payment reference is missing");
    }

    return true;
};

// Create a Paystack transfer recipient.
const createTransferRecipient = async (data) => {
    try {
        const response = await paystackRequest(
            "/transferrecipient",
            "POST",
            data
        );

        return response.data;
    } catch (error) {
        console.error(
            "Error creating transfer recipient:",
            error.message
        );

        throw new Error(
            error.response?.data?.message ||
            error.message ||
            "Failed to create transfer recipient"
        );
    }
};

// Initiate a transfer to an artisan.
const transferToArtisan = async (data) => {
    try {
        const response = await paystackRequest(
            "/transfer",
            "POST",
            data
        );

        return response.data;
    } catch (error) {
        console.error(
            "Error transferring to artisan:",
            error.message
        );

        throw new Error(
            error.response?.data?.message ||
            error.message ||
            "Failed to initiate transfer"
        );
    }
};

// Validate a Paystack webhook signature.
// Express must preserve the original raw request body as req.rawBody.
const validWebHookSignature = (req) => {
    const signature = req.headers["x-paystack-signature"];
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const rawBody = req.rawBody;

    if (!signature || !secret || !rawBody) {
        return false;
    }

    if (!/^[a-f0-9]{128}$/i.test(signature)) {
        return false;
    }

    const expectedSignature = crypto
        .createHmac("sha512", secret)
        .update(rawBody)
        .digest("hex");

    const receivedBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    return (
        receivedBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(
            receivedBuffer,
            expectedBuffer
        )
    );
}

export {
    makeReference,
    initializePayment,
    verifyPayment,
    validateVerifiedPaymentData,
    createTransferRecipient,
    transferToArtisan,
    validWebHookSignature,
};
