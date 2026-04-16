import { Router, Request, Response } from "express";
import multer from "multer";
import { storageService } from "../services/storage.service";
import logger from "../utils/logger";

const router = Router();

// Configure multer for memory storage (files stored in buffer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
});

/**
 * @swagger
 * /api/v1/upload:
 *   post:
 *     summary: Upload a file to GCS
 *     tags: [Upload]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               folder:
 *                 type: string
 *                 default: knowledge
 *     responses:
 *       201:
 *         description: File uploaded successfully
 */
router.post("/", upload.single("file"), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const folder = (req.body.folder as string) || "knowledge";

    if (!file) {
      return res.status(400).json({ error: "No file provided" });
    }

    // Upload to GCS
    const result = await storageService.uploadFile({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype || "application/octet-stream",
      assetType: folder,
    });

    logger.info(`File uploaded: ${result.gcsPath}`);

    return res.status(201).json({
      url: result.fileUrl,
      file_url: result.fileUrl,
      filename: file.originalname,
      file_name: file.originalname,
      key: result.gcsPath,
      file_key: result.gcsPath,
      size: result.fileSize,
      mimeType: result.mimeType,
    });
  } catch (error) {
    logger.error("Upload failed:", error);
    return res
      .status(500)
      .json({ error: `Upload failed: ${(error as Error).message}` });
  }
});

/**
 * @swagger
 * /api/v1/upload/{key}:
 *   delete:
 *     summary: Delete a file from GCS
 *     tags: [Upload]
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File deleted successfully
 */
router.delete("/*", async (req: Request, res: Response) => {
  try {
    // Get the full path after /upload/
    const key = req.params[0];

    if (!key) {
      return res.status(400).json({ error: "No file key provided" });
    }

    await storageService.deleteFile(key);

    logger.info(`File deleted: ${key}`);

    return res.status(200).json({ deleted: true, key });
  } catch (error) {
    logger.error("Delete failed:", error);
    return res
      .status(500)
      .json({ error: `Delete failed: ${(error as Error).message}` });
  }
});

/**
 * @swagger
 * /api/v1/upload/{key}/signed-url:
 *   get:
 *     summary: Get a signed URL for private file access
 *     tags: [Upload]
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: expires
 *         schema:
 *           type: integer
 *           default: 60
 *     responses:
 *       200:
 *         description: Signed URL generated
 */
router.get("/*/signed-url", async (req: Request, res: Response) => {
  try {
    // Get the path before /signed-url
    const fullPath = req.params[0];
    const key = fullPath.replace(/\/signed-url$/, "");
    const expiresIn = parseInt((req.query.expires as string) || "60", 10);

    if (!key) {
      return res.status(400).json({ error: "No file key provided" });
    }

    const signedUrl = await storageService.getSignedUrl(key, expiresIn);

    return res.status(200).json({ url: signedUrl, expires_in: expiresIn });
  } catch (error) {
    logger.error("Signed URL generation failed:", error);
    return res
      .status(500)
      .json({
        error: `Failed to generate signed URL: ${(error as Error).message}`,
      });
  }
});

export default router;
