import "dotenv/config";
import { setServers } from "node:dns/promises";
import validateEnv from "./config/env.js";
import connectDB from "./config/db.js";
import app from "./app.js";
import { startArtisanSyncWorker } from "./services/artisanSyncQueue.js";

setServers(["8.8.8.8", "8.8.4.4"]);

validateEnv();
await connectDB();
startArtisanSyncWorker();

const port = Number(process.env.PORT || 4000);

app.listen(port, () => {
  console.log(`iSabiKraft API listening on ${port}`);
});
