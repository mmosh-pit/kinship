import { Router, Request, Response } from 'express';
import { platformService } from '../services/platform.service';
import { validate } from '../middleware';
import { CreatePlatformSchema, UpdatePlatformSchema, PlatformQuerySchema } from '../models/validators';
import db from '../config/database';
import type { PlatformType } from '../types';

const router = Router();

/**
 * @swagger
 * /platforms:
 *   get:
 *     tags: [Platforms]
 *     summary: List all platforms and/or projects
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [platform, project]
 *         description: Filter by type
 *       - in: query
 *         name: parent_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter projects by parent platform ID
 *       - in: query
 *         name: visibility
 *         schema:
 *           type: string
 *           enum: [public, private, secret]
 *         description: Filter by visibility level
 *       - in: query
 *         name: include_projects
 *         schema:
 *           type: boolean
 *         description: Include projects nested under each platform
 *     responses:
 *       200:
 *         description: List of platforms/projects with asset/game counts
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { type, parent_id, visibility, include_projects } = req.query;

    // If include_projects is true, return platforms with nested projects
    if (include_projects === 'true') {
      const platformsWithProjects = await platformService.listWithProjects({
        visibility: visibility as string | undefined,
      });
      res.json(platformsWithProjects);
      return;
    }

    const platforms = await platformService.list({
      type: type as PlatformType | undefined,
      parent_id: parent_id as string | undefined,
      visibility: visibility as string | undefined,
    });
    res.json(platforms);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list platforms', message: (error as Error).message });
  }
});

/**
 * @swagger
 * /platforms/{id}:
 *   get:
 *     tags: [Platforms]
 *     summary: Get platform by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Platform details with counts
 *       404:
 *         description: Platform not found
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const platform = await platformService.getById(req.params.id);
    if (!platform) {
      res.status(404).json({ error: 'Not Found', message: 'Platform not found' });
      return;
    }
    res.json(platform);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get platform', message: (error as Error).message });
  }
});

/**
 * @swagger
 * /platforms/slug/{slug}:
 *   get:
 *     tags: [Platforms]
 *     summary: Get platform by slug
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Platform details
 *       404:
 *         description: Platform not found
 */
router.get('/slug/:slug', async (req: Request, res: Response) => {
  try {
    const platform = await platformService.getBySlug(req.params.slug);
    if (!platform) {
      res.status(404).json({ error: 'Not Found', message: 'Platform not found' });
      return;
    }
    res.json(platform);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get platform', message: (error as Error).message });
  }
});

/**
 * @swagger
 * /platforms/handle/{handle}:
 *   get:
 *     tags: [Platforms]
 *     summary: Get platform by handle
 *     parameters:
 *       - in: path
 *         name: handle
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Platform details
 *       404:
 *         description: Platform not found
 */
router.get('/handle/:handle', async (req: Request, res: Response) => {
  try {
    const platform = await platformService.getByHandle(req.params.handle);
    if (!platform) {
      res.status(404).json({ error: 'Not Found', message: 'Platform not found' });
      return;
    }
    res.json(platform);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get platform', message: (error as Error).message });
  }
});

/**
 * @swagger
 * /platforms/{id}/projects:
 *   get:
 *     tags: [Platforms]
 *     summary: Get all projects for a platform (from projects table)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of projects
 */
router.get('/:id/projects', async (req: Request, res: Response) => {
  try {
    const projects = await platformService.getProjectsForPlatform(req.params.id);
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list projects', message: (error as Error).message });
  }
});

/**
 * @swagger
 * /platforms:
 *   post:
 *     tags: [Platforms]
 *     summary: Create a new platform or project
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, created_by]
 *             properties:
 *               name:
 *                 type: string
 *               handle:
 *                 type: string
 *                 description: Unique handle (letters, numbers, underscores, periods)
 *               description:
 *                 type: string
 *               icon:
 *                 type: string
 *               color:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [platform, project]
 *               parent_id:
 *                 type: string
 *                 format: uuid
 *                 description: Parent platform ID (required for projects)
 *               presence_id:
 *                 type: string
 *                 description: Linked Presence agent ID
 *               visibility:
 *                 type: string
 *                 enum: [public, private, secret]
 *               knowledge_base_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *               instructions:
 *                 type: string
 *                 description: System prompt for this context
 *               created_by:
 *                 type: string
 *     responses:
 *       201:
 *         description: Platform/Project created
 *       409:
 *         description: Handle already taken
 */
router.post('/', validate(CreatePlatformSchema), async (req: Request, res: Response) => {
  try {
    const platform = await platformService.create(req.body);
    res.status(201).json(platform);
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes('Handle')) {
      res.status(409).json({ error: 'Conflict', message });
    } else {
      res.status(500).json({ error: 'Failed to create platform', message });
    }
  }
});

/**
 * @swagger
 * /platforms/{id}:
 *   patch:
 *     tags: [Platforms]
 *     summary: Update platform
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Platform updated
 *       404:
 *         description: Platform not found
 *       409:
 *         description: Handle already taken
 */
router.patch('/:id', validate(UpdatePlatformSchema), async (req: Request, res: Response) => {
  try {
    const platform = await platformService.update(req.params.id, req.body);
    if (!platform) {
      res.status(404).json({ error: 'Not Found', message: 'Platform not found' });
      return;
    }
    res.json(platform);
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes('Handle')) {
      res.status(409).json({ error: 'Conflict', message });
    } else {
      res.status(500).json({ error: 'Failed to update platform', message });
    }
  }
});

/**
 * @swagger
 * /platforms/{id}/assign-assets:
 *   post:
 *     tags: [Platforms]
 *     summary: Assign specific assets to this platform
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               asset_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *     responses:
 *       200:
 *         description: Assets assigned
 */
router.post('/:id/assign-assets', async (req: Request, res: Response) => {
  try {
    const { asset_ids } = req.body;
    if (!asset_ids || !Array.isArray(asset_ids)) {
      res.status(400).json({ error: 'Bad Request', message: 'asset_ids array is required' });
      return;
    }
    const updated = await db('assets')
      .whereIn('id', asset_ids)
      .update({ platform_id: req.params.id, updated_at: db.fn.now() });
    res.json({ message: `${updated} assets assigned to platform`, count: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign assets', message: (error as Error).message });
  }
});

/**
 * @swagger
 * /platforms/{id}/assign-all-unassigned:
 *   post:
 *     tags: [Platforms]
 *     summary: Assign ALL unassigned assets (platform_id IS NULL) to this platform
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Unassigned assets assigned to platform
 */
router.post('/:id/assign-all-unassigned', async (req: Request, res: Response) => {
  try {
    const updated = await db('assets')
      .whereNull('platform_id')
      .update({ platform_id: req.params.id, updated_at: db.fn.now() });
    res.json({ message: `${updated} unassigned assets assigned to platform`, count: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign assets', message: (error as Error).message });
  }
});

/**
 * @swagger
 * /platforms/{id}:
 *   delete:
 *     tags: [Platforms]
 *     summary: Delete platform (cascades to games)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Platform deleted
 *       404:
 *         description: Platform not found
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await platformService.delete(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Not Found', message: 'Platform not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete platform', message: (error as Error).message });
  }
});

export default router;