import { body } from "express-validator";
import { CORE_CATEGORIES } from "../models/artisanProfileModel.js";

export const upsertProfileValidator = [
  body("businessName").trim().notEmpty().withMessage("Business name is required"),

  body("bio").optional().trim().isLength({ max: 1000 }).withMessage("Bio must be 1000 characters or fewer"),

  body("yearsExperience")
    .optional()
    .isInt({ min: 0, max: 60 })
    .withMessage("Years of experience must be between 0 and 60"),

  body("categories")
    .isArray({ min: 1 })
    .withMessage("Select at least one category")
    .custom((value) => value.every((c) => CORE_CATEGORIES.includes(c)))
    .withMessage(`Categories must be one of: ${CORE_CATEGORIES.join(", ")}`),

  body("state").trim().notEmpty().withMessage("State is required"),

  body("lga").trim().notEmpty().withMessage("LGA is required"),

  body("address").optional().trim(),
];

export const addPortfolioItemValidator = [
  body("url").trim().isURL().withMessage("A valid portfolio item URL is required"),

  body("type").isIn(["photo", "video"]).withMessage("Type must be photo or video"),

  body("caption").optional().trim().isLength({ max: 200 }).withMessage("Caption must be 200 characters or fewer"),
];

export const submitVerificationValidator = [
  body("idType").isIn(["NIN", "BVN"]).withMessage("idType must be NIN or BVN"),

  body("idNumber")
    .trim()
    .isLength({ min: 10, max: 11 })
    .withMessage("idNumber must be 10-11 digits"),
];

export const reviewVerificationValidator = [
  body("decision").isIn(["approved", "rejected"]).withMessage("decision must be approved or rejected"),

  body("tier")
    .optional()
    .isIn(["basic", "verified", "pro"])
    .withMessage("tier must be basic, verified, or pro"),

  body("rejectionReason").optional().trim().isLength({ max: 300 }),
];
