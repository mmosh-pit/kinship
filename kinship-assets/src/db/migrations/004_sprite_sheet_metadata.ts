import type { Knex } from "knex";

/**
 * Migration 004: Sprite Sheet Metadata
 *
 * Problem: Sprite assets uploaded as sprite sheets (multi-frame PNGs) have no
 * frame-level metadata. The Flame game engine renders the entire sheet image
 * as one frame → visual shaking/jitter.
 *
 * Solution: Add dedicated columns so the game knows how to slice the sheet
 * into individual frames, map rows to directions, and define animation states.
 *
 * Layout of a typical sprite sheet:
 *
 *   ┌────────┬────────┬────────┬────────┐
 *   │ row 0  │ frame0 │ frame1 │ frame2 │  ← "down" direction
 *   ├────────┼────────┼────────┼────────┤
 *   │ row 1  │ frame0 │ frame1 │ frame2 │  ← "left" direction
 *   ├────────┼────────┼────────┼────────┤
 *   │ row 2  │ frame0 │ frame1 │ frame2 │  ← "right" direction
 *   ├────────┼────────┼────────┼────────┤
 *   │ row 3  │ frame0 │ frame1 │ frame2 │  ← "up" direction
 *   └────────┴────────┴────────┴────────┘
 *            ←─ frame_width ─→
 *   columns = 3, rows = 4
 */
export async function up(knex: Knex): Promise<void> {
  // ── Sprite sheet layout columns ──
  const hasFrameWidth = await knex.schema.hasColumn(
    "asset_metadata",
    "sprite_frame_width",
  );

  if (!hasFrameWidth) {
    await knex.schema.alterTable("asset_metadata", (table) => {
      // Frame dimensions (pixels) — how to slice the sheet
      table.integer("sprite_frame_width").defaultTo(0);
      table.integer("sprite_frame_height").defaultTo(0);

      // Sheet grid layout
      table.integer("sprite_columns").defaultTo(1); // frames per row
      table.integer("sprite_rows").defaultTo(1); // total rows in sheet

      // Anchor point (0.0–1.0) for isometric alignment
      // 0.5, 1.0 = bottom-center (feet) — standard for characters
      // 0.5, 0.5 = true center — good for effects/particles
      table.float("sprite_anchor_x").defaultTo(0.5);
      table.float("sprite_anchor_y").defaultTo(1.0);

      // Padding between frames in the sheet (pixels)
      table.integer("sprite_padding").defaultTo(0);

      // Row → direction mapping
      // e.g. {"0": "down", "1": "left", "2": "right", "3": "up"}
      // null = no directional rows (all frames are same direction)
      table.jsonb("sprite_direction_map").nullable();

      // Per-state animation definitions
      // e.g. {
      //   "idle":  { "row": 0, "start_col": 0, "end_col": 0, "fps": 1,  "loop": true  },
      //   "walk":  { "row": 0, "start_col": 0, "end_col": 2, "fps": 8,  "loop": true  },
      //   "interact": { "row": 0, "start_col": 3, "end_col": 5, "fps": 6, "loop": false }
      // }
      // When direction_map is set, "row" in each state is the COLUMN offset within that direction's row.
      // The actual sheet row = direction_map[current_direction].
      table
        .jsonb("sprite_states")
        .defaultTo(
          '{"idle": {"row": 0, "start_col": 0, "end_col": 0, "fps": 1, "loop": true}}',
        );
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasFrameWidth = await knex.schema.hasColumn(
    "asset_metadata",
    "sprite_frame_width",
  );

  if (hasFrameWidth) {
    await knex.schema.alterTable("asset_metadata", (table) => {
      table.dropColumn("sprite_frame_width");
      table.dropColumn("sprite_frame_height");
      table.dropColumn("sprite_columns");
      table.dropColumn("sprite_rows");
      table.dropColumn("sprite_anchor_x");
      table.dropColumn("sprite_anchor_y");
      table.dropColumn("sprite_padding");
      table.dropColumn("sprite_direction_map");
      table.dropColumn("sprite_states");
    });
  }
}