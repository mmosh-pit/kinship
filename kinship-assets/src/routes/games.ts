import { Router, Request, Response } from 'express';
import { gameService } from '../services/game.service';
import { validate } from '../middleware';
import { CreateGameSchema, UpdateGameSchema } from '../models/validators';

const router = Router();

/**
 * @swagger
 * /games:
 *   get:
 *     tags: [Games]
 *     summary: List games (optionally filtered by platform)
 *     parameters:
 *       - in: query
 *         name: platform_id
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by platform ID. If not provided, returns all games.
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, published, archived]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: List of games with scene/quest counts
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const platformId = req.query.platform_id as string;
    const options = {
      status: req.query.status as string,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
    };

    // If platform_id is provided, filter by platform; otherwise list all games
    const result = platformId 
      ? await gameService.listByPlatform(platformId, options)
      : await gameService.listAll(options);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list games', message: (error as Error).message });
  }
});

/**
 * @swagger
 * /games/{id}:
 *   get:
 *     tags: [Games]
 *     summary: Get game by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Game details with counts
 *       404:
 *         description: Game not found
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const game = await gameService.getById(req.params.id);
    if (!game) {
      res.status(404).json({ error: 'Not Found', message: 'Game not found' });
      return;
    }
    res.json(game);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get game', message: (error as Error).message });
  }
});

/**
 * @swagger
 * /games:
 *   post:
 *     tags: [Games]
 *     summary: Create a new game
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
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               icon:
 *                 type: string
 *               config:
 *                 type: object
 *                 properties:
 *                   grid_width:
 *                     type: integer
 *                   grid_height:
 *                     type: integer
 *                   tile_width:
 *                     type: integer
 *                   tile_height:
 *                     type: integer
 *               created_by:
 *                 type: string
 *     responses:
 *       201:
 *         description: Game created
 */
router.post('/', validate(CreateGameSchema), async (req: Request, res: Response) => {
  try {
    const game = await gameService.create(req.body);
    res.status(201).json(game);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create game', message: (error as Error).message });
  }
});

/**
 * @swagger
 * /games/{id}:
 *   patch:
 *     tags: [Games]
 *     summary: Update game
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Game updated
 *       404:
 *         description: Game not found
 */
router.patch('/:id', validate(UpdateGameSchema), async (req: Request, res: Response) => {
  try {
    const game = await gameService.update(req.params.id, req.body);
    if (!game) {
      res.status(404).json({ error: 'Not Found', message: 'Game not found' });
      return;
    }
    res.json(game);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update game', message: (error as Error).message });
  }
});

/**
 * @swagger
 * /games/{id}:
 *   delete:
 *     tags: [Games]
 *     summary: Delete game
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Game deleted
 *       404:
 *         description: Game not found
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await gameService.delete(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Not Found', message: 'Game not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete game', message: (error as Error).message });
  }
});

export default router;