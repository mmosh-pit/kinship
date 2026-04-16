import type { Knex } from "knex";

/**
 * Migration 006: Add movement personality
 *
 * Personality drives HOW a sprite behaves — its behavior weights, timing,
 * and movement style. Combined with the available sprite_sheet states,
 * the game engine can produce natural, scene-appropriate movement for
 * any asset type (creatures, NPCs, ambient objects, etc.)
 *
 * Options:
 *   calm       → long rests, slow gentle movement, peaceful
 *   energetic  → short rests, faster movement, frequent changes
 *   nervous    → many alerts, quick turns, restless
 *   lazy       → mostly resting, rare slow movement
 *   curious    → moderate pace, varied exploration
 *   guard      → stays close to post, mostly idle, short patrols
 *   ambient    → stationary, just loops animation
 *   playful    → bouncy, quick movements, frequent emotes
 */
export async function up(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn(
    "asset_metadata",
    "move_personality",
  );
  if (!hasCol) {
    await knex.schema.alterTable("asset_metadata", (table) => {
      table.string("move_personality", 30).defaultTo("");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn(
    "asset_metadata",
    "move_personality",
  );
  if (hasCol) {
    await knex.schema.alterTable("asset_metadata", (table) => {
      table.dropColumn("move_personality");
    });
  }
}