import type { Knex } from "knex";

// ============================================================
// Migration: 012 — Add completed_challenges to game_scores
//
// Adds a JSONB column to persist the list of completed
// challenge IDs per player per game, so the game client
// can restore challenge state on reload without re-collecting
// already-collected coins/objects.
// ============================================================

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("game_scores", (table) => {
    table
      .jsonb("completed_challenges")
      .defaultTo("[]")
      .notNullable()
      .comment("Array of completed challenge IDs for this player/game");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("game_scores", (table) => {
    table.dropColumn("completed_challenges");
  });
}
