import "dotenv/config";
import { setServers } from "node:dns/promises";
import validateEnv from "./config/env.js";
import connectDB from "./config/db.js";
import app from "./app.js";
import { startArtisanSyncWorker } from "./services/artisanSyncQueue.js";
import Escrow from "./models/escrow.js";
import Payment from "./models/payment.js";

setServers(["8.8.8.8", "8.8.4.4"]);

validateEnv();
await connectDB();

// One-off: set SYNC_INDEXES=true on Render, deploy once, then remove it.
// Drops leftover indexes that are not in the schema (e.g. an old unique index
// that makes Escrow.create fail) and logs what it did.
if (process.env.SYNC_INDEXES === "true") {
  for (const Model of [Escrow, Payment]) {
    try {
      const before = (await Model.collection.indexes()).map((i) => i.name);
      const dropped = await Model.syncIndexes();
      console.log(`[SYNC_INDEXES] ${Model.modelName}: before=${before.join(", ")} dropped=${dropped.join(", ") || "none"}`);
    } catch (e) {
      console.error(`[SYNC_INDEXES] ${Model.modelName} failed:`, e.message);
    }
  }
}
startArtisanSyncWorker();

const port = Number(process.env.PORT || 4000);

app.listen(port, () => {
  console.log(`iSabiKraft API listening on ${port}`);
});
