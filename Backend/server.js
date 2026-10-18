import app from './app.js';
import validateEnv from './config/env.js';
import connectDB from './config/db.js';

validateEnv();

await connectDB();

const port = Number(process.env.PORT || 4000);

app.listen(port, () => {
  console.log(`iSabiKraft API listening on ${port}`);
});