
import express from "express";

import { authenticateUser } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

import {
  getDashboard,
  getUsers,
  getUserById,
  getPayments,
  getEscrows,
  getEscrowTransactions,
  getDisputes,
} from "../controllers/adminController.js";

const router = express.Router();

router.use(authenticateUser);
router.use(authorizeRoles("admin"));

router.get("/dashboard", getDashboard);
router.get("/users", getUsers);
router.get("/users/:userId", getUserById);
router.get("/payments", getPayments);
router.get("/escrows", getEscrows);
router.get("/escrow-transactions", getEscrowTransactions);
router.get("/disputes", getDisputes);

export default router;
