import 'dotenv/config';
import app from './app.js';
import { validateEnv } from './config/env.js';
import connectDB from './config/db.js';
import { purgeExpired } from './services/selfieVerificationService.js';

validateEnv();
await connectDB();
const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`iSabiKraft API listening on ${port}`));

const purge = () => purgeExpired().catch((error) => console.error('Selfie purge failed:', error.message));
purge();
setInterval(purge, 60 * 60 * 1000).unref();
