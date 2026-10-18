import { body, param } from "express-validator";

export const sessionIdValidator = [param("id").isMongoId().withMessage("Invalid session id")];

export const frameParamsValidator = [
  param("id").isMongoId().withMessage("Invalid session id"),
  param("index").isInt({ min: 0, max: 9 }).withMessage("Invalid frame index"),
];

export const reviewSelfieValidator = [
  param("id").isMongoId().withMessage("Invalid session id"),
  body("decision").isIn(["approved", "rejected"]).withMessage("decision must be approved or rejected"),
  body("rejectionReason").optional().isString().trim().isLength({ max: 300 }),
];

// The consent screen's "I agree" — biometric data is only captured after explicit consent
export const startSessionValidator = [
  body("consent").custom((v) => v === true || v === "true").withMessage("You must consent to the selfie check to continue"),
];
