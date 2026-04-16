import { Router, Request, Response } from "express";
import { assetService } from "../services/asset.service";
import { storageService } from "../services/storage.service";
import {
  notifyAssetCreated,
  notifyAssetUpdated,
  notifyAssetDeleted,
  notifyMetadataUpdated,
} from "../services/webhook.notifier";
import { validate, upload } from "../middleware";
import {
  CreateAssetSchema,
  UpdateAssetSchema,
  AssetQuerySchema,
  CreateMetadataSchema,
  UpdateMetadataSchema,
} from "../models/validators";
import imageSize from "image-size";

const router = Router();

// ==========================================
// ASSET ENDPOINTS
// ==========================================

/**
 * @swagger
 * /assets:
 *   get:
 *     tags: [Assets]
 *     summary: List assets with filtering and pagination
 *     parameters:
 *       - in: query
 *         name: platform_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter assets by platform
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [tile, sprite, object, npc, avatar, ui, audio, tilemap, animation]
 *       - in: query
 *         name: scene_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter assets belonging to a scene (via junction table)
 *       - in: query
 *         name: scene_type
 *         schema:
 *           type: string
 *           enum: [gym, garden, farm, shared, lobby]
 *       - in: query
 *         name: tags
 *         schema:
 *           type: string
 *         description: Comma-separated tags
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           default: created_at
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: Paginated list of assets
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 */
router.get(
  "/",
  validate(AssetQuerySchema, "query"),
  async (req: Request, res: Response) => {
    try {
      const params = req.query as any;
      if (params.tags && typeof params.tags === "string") {
        params.tags = params.tags.split(",");
      }
      if (params.is_active !== undefined) {
        params.is_active = params.is_active === "true";
      }

      const result = await assetService.list(params);
      res.json(result);
    } catch (error) {
      res
        .status(500)
        .json({
          error: "Failed to list assets",
          message: (error as Error).message,
        });
    }
  },
);

/**
 * @swagger
 * /assets/{id}:
 *   get:
 *     tags: [Assets]
 *     summary: Get asset by ID (includes metadata)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Asset with metadata
 *       404:
 *         description: Asset not found
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const asset = await assetService.getById(req.params.id);
    if (!asset) {
      res.status(404).json({ error: "Not Found", message: "Asset not found" });
      return;
    }
    res.json(asset);
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to get asset",
        message: (error as Error).message,
      });
  }
});

/**
 * @swagger
 * /assets:
 *   post:
 *     tags: [Assets]
 *     summary: Create a new asset with file upload
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, name, display_name, type, created_by]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               name:
 *                 type: string
 *               display_name:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [tile, sprite, object, npc, avatar, ui, audio, tilemap, animation]
 *               meta_description:
 *                 type: string
 *                 description: Rich description of the asset for AI context and search
 *               tags:
 *                 type: string
 *                 description: JSON array as string
 *               platform_id:
 *                 type: string
 *                 format: uuid
 *                 description: Platform this asset belongs to
 *               created_by:
 *                 type: string
 *     responses:
 *       201:
 *         description: Asset created
 *       400:
 *         description: Validation error
 */
router.post("/", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res
        .status(400)
        .json({ error: "Validation Error", message: "File is required" });
      return;
    }

    // Parse tags from string
    let tags: string[] = [];
    if (req.body.tags) {
      try {
        tags = JSON.parse(req.body.tags);
      } catch {
        tags = req.body.tags.split(",").map((t: string) => t.trim());
      }
    }

    // Validate body
    const validation = CreateAssetSchema.safeParse({ ...req.body, tags });
    if (!validation.success) {
      res.status(400).json({
        error: "Validation Error",
        details: validation.error.errors,
      });
      return;
    }

    // Upload to GCS
    const uploadResult = await storageService.uploadFile({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      assetType: validation.data.type,
    });

    // Create asset record — now includes platform_id
    const asset = await assetService.create({
      ...validation.data,
      file_url: uploadResult.fileUrl,
      file_size: uploadResult.fileSize,
      mime_type: uploadResult.mimeType,
    });

    // Auto-measure image dimensions and store in metadata
    if (req.file.mimetype.startsWith("image/")) {
      try {
        const dimensions = imageSize(req.file.buffer);
        if (dimensions.width && dimensions.height) {
          await assetService.setPixelDimensions(
            asset.id,
            dimensions.width,
            dimensions.height,
          );
        }
      } catch (dimErr) {
        // Non-fatal: dimensions are nice-to-have
        console.warn(`Could not measure dimensions for ${asset.name}:`, dimErr);
      }
    }

    res.status(201).json(asset);
    notifyAssetCreated(asset);
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to create asset",
        message: (error as Error).message,
      });
  }
});

/**
 * @swagger
 * /assets/{id}:
 *   patch:
 *     tags: [Assets]
 *     summary: Update asset properties
 */
router.patch(
  "/:id",
  validate(UpdateAssetSchema),
  async (req: Request, res: Response) => {
    try {
      const asset = await assetService.update(
        req.params.id,
        req.body,
        req.body.updated_by || "system",
      );
      if (!asset) {
        res
          .status(404)
          .json({ error: "Not Found", message: "Asset not found" });
        return;
      }
      res.json(asset);
      notifyAssetUpdated(asset);
    } catch (error) {
      res
        .status(500)
        .json({
          error: "Failed to update asset",
          message: (error as Error).message,
        });
    }
  },
);

/**
 * @swagger
 * /assets/{id}:
 *   delete:
 *     tags: [Assets]
 *     summary: Soft-delete or hard-delete an asset
 */
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const deleted = await assetService.delete(req.params.id, req.body.deleted_by || 'system');
    if (!deleted) {
      res.status(404).json({ error: 'Not Found', message: 'Asset not found' });
      return;
    }
    res.status(204).send();
    notifyAssetDeleted(req.params.id);
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to delete asset",
        message: (error as Error).message,
      });
  }
});

// ==========================================
// METADATA ENDPOINTS
// ==========================================

router.get('/:id/metadata', async (req: Request, res: Response) => {
  try {
    const metadata = await assetService.getMetadata(req.params.id);
    if (!metadata) {
      res
        .status(404)
        .json({
          error: "Not Found",
          message: "Metadata not found for this asset",
        });
      return;
    }
    res.json(metadata);
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to get metadata",
        message: (error as Error).message,
      });
  }
});

router.post('/:id/metadata', validate(CreateMetadataSchema), async (req: Request, res: Response) => {
  try {
    const asset = await assetService.getById(req.params.id);
    if (!asset) {
      res.status(404).json({ error: 'Not Found', message: 'Asset not found' });
      return;
    }
    const existing = await assetService.getMetadata(req.params.id);
    if (existing) {
      // Upsert: update existing metadata instead of returning 409
      const metadata = await assetService.updateMetadata(
        req.params.id,
        req.body,
        req.body.updated_by || 'studio_creator'
      );
      res.status(200).json(metadata);
      notifyMetadataUpdated(req.params.id, metadata);
      return;
    }
    const metadata = await assetService.createMetadata(req.params.id, req.body);
    res.status(201).json(metadata);
    notifyMetadataUpdated(req.params.id, metadata);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create metadata', message: (error as Error).message });
  }
});

router.patch('/:id/metadata', validate(UpdateMetadataSchema), async (req: Request, res: Response) => {
  try {
    const metadata = await assetService.updateMetadata(
      req.params.id,
      req.body,
      req.body.updated_by || 'system'
    );
    if (!metadata) {
      res.status(404).json({ error: 'Not Found', message: 'Metadata not found. Use POST to create.' });
      return;
    }
    res.json(metadata);
    notifyMetadataUpdated(req.params.id, metadata);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update metadata', message: (error as Error).message });
  }
});

// ==========================================
// SPECIAL QUERIES
// ==========================================

router.get('/by-facet/:facet', async (req: Request, res: Response) => {
  try {
    const assets = await assetService.getAssetsByFacet(req.params.facet);
    res.json(assets);
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to query by facet",
        message: (error as Error).message,
      });
  }
});

router.get('/:id/audit', async (req: Request, res: Response) => {
  try {
    const logs = await assetService.getAuditLog(req.params.id);
    res.json(logs);
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to get audit log",
        message: (error as Error).message,
      });
  }
});

// ==========================================
// KNOWLEDGE ENDPOINTS (AI-generated)
// ==========================================

router.get("/knowledge/stats", async (req: Request, res: Response) => {
  try {
    const stats = await assetService.getKnowledgeStats();
    res.json(stats);
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to get stats",
        message: (error as Error).message,
      });
  }
});

router.get("/:id/knowledge", async (req: Request, res: Response) => {
  try {
    const knowledge = await assetService.getKnowledge(req.params.id);
    if (!knowledge) {
      res.status(404).json({ error: "Knowledge not found for this asset" });
      return;
    }
    res.json(knowledge);
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to get knowledge",
        message: (error as Error).message,
      });
  }
});

router.put("/:id/knowledge", async (req: Request, res: Response) => {
  try {
    const asset = await assetService.getById(req.params.id);
    if (!asset) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }
    const knowledge = await assetService.upsertKnowledge(
      req.params.id,
      req.body,
    );
    res.json(knowledge);
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to save knowledge",
        message: (error as Error).message,
      });
  }
});

router.delete("/:id/knowledge", async (req: Request, res: Response) => {
  try {
    const deleted = await assetService.deleteKnowledge(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Knowledge not found" });
      return;
    }
    res.status(204).send();
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to delete knowledge",
        message: (error as Error).message,
      });
  }
});

router.post('/backfill-dimensions', async (_req: Request, res: Response) => {
  try {
    const assets = await assetService.list({ is_active: true, limit: 500, page: 1 });
    const imageAssets = assets.data.filter(a => a.mime_type?.startsWith('image/'));

    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const results: { name: string; width: number; height: number }[] = [];

    for (const asset of imageAssets) {
      if (asset.metadata?.pixel_width && asset.metadata.pixel_width > 0) {
        skipped++;
        continue;
      }
      try {
        const response = await fetch(asset.file_url);
        if (!response.ok) { failed++; continue; }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const dimensions = imageSize(buffer);
        if (dimensions.width && dimensions.height) {
          await assetService.setPixelDimensions(
            asset.id,
            dimensions.width,
            dimensions.height,
          );
          results.push({
            name: asset.name,
            width: dimensions.width,
            height: dimensions.height,
          });
          updated++;
        } else {
          failed++;
        }
      } catch (err) {
        failed++;
        console.warn(`Failed to measure ${asset.name}:`, err);
      }
    }

    res.json({ total: imageAssets.length, updated, skipped, failed, results });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Backfill failed", message: (error as Error).message });
  }
});

export default router;
