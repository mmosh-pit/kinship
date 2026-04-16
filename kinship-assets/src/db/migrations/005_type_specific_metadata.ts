import type { Knex } from "knex";

/**
 * Migration 005: Type-Specific Metadata Columns
 *
 * Different asset types need different metadata sections:
 *
 * ┌────────────────┬──────┬────────┬────────┬─────┬────────┬────┬───────┬─────────┬───────────┐
 * │    Section     │ tile │ sprite │ object │ npc │ avatar │ ui │ audio │ tilemap │ animation │
 * ├────────────────┼──────┼────────┼────────┼─────┼────────┼────┼───────┼─────────┼───────────┤
 * │ Tile Config    │  ✓   │        │        │     │        │    │       │         │           │
 * │ Audio Config   │      │        │        │     │        │    │   ✓   │         │           │
 * │ Tilemap Config │      │        │        │     │        │    │       │    ✓    │           │
 * │ Movement       │      │   ✓    │        │  ✓  │   ✓    │    │       │         │           │
 * └────────────────┴──────┴────────┴────────┴─────┴────────┴────┴───────┴─────────┴───────────┘
 *
 * Adds flat columns per section to asset_metadata table.
 */
export async function up(knex: Knex): Promise<void> {
  // ── Tile Config (walkability, terrain, auto-tiling) ──
  const hasTileWalkable = await knex.schema.hasColumn(
    "asset_metadata",
    "tile_walkable",
  );
  if (!hasTileWalkable) {
    await knex.schema.alterTable("asset_metadata", (table) => {
      table.string("tile_walkable", 20).defaultTo("walkable"); // walkable | blocked | slow | hazard
      table.float("tile_terrain_cost").defaultTo(1.0); // pathfinding cost multiplier (1.0=normal, 2.0=slow)
      table.string("tile_terrain_type", 50).defaultTo(""); // grass | stone | water | sand | dirt | wood | snow
      table.string("tile_auto_group", 100).defaultTo(""); // auto-tile group name (e.g. "grass_01" for seamless tiling)
      table.boolean("tile_is_edge").defaultTo(false); // edge/border tile for transitions
    });
  }

  // ── Audio Config (playback, spatialization) ──
  const hasAudioVolume = await knex.schema.hasColumn(
    "asset_metadata",
    "audio_volume",
  );
  if (!hasAudioVolume) {
    await knex.schema.alterTable("asset_metadata", (table) => {
      table.float("audio_volume").defaultTo(1.0); // 0.0–1.0
      table.boolean("audio_loop").defaultTo(true); // loop playback
      table.integer("audio_fade_in_ms").defaultTo(0); // fade in duration
      table.integer("audio_fade_out_ms").defaultTo(0); // fade out duration
      table.boolean("audio_spatial").defaultTo(false); // 3D spatial audio (attenuates with distance)
      table.string("audio_trigger", 30).defaultTo("ambient"); // ambient | proximity | event | interaction
      table.float("audio_radius").defaultTo(5.0); // audible radius in tiles (for spatial)
      table.string("audio_category", 30).defaultTo("sfx"); // sfx | music | ambient | ui | voice
    });
  }

  // ── Tilemap Config (grid dimensions) ──
  const hasTilemapWidth = await knex.schema.hasColumn(
    "asset_metadata",
    "tilemap_grid_width",
  );
  if (!hasTilemapWidth) {
    await knex.schema.alterTable("asset_metadata", (table) => {
      table.integer("tilemap_grid_width").defaultTo(0); // map width in tiles
      table.integer("tilemap_grid_height").defaultTo(0); // map height in tiles
      table.integer("tilemap_tile_size").defaultTo(64); // pixel size per tile
      table.integer("tilemap_layer_count").defaultTo(1); // number of layers
      table.string("tilemap_orientation", 20).defaultTo("isometric"); // isometric | orthogonal | hexagonal
    });
  }

  // ── Movement Config (for animated/mobile entities) ──
  const hasMoveSpeed = await knex.schema.hasColumn(
    "asset_metadata",
    "move_speed",
  );
  if (!hasMoveSpeed) {
    await knex.schema.alterTable("asset_metadata", (table) => {
      table.float("move_speed").defaultTo(1.0); // tiles per second
      table.string("move_type", 30).defaultTo("static"); // static | wander | patrol | follow | flee
      table.float("move_wander_radius").defaultTo(3.0); // wander area in tiles
      table.jsonb("move_patrol_path").nullable(); // [{x,y}, ...] patrol waypoints
      table.boolean("move_avoid_obstacles").defaultTo(true); // use pathfinding
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const columns: Record<string, string[]> = {
    tile: [
      "tile_walkable",
      "tile_terrain_cost",
      "tile_terrain_type",
      "tile_auto_group",
      "tile_is_edge",
    ],
    audio: [
      "audio_volume",
      "audio_loop",
      "audio_fade_in_ms",
      "audio_fade_out_ms",
      "audio_spatial",
      "audio_trigger",
      "audio_radius",
      "audio_category",
    ],
    tilemap: [
      "tilemap_grid_width",
      "tilemap_grid_height",
      "tilemap_tile_size",
      "tilemap_layer_count",
      "tilemap_orientation",
    ],
    movement: [
      "move_speed",
      "move_type",
      "move_wander_radius",
      "move_patrol_path",
      "move_avoid_obstacles",
    ],
  };

  for (const [, cols] of Object.entries(columns)) {
    for (const col of cols) {
      const hasCol = await knex.schema.hasColumn("asset_metadata", col);
      if (hasCol) {
        await knex.schema.alterTable("asset_metadata", (table) => {
          table.dropColumn(col);
        });
      }
    }
  }
}