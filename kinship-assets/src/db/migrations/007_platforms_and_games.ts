import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ============================================
  // Platforms table
  // ============================================
  await knex.schema.createTable('platforms', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('name').notNullable();
    table.string('slug').notNullable().unique();
    table.text('description').defaultTo('');
    table.string('icon').defaultTo('🎮');
    table.string('color').defaultTo('#4CADA8');
    table.boolean('is_active').defaultTo(true);
    table.string('created_by').notNullable();
    table.timestamps(true, true);

    table.index(['slug']);
    table.index(['is_active']);
  });

  // ============================================
  // Games table
  // ============================================
  await knex.schema.createTable('games', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('platform_id').notNullable().references('id').inTable('platforms').onDelete('CASCADE');
    table.string('name').notNullable();
    table.string('slug').notNullable();
    table.text('description').defaultTo('');
    table.string('icon').defaultTo('🌿');
    table.enum('status', ['draft', 'published', 'archived']).defaultTo('draft');
    table.uuid('starting_scene_id').nullable();
    table.jsonb('config').defaultTo(JSON.stringify({
      grid_width: 16,
      grid_height: 16,
      tile_width: 128,
      tile_height: 64,
    }));
    table.boolean('is_active').defaultTo(true);
    table.string('created_by').notNullable();
    table.timestamps(true, true);

    table.unique(['platform_id', 'slug']);
    table.index(['platform_id']);
    table.index(['status']);
  });

  // ============================================
  // Add platform_id to assets (assets belong to platform)
  // ============================================
  await knex.schema.alterTable('assets', (table) => {
    table.uuid('platform_id').nullable().references('id').inTable('platforms').onDelete('SET NULL');
    table.index(['platform_id']);
  });

  // ============================================
  // Add game_id to scenes (scenes belong to game)
  // ============================================
  await knex.schema.alterTable('scenes', (table) => {
    table.uuid('game_id').nullable().references('id').inTable('games').onDelete('SET NULL');
    table.index(['game_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  // Remove FKs first
  await knex.schema.alterTable('scenes', (table) => {
    table.dropColumn('game_id');
  });
  await knex.schema.alterTable('assets', (table) => {
    table.dropColumn('platform_id');
  });
  await knex.schema.dropTableIfExists('games');
  await knex.schema.dropTableIfExists('platforms');
}