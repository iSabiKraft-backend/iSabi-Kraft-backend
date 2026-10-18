
import * as reviewService from "../services/reviewService.js";

export const createReview = async (req, res) => {
  const review = await reviewService.createReview(
    req.params.jobId,
    req.user.id,
    req.body
  );

  return res.status(201).json({
    success: true,
    message: "Review submitted successfully",
    data: review,
  });
};

export const getArtisanReviews = async (req, res) => {
  const reviews = await reviewService.getArtisanReviews(
    req.params.artisanId
  );

  return res.status(200).json({
    success: true,
    count: reviews.length,
    data: reviews,
  });
};

export const getReviewById = async (req, res) => {
  const review = await reviewService.getReviewById(req.params.id);

  return res.status(200).json({
    success: true,
    data: review,
  });
};

export const updateReview = async (req, res) => {
  const review = await reviewService.updateReview(
    req.params.id,
    req.user.id,
    req.body
  );

  return res.status(200).json({
    success: true,
    message: "Review updated successfully",
    data: review,
  });
};

export const deleteReview = async (req, res) => {
  const result = await reviewService.deleteReview(
    req.params.id,
    req.user.id
  );

  return res.status(200).json({
    success: true,
    ...result,
  });
};