import express from "express";
import authRoutes from "./authRoute.js";
import userRoutes from "./userRoute.js";
import artisanRoutes from "./artisanRoute.js";
import termsRoutes from "./termsRoute.js";

const route = express.Router();

route.use("/auth", authRoutes);
route.use("/users", userRoutes);
route.use("/artisans", artisanRoutes);
route.use("/terms", termsRoutes);

// Dev 2 adds, e.g.:
// route.use("/jobs", jobRoutes);
// route.use("/quotes", quoteRoutes);
// route.use("/reviews", reviewRoutes);

// Dev 3 adds, e.g.:
// route.use("/payments", paymentRoutes);
// route.use("/disputes", disputeRoutes);
// route.use("/admin", adminRoutes);

export default route;
