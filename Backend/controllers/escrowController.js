import mongoose from "mongoose";
import Escrow from "../models/escrow.js";
import Job from "../models/job.js";
import {
    fundEscrowAccount,
    releaseMaterial,
    confirmCompletion,
    handlePaystackWebhook,
} from "../services/escrowService.js";

import escrow from "../models/escrow.js";


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
        const {
            jobId,
            artisanId,
            totalAmount,
            materialAmount = 0
        } = req.body; 

        //Validate ID
        if (!isValidObjectId(jobId) || !isValidObjectId(artisanId)){
            return res.status(400).json({
                success: false,
                message: "Invalid job or artisan ID"
            });
        }
        //Validate amount 
        if (typeof totalAmount !== "number" ||
            typeof materialAmount !== "number" ||
            totalAmount <= 0 || 
            materialAmount <= 0){
                return res.status(400).json({
                    success: false,
                    message: "Invalid total amount"
            });
        }
        // Ensure the job exists and belongs to the right customer
        const job = await Job.findById({
            _id: jobId,
            customer: customerId
        });
        if (!job || job.customer.toString() !== customerId.toString()) {
            return res.status(404).json({
                success: false,
                message: "Job not found"
            });
        }

        // If your Job schema stores the assigned artisan as artisanID,
        // verify that it matches the requested artisan.
        //continue after jobId is verified in model
        /*
        if (
            job.artisanID &&
            job.artisanID.toString() !== artisanID.toString()
            ) {
      return res.status(400).json({
        success: false,
        message: "The artisan does not match the assigned job artisan",
      });
    }
         */


    // Do not allow another escrow for the same job.
    const existingEscrow = await Escrow.findById({jobId})
    if (existingEscrow){
        return res.status(400).json({
            success: false,
            message: "An escrow already exists for this job"
        })
    }

    const remainingAmount = Number ( (totalAmount - materialAmount).toFixed(2));

    const escrow = await Escrow.create({
        jobId,
        customerId,
        artisanId,
        totalAmount,
        heldAmount: 0,
        materialPaymentAmount: materialAmount,
        materialPaymentStatus: "pending",
        remainingAmount,
        balancePaymentStatus: "pending",
        status: "awaiting_payment",
    })

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
    try{
        const {escrowId} = req.params;
        const {reference} = req.body;
        const customerId = getUserId(req);

        // Check if customer is authenticated
        if (!customerId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            });
        }
        // Check if escrow is valid
       if (!isValidId(escrowId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid escrow ID"
            });
       }

       if (typeof reference != "string" ||
        !reference.trim()
       ){
        return res.status(400).json({
            success: false,
            message: "Invalid reference, paystack payment reference is required"
        });
       }

       //Make sure only the customer that owns an escrow can fund it
       const escrow = await Escrow.findOne({
        _id: escrowId,
        customerId
       });

       if (!escrow) {
        return res.status(404).json({
            success: false,
            message: "Escrow not found"
        });
       }

    }
    catch(error){
        console.error("Error verifying customer PAYSTACK payment:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}


// Initiate the materials payment
const initiateMaterialPayment = async (req, res) => {
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
        if (!isValidId(escrowId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid escrow ID"
            });
        }
        
        // Find the escrow
        const escrow = await Escrow.findOne({
            _id: escrowId,
            customerId
        });
        
        if (!escrow) {
            return res.status(404).json({
                success: false,
                message: "Escrow not found"
            });
        }
        
        // Check if materials payment is already initiated
        if (escrow.materialPaymentStatus !== "pending") {
            return res.status(400).json({
                success: false,
                message: "Materials payment already initiated or completed",
                data: updatedEscrow
            });
        }
        
        //Initialize the materials payment
        const updatedEscrow = await Escrow.findByIdAndUpdate(
            escrowId,
            { materialPaymentStatus: "processing" },
            { new: true }
        );

        return res.status(200).json({
            success: true,
            message: "Materials payment initiated",
            data: updatedEscrow
        });
        
    }
    catch(error){
        console.error("Error initiating material payment:", error.message);
        res.status(500).json({
            message: "Internal server error"
        });
    }
}

//Mark job as completed
const markJobCompleted = async (req, res) => {
    try {
        const { escrowId } = req.params;
        const artisanId = req.user?.id || req.user?._id;
        const { completionNote = ""} = req.body; // 

    if (!mongoose.isValidObjectId(escrowId)){
        return res.status(400).json({
            success: false,
            message: "Invalid escrow ID"
        });
    }
    //Only artisan assigned can mark as control
    const escrow = await Escrow.findOne({
        _id: escrowId,
        artisanId
    });

    if (!escrow) {
        return res.status(404).json({
            success: false,
            message: "Escrow not found"
        });
    }

    if (escrow.status !== "material_payment_made"){
        return res.status(400).json({
            success: false,
            message: "The escrow must be in material payment made status to mark job as completed"
        });
    }
    const job = await Job.findById(escrow.jobID);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    if (job.completionStatus === "artisan_marked_complete") {
        return res.status(409).json({
            success: false,
            message: "The job has already been marked complete",
      });
    }

    if (job.completionStatus === "customer_confirmed") {
        return res.status(409).json({
            success: false,
            message: "The customer has already confirmed completion",
      });
    }

    job.completionStatus = "artisan_marked_complete";
    job.artisanCompletedAt = new Date();
    job.artisanCompletionNote = String(completionNote).trim();

    await job.save();

    return res.status(200).json({
        success: true,
        message: "Job marked as completed. Awaiting customer confirmation.",
        data: {
            jobID: job._id,
            completionStatus: job.completionStatus,
            artisanCompletedAt: job.artisanCompletedAt,
      },
    });
  } catch (error) {
    console.error("Mark job complete error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to mark job as completed",
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
        if (!isValidId(escrowId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid escrow ID"
            });
        }
        
        // Find the escrow
        const escrow = await Escrow.findOne({
            _id: escrowId,
            customerId
        });
        
        if (!escrow) {
            return res.status(404).json({
                success: false,
                message: "Escrow not found"
            });
        }
        
        // Check if job is already completed
        if (escrow.jobStatus !== "in_progress") {
            return res.status(400).json({
                success: false,
                message: "Job already completed or not in progress"
            });
        }
        

        escrow.jobStatus = "completed";
        await escrow.save();
        
        return res.status(200).json({
            success: true,
            message: "Job completion confirmed",
            data: escrow
        });
        
    }
    catch(error){
        console.error("Error confirming job completion:", error);
        res.status(500).json({ message: "Internal server error" });
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
        
        if (!isValidId(escrowId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid escrow ID"
            });
        }
        
        const escrow = await Escrow.findOne({
            _id: escrowId,
            customerId: userId
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
