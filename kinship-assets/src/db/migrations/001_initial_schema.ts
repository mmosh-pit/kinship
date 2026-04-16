import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Enable UUID extension
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // ============================================
  // Scenes table
  // ============================================
  await knex.schema.createTable("scenes", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    table.string("scene_name").notNullable();
    table
      .enum("scene_type", ["gym", "garden", "farm", "shared", "lobby"])
      .notNullable();
    table.string("tile_map_url");
    table.jsonb("spawn_points").defaultTo("[]");
    table
      .jsonb("ambient")
      .defaultTo('{"lighting":"day","weather":"clear","music_track":null}');
    table.integer("version").defaultTo(1);
    table.boolean("is_active").defaultTo(true);
    table.string("created_by").notNullable();
    table.timestamps(true, true);

    table.index(["scene_type"]);
    table.index(["is_active"]);
  });

  // ============================================
  // Assets table
  // ============================================
  await knex.schema.createTable("assets", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    table.string("name").notNullable().unique();
    table.string("display_name").notNullable();
    table
      .enum("type", [
        "tile",
        "sprite",
        "object",
        "npc",
        "avatar",
        "ui",
        "audio",
        "tilemap",
        "animation",
      ])
      .notNullable();
    table.text("meta_description").defaultTo("");
    table.string("file_url").notNullable();
    table.string("thumbnail_url");
    table.bigInteger("file_size").defaultTo(0);
    table.string("mime_type").notNullable();
    table.specificType("tags", "text[]").defaultTo("{}");
    table.integer("version").defaultTo(1);
    table.boolean("is_active").defaultTo(true);
    table.string("created_by").notNullable();
    table.timestamps(true, true);

    table.index(["type"]);
    table.index(["is_active"]);
    table.index(["tags"], undefined, "gin");
  });

  // ============================================
  // Asset Metadata table
  // ============================================
  await knex.schema.createTable("asset_metadata", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    table
      .uuid("asset_id")
      .references("id")
      .inTable("assets")
      .onDelete("CASCADE")
      .unique();

    // AOE
    table
      .enum("aoe_shape", ["circle", "rectangle", "polygon", "none"])
      .defaultTo("none");
    table.float("aoe_radius");
    table.float("aoe_width");
    table.float("aoe_height");
    table.jsonb("aoe_vertices");
    table.enum("aoe_unit", ["tiles", "pixels"]).defaultTo("tiles");

    // Hitbox
    table.float("hitbox_width").defaultTo(1);
    table.float("hitbox_height").defaultTo(1);
    table.float("hitbox_offset_x").defaultTo(0);
    table.float("hitbox_offset_y").defaultTo(0);

    // Interaction
    table
      .enum("interaction_type", [
        "tap",
        "long_press",
        "drag",
        "proximity",
        "none",
      ])
      .defaultTo("tap");
    table.float("interaction_range").defaultTo(1.5);
    table.integer("interaction_cooldown_ms").defaultTo(500);
    table.boolean("interaction_requires_facing").defaultTo(false);

    // HEARTS mapping
    table.enum("hearts_primary_facet", ["H", "E", "A", "R", "T", "Si", "So"]);
    table.enum("hearts_secondary_facet", ["H", "E", "A", "R", "T", "Si", "So"]);
    table.float("hearts_base_delta").defaultTo(0);
    table.text("hearts_description").defaultTo("");

    // States & Animations
    table.specificType("states", "text[]").defaultTo("{idle}");
    table.jsonb("animations").defaultTo("{}");

    // Spawn config
    table.float("spawn_x").defaultTo(0);
    table.float("spawn_y").defaultTo(0);
    table.string("spawn_layer").defaultTo("objects");
    table.integer("spawn_z_index").defaultTo(1);
    table.string("spawn_facing").defaultTo("south");

    // Rules
    table.string("requires_item");
    table.integer("max_users").defaultTo(1);
    table.text("description").defaultTo("");
    table.boolean("is_movable").defaultTo(false);
    table.boolean("is_destructible").defaultTo(false);
    table.integer("level_required").defaultTo(0);

    // Flexible extra properties
    table.jsonb("custom_properties").defaultTo("{}");

    table.timestamps(true, true);

    table.index(["asset_id"]);
    table.index(["hearts_primary_facet"]);
    table.index(["interaction_type"]);
  });

  // ============================================
  // Scene-Asset junction table
  // ============================================
  await knex.schema.createTable("scene_assets", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    table
      .uuid("scene_id")
      .references("id")
      .inTable("scenes")
      .onDelete("CASCADE");
    table
      .uuid("asset_id")
      .references("id")
      .inTable("assets")
      .onDelete("CASCADE");
    table.float("position_x").defaultTo(0);
    table.float("position_y").defaultTo(0);
    table.integer("z_index").defaultTo(1);
    table.jsonb("overrides").defaultTo("{}"); // Per-scene metadata overrides
    table.timestamps(true, true);

    table.unique(["scene_id", "asset_id"]);
    table.index(["scene_id"]);
  });

  // ============================================
  // Audit log table
  // ============================================
  await knex.schema.createTable("asset_audit_log", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    table
      .uuid("asset_id")
      .references("id")
      .inTable("assets")
      .onDelete("SET NULL");
    table.string("action").notNullable(); // created, updated, deleted, uploaded, metadata_changed
    table.string("performed_by").notNullable();
    table.jsonb("changes").defaultTo("{}");
    table.timestamp("performed_at").defaultTo(knex.fn.now());

    table.index(["asset_id"]);
    table.index(["performed_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("asset_audit_log");
  await knex.schema.dropTableIfExists("scene_assets");
  await knex.schema.dropTableIfExists("asset_metadata");
  await knex.schema.dropTableIfExists("assets");
  await knex.schema.dropTableIfExists("scenes");
}