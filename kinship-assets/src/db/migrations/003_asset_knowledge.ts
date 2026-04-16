import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE scene_role_enum AS ENUM (
        'ground_fill', 'path', 'boundary', 'focal_point', 'furniture',
        'shelter', 'accent', 'scatter', 'utility', 'lighting',
        'signage', 'vegetation', 'prop'
      );
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE placement_hint_enum AS ENUM (
        'single', 'pair', 'cluster', 'scatter', 'line', 'ring', 'border', 'grid'
      );
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  const hasTable = await knex.schema.hasTable("asset_knowledge");
  if (!hasTable) {
    await knex.schema.createTable("asset_knowledge", (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
      table
        .uuid("asset_id")
        .references("id")
        .inTable("assets")
        .onDelete("CASCADE")
        .unique();

      table.text("visual_description").notNullable().defaultTo("");
      table.specificType("color_palette", "text[]").defaultTo("{}");
      table.specificType("visual_mood", "text[]").defaultTo("{}");
      table.string("art_style").defaultTo("");

      table.specificType("scene_role", "scene_role_enum").defaultTo("prop");
      table
        .specificType("placement_hint", "placement_hint_enum")
        .defaultTo("single");
      table.specificType("pair_with", "text[]").defaultTo("{}");
      table.specificType("avoid_near", "text[]").defaultTo("{}");
      table.text("composition_notes").defaultTo("");

      table.specificType("suitable_scenes", "text[]").defaultTo("{}");
      table.specificType("suitable_facets", "text[]").defaultTo("{}");
      table.text("therapeutic_use").defaultTo("");
      table.text("narrative_hook").defaultTo("");

      table.string("generated_by").defaultTo("");
      table.timestamp("generated_at").defaultTo(knex.fn.now());
      table.integer("generation_version").defaultTo(1);

      table.timestamps(true, true);
      table.index(["asset_id"]);
      table.index(["scene_role"]);
      table.index(["placement_hint"]);
    });
  }

  // Add Flame rendering columns to asset_metadata (safe: check each)
  const hasPixelWidth = await knex.schema.hasColumn(
    "asset_metadata",
    "pixel_width",
  );
  if (!hasPixelWidth) {
    await knex.schema.alterTable("asset_metadata", (table) => {
      table.integer("pixel_width").defaultTo(0);
      table.integer("pixel_height").defaultTo(0);
      table.float("anchor_x").defaultTo(0.5);
      table.float("anchor_y").defaultTo(1.0);
      table.float("render_scale").defaultTo(1.0);
      table.boolean("allow_flip").defaultTo(false);
      table.float("render_opacity").defaultTo(1.0);
      table.float("sort_offset").defaultTo(0);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("asset_knowledge");
  await knex.schema.alterTable("asset_metadata", (table) => {
    table.dropColumn("pixel_width");
    table.dropColumn("pixel_height");
    table.dropColumn("anchor_x");
    table.dropColumn("anchor_y");
    table.dropColumn("render_scale");
    table.dropColumn("allow_flip");
    table.dropColumn("render_opacity");
    table.dropColumn("sort_offset");
  });
  await knex.raw("DROP TYPE IF EXISTS scene_role_enum");
  await knex.raw("DROP TYPE IF EXISTS placement_hint_enum");
}