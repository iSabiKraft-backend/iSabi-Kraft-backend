import express from 'express';
import { UPLOAD_ROOT } from './middleware/uploadMiddleware.js';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// Team routes (singular Route.js convention)
import authRoutes from './routes/authRoute.js';
import disputeRoutes from './routes/disputeRoute.js';
import escrowRoutes from './routes/escrowRoute.js';
import paymentRoutes from './routes/paymentRoute.js';
import termsRoutes from './routes/termsRoute.js';
import userRoutes from './routes/userRoute.js';
import artisanRoutes from './routes/artisanRoute.js';
import adminRoutes from './routes/adminRoute.js';

// Your new modules (plural routes.js convention)
import jobRoutes from './routes/jobRoutes.js';
import quoteRoutes from './routes/quoteRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import locationRoutes from './routes/locationRoute.js';
import selfieVerificationRoutes from './routes/selfieVerificationRoute.js';
import notificationRoutes from './routes/notificationRoutes.js';

import { paystackWebhook } from './controllers/paystackWebhookController.js';
import asyncHandler from './utils/asyncHandler.js';
import errorHandler from './middleware/errorHandler.js';

const app = express();

if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
}

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',').map((s) => s.trim()) : false, credentials: true }));

// Paystack webhook needs the RAW body to verify its signature
app.post('/api/payments/paystack/webhook', express.raw({ type: 'application/json' }), paystackWebhook);

// Uploaded profile photos CORS policy relaxation
app.use(
  '/uploads',
  (_req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(UPLOAD_ROOT, { index: false })
);

app.use(express.json({ limit: '1mb' }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Mount all routes
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/verification/selfie', selfieVerificationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/escrow', escrowRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/terms', termsRoutes);
app.use('/api/artisan', artisanRoutes);
app.use('/api/admin', adminRoutes);

app.use((_req, res) => res.status(404).json({ message: 'Route not found' }));
app.use(errorHandler);

export default app;
