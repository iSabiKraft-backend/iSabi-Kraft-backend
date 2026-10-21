import { body, param, validationResult } from "express-validator";

const VALID_CATEGORIES = [
  "plumbing",
  "electrical",
  "carpentry",
  "painting",
  "welding",
  "masonry",
  "tiling",
  "ac_repairs",
  "other",
];

// Validate job creation and update requests
export const jobValidator = [
  body("title")
    .if((value, { req }) => req.method === "POST" || value !== undefined)
    .trim()
    .notEmpty()
    .withMessage("Job title is required")
    .bail()
    .isLength({ min: 5, max: 120 })
    .withMessage("Job title must be between 5 and 120 characters"),

  body("description")
    .if((value, { req }) => req.method === "POST" || value !== undefined)
    .trim()
    .notEmpty()
    .withMessage("Job description is required")
    .bail()
    .isLength({ min: 20, max: 3000 })
    .withMessage("Description must be between 20 and 3000 characters"),

  body("category")
    .if((value, { req }) => req.method === "POST" || value !== undefined)
    .trim()
    .isIn(VALID_CATEGORIES)
    .withMessage(`Category must be one of: ${VALID_CATEGORIES.join(", ")}`),

  body("location")
    .if((value, { req }) => req.method === "POST" || value !== undefined)
    .isObject({ strict: true })
    .withMessage("Location must be an object"),

  body("location.address")
    .if((value, { req }) => req.method === "POST" || value !== undefined)
    .trim()
    .notEmpty()
    .withMessage("Job address is required")
    .bail()
    .isLength({ max: 300 })
    .withMessage("Address cannot exceed 300 characters"),

  body("location.area")
    .if((value, { req }) => req.method === "POST" || value !== undefined)
    .trim()
    .notEmpty()
    .withMessage("Job area is required")
    .bail()
    .isLength({ max: 100 })
    .withMessage("Area cannot exceed 100 characters"),

  body("location.city")
    .if((value, { req }) => req.method === "POST" || value !== undefined)
    .trim()
    .notEmpty()
    .withMessage("City is required")
    .bail()
    .isLength({ max: 100 })
    .withMessage("City cannot exceed 100 characters"),

  body("location.state")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("State cannot exceed 100 characters"),

  body("location.coordinates")
    .optional()
    .isArray({ min: 2, max: 2 })
    .withMessage("Coordinates must be an array of [longitude, latitude]")
    .bail()
    .custom((coords) => {
      const [lng, lat] = coords;
      return (
        typeof lng === "number" &&
        lng >= -180 &&
        lng <= 180 &&
        typeof lat === "number" &&
        lat >= -90 &&
        lat <= 90
      );
    })
    .withMessage("Invalid longitude or latitude values"),

  body("photos")
    .optional()
    .isArray({ max: 5 })
    .withMessage("A job can have no more than 5 photos"),

  body("photos.*")
    .optional()
    .isURL({ require_protocol: true })
    .withMessage("Each photo must be a valid URL"),

  body("preferredStartDate")
    .optional({ nullable: true })
    .isISO8601()
    .withMessage("Preferred start date must be a valid date"),

  body([
    "customerID",
    "artisanID",
    "status",
    "completedAt",
    "cancelledAt",
  ])
    .not()
    .exists()
    .withMessage("You cannot set protected job fields directly"),
];

// Validate partial job updates (PATCH)
export const updateJobValidator = [
  body("title")
    .optional()
    .trim()
    .isLength({ min: 5, max: 120 })
    .withMessage("Job title must be between 5 and 120 characters"),

  body("description")
    .optional()
    .trim()
    .isLength({ min: 20, max: 3000 })
    .withMessage("Description must be between 20 and 3000 characters"),

  body("category")
    .optional()
    .isIn(VALID_CATEGORIES)
    .withMessage(`Invalid job category selected`),

  body("location")
    .optional()
    .isObject({ strict: true })
    .withMessage("Location must be an object"),

  body("location.address")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Address cannot be empty")
    .bail()
    .isLength({ max: 300 })
    .withMessage("Address cannot exceed 300 characters"),

  body("location.area")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Area cannot be empty")
    .bail()
    .isLength({ max: 100 })
    .withMessage("Area cannot exceed 100 characters"),

  body("location.city")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("City cannot be empty")
    .bail()
    .isLength({ max: 100 })
    .withMessage("City cannot exceed 100 characters"),

  body("location.state")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("State cannot exceed 100 characters"),

  body("location.coordinates")
    .optional()
    .isArray({ min: 2, max: 2 })
    .withMessage("Coordinates must be an array of [longitude, latitude]")
    .bail()
    .custom((coords) => {
      const [lng, lat] = coords;
      return (
        typeof lng === "number" &&
        lng >= -180 &&
        lng <= 180 &&
        typeof lat === "number" &&
        lat >= -90 &&
        lat <= 90
      );
    })
    .withMessage("Invalid longitude or latitude values"),

  body("photos")
    .optional()
    .isArray({ max: 5 })
    .withMessage("A job can have no more than 5 photos"),

  body("photos.*")
    .optional()
    .isURL({ require_protocol: true })
    .withMessage("Each photo must be a valid URL"),

  body("preferredStartDate")
    .optional({ nullable: true })
    .isISO8601()
    .withMessage("Preferred start date must be a valid date"),

  body([
    "customerID",
    "artisanID",
    "status",
    "completedAt",
    "cancelledAt",
  ])
    .not()
    .exists()
    .withMessage("You cannot set protected job fields directly"),
];

// Validate job ID route parameters
export const jobIdValidator = [
  param("id")
    .isMongoId()
    .withMessage("Invalid job ID"),
];

// Return validation errors as a 400 response
export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: "Validation failed",
      errors: errors.array().map(({ path, msg }) => ({
        field: path,
        message: msg,
      })),
    });
  }

  next();
};

export const requireJobUpdateField = (req, res, next) => {
  const allowedFields = [
    "title",
    "description",
    "category",
    "location",
    "photos",
    "preferredStartDate",
  ];

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