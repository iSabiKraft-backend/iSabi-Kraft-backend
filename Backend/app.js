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
import categoryRoutes from "./routes/category.routes.js";
import { webhook } from "./controllers/payment.controller.js";
import * as paystack from "./services/paystackService.js";
import { confirmPayment } from "./services/escrowService.js";
import asyncHandler from "./utils/asyncHandler.js";
import errorHandler from "./middleware/error-handler.js";
import { verificationChanged } from "./controllers/supabaseWebhook.controller.js";

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

app.use(express.json({ limit: "1mb" }));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));

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

// Paystack sends the customer here after paying. We verify the transaction with
// Paystack server-side (idempotent, same path as the webhook) and then bounce the
// customer back into the app via the deep link. A bare 302 to a custom scheme is
// unreliable in Android Custom Tabs, so we serve a tiny page that redirects with
// JS / meta refresh and also shows a manual "Return to app" button.
app.get("/api/payments/callback", async (req, res) => {
  const reference = String(req.query.reference || req.query.trxref || "");
  const scheme = (process.env.APP_SCHEME || "isabikraft").replace(/[^a-z0-9+.-]/gi, "");
  let status = "pending";
  if (reference) {
    try {
      const tx = await paystack.verifyPayment(reference);
      const payment = await confirmPayment(reference, tx);
      if (payment?.status) status = payment.status;
    } catch (err) {
      console.error("Paystack callback verify failed", reference, err?.message);
    }
  }
  const target = `${scheme}://payment-complete?reference=${encodeURIComponent(reference)}&status=${encodeURIComponent(status)}`;
  const safe = target.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  res
    .status(200)
    .set({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
    })
    .send(`<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0;url=${safe}">
<title>Payment received</title>
<style>body{font-family:system-ui,sans-serif;text-align:center;padding:48px 24px;color:#1a1a1a}
a{display:inline-block;margin-top:24px;padding:14px 28px;background:#208AEF;color:#fff;border-radius:12px;text-decoration:none;font-weight:600}</style>
</head><body><h2>Payment received</h2><p>Returning you to iSabiKraft&hellip;</p>
<a href="${safe}">Return to app</a>
<script>window.location.replace(${JSON.stringify(target).replace(/</g, "\\u003c")});</script>
</body></html>`);
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/users", userRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/escrow", escrowRoutes);
app.use("/api/artisan", artisanRoutes);
app.use("/api/artisans", discoveryRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/disputes", disputeRoutes);
app.use("/api/admin", adminRoutes);

app.use((_req, res) => res.status(404).json({ message: "Route not found" }));
app.use(errorHandler);

export default app;
