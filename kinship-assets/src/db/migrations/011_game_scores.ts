import type { Knex } from "knex";

// ============================================================
// Migration: 011 — Game Scores
// Creates the game_scores table for player score tracking
// and leaderboard functionality.
//
// Schema:
//   game_id    — references which game this score belongs to
//   player_id  — external player identifier (from game client)
//   player_name — display name for leaderboard
//   total_score — cumulative score (updated on each save)
//   scene_id   — last scene where a score was earned
//   created_at / updated_at — standard timestamps
// ============================================================

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("game_scores", (table) => {
    // Primary key
    table
      .uuid("id")
      .primary()
      .defaultTo(knex.raw("uuid_generate_v4()"));

    // Player & game identifiers
    table.string("game_id").notNullable();
    table.string("player_id").notNullable();
    table.string("player_name").nullable();

    // Score data
    table.integer("total_score").defaultTo(0).notNullable();

    // Context
    table.string("scene_id").nullable();

    // Standard timestamps
    table.timestamps(true, true);

    // Indexes for efficient leaderboard queries
    table.index(["game_id"], "idx_game_scores_game_id");
    table.index(["game_id", "player_id"], "idx_game_scores_game_player");
    table.index(["game_id", "total_score"], "idx_game_scores_game_total");

    // Ensure one record per player per game (upsert target)
    table.unique(["game_id", "player_id"], {
      indexName: "uq_game_scores_game_player",
    });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("game_scores");
}
