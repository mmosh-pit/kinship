import cron from "node-cron";
import { db } from "../db/client.js";
import { receipts } from "../db/schema/index.js";
import { lt, eq } from "drizzle-orm";

// Mirrors the Go backend's hourly receipt renewal check.
export function startCronJobs() {
  // Every hour: mark expired receipts as canceled
  cron.schedule("0 * * * *", async () => {
    try {
      await db
        .update(receipts)
        .set({ isCanceled: true })
        .where(lt(receipts.expiredAt, new Date()));

      console.info("[cron] Receipt renewal check complete");
    } catch (err) {
      console.error("[cron] Receipt renewal check failed", err);
    }
  });
}
