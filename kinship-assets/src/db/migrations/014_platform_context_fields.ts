import type { Knex } from "knex";

/**
 * Migration: Platform Context Fields
 * 
 * Creates the platforms table if it doesn't exist, then adds context fields:
 * - handle: unique identifier (@kinship_health)
 * - presence_id: links to a Presence agent
 * - visibility: public | private | secret
 * - knowledge_base_ids: array of knowledge base IDs
 * - instruction_ids: array of system prompt IDs
 */
export async function up(knex: Knex): Promise<void> {
  // First, ensure the platforms table exists
  const platformsExists = await knex.schema.hasTable('platforms');
  
  if (!platformsExists) {
    // Create the platforms table from scratch
    await knex.schema.createTable('platforms', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.string('name').notNullable();
      table.string('slug').notNullable().unique();
      table.string('handle', 25).nullable().unique();
      table.text('description').defaultTo('');
      table.string('icon').defaultTo('🎮');
      table.string('color').defaultTo('#4CADA8');
      table.string('presence_id').nullable();
      table.enum('visibility', ['public', 'private', 'secret']).defaultTo('public');
      table.jsonb('knowledge_base_ids').defaultTo('[]');
      table.jsonb('instruction_ids').defaultTo('[]');
      table.boolean('is_active').defaultTo(true);
      table.string('created_by').notNullable();
      table.timestamps(true, true);
      
      // Indexes
      table.index(['slug']);
      table.index(['handle']);
      table.index(['visibility']);
      table.index(['is_active']);
    });
  } else {
    // Table exists, add missing columns
    const hasHandle = await knex.schema.hasColumn('platforms', 'handle');
    const hasPresenceId = await knex.schema.hasColumn('platforms', 'presence_id');
    const hasVisibility = await knex.schema.hasColumn('platforms', 'visibility');
    const hasKnowledgeBaseIds = await knex.schema.hasColumn('platforms', 'knowledge_base_ids');
    const hasInstructionIds = await knex.schema.hasColumn('platforms', 'instruction_ids');
    const hasInstructions = await knex.schema.hasColumn('platforms', 'instructions');

    await knex.schema.alterTable('platforms', (table) => {
      if (!hasHandle) {
        table.string('handle', 25).nullable().unique();
        table.index(['handle']);
      }
      if (!hasPresenceId) {
        table.string('presence_id').nullable();
      }
      if (!hasVisibility) {
        table.enum('visibility', ['public', 'private', 'secret']).defaultTo('public');
        table.index(['visibility']);
      }
      if (!hasKnowledgeBaseIds) {
        table.jsonb('knowledge_base_ids').defaultTo('[]');
      }
      if (!hasInstructionIds) {
        table.jsonb('instruction_ids').defaultTo('[]');
      }
      // Drop instructions column if it exists (no longer needed)
      if (hasInstructions) {
        table.dropColumn('instructions');
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const platformsExists = await knex.schema.hasTable('platforms');
  
  if (platformsExists) {
    const hasHandle = await knex.schema.hasColumn('platforms', 'handle');
    const hasPresenceId = await knex.schema.hasColumn('platforms', 'presence_id');
    const hasVisibility = await knex.schema.hasColumn('platforms', 'visibility');
    const hasKnowledgeBaseIds = await knex.schema.hasColumn('platforms', 'knowledge_base_ids');
    const hasInstructionIds = await knex.schema.hasColumn('platforms', 'instruction_ids');

    await knex.schema.alterTable('platforms', (table) => {
      if (hasHandle) {
        table.dropIndex(['handle']);
        table.dropColumn('handle');
      }
      if (hasPresenceId) {
        table.dropColumn('presence_id');
      }
      if (hasVisibility) {
        table.dropIndex(['visibility']);
        table.dropColumn('visibility');
      }
      if (hasKnowledgeBaseIds) {
        table.dropColumn('knowledge_base_ids');
      }
      if (hasInstructionIds) {
        table.dropColumn('instruction_ids');
      }
    });
  }
}
