import "dotenv/config";
import { buildApp } from "./app.js";
import { startCronJobs } from "./services/cron.js";
import { seedSubscriptions } from "./routes/subscriptions.js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./db/client.js";

const PORT = parseInt(process.env.PORT ?? "6050", 10);

async function main() {
  await migrate(db, { migrationsFolder: "./drizzle" });

  const app = await buildApp();

  // Seed default subscription tiers on startup (idempotent)
  await seedSubscriptions();

  startCronJobs();

  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.info(`Server listening on port ${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
