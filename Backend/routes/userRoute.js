import express from "express";
import { getMe, updateMe, listUsers, completeProfile, uploadAvatar } from "../controllers/userController.js";
import { authenticateUser } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { updateUserValidator, completeProfileValidator } from "../validators/userValidator.js";
import { validateRequest } from "../middleware/validationMiddleware.js";
import { uploadAvatar as avatarUpload } from "../middleware/uploadMiddleware.js";

const route = express.Router();

route.get("/me", authenticateUser, getMe);

route.patch("/me", authenticateUser, updateUserValidator, validateRequest, updateMe);

// Onboarding step 2 of 2 — "Complete Your Profile"
route.put("/me/profile", authenticateUser, completeProfileValidator, validateRequest, completeProfile);

// Profile photo (multipart/form-data, field "avatar")
route.post("/me/avatar", authenticateUser, ...avatarUpload, uploadAvatar);

// admin-only user list, for the admin dashboard
route.get("/", authenticateUser, authorizeRoles("admin"), listUsers);

export default route;
