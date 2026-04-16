import { Router, Request, Response } from 'express';
import { projectService } from '../services/project.service';
import { validate } from '../middleware';
import { CreateProjectSchema, UpdateProjectSchema, ProjectQuerySchema } from '../models/validators';

const router = Router();

/**
 * @swagger
 * /projects:
 *   get:
 *     tags: [Projects]
 *     summary: List all projects
 *     parameters:
 *       - in: query
 *         name: platform_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by parent platform ID
 *       - in: query
 *         name: visibility
 *         schema:
 *           type: string
 *           enum: [public, private, secret]
 *         description: Filter by visibility level
 *     responses:
 *       200:
 *         description: List of projects
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { platform_id, visibility } = req.query;

    const projects = await projectService.list({
      platform_id: platform_id as string | undefined,
      visibility: visibility as string | undefined,
    });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list projects', message: (error as Error).message });
  }
});

/**
 * @swagger
 * /projects/{id}:
 *   get:
 *     tags: [Projects]
 *     summary: Get project by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Project details
 *       404:
 *         description: Project not found
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const project = await projectService.getById(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Not Found', message: 'Project not found' });
      return;
    }
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get project', message: (error as Error).message });
  }
});

/**
 * @swagger
 * /projects/handle/{handle}:
 *   get:
 *     tags: [Projects]
 *     summary: Get project by handle
 *     parameters:
 *       - in: path
 *         name: handle
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Project details
 *       404:
 *         description: Project not found
 */
router.get('/handle/:handle', async (req: Request, res: Response) => {
  try {
    const project = await projectService.getByHandle(req.params.handle);
    if (!project) {
      res.status(404).json({ error: 'Not Found', message: 'Project not found' });
      return;
    }
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get project', message: (error as Error).message });
  }
});

/**
 * @swagger
 * /projects:
 *   post:
 *     tags: [Projects]
 *     summary: Create a new project
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [platform_id, name, created_by]
 *             properties:
 *               platform_id:
 *                 type: string
 *                 format: uuid
 *                 description: Parent platform ID
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
 *         description: Project created
 *       404:
 *         description: Platform not found
 *       409:
 *         description: Handle already taken
 */
router.post('/', validate(CreateProjectSchema), async (req: Request, res: Response) => {
  try {
    const project = await projectService.create(req.body);
    res.status(201).json(project);
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes('Handle')) {
      res.status(409).json({ error: 'Conflict', message });
    } else if (message.includes('Platform not found')) {
      res.status(404).json({ error: 'Not Found', message });
    } else {
      res.status(500).json({ error: 'Failed to create project', message });
    }
  }
});

/**
 * @swagger
 * /projects/{id}:
 *   patch:
 *     tags: [Projects]
 *     summary: Update project
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Project updated
 *       404:
 *         description: Project not found
 *       409:
 *         description: Handle already taken
 */
router.patch('/:id', validate(UpdateProjectSchema), async (req: Request, res: Response) => {
  try {
    const project = await projectService.update(req.params.id, req.body);
    if (!project) {
      res.status(404).json({ error: 'Not Found', message: 'Project not found' });
      return;
    }
    res.json(project);
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes('Handle')) {
      res.status(409).json({ error: 'Conflict', message });
    } else {
      res.status(500).json({ error: 'Failed to update project', message });
    }
  }
});

/**
 * @swagger
 * /projects/{id}:
 *   delete:
 *     tags: [Projects]
 *     summary: Delete project
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Project deleted
 *       404:
 *         description: Project not found
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await projectService.delete(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Not Found', message: 'Project not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete project', message: (error as Error).message });
  }
});

export default router;