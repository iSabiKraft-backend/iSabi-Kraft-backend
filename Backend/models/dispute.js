import mongoose from "mongoose" ;
const disputeSchema = new mongoose.schema({
    job : {
        type : mongoose.Schema.Types.ObjectId,
        ref: "Job",
        required: true,
    },
    artisan : {
        type: mongoose.Schema.Types.ObjectId,
        ref: "artisan",
        required: true    
    },
    description: { type: String, required: true, trim: true },
    evidence: {
        url: { type: String, required: true },
        note: String,
        _id: false,
    },
    status: {
        type: String,
        enum: ['open', 'under_review', 'resolved', 'dismissed'],
        default: 'open',
        index: true,
    },
    // Filled in by an admin when the dispute is closed
    resolution: {
        decision: { 
            type: String, 
            enum: ['refund_customer', 'release_artisan', 'split', 'dismissed'] 
        },
        customerPercent: { 
            type: Number, 
            min: 0, 
            max: 100 
        }, // share of held money refunded
        note: String,
        resolvedBy: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'User' 
        },
        resolvedAt: Date,
    },
},
    { 
        timestamps: true
    }
);

export default mongoose.model("Dispute", disputeSchema);
