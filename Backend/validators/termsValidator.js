import { body } from "express-validator";

export const acceptTermsValidator = [
  body("version").trim().notEmpty().withMessage("version is required"),
];

export const publishTermsValidator = [
  body("version").trim().notEmpty().withMessage("version is required"),
  body("content").trim().notEmpty().withMessage("content is required"),
];
