import { body, param } from "express-validator";
import { CORE_CATEGORIES, EXPERIENCE_LEVELS } from "../models/artisanProfileModel.js";

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
    .bail()
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

// "Identity Verification" -> Submit for Verification
export const submitVerificationValidator = [
  body("idType").isIn(["NIN", "BVN"]).withMessage("idType must be NIN or BVN"),

  // NIN and BVN are both 11 digits
  body("idNumber")
    .isString()
    .withMessage("Enter your 11-digit NIN or BVN")
    .bail()
    .trim()
    .matches(/^\d{11}$/)
    .withMessage("idNumber must be exactly 11 digits"),

  body("dateOfBirth")
    .isISO8601({ strict: true })
    .withMessage("Date of birth must be a valid date (YYYY-MM-DD)")
    .bail()
    .custom((value) => {
      const date = new Date(value);
      if (date > new Date()) throw new Error("Date of birth cannot be in the future");
      if (date < new Date("1900-01-01")) throw new Error("Enter a valid date of birth");
      return true;
    }),

  body("consent")
    .custom((v) => v === true || v === "true")
    .withMessage("You must consent to the verification of your NIN/BVN"),
];

// "Complete Your Profile" (artisan, step 2 of 2 of sign-up)
export const completeArtisanProfileValidator = [
  body("fullName").optional().isString().trim().notEmpty().withMessage("Full name cannot be empty"),

  body("tradeCategory").isIn(CORE_CATEGORIES).withMessage(`Trade category must be one of: ${CORE_CATEGORIES.join(", ")}`),

  body("experienceLevel")
    .isIn(EXPERIENCE_LEVELS.map((l) => l.value))
    .withMessage(`Experience level must be one of: ${EXPERIENCE_LEVELS.map((l) => l.value).join(", ")}`),

  body("state").isString().trim().notEmpty().withMessage("State is required"),

  body("lga").isString().trim().notEmpty().withMessage("LGA is required"),

  body("bio").optional({ values: "falsy" }).isString().trim().isLength({ max: 500 }).withMessage("Bio must be 500 characters or fewer"),

  body("residentialAddress")
    .isString()
    .withMessage("Residential address is required")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("Residential address is required")
    .isLength({ max: 200 })
    .withMessage("Address must be 200 characters or fewer"),
];

export const documentIndexValidator = [
  param("id").isMongoId().withMessage("Invalid artisan id"),
  param("index").isInt({ min: 0, max: 1 }).withMessage("Invalid document index"),
];

export const reviewVerificationValidator = [
  body("decision").isIn(["approved", "rejected"]).withMessage("decision must be approved or rejected"),

  body("tier")
    .optional()
    .isIn(["basic", "verified", "pro"])
    .withMessage("tier must be basic, verified, or pro"),

  // A rejection must say why: the artisan sees this text on the "needs attention" screen and in the notification.
  body("rejectionReason")
    .if(body("decision").equals("rejected"))
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Give a reason when rejecting a verification")
    .isLength({ max: 300 })
    .withMessage("Reason must be 300 characters or fewer"),
  body("rejectionReason").optional({ values: "falsy" }).isString().trim().isLength({ max: 300 }),
];

// Reject malformed ids with a 400 instead of a Postgres "invalid uuid" 500
export const artisanIdParamValidator = [param("id").isMongoId().withMessage("Invalid artisan id")];
