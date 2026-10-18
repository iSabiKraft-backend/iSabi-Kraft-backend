import { body, param } from "express-validator";
import { validateRequest } from "./jobValidator.js";



// Validate review creation
export const reviewValidator = [
  body("rating")
    .notEmpty()
    .withMessage("Rating is required")
    .bail()
    .isInt({ min: 1, max: 5 })
    .withMessage("Rating must be a whole number between 1 and 5"),

  body("comment")
    .optional()
    .isString()
    .withMessage("Review comment must be text")
    .bail()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Review comment cannot exceed 1000 characters"),

  // The server must determine the customer and artisan
  // from the authenticated user and job, not the request body.
  body(["jobID", "customerID", "artisanID"])
    .not()
    .exists()
    .withMessage("You cannot set protected review fields directly"),
];


// Validate partial review updates (PATCH)
export const updateReviewValidator = [
  body("rating")
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage("Rating must be a whole number between 1 and 5"),

  body("comment")
    .optional()
    .isString()
    .withMessage("Review comment must be text")
    .bail()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Review comment cannot exceed 1000 characters"),

  body(["jobID", "customerID", "artisanID"])
    .not()
    .exists()
    .withMessage("You cannot change protected review fields"),
];



// Validate review ID and job ID route parameters
export const reviewIdValidator = [
  param("id")
    .isMongoId()
    .withMessage("Invalid review ID"),
];

export const requireReviewUpdateField = (req, res, next) => {
  const allowedFields = ["rating", "comment"];

  const hasAllowedField = allowedFields.some((field) =>
    Object.prototype.hasOwnProperty.call(req.body, field)
  );

  if (!hasAllowedField) {
    return res.status(400).json({
      message: "Provide at least one field to update",
    });
  }

  next();
};

// Reuse the shared validation-error handler
export { validateRequest };


