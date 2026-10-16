
import Payment from "../models/payment.js";
import Job from "../models/job.js";
import {createNotification} from "../services/notificationService.js";
import {
    initializePayment,
    verifyPayment,
    validateVerifiedPaymentData
} from "../services/paystackService.js";
import payment from "../models/payment.js";

// Initialize payment
const initializePaymentController = async (req, res) => {
    try {
        
        const { jobId } = req.body;
        if (!jobId) {
            return res.status(400).json({
                 message: "Job ID is required" 
                });
        }

        //find the job
        const job = await Job.findById(jobId);
        if (!job) {
            return res.status(404).json({ 
                message: "Job not found" 
            });
        }

        //confirm customer owns the job
        if (job.customerId.toString() !== req.user.id) {
            return res.status(403).json({ 
                message: "You are not authorized to make payment for this job" 
            });
        }
        
        //total amount to be paid
        const totalAmount = Math.round(job.totalAmount )* 100; //convert to kobo
        if (totalAmount <= 0) {
            return res.status(400).json({ 
                message: "Invalid payment amount" 
            });
        }

        //prevent duplicate payment initialization for the same job
        const existingPayment = await Payment.findOne({ jobId, status: "pending" });
        if (existingPayment) {
            return res.status(400).json({ 
                message: "A pending payment already exists for this job" 
            });
        }
        //prevent duplicate successful payment 
        if (job.paymentStatus === "completed") {
            return res.status(400).json({ 
                message: "Payment for this job has already been completed" 
            });
        }

        //initialize payment with paystack
        const paymentResponse = await initializePayment({
            email: req.user.email,
            amount,
            currency: "NGN",
            metadata: {
                jobId: String(job._id),
                customerId: String(req.user.id)
            }
        });

        if (
            paymentResponse.status !== true ||
            !paymentResponse.data?.reference ||
            !paymentResponse.data?.authorization_url
        ){
            return res.status(502).json({
                success: false,
                message: "Unable to initialize payment"
            });
        }

        //save payment record
        const paymentRecord = await payment.create({
            jobId: job._id,
            costumerId: req.user.id,
            amount,
            currency: "NGN",
            reference: paymentResponse.data.reference,
            status: "pending"
        });

        //create notification
        try{
            await createNotification({
                userId: req.user.id,
                title: "Payment Initialized",
                message: "Your payment has been initialized. Complete the payment to proceed with your artisan job.",
                type: "payment"
            })
                } catch (notificationError) {
            console.error(
                "Payment initialization notification error:",
                notificationError.message
                );
            }
            return res.status(201).json({
                success: true,
                message: "Payment initialized successfully",
                data: {
                    paymentId : paymentRecord._id,
                    reference: paymentRecord.reference,
                    authorizationUrl: paymentResponse.data.authorization_url,
                    amount: paymentRecord.amount,
                    currency: paymentRecord.currency,
                    status: paymentRecord.status
                }
            });
        } catch (error) {
                console.error("Initialize payment error: ", error.message);
                return res.status(500).json({
                    success: false,
                    message: "Failed to initialize payment"
                });
            }
        }

//Verify Payment WIth Paystack
const verifyPayment = async (req, res) => {
    try {
        const { reference } = req.params;

        //verify payment with paystack
        const paymentResponse = await axios.get(
            `https://api.paystack.co/transaction/verify/${reference}`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
                }
            }
        );

        if (
            paymentResponse.status !== 200 ||
            !paymentResponse.data?.status ||
            paymentResponse.data.data.status !== "success"
        ){
            return res.status(400).json({
                success: false,
                message: "Payment verification failed"
            });
        }

        //update payment record
        const paymentRecord = await payment.findOneAndUpdate(
            { reference },
            {
                status: "completed",
                paidAt: new Date()
            },
            { new: true }
        );

        if (!paymentRecord) {
            return res.status(404).json({
                success: false,
                message: "Payment record not found"
            });
        }

        //update job status
        const job = await job.findById(paymentRecord.jobId);
        if (job) {
            job.status = "paid";
            await job.save();
        }

        //create notification
        try{
            await createNotification({
                userId: paymentRecord.costumerId,
                title: "Payment Successful",
                message: "Your payment has been successfully processed. Your artisan job is now confirmed.",
                type: "payment"
            })
                } catch (notificationError) {
            console.error(
                "Payment verification notification error:",
                notificationError.message
                );
            }

            return res.status(200).json({
                success: true,
                message: "Payment verified successfully",
                data: {
                    paymentId: paymentRecord._id,
                    reference: paymentRecord.reference,
                    status: paymentRecord.status,
                    amount: paymentRecord.amount,
                    currency: paymentRecord.currency
                }
            });
        } catch (error) {
            console.error("Verify payment error: ", error.message);
            return res.status(500).json({
                success: false,
                message: "Failed to verify payment"
            });
        }
    };

//Get Payment History
const getPaymentHistory = async (req, res) => {
    try {
        const { userId } = req.params;

        //get payment history
        const payments = await payment.find({ costumerId: userId })
            .populate("jobId", "title status")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            message: "Payment history retrieved successfully",
            data: payments
        });
    } catch (error) {
        console.error("Get payment history error: ", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve payment history"
        });
    }
};

//Get one payment
const getPayment = async (req, res) => {
    try {
        const { paymentId } = req.params;

        //get payment
        const payment = await payment.findById(paymentId)
            .populate("jobId", "title status")
            .populate("costumerId", "name email");

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Payment retrieved successfully",
            data: payment
        });
    } catch (error) {
        console.error("Get payment error: ", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve payment"
        });
    }
};

export { initializePayment, verifyPayment, getPaymentHistory, getPayment };