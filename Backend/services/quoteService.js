
import mongoose from "mongoose";
import Quote from "../models/quoteModel.js";
import Job from "../models/jobModel.js";


const createError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getJobOrThrow = async (jobID, options = {}) => {
  const job = await Job.findById(jobID, null, options);

  if (!job) {
    throw createError("Job not found", 404);
  }

  return job;
};

const getQuoteOrThrow = async (quoteID, options = {}) => {
  const quote = await Quote.findById(quoteID, null, options);

  if (!quote) {
    throw createError("Quote not found", 404);
  }

  return quote;
};

// Submit a quote for an open job
export const createQuote = async (jobID, artisanID, data) => {
  const {
    labourAmount,
    materialAmount,
    additionalAmount = 0,
    scope,
    estimatedDuration,
    guaranteeTerms = "",
    expiresAt,
  } = data;

  const job = await getJobOrThrow(jobID);

  if (job.status !== "open") {
    throw createError("Quotes can only be submitted for open jobs", 400);
  }

  if (job.customerID.toString() === artisanID.toString()) {
    throw createError("You cannot submit a quote for your own job", 403);
  }

  if (expiresAt && new Date(expiresAt) <= new Date()) {
    throw createError("Quote expiry must be in the future", 400);
  }

  const existingQuote = await Quote.findOne({
    jobID: job._id,
    artisanID,
  });

  if (existingQuote) {
    throw createError(
      "You have already submitted a quote for this job",
      409
    );
  }

  return Quote.create({
    jobID: job._id,
    artisanID,
    labourAmount,
    materialAmount,
    additionalAmount,
    scope,
    estimatedDuration,
    guaranteeTerms,
    expiresAt,
  });
};

// Retrieve all quotes for a job (job owner only)
export const getJobQuotes = async (jobID, customerID) => {
  const job = await getJobOrThrow(jobID);

  if (job.customerID.toString() !== customerID.toString()) {
    throw createError(
      "You are not authorized to view quotes for this job",
      403
    );
  }

  return Quote.find({ jobID: job._id })
    .populate("artisanID", "firstName lastName")
    .sort({ createdAt: -1 });
};

// Retrieve one quote
export const getQuoteById = async (quoteID, userID) => {
  const quote = await Quote.findById(quoteID)
    .populate("artisanID", "firstName lastName")
    .populate("jobID");

  if (!quote) {
    throw createError("Quote not found", 404);
  }

  if (
    String(quote.jobID.customerID) !== String(userID) &&
    String(quote.artisanID._id) !== String(userID)
  ) {
    throw createError("You are not authorized to view this quote", 403);
  }

  return quote;
};

// Accept a quote and assign its artisan to the job.
// Both database updates must succeed together.
export const acceptQuote = async (quoteID, customerID) => {
  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const quote = await getQuoteOrThrow(quoteID, { session });
      const job = await getJobOrThrow(quote.jobID, { session });

      if (job.customerID.toString() !== customerID.toString()) {
        throw createError(
          "Only the job owner can accept a quote",
          403
        );
      }

      if (job.status !== "open") {
        throw createError(
          "A quote can only be accepted while the job is open",
          400
        );
      }

      if (quote.status !== "pending") {
        throw createError("Only pending quotes can be accepted", 400);
      }

      if (quote.expiresAt && quote.expiresAt <= new Date()) {
        throw createError("This quote has expired", 400);
      }

      quote.status = "accepted";
      quote.acceptedAt = new Date();

      await Quote.updateMany(
        { jobID: job._id, _id: { $ne: quote._id }, status: "pending" },
        { $set: { status: "rejected" } },
        { session }
      );

      job.status = "quote_accepted";
      job.artisanID = quote.artisanID;
      job.agreement = {
        quoteID: quote._id,
        labourAmount: quote.labourAmount,
        materialAmount: quote.materialAmount,
        additionalAmount: quote.additionalAmount ?? 0,
        totalAmount: quote.totalAmount,
        scope: quote.scope,
        estimatedDuration: quote.estimatedDuration,
        guaranteeTerms: quote.guaranteeTerms ?? "",
        acceptedAt: quote.acceptedAt,
      };
      job.passportEvents.push({
        type: "quote_accepted",
        actorID: customerID,
        message: "Customer accepted the artisan's quote.",
        metadata: { quoteID: quote._id, totalAmount: quote.totalAmount },
      });

      await quote.save({ session });
      await job.save({ session });

      result = { quote, job };
    });

    return result;
  } finally {
    await session.endSession();
  }
};

// Reject a quote (job owner only)
export const rejectQuote = async (quoteID, customerID) => {
  const quote = await getQuoteOrThrow(quoteID);
  const job = await getJobOrThrow(quote.jobID);

  if (job.customerID.toString() !== customerID.toString()) {
    throw createError("Only the job owner can reject a quote", 403);
  }

  if (job.status !== "open") {
    throw createError("Quotes can only be rejected while the job is open", 400);
  }

  if (quote.status !== "pending") {
    throw createError("Only pending quotes can be rejected", 400);
  }

  quote.status = "rejected";
  await quote.save();

  return quote;
};

// Withdraw a quote (submitting artisan only)
export const withdrawQuote = async (quoteID, artisanID) => {
  const quote = await getQuoteOrThrow(quoteID);

  if (quote.artisanID.toString() !== artisanID.toString()) {
    throw createError(
      "You are not authorized to withdraw this quote",
      403
    );
  }

  if (quote.status !== "pending") {
    throw createError("Only pending quotes can be withdrawn", 400);
  }

  quote.status = "withdrawn";
  await quote.save();

  return quote;
};