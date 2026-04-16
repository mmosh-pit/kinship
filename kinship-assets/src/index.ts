import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import dotenv from 'dotenv';

import { swaggerSpec } from './config/swagger';
import { errorHandler, notFound } from './middleware';
import logger from './utils/logger';

import assetRoutes from './routes/assets';
import sceneRoutes from './routes/scenes';
import healthRoutes from './routes/health';
import uploadRoutes from './routes/upload';
import platformRoutes from './routes/platforms';
import projectRoutes from './routes/projects';
import gameRoutes from './routes/games';
import scoreRoutes from './routes/scores';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// ==========================================
// MIDDLEWARE
// ==========================================

// Security
app.use(helmet());

// CORS
const corsOrigins = (process.env.CORS_ORIGINS || "http://localhost:3000").split(
  ",",
);
app.use(
  cors({
    // origin: corsOrigins,
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

// Rate limiting
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // limit per window per IP
//   standardHeaders: true,
//   legacyHeaders: false,
//   message: { error: 'Too many requests', message: 'Please try again later' },
// });
// app.use('/api/', limiter);

// Upload-specific rate limit (more restrictive)
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Upload limit reached", message: "Please try again later" },
});
app.use("/api/v1/assets", (req, _res, next) => {
  if (req.method === "POST") return uploadLimiter(req, _res, next);
  next();
});

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

// ==========================================
// ROUTES
// ==========================================

// Swagger docs
app.use(
  "/api/docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Kinship Assets API",
  }),
);

// Swagger JSON spec
app.get("/api/docs.json", (_req, res) => {
  res.json(swaggerSpec);
});

// API routes
app.use('/api/v1/platforms', platformRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/games', gameRoutes);
app.use('/api/v1/assets', assetRoutes);
app.use('/api/v1/scenes', sceneRoutes);
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/upload', uploadRoutes);
app.use('/api/upload', uploadRoutes);  // Also mount at /api/upload for kinship-backend
app.use('/api/v1/scores', scoreRoutes);

// Root
app.get("/", (_req, res) => {
  res.json({
    service: "kinship-assets",
    version: "1.0.0",
    docs: "/api/docs",
    health: "/api/v1/health",
  });
});

// Error handling
app.use(notFound);
app.use(errorHandler);

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {
  logger.info(`🚀 Kinship Assets Service running on port ${PORT}`);
  logger.info(`📚 Swagger docs: http://localhost:${PORT}/api/docs`);
  logger.info(`❤️ Health check: http://localhost:${PORT}/api/v1/health`);
});

export default app;