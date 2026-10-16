import express from "express";
import { getMe, updateMe, listUsers } from "../controllers/userController.js";
import { authenticateUser } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { updateUserValidator } from "../validators/userValidator.js";
import { validateRequest } from "../middleware/validationMiddleware.js";

const route = express.Router();

route.get("/me", authenticateUser, getMe);

route.patch("/me", authenticateUser, updateUserValidator, validateRequest, updateMe);

// admin-only user list, for the admin dashboard
route.get("/", authenticateUser, authorizeRoles("admin"), listUsers);

export default route;
