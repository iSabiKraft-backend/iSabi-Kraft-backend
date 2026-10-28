import mongoose from "mongoose";

const { Schema, model } = mongoose;

const notificationSchema = new Schema(
  {
    recipientID: { 
        type: Schema.Types.ObjectId, 
        ref: "User", 
        required: true, 
        index: true 
    },
    senderID: { 
        type: Schema.Types.ObjectId, 
        ref: "User", 
        default: null 
    },
    type: {
      type: String,
      enum: [
        "job_request",
        "quote_submitted",
        "quote_accepted",
        "job_completion_submitted",
        "job_completed",
        "material_payment",
        "balance_payment",
      ],
      required: true,
      index: true,
    },
    title: { 
        type: String, 
        required: true, 
        trim: true, 
        maxlength: 160 
    },
    message: { 
        type: String, 
        required: true, 
        trim: true, 
        maxlength: 
        1000 
    },
    jobID: { 
        type: Schema.Types.ObjectId, 
        ref: "Job", 
        default: null, 
        index: true 
    },
    quoteID: { 
        type: Schema.Types.ObjectId, 
        ref: "Quote", 
        default: null 
    },
    escrowID: { 
        type: Schema.Types.ObjectId, 
        ref: "Escrow", 
        default: null 
    },
    metadata: { 
        type: Schema.Types.Mixed, 
        default: {} 
    },
    readAt: { 
        type: Date, 
        default: null, 
        index: true 
    },
  },
  { timestamps: true, versionKey: false }
);

notificationSchema.index({ recipientID: 1, readAt: 1, createdAt: -1 });

const Notification = model("Notification", notificationSchema);

export default Notification;
