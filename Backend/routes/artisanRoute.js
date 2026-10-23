import express from "express";
import rateLimit from "express-rate-limit";
import {
  search,
  getById,
  upsertMyProfile,
  addPortfolioItem,
  submitVerification,
  listPendingVerifications,
  reviewVerification,
  options,
  getMyProfile,
  completeProfile,
  uploadDocuments,
  onboardingStatus,
  documentFile,
} from "../controllers/artisanController.js";
import { authenticateUser } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { validateRequest } from "../middleware/validationMiddleware.js";
import { uploadDocuments as documentUpload } from "../middleware/identityUploadMiddleware.js";
import {
  upsertProfileValidator,
  addPortfolioItemValidator,
  submitVerificationValidator,
  reviewVerificationValidator,
  artisanIdParamValidator,
  completeArtisanProfileValidator,
  documentIndexValidator,
} from "../validators/artisanValidator.js";

const route = express.Router();

// Public — Dev 2's "Find Suitable Artisans" / "View Artisan Profiles" screens
route.get("/", search);

// Public — dropdown values for the artisan onboarding screens (declared before "/:id")
route.get("/options", options);

// Admin verification queue — defined before "/:id" so it isn't swallowed by it
route.get("/verification-queue", authenticateUser, authorizeRoles("admin"), listPendingVerifications);

// Artisan self-service GETs — also before "/:id"
route.get("/me", authenticateUser, authorizeRoles("artisan"), getMyProfile);
route.get("/me/onboarding", authenticateUser, authorizeRoles("artisan"), onboardingStatus);

route.get("/:id", artisanIdParamValidator, validateRequest, getById);

// Artisan self-service
route.put(
  "/me",
  authenticateUser,
  authorizeRoles("artisan"),
  upsertProfileValidator,
  validateRequest,
  upsertMyProfile
);

// Onboarding: "Complete Your Profile"
route.put(
  "/me/profile",
  authenticateUser,
  authorizeRoles("artisan"),
  completeArtisanProfileValidator,
  validateRequest,
  completeProfile
);

route.post(
  "/me/portfolio",
  authenticateUser,
  authorizeRoles("artisan"),
  addPortfolioItemValidator,
  validateRequest,
  addPortfolioItem
);

// Onboarding: "Identity Verification" — upload the NIN/BVN slip, then submit
route.post(
  "/me/verification/documents",
  authenticateUser,
  authorizeRoles("artisan"),
  rateLimit({ windowMs: 15 * 60 * 1000, limit: Number(process.env.ID_UPLOAD_RATE_LIMIT || 20), message: { success: false, message: "Too many uploads. Please wait." } }),
  ...documentUpload,
  uploadDocuments
);

route.post(
  "/me/verification",
  authenticateUser,
  authorizeRoles("artisan"),
  submitVerificationValidator,
  validateRequest,
  submitVerification
);

// Admin: view one uploaded ID document
route.get(
  "/:id/verification/documents/:index",
  authenticateUser,
  authorizeRoles("admin"),
  documentIndexValidator,
  validateRequest,
  documentFile
);

// Admin verification decision
route.patch(
  "/:id/verification",
  authenticateUser,
  authorizeRoles("admin"),
  artisanIdParamValidator,
  reviewVerificationValidator,
  validateRequest,
  reviewVerification
);

export default route;

