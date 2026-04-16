import type { Knex } from "knex";

// ============================================================
// Migration: 013 — Add collected_coins to game_scores
//
// Adds a JSONB column to persist the list of collected item
// keys per player per game, so the game client can hide
// already-collected items on reload.
// ============================================================

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("game_scores", (table) => {
    table
      .jsonb("collected_coins")
      .defaultTo("[]")
      .notNullable()
      .comment("Array of collected item keys (e.g., 'coin_5_3') for this player/game");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("game_scores", (table) => {
    table.dropColumn("collected_coins");
  });
}
