import { body, query } from "express-validator";
import { normalizePhone } from "../utils/identifier.js";

// Password rules shown under the field on the sign-up / reset screens:
// at least 8 characters, one uppercase letter, one number, one special character.
const passwordRules = (field, label = "Password") =>
  body(field)
    // no .trim(): login doesn't trim, so trimming here would lock out
    // anyone whose password starts/ends with a space
    .isString()
    .withMessage(`${label} is required`)
    .bail()
    .isLength({ min: 8 })
    .withMessage(`${label} must be at least 8 characters long`)
    .matches(/[A-Z]/)
    .withMessage(`${label} needs at least one uppercase letter`)
    .matches(/\d/)
    .withMessage(`${label} needs at least one number`)
    .matches(/[^A-Za-z0-9]/)
    .withMessage(`${label} needs at least one special character`);

const confirmMatches = (passwordField, confirmField, label = "Passwords") =>
  body(confirmField).custom((value, { req }) => value === req.body[passwordField]).withMessage(`${label} do not match`);

const identifierField = (field = "identifier") =>
  body(field).isString().withMessage("Email or phone number is required").bail().trim().notEmpty().withMessage("Email or phone number is required");

// validation rules for "Create a customer account" (step 1 of 2)
export const registerValidator = [
  body("fullName").optional().isString().trim().notEmpty().withMessage("Full name is required"),

  body().custom((value) => {
    if (!value.fullName && !(value.firstName && value.lastName)) throw new Error("Full name is required");
    if (!value.email && !value.phone) throw new Error("Provide an email address or a phone number");
    return true;
  }),

  body("email").optional({ values: "falsy" }).isString().trim().isEmail().withMessage("Provide a valid email address"),

  body("phone")
    .optional({ values: "falsy" })
    .isString()
    .custom((value) => normalizePhone(value) !== null)
    .withMessage("Provide a valid phone number"),

  body("verificationMethod").optional().isIn(["email", "sms"]).withMessage("Verification method must be email or sms"),

  passwordRules("password"),

  confirmMatches("password", "confirmPassword"),

  body("acceptTerms")
    .custom((value) => value === true || value === "true")
    .withMessage("You must agree to the Terms of Service and Privacy Policy"),

  body("role").optional().isIn(["customer", "artisan"]).withMessage("Role must be either customer or artisan"),
];

// "Verify Your Account" — 6-digit code
export const verifyValidator = [
  identifierField(),
  body("code").isString().trim().matches(/^\d{6}$/).withMessage("Enter the 6-digit code"),
];

export const resendVerificationValidator = [identifierField()];

// validation rules for "Welcome Back" (identifier = email or phone; `email` still accepted)
export const loginValidator = [
  body().custom((value) => {
    if (typeof (value.identifier ?? value.email) !== "string" || !(value.identifier ?? value.email).trim()) {
      throw new Error("Email or phone number is required");
    }
    return true;
  }),

  body("password").isString().notEmpty().withMessage("Provide a valid password"),

  body("role").optional().isIn(["customer", "artisan"]).withMessage("Role must be customer or artisan"),

  body("rememberMe").optional().isBoolean().withMessage("rememberMe must be true or false").toBoolean(),
];

// "Forgot Password?"
export const forgotPasswordValidator = [identifierField()];

export const resetTokenQueryValidator = [
  query("token").isString().matches(/^[a-f0-9]{64}$/).withMessage("Invalid reset link"),
];

// "Create New Password"
export const resetPasswordValidator = [
  body("token").isString().matches(/^[a-f0-9]{64}$/).withMessage("Invalid reset link"),
  passwordRules("password", "New password"),
  confirmMatches("password", "confirmPassword", "Passwords"),
];

// "Continue with Google / Apple"
export const socialLoginValidator = [
  body("provider").isIn(["google", "apple"]).withMessage("provider must be google or apple"),
  body("idToken").isString().notEmpty().withMessage("idToken is required"),
  body("role").optional().isIn(["customer", "artisan"]).withMessage("Role must be either customer or artisan"),
  body("fullName").optional().isString().trim(),
];
