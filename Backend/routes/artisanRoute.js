import express from "express";
import {
  search,
  getById,
  upsertMyProfile,
  addPortfolioItem,
  submitVerification,
  listPendingVerifications,
  reviewVerification,
} from "../controllers/artisanController.js";
import { authenticateUser } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { validateRequest } from "../middleware/validationMiddleware.js";
import {
  upsertProfileValidator,
  addPortfolioItemValidator,
  submitVerificationValidator,
  reviewVerificationValidator,
} from "../validators/artisanValidator.js";

const route = express.Router();

// Public — Dev 2's "Find Suitable Artisans" / "View Artisan Profiles" screens
route.get("/", search);

// Admin verification queue — defined before "/:id" so it isn't swallowed by it
route.get("/verification-queue", authenticateUser, authorizeRoles("admin"), listPendingVerifications);

route.get("/:id", getById);

// Artisan self-service
route.put(
  "/me",
  authenticateUser,
  authorizeRoles("artisan"),
  upsertProfileValidator,
  validateRequest,
  upsertMyProfile
);

route.post(
  "/me/portfolio",
  authenticateUser,
  authorizeRoles("artisan"),
  addPortfolioItemValidator,
  validateRequest,
  addPortfolioItem
);

route.post(
  "/me/verification",
  authenticateUser,
  authorizeRoles("artisan"),
  submitVerificationValidator,
  validateRequest,
  submitVerification
);

// Admin verification decision
route.patch(
  "/:id/verification",
  authenticateUser,
  authorizeRoles("admin"),
  reviewVerificationValidator,
  validateRequest,
  reviewVerification
);

export default route;
