import express from 'express';
import { UPLOAD_ROOT } from './middleware/uploadMiddleware.js';
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

if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',') : false }));

// Paystack webhook needs the RAW body to verify its signature, so it must be
// registered before express.json().
app.post('/api/payments/paystack/webhook', express.raw({ type: 'application/json' }), webhook);

// Uploaded profile photos. helmet's default CORP header would stop the frontend
// (a different origin) from displaying them, so relax it for this path only.
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
