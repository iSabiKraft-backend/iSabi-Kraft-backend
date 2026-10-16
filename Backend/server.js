import app from './app.js';
import { validateEnv } from './config/env.js';
import { connectDatabase } from './config/database.js';

validateEnv();
await connectDatabase();
const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`iSabiKraft API listening on ${port}`));
