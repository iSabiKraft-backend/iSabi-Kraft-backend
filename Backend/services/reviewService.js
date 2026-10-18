
import Review from "../models/reviewModel.js";
import Job from "../models/jobModel.js";

const createError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getReviewOrThrow = async (reviewID) => {
  const review = await Review.findById(reviewID);

  if (!review) {
    throw createError("Review not found", 404);
  }

  return review;
};

// Submit a review for a completed job
export const createReview = async (jobID, customerID, data) => {
  const { rating, comment } = data;

  const job = await Job.findById(jobID);

  if (!job) {
    throw createError("Job not found", 404);
  }

  if (job.customerID.toString() !== customerID.toString()) {
    throw createError(
      "Only the customer who owns this job can submit a review",
      403
    );
  }

  if (job.status !== "completed") {
    throw createError(
      "A review can only be submitted for a completed job",
      400
    );
  }

  if (!job.artisanID) {
    throw createError(
      "This job does not have an assigned artisan",
      400
    );
  }

  const existingReview = await Review.findOne({
    jobID: job._id,
    customerID,
  });

  if (existingReview) {
    throw createError("You have already reviewed this job", 409);
  }

  return Review.create({
    jobID: job._id,
    customerID,
    artisanID: job.artisanID,
    rating,
    comment,
  });
};

// Retrieve reviews for an artisan
export const getArtisanReviews = async (artisanID) => {
  return Review.find({ artisanID })
    .populate("customerID", "firstName lastName")
    .populate("jobID", "title category")
    .sort({ createdAt: -1 });
};

// Retrieve one review
export const getReviewById = async (reviewID) => {
  const review = await Review.findById(reviewID)
    .populate("customerID", "firstName lastName")
    .populate("artisanID", "firstName lastName")
    .populate("jobID", "title category");

  if (!review) {
    throw createError("Review not found", 404);
  }

  return review;
};

// Update a review owned by the customer
export const updateReview = async (
  reviewID,
  customerID,
  data
) => {
  const { rating, comment } = data;
  const review = await getReviewOrThrow(reviewID);

  if (review.customerID.toString() !== customerID.toString()) {
    throw createError(
      "You are not authorized to update this review",
      403
    );
  }

  if (rating !== undefined) {
    review.rating = rating;
  }

  if (comment !== undefined) {
    review.comment = comment;
  }

  await review.save();

  return review;
};

// Delete a review owned by the customer
export const deleteReview = async (reviewID, customerID) => {
  const review = await getReviewOrThrow(reviewID);

  if (review.customerID.toString() !== customerID.toString()) {
    throw createError(
      "You are not authorized to delete this review",
      403
    );
  }

  await review.deleteOne();

  return { message: "Review deleted successfully" };
};