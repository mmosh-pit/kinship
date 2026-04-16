import { Router, Request, Response } from "express";
import { scoreService } from "../services/score.service";

const router = Router();

// ============================================================
// POST /api/v1/scores/save
//
// Store or update a player's game score.
// Accumulates score on top of the existing total.
//
// Body:
//   game_id     string  (required)
//   player_id   string  (required)
//   player_name string  (optional, default "Player")
//   score       number  (optional, default 0 — points to add)
//   scene_id    string  (optional)
//
// Response:
//   status              "created" | "updated"
//   total_updated_score number
//   rank                number  (1-based)
//   total_players       number
//   leaderboard         LeaderboardEntry[]  (top 10)
//   game_id, player_id, player_name, scene_id
// ============================================================

/**
 * @swagger
 * /scores/save:
 *   post:
 *     tags: [Scores]
 *     summary: Save or update a player's game score
 *     description: >
 *       Upserts a player score record. If the player already has a record
 *       for this game, the provided `score` is added to their running total.
 *       Returns the updated total, rank, and top-10 leaderboard.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [game_id, player_id]
 *             properties:
 *               game_id:
 *                 type: string
 *               player_id:
 *                 type: string
 *               player_name:
 *                 type: string
 *               score:
 *                 type: number
 *                 default: 0
 *               scene_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Score saved successfully
 */
router.post("/save", async (req: Request, res: Response) => {
  try {
    const { game_id, player_id, player_name, score = 0, scene_id, completed_challenges, collected_coins } = req.body;

    if (!game_id || !player_id) {
      res.status(400).json({
        error: "Bad Request",
        message: "game_id and player_id are required",
      });
      return;
    }

    if (typeof score !== "number" || score < 0) {
      res.status(400).json({
        error: "Bad Request",
        message: "score must be a non-negative number",
      });
      return;
    }

    const result = await scoreService.saveScore({
      game_id,
      player_id,
      player_name,
      score,
      scene_id,
      completed_challenges: Array.isArray(completed_challenges) ? completed_challenges : [],
      collected_coins: Array.isArray(collected_coins) ? collected_coins : [],
    });

    res.status(200).json(result);
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to save score",
        message: (error as Error).message,
      });
  }
});

// ============================================================
// GET /api/v1/scores/list
//
// List leaderboard records from highest to lowest score,
// filtered by game_id, with limit-based pagination.
// Optionally returns the requesting player's own score entry.
//
// Query params:
//   game_id   string  (required)
//   player_id string  (optional — include this player's entry)
//   limit     number  (optional, default 10, max 100)
//   offset    number  (optional, default 0)
//
// Response:
//   game_id        string
//   leaderboard    LeaderboardEntry[]
//   total_players  number
//   pagination     { limit, offset, has_more }
//   player_score   LeaderboardEntry | null
// ============================================================

/**
 * @swagger
 * /scores/list:
 *   get:
 *     tags: [Scores]
 *     summary: List leaderboard (high to low) for a game
 *     parameters:
 *       - in: query
 *         name: game_id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: player_id
 *         schema:
 *           type: string
 *         description: Include this player's own score entry in the response
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Leaderboard data with optional player score
 */
router.get("/list", async (req: Request, res: Response) => {
  try {
    const { game_id, player_id } = req.query as Record<string, string>;

    if (!game_id) {
      res.status(400).json({
        error: "Bad Request",
        message: "game_id query parameter is required",
      });
      return;
    }

    const limit = Math.min(
      parseInt((req.query.limit as string) || "10", 10),
      100
    );
    const offset = Math.max(
      parseInt((req.query.offset as string) || "0", 10),
      0
    );

    const result = await scoreService.listScores(
      game_id,
      limit,
      offset,
      player_id
    );

    res.json(result);
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to list scores",
        message: (error as Error).message,
      });
  }
});

// ============================================================
// DELETE /api/v1/scores/delete
//
// Delete a player's score record for a game.
//
// Query params:
//   game_id   string  (required)
//   player_id string  (required)
//
// Response:
//   status   "deleted" | "not_found"
//   game_id, player_id
// ============================================================

/**
 * @swagger
 * /scores/delete:
 *   delete:
 *     tags: [Scores]
 *     summary: Delete a player's score for a game
 *     parameters:
 *       - in: query
 *         name: game_id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: player_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Score deleted
 *       404:
 *         description: Score not found
 */
router.delete("/delete", async (req: Request, res: Response) => {
  try {
    const { game_id, player_id } = req.query as Record<string, string>;

    if (!game_id || !player_id) {
      res.status(400).json({
        error: "Bad Request",
        message: "game_id and player_id are required",
      });
      return;
    }

    const deleted = await scoreService.deleteScore(game_id, player_id);

    if (!deleted) {
      res.status(404).json({
        status: "not_found",
        message: "No score record found for this game_id and player_id",
        game_id,
        player_id,
      });
      return;
    }

    res.json({
      status: "deleted",
      game_id,
      player_id,
    });
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to delete score",
        message: (error as Error).message,
      });
  }
});

export default router;