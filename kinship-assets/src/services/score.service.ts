// ============================================================
// Kinship Assets — Score Service
//
// Manages player scores per game:
//   - Upsert cumulative score on challenge completion
//   - Build leaderboard with rank information
//   - Delete player score records
// ============================================================

import db from "../config/database";
import logger from "../utils/logger";
import { v4 as uuidv4 } from "uuid";

// ─── Types ───────────────────────────────────────────────────────

export interface SaveScoreInput {
  game_id: string;
  player_id: string;
  player_name?: string;
  score: number;
  scene_id?: string;
  completed_challenges?: string[];
  collected_coins?: string[]; // Coin keys collected this session e.g. "gold_coin_8_5"
}

export interface ScoreRecord {
  id: string;
  game_id: string;
  player_id: string;
  player_name: string | null;
  total_score: number;
  scene_id: string | null;
  completed_challenges: string[];
  collected_coins: string[];
  created_at: Date;
  updated_at: Date;
}

export interface LeaderboardEntry {
  rank: number;
  player_id: string;
  player_name: string;
  total_score: number;
  scene_id: string | null;
  completed_challenges: string[];
  collected_coins: string[];
  updated_at: Date;
}

export interface SaveScoreResult {
  status: "created" | "updated";
  game_id: string;
  player_id: string;
  player_name: string;
  total_updated_score: number;
  scene_id: string | null;
  completed_challenges: string[];
  collected_coins: string[];
  rank: number;
  total_players: number;
  leaderboard: LeaderboardEntry[];
}

export interface ListScoresResult {
  game_id: string;
  leaderboard: LeaderboardEntry[];
  total_players: number;
  pagination: {
    limit: number;
    offset: number;
    has_more: boolean;
  };
  player_score: LeaderboardEntry | null;
}

// ─── Score Service ────────────────────────────────────────────────

class ScoreService {
  private readonly TABLE = "game_scores";

  // ── Save (upsert) ──────────────────────────────────────────────

  /**
   * Upserts a player's score for a game.
   * If the player already has a record, the provided score is ADDED
   * to their existing total. Otherwise a new record is created.
   *
   * Returns the updated total, rank and top-10 leaderboard.
   */
  async saveScore(input: SaveScoreInput): Promise<SaveScoreResult> {
    const { game_id, player_id, score, scene_id } = input;
    const player_name = input.player_name ?? "Player";
    const incoming_challenges = input.completed_challenges ?? [];
    const incoming_coins = input.collected_coins ?? [];

    // Check existing record
    const existing = await db<ScoreRecord>(this.TABLE)
      .where({ game_id, player_id })
      .first();

    let total_score: number;
    let merged_challenges: string[];
    let merged_coins: string[];
    let status: "created" | "updated";

    if (existing) {
      // Parse existing challenges (stored as jsonb, may come back as string)
      const existingChallenges: string[] =
        typeof existing.completed_challenges === "string"
          ? JSON.parse(existing.completed_challenges)
          : existing.completed_challenges ?? [];

      const existingCoins: string[] =
        typeof existing.collected_coins === "string"
          ? JSON.parse(existing.collected_coins)
          : existing.collected_coins ?? [];

      // Union-merge: keep all existing + any new ones (no duplicates)
      merged_challenges = Array.from(
        new Set([...existingChallenges, ...incoming_challenges])
      );
      merged_coins = Array.from(
        new Set([...existingCoins, ...incoming_coins])
      );
      total_score = existing.total_score + score;

      await db<ScoreRecord>(this.TABLE)
        .where({ game_id, player_id })
        .update({
          total_score,
          player_name,
          scene_id: scene_id ?? existing.scene_id,
          completed_challenges: JSON.stringify(merged_challenges) as any,
          collected_coins: JSON.stringify(merged_coins) as any,
          updated_at: db.fn.now() as any,
        });
      status = "updated";
      logger.debug(
        `[ScoreService] Updated score for player=${player_id} game=${game_id} total=${total_score} challenges=${merged_challenges.length} coins=${merged_coins.length}`
      );
    } else {
      merged_challenges = [...new Set(incoming_challenges)];
      merged_coins = [...new Set(incoming_coins)];
      total_score = score;
      await db<Omit<ScoreRecord, "id" | "created_at" | "updated_at">>(
        this.TABLE
      ).insert({
        id: uuidv4(),
        game_id,
        player_id,
        player_name,
        total_score,
        scene_id: scene_id ?? null,
        completed_challenges: JSON.stringify(merged_challenges) as any,
        collected_coins: JSON.stringify(merged_coins) as any,
      } as any);
      status = "created";
      logger.debug(
        `[ScoreService] Created score for player=${player_id} game=${game_id} total=${total_score} challenges=${merged_challenges.length} coins=${merged_coins.length}`
      );
    }

    const { rank, total_players } = await this._getPlayerRank(
      game_id,
      player_id,
      total_score
    );
    const leaderboard = await this._getLeaderboard(game_id, 10, 0);

    return {
      status,
      game_id,
      player_id,
      player_name,
      total_updated_score: total_score,
      scene_id: scene_id ?? null,
      completed_challenges: merged_challenges,
      collected_coins: merged_coins,
      rank,
      total_players,
      leaderboard,
    };
  }

  // ── List / Leaderboard ─────────────────────────────────────────

  /**
   * Returns the leaderboard for a game (sorted high → low),
   * plus the requesting player's own score entry.
   */
  async listScores(
    game_id: string,
    limit: number,
    offset: number,
    player_id?: string
  ): Promise<ListScoresResult> {
    const leaderboard = await this._getLeaderboard(game_id, limit, offset);

    // Total player count
    const [{ count }] = await db(this.TABLE)
      .where({ game_id })
      .count("id as count");
    const total_players = Number(count);

    // Player's own entry (if requested)
    let player_score: LeaderboardEntry | null = null;
    if (player_id) {
      player_score = await this._getPlayerEntry(game_id, player_id);
    }

    return {
      game_id,
      leaderboard,
      total_players,
      pagination: {
        limit,
        offset,
        has_more: offset + leaderboard.length < total_players,
      },
      player_score,
    };
  }

  // ── Delete ─────────────────────────────────────────────────────

  /**
   * Deletes a player's score record for a specific game.
   */
  async deleteScore(game_id: string, player_id: string): Promise<boolean> {
    const deleted = await db<ScoreRecord>(this.TABLE)
      .where({ game_id, player_id })
      .delete();

    if (deleted) {
      logger.debug(
        `[ScoreService] Deleted score for player=${player_id} game=${game_id}`
      );
    }
    return deleted > 0;
  }

  // ── Private Helpers ────────────────────────────────────────────

  private async _getLeaderboard(
    game_id: string,
    limit: number,
    offset: number
  ): Promise<LeaderboardEntry[]> {
    const rows = await db<ScoreRecord>(this.TABLE)
      .where({ game_id })
      .orderBy("total_score", "desc")
      .orderBy("updated_at", "asc") // tie-break: earlier is higher
      .limit(limit)
      .offset(offset)
      .select(
        "player_id",
        "player_name",
        "total_score",
        "scene_id",
        "completed_challenges",
        "collected_coins",
        "updated_at"
      );

    return rows.map((row, index) => ({
      rank: offset + index + 1,
      player_id: row.player_id,
      player_name: row.player_name ?? "Player",
      total_score: row.total_score,
      scene_id: row.scene_id,
      completed_challenges:
        typeof row.completed_challenges === "string"
          ? JSON.parse(row.completed_challenges)
          : row.completed_challenges ?? [],
      collected_coins:
        typeof row.collected_coins === "string"
          ? JSON.parse(row.collected_coins)
          : row.collected_coins ?? [],
      updated_at: row.updated_at,
    }));
  }

  private async _getPlayerRank(
    game_id: string,
    player_id: string,
    player_total_score: number
  ): Promise<{ rank: number; total_players: number }> {
    // Players with a strictly higher score
    const [{ count: above }] = await db(this.TABLE)
      .where({ game_id })
      .where("total_score", ">", player_total_score)
      .count("id as count");

    const [{ count: total }] = await db(this.TABLE)
      .where({ game_id })
      .count("id as count");

    return {
      rank: Number(above) + 1,
      total_players: Number(total),
    };
  }

  private async _getPlayerEntry(
    game_id: string,
    player_id: string
  ): Promise<LeaderboardEntry | null> {
    const row = await db<ScoreRecord>(this.TABLE)
      .where({ game_id, player_id })
      .first();

    if (!row) return null;

    const { rank, total_players } = await this._getPlayerRank(
      game_id,
      player_id,
      row.total_score
    );

    return {
      rank,
      player_id: row.player_id,
      player_name: row.player_name ?? "Player",
      total_score: row.total_score,
      scene_id: row.scene_id,
      completed_challenges:
        typeof row.completed_challenges === "string"
          ? JSON.parse(row.completed_challenges)
          : row.completed_challenges ?? [],
      collected_coins:
        typeof row.collected_coins === "string"
          ? JSON.parse(row.collected_coins)
          : row.collected_coins ?? [],
      updated_at: row.updated_at,
    };
  }
}

export const scoreService = new ScoreService();