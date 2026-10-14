import { body } from "express-validator";

// validation rules for user registration
export const registerValidator = [
  body("firstName").trim().notEmpty().withMessage("First name is required"),

  body("lastName").trim().notEmpty().withMessage("Last name is required"),

  body("email")
    .trim()
    .isEmail()
    .withMessage("Provide a valid email address")
    .normalizeEmail(),

  body("phone").trim().notEmpty().withMessage("Phone number is required"),

  // no .trim(): login doesn't trim, so trimming here would lock out
  // anyone whose password starts/ends with a space
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long"),

  body("role")
    .optional()
    .isIn(["customer", "artisan"])
    .withMessage("Role must be either customer or artisan"),
];

// validation rules for user login
export const loginValidator = [
  body("email")
    .trim()
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),

  body("password").notEmpty().withMessage("Provide a valid password"),
];
