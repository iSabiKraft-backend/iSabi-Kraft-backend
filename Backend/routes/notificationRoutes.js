import express from "express";
import { param, query } from "express-validator";
import {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "../controllers/notificationController.js";
import { authenticateUser } from "../middleware/authMiddleware.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = express.Router();

router.use(authenticateUser);

router.get(
  "/",
  [
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("unreadOnly").optional().isBoolean(),
  ],
  asyncHandler(getMyNotifications)
);

router.patch(
  "/read-all",
  asyncHandler(markAllNotificationsRead)
);

router.patch(
  "/:id/read",
  [param("id").isMongoId().withMessage("Invalid notification ID")],
  asyncHandler(markNotificationRead)
);

export default router;
