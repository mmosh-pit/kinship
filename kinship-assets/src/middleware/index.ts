import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import multer from "multer";
import logger from "../utils/logger";

// --- Zod Validation Middleware ---

export function validate(
  schema: ZodSchema,
  source: "body" | "query" | "params" = "body",
) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = schema.parse(req[source]);
      req[source] = data; // Replace with parsed/cleaned data
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: "Validation Error",
          message: "Invalid request data",
          details: error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        });
        return;
      }
      next(error);
    }
  };
}

// --- Global Error Handler ---

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  logger.error(`${req.method} ${req.path} - Error:`, {
    message: err.message,
    stack: err.stack,
  });

  if (err instanceof multer.MulterError) {
    res.status(400).json({
      error: "Upload Error",
      message: err.message,
    });
    return;
  }

  res.status(500).json({
    error: "Internal Server Error",
    message:
      process.env.NODE_ENV === "production"
        ? "Something went wrong"
        : err.message,
  });
}

// --- Multer Upload Config ---

const maxFileSize =
  parseInt(process.env.MAX_FILE_SIZE_MB || "50") * 1024 * 1024;
const allowedTypes = (
  process.env.ALLOWED_FILE_TYPES || "image/png,image/jpeg,image/webp"
).split(",");

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: maxFileSize },
  fileFilter: (_req, file, cb) => {
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `File type ${file.mimetype} not allowed. Accepted: ${allowedTypes.join(", ")}`,
        ),
      );
    }
  },
});

// --- Not Found Handler ---

export function notFound(req: Request, res: Response) {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.method} ${req.path} not found`,
  });
}
