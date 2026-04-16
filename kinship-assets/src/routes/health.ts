import { Router, Request, Response } from "express";
import db from "../config/database";
import { bucket } from "../config/storage";

const router = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Service health check
 *     responses:
 *       200:
 *         description: Service is healthy
 *       503:
 *         description: Service unhealthy
 */
router.get("/", async (_req: Request, res: Response) => {
  const checks: Record<string, string> = {};

  // Check PostgreSQL
  try {
    await db.raw("SELECT 1");
    checks.database = "healthy";
  } catch {
    checks.database = "unhealthy";
  }

  // Check GCS
  try {
    await bucket.exists();
    checks.storage = "healthy";
  } catch {
    checks.storage = "unhealthy";
  }

  const isHealthy = Object.values(checks).every((v) => v === "healthy");

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "healthy" : "degraded",
    service: "kinship-assets",
    timestamp: new Date().toISOString(),
    checks,
  });
});

export default router;
