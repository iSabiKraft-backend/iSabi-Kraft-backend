import { body } from "express-validator";
import { normalizePhone } from "../utils/identifier.js";

export const updateUserValidator = [
  body("firstName").optional().trim().notEmpty().withMessage("First name cannot be empty"),

  body("lastName").optional().trim().notEmpty().withMessage("Last name cannot be empty"),

  body("phone")
    .optional()
    .isString()
    .custom((value) => normalizePhone(value) !== null)
    .withMessage("Provide a valid phone number"),
];

// "Complete Your Profile" (step 2 of 2)
export const completeProfileValidator = [
  body("fullName").optional().isString().trim().notEmpty().withMessage("Full name cannot be empty"),

  body("state").isString().trim().notEmpty().withMessage("State is required"),

  body("lga").isString().trim().notEmpty().withMessage("LGA is required"),

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

  body("address").optional({ values: "falsy" }).isString().trim().isLength({ max: 200 }).withMessage("Address must be 200 characters or fewer"),
];
