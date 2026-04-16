import { Router, Request, Response } from "express";
import { sceneService } from "../services/scene.service";
import { validate } from "../middleware";
import { CreateSceneSchema, UpdateSceneSchema } from "../models/validators";

const router = Router();

/**
 * @swagger
 * /scenes:
 *   get:
 *     tags: [Scenes]
 *     summary: List all scenes
 *     parameters:
 *       - in: query
 *         name: scene_type
 *         schema:
 *           type: string
 *           enum: [gym, garden, farm, shared, lobby]
 *       - in: query
 *         name: game_id
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of scenes
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const scenes = await sceneService.list(
      req.query.scene_type as string,
      req.query.game_id as string,
    );
    res.json(scenes);
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to list scenes",
        message: (error as Error).message,
      });
  }
});

/**
 * @swagger
 * /scenes/{id}:
 *   get:
 *     tags: [Scenes]
 *     summary: Get scene by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Scene details
 *       404:
 *         description: Scene not found
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const scene = await sceneService.getById(req.params.id);
    if (!scene) {
      res.status(404).json({ error: "Not Found", message: "Scene not found" });
      return;
    }
    res.json(scene);
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to get scene",
        message: (error as Error).message,
      });
  }
});

/**
 * @swagger
 * /scenes/{id}/manifest:
 *   get:
 *     tags: [Scenes]
 *     summary: Get full scene manifest with all assets and metadata
 *     description: >
 *       Main endpoint consumed by the mobile app and backend orchestration.
 *       Pass `?fullManifest=true` to also receive the GCS-stored JSON manifest
 *       (used by AI-generated scenes). The backend fetches it server-side to
 *       avoid CORS issues when called from the browser.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: fullManifest
 *         schema:
 *           type: boolean
 *         description: >
 *           When true, the GCS manifest JSON stored in tile_map_url is fetched
 *           server-side and returned as `gcsManifest` in the response body.
 *     responses:
 *       200:
 *         description: Full scene manifest with assets
 *       404:
 *         description: Scene not found
 */
router.get("/:id/manifest", async (req: Request, res: Response) => {
  try {
    const fullManifest = req.query.fullManifest === "true";
    const manifest = await sceneService.getFullManifest(
      req.params.id,
      fullManifest,
    );
    if (!manifest) {
      res.status(404).json({ error: "Not Found", message: "Scene not found" });
      return;
    }
    res.json(manifest);
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to get manifest",
        message: (error as Error).message,
      });
  }
});

/**
 * @swagger
 * /scenes:
 *   post:
 *     tags: [Scenes]
 *     summary: Create a new scene
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SceneManifest'
 *     responses:
 *       201:
 *         description: Scene created
 */
router.post(
  "/",
  validate(CreateSceneSchema),
  async (req: Request, res: Response) => {
    try {
      const scene = await sceneService.create(req.body);
      res.status(201).json(scene);
    } catch (error) {
      res
        .status(500)
        .json({
          error: "Failed to create scene",
          message: (error as Error).message,
        });
    }
  },
);

/**
 * @swagger
 * /scenes/{id}:
 *   patch:
 *     tags: [Scenes]
 *     summary: Update scene
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Scene updated
 */
router.patch(
  "/:id",
  validate(UpdateSceneSchema),
  async (req: Request, res: Response) => {
    try {
      const scene = await sceneService.update(req.params.id, req.body);
      if (!scene) {
        res
          .status(404)
          .json({ error: "Not Found", message: "Scene not found" });
        return;
      }
      res.json(scene);
    } catch (error) {
      res
        .status(500)
        .json({
          error: "Failed to update scene",
          message: (error as Error).message,
        });
    }
  },
);

/**
 * @swagger
 * /scenes/{id}:
 *   delete:
 *     tags: [Scenes]
 *     summary: Delete scene
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Scene deleted
 */
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const deleted = await sceneService.delete(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Not Found", message: "Scene not found" });
      return;
    }
    res.status(204).send();
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to delete scene",
        message: (error as Error).message,
      });
  }
});

/**
 * @swagger
 * /scenes/{id}/assets/{assetId}:
 *   post:
 *     tags: [Scenes]
 *     summary: Add asset to scene
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               position:
 *                 type: object
 *                 properties:
 *                   x: { type: number }
 *                   y: { type: number }
 *               z_index:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Asset added to scene
 */
router.post("/:id/assets/:assetId", async (req: Request, res: Response) => {
  try {
    await sceneService.addAssetToScene(
      req.params.id,
      req.params.assetId,
      req.body.position,
      req.body.z_index,
    );
    res.json({ message: "Asset added to scene" });
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to add asset",
        message: (error as Error).message,
      });
  }
});

/**
 * @swagger
 * /scenes/{id}/assets/{assetId}:
 *   delete:
 *     tags: [Scenes]
 *     summary: Remove asset from scene
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *       - in: path
 *         name: assetId
 *         required: true
 *     responses:
 *       204:
 *         description: Asset removed from scene
 */
router.delete("/:id/assets/:assetId", async (req: Request, res: Response) => {
  try {
    await sceneService.removeAssetFromScene(req.params.id, req.params.assetId);
    res.status(204).send();
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to remove asset",
        message: (error as Error).message,
      });
  }
});

export default router;