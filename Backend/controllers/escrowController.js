import mongoose from "mongoose";
import Escrow from "../models/escrow.js";
import Job from "../models/jobModel.js";
import Quote from "../models/quoteModel.js";
import {
    fundEscrowAccount,
    releaseMaterial,
    confirmCompletion,
    handlePaystackWebhook,
} from "../services/escrowService.js";
import { makeReference, verifyPayment } from "../services/paystackService.js";
import { submitCompletion } from "../services/jobPassportService.js";


//Get authenticated user ID
const getUserId = (req) => req.user?.id || req.user?._id;

//validate ObjectId
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

//Create escrow
const createEscrow = async (req,res) => {
    try{
        const customerId = getUserId(req);
        if (!customerId){
            return res.status(401).json({
                success: false, 
                message: "Unauthorized" 
                });
        }

        //Extract from frontend
        const { jobId } = req.body ?? {};

        //Validate ID
        if (!isValidObjectId(jobId)){
            return res.status(400).json({
                success: false,
                message: "Invalid job or artisan ID"
            });
        }
        // Ensure the job exists and belongs to the right customer
        const job = await Job.findById(jobId);
        if (!job) {
            return res.status(404).json({
                success: false,
                message: "Job not found"
            });
        }
        if (String(job.customerID) !== String(customerId)) {
            return res.status(403).json({ success: false, message: "You are not authorized to create escrow for this job" });
        }
        if (job.status !== "quote_accepted" || !job.artisanID) {
            return res.status(409).json({ success: false, message: "A quote must be accepted before escrow can be created" });
        }

        const acceptedQuote = await Quote.findOne({
            jobID: job._id,
            artisanID: job.artisanID,
            status: "accepted",
        });
        if (!acceptedQuote) {
            return res.status(409).json({ success: false, message: "No accepted quote was found for this job" });
        }
        const totalAmount = Number(job.agreement?.totalAmount ?? acceptedQuote.totalAmount);
        const materialAmount = Number(acceptedQuote.materialAmount);
        if (!Number.isFinite(totalAmount) || totalAmount <= 0 || !Number.isFinite(materialAmount) || materialAmount < 0 || materialAmount > totalAmount) {
            return res.status(400).json({ success: false, message: "The accepted quote has invalid amounts" });
        }


    // Do not allow another escrow for the same job.
    const existingEscrow = await Escrow.findOne({ jobId: job._id });
    if (existingEscrow){
        return res.status(400).json({
            success: false,
            message: "An escrow already exists for this job"
        })
    }

    const remainingAmount = Number((totalAmount - materialAmount).toFixed(2));

    const escrow = await Escrow.create({
        jobId: job._id,
        customerId,
        artisanId: job.artisanID,
        totalAmount,
        heldAmount: 0,
        materialAmount,
        materialPaymentStatus: "pending",
        remainingAmount,
        balancePaymentStatus: "pending",
        reference: makeReference(),
        status: "pending",
    })

    job.paymentStatus = "pending";
    job.passportEvents.push({
        type: "escrow_created",
        actorID: customerId,
        message: "Escrow was created for the accepted agreement.",
        metadata: { escrowID: escrow._id, reference: escrow.reference, totalAmount },
    });
    await job.save();

    return res.status(201).json({
        success: true,
        message: "Escrow created successfully",
        data: escrow
    })
}    catch(error){
        // A unique jobID index can protect against concurrent creation.
    if (error.code === 11000) {
        return res.status(409).json({
            success: false,
            message: "An escrow already exists for this job"
        });
    }
    console.error("Error creating escrow:", error);
    res.status(500).json({ message: "Internal server error" });
    }
};


//Verify customer PAYSTACK payment 

const fundEscrow = async (req, res) => {
    try {
        const { escrowId } = req.params;
        const { reference } = req.body;
        const customerId = getUserId(req);

        // 1. Authenticate customer
        if (!customerId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        // 2. Validate escrow ID
        if (!isValidObjectId(escrowId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid escrow ID",
            });
        }

        // 3. Validate Paystack reference
        if (typeof reference !== "string" || !reference.trim()) {
            return res.status(400).json({
                success: false,
                message: "Paystack payment reference is required",
            });
        }

        if (!process.env.PAYSTACK_SECRET_KEY) {
            console.error("PAYSTACK_SECRET_KEY is not configured");

            return res.status(500).json({
                success: false,
                message: "Payment service is not configured",
            });
        }

        // 4. Find escrow belonging to this customer
        const escrowRecord = await Escrow.findOne({
            _id: escrowId,
            customerId,
        });

        if (!escrowRecord) {
            return res.status(404).json({
                success: false,
                message: "Escrow not found",
            });
        }

        // 5. Prevent funding an already funded escrow
        if (
            escrowRecord.status !== "pending" ||
            Number(escrowRecord.heldAmount) > 0
        ) {
            return res.status(409).json({
                success: false,
                message: "This escrow is not awaiting payment",
                data: {
                    escrowId: escrowRecord._id,
                    status: escrowRecord.status,
                    heldAmount: escrowRecord.heldAmount,
                },
            });
        }

        // The Paystack service returns the transaction object directly.
        const transaction = await verifyPayment(reference.trim());

        // 7. Confirm successful payment
        if (
            transaction?.status !== "success"
        ) {
            return res.status(400).json({
                success: false,
                message: "Payment has not been completed successfully",
            });
        }

        // 8. Confirm reference, amount, and currency
        const expectedAmountKobo = Math.round(
            Number(escrowRecord.totalAmount) * 100
        );

        if (
            transaction.reference !== reference.trim() ||
            Number(transaction.amount) !== expectedAmountKobo ||
            transaction.currency !== "NGN"
        ) {
            return res.status(400).json({
                success: false,
                message: "Payment details do not match this escrow",
            });
        }

        const updatedEscrow = await fundEscrowAccount(escrowRecord._id, transaction);

        return res.status(200).json({
            success: true,
            message: "Escrow funded successfully",
            data: updatedEscrow,
        });
    } catch (error) {
        console.error("Error funding escrow:", error);

        if (error.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message,
            });
        }

        return res.status(500).json({
            success: false,
            message: "Failed to fund escrow",
        });
    }
};


// Initiate the materials payment
const initiateMaterialPayment = async (req, res) => {
    try {
        const { escrowId } = req.params;
        const customerId = getUserId(req);
        if (!isValidObjectId(escrowId)) {
            return res.status(400).json({ success: false, message: "Invalid escrow ID" });
        }

        const escrowRecord = await Escrow.findOne({ _id: escrowId, customerId });
        if (!escrowRecord) {
            return res.status(404).json({ success: false, message: "Escrow not found" });
        }

        const updatedEscrow = await releaseMaterial(escrowRecord._id);
        return res.status(200).json({
            success: true,
            message: "Materials payment initiated",
            data: updatedEscrow,
        });
    } catch (error) {
        console.error("Error initiating material payment:", error.message);
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode ? error.message : "Failed to initiate material payment",
        });
    }
};

//Mark job as completed
const markJobCompleted = async (req, res) => {
    try {
        const { escrowId } = req.params;
        const artisanId = req.user?.id || req.user?._id;
        const { completionNote = "" } = req.body ?? {};

    if (!mongoose.isValidObjectId(escrowId)){
        return res.status(400).json({
            success: false,
            message: "Invalid escrow ID"
        });
    }
    //Only artisan assigned can mark as control
    const escrowRecord = await Escrow.findOne({ _id: escrowId, artisanId });

    if (!escrowRecord) {
        return res.status(404).json({
            success: false,
            message: "Escrow not found"
        });
    }

    if (escrowRecord.status !== "material_payment_made"){
        return res.status(400).json({
            success: false,
            message: "The escrow must be in material payment made status to mark job as completed"
        });
    }
        const job = await submitCompletion(escrowRecord.jobId, req.user, {
                note: completionNote,
                evidence: req.body?.evidence,
        });

    return res.status(200).json({
                success: true,
                message: "Job marked as completed. Awaiting customer confirmation.",
                data: job,
    });
  } catch (error) {
    console.error("Mark job complete error:", error.message);

        return res.status(error.statusCode || 500).json({
      success: false,
            message: error.statusCode ? error.message : "Failed to mark job as completed",
        });
    }
}


//Confirm job completion and initiate the final balance release
const confirmJobCompletion = async (req, res) => {
    try{
        const { escrowId } = req.params;
        const customerId = getUserId(req);
        
        // Check if customer is authenticated
        if (!customerId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            });
        }
        
        // Check if escrow is valid
        if (!isValidObjectId(escrowId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid escrow ID"
            });
        }
        
        // Find the escrow
        const escrowRecord = await Escrow.findOne({ _id: escrowId, customerId });
        
        if (!escrowRecord) {
            return res.status(404).json({
                success: false,
                message: "Escrow not found"
            });
        }
        
        const job = await Job.findOne({ _id: escrowRecord.jobId, customerID: customerId });
        if (!job) {
            return res.status(404).json({ success: false, message: "Job not found" });
        }
        if (escrowRecord.status === "balance_released" && job.status === "completed") {
            return res.status(200).json({ success: true, message: "Job completion was already confirmed", data: escrowRecord });
        }
        const awaitingCustomerConfirmation =
            job.status === "in_progress" && job.completionStatus === "artisan_marked_complete";
        const retryingBalanceRelease =
            job.status === "completed" && job.completionStatus === "customer_confirmed" &&
            escrowRecord.status === "material_payment_made";
        if (!awaitingCustomerConfirmation && !retryingBalanceRelease) {
            return res.status(409).json({ success: false, message: "The artisan must mark the job complete before confirmation" });
        }

        if (awaitingCustomerConfirmation) {
            job.status = "completed";
            job.completionStatus = "customer_confirmed";
            job.completedAt = new Date();
            job.passportEvents.push({
                type: "completion_confirmed",
                actorID: customerId,
                message: "Customer confirmed the submitted completion evidence.",
                metadata: { escrowID: escrowRecord._id },
            });
            await job.save();
        }

        const updatedEscrow = await confirmCompletion(job._id, escrowRecord._id, customerId);
        return res.status(200).json({
            success: true,
            message: "Job completion confirmed and balance release initiated",
            data: updatedEscrow
        });
        
    }
    catch(error){
        console.error("Error confirming job completion:", error);
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode ? error.message : "Failed to confirm job completion",
        });
    }
}

//Get escrow
const getEscrowById = async ( req, res) => {
    try{
        const {escrowId} = req.params;
        const userId = getUserId(req);
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            });
        }
        
        if (!isValidObjectId(escrowId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid escrow ID"
            });
        }
        
        const escrow = await Escrow.findOne({
            _id: escrowId,
            $or: [{ customerId: userId }, { artisanId: userId }],
        });
        
        if (!escrow) {
            return res.status(404).json({
                success: false,
                message: "Escrow not found"
            });
        }
        
        return res.status(200).json({
            success: true,
            data: escrow
        });
        
    }
    catch(error){
        console.error("Error getting escrow:", error);
        res.status(500).json({ 
            success: false,
            message: "Internal server error" 
        });
    }
}
   
export {
    createEscrow,
    fundEscrow,
    initiateMaterialPayment,
    markJobCompleted,
    confirmJobCompletion,
    getEscrowById
}
