import { body } from "express-validator";

export const updateUserValidator = [
  body("firstName").optional().trim().notEmpty().withMessage("First name cannot be empty"),

  body("lastName").optional().trim().notEmpty().withMessage("Last name cannot be empty"),

  body("phone").optional().trim().notEmpty().withMessage("Phone number cannot be empty"),
];
