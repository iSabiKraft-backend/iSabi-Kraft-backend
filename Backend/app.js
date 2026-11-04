import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import userRoutes from "./routes/user.routes.js";
import jobRoutes from "./routes/job.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import escrowRoutes from "./routes/escrow.routes.js";
import artisanRoutes from "./routes/artisan.routes.js";
import disputeRoutes from "./routes/dispute.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import discoveryRoutes from "./routes/discovery.routes.js";
import reviewRoutes from "./routes/review.routes.js";
import { webhook } from "./controllers/payment.controller.js";
import asyncHandler from "./utils/asyncHandler.js";
import errorHandler from "./middleware/error-handler.js";
import { verificationChanged } from "./controllers/supabaseWebhook.controller.js";
import aiMatchingRoutes from "./routes/aiMatching.routes.js";


const app = express();

const trustProxyHops = Number(process.env.TRUST_PROXY || 0);
if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
  app.set("trust proxy", trustProxyHops);
}

app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL
      ? process.env.CLIENT_URL.split(",").map((s) => s.trim())
      : false,
  }),
);
app.use(
  "/api/internal/ai-matching",
  aiMatchingRoutes
);

app.post(
  "/api/webhooks/supabase/artisan-verification",
  express.json({ limit: "256kb" }),
  asyncHandler(verificationChanged),
);
app.post(
  "/api/webhooks/supabase/artisan-profile",
  express.json({ limit: "256kb" }),
  asyncHandler(verificationChanged),
);
app.post(
  "/api/webhooks/supabase/user-profile",
  express.json({ limit: "256kb" }),
  asyncHandler(verificationChanged),
);

app.post(
  "/api/payments/paystack/webhook",
  express.raw({ type: "*/*", limit: "1mb" }),
  asyncHandler(webhook),
);

app.use(express.json({ limit: "1mb" }));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/users", userRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/escrow", escrowRoutes);
app.use("/api/artisan", artisanRoutes);
app.use("/api/artisans", discoveryRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/disputes", disputeRoutes);
app.use("/api/admin", adminRoutes);

app.use((_req, res) => res.status(404).json({ message: "Route not found" }));
app.use(errorHandler);

export default app;
