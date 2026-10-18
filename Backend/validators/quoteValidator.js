import { body, param } from "express-validator";
import { validateRequest } from "./jobValidator.js";

// Validate quote creation and update requests
export const quoteValidator = [
  body("labourAmount")
    .notEmpty()
    .withMessage("Labour amount is required")
    .bail()
    .isFloat({ min: 0 })
    .withMessage("Labour amount must be a non-negative number"),

  body("materialAmount")
    .notEmpty()
    .withMessage("Material amount is required")
    .bail()
    .isFloat({ min: 0 })
    .withMessage("Material amount must be a non-negative number"),

  body("scope")
    .trim()
    .notEmpty()
    .withMessage("Quote scope is required")
    .bail()
    .isLength({ min: 10, max: 2000 })
    .withMessage("Quote scope must be between 10 and 2000 characters"),

  body("estimatedDuration")
    .trim()
    .notEmpty()
    .withMessage("Estimated duration is required")
    .bail()
    .isLength({ max: 100 })
    .withMessage("Estimated duration cannot exceed 100 characters"),

  body("expiresAt")
    .optional({ nullable: true })
    .isISO8601()
    .withMessage("Expiry date must be a valid date"),

  // These fields must be controlled by the server
  body(["jobID", "artisanID", "totalAmount", "status", "acceptedAt"])
    .not()
    .exists()
    .withMessage("You cannot set protected quote fields directly"),
];

// Validate quote ID and job ID route parameters
export const quoteIdValidator = [
  param("id")
    .isMongoId()
    .withMessage("Invalid quote ID"),
];

// Reuse the shared validation-error handler
export { validateRequest };

