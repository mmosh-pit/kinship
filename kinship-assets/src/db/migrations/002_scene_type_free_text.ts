import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Convert scene_type from enum to varchar for creator-defined types
  // Check if already converted (scene_type is varchar, not enum)
  const colInfo = await knex.raw(`
    SELECT data_type FROM information_schema.columns 
    WHERE table_name = 'scenes' AND column_name = 'scene_type'
  `);

  const currentType = colInfo.rows?.[0]?.data_type || "";
  if (currentType === "character varying" || currentType === "text") {
    // Already converted, skip
    return;
  }

  // Step 1: Add temp column
  const hasTempCol = await knex.schema.hasColumn("scenes", "scene_type_new");
  if (!hasTempCol) {
    await knex.schema.alterTable("scenes", (table) => {
      table.string("scene_type_new", 100);
    });
  }

  // Step 2: Copy data
  await knex.raw("UPDATE scenes SET scene_type_new = scene_type::text");

  // Step 3: Drop old column and rename
  await knex.schema.alterTable("scenes", (table) => {
    table.dropColumn("scene_type");
  });

  await knex.schema.alterTable("scenes", (table) => {
    table.renameColumn("scene_type_new", "scene_type");
  });

  // Step 4: Make it not nullable
  await knex.raw("ALTER TABLE scenes ALTER COLUMN scene_type SET NOT NULL");

  // Step 5: Re-create index
  await knex.schema.alterTable("scenes", (table) => {
    table.index(["scene_type"]);
  });

  // Drop the old enum type created by Knex
  await knex.raw('DROP TYPE IF EXISTS "scenes_scene_type"');
}

export async function down(knex: Knex): Promise<void> {
  // Revert to enum (will fail if any non-original values exist)
  await knex.schema.alterTable("scenes", (table) => {
    table.dropIndex(["scene_type"]);
  });

  await knex.raw(`
    CREATE TYPE scenes_scene_type AS ENUM ('gym', 'garden', 'farm', 'shared', 'lobby');
    ALTER TABLE scenes ALTER COLUMN scene_type TYPE scenes_scene_type USING scene_type::scenes_scene_type;
  `);
}