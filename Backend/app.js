import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/authRoute.js';
import disputeRoutes from './routes/disputeRoute.js';
import jobRoutes from './routes/jobRoute.js';
import escrowRoutes from './routes/escrowRoute.js';
import paymentRoutes from './routes/paymentRoute.js';
import paystackWebhookRoutes from './routes/paystackWebhookRoute.js';
import termsRoutes from './routes/termsRoute.js';
import userRoutes from './routes/userRoute.js';
import artisanRoutes from './routes/artisanRoute.js';
import adminRoutes from './routes/adminRoute.js';
import { webhook } from './controllers/paymentController.js';
import asyncHandler from './utils/asyncHandler.js';
import errorHandler from './middleware/error-handler.js';

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL?.split(',') || false }));
app.use('/api/payments/paystack/webhook', express.raw({ type: 'application/json' }), asyncHandler(webhook));
app.use(
    express.json({
        verify: (req, res, buffer) => {
            req.rawBody = Buffer.from(buffer);
        },
    })
);
app.use("/api/webhooks/paystack", paystackWebhookRoutes);
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use("/api/disputes", disputeRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/artisan', artisanRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/escrow', escrowRoutes);
app.use('/api/users', userRoutes);
app.use('/api/terms', termsRoutes);
app.use((_req, res) => res.status(404).json({ message: 'Route not found' }));
app.use(errorHandler);
export default app;
