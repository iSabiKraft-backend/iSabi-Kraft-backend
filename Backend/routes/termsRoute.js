import express from "express";
import { getActiveTerms, acceptTerms, publishTerms } from "../controllers/termsController.js";
import { authenticateUser } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { validateRequest } from "../middleware/validationMiddleware.js";
import { acceptTermsValidator, publishTermsValidator } from "../validators/termsValidator.js";

const route = express.Router();

route.get("/", getActiveTerms);

route.post("/accept", authenticateUser, acceptTermsValidator, validateRequest, acceptTerms);

route.post("/", authenticateUser, authorizeRoles("admin"), publishTermsValidator, validateRequest, publishTerms);

export default route;
