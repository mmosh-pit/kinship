import type { Knex } from "knex";

/**
 * Migration: Projects Table
 * 
 * Creates a separate projects table as a child of platforms table.
 * Projects have a foreign key relationship to their parent platform.
 */
export async function up(knex: Knex): Promise<void> {
  const projectsExists = await knex.schema.hasTable('projects');
  
  if (!projectsExists) {
    await knex.schema.createTable('projects', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      
      // Foreign key to parent platform
      table.uuid('platform_id').notNullable().references('id').inTable('platforms').onDelete('CASCADE');
      
      // Basic info
      table.string('name').notNullable();
      table.string('slug').notNullable();
      table.string('handle', 25).nullable().unique();
      table.text('description').defaultTo('');
      table.string('icon').defaultTo('📁');
      table.string('color').defaultTo('#A855F7'); // Purple for projects
      
      // Context fields
      table.string('presence_id').nullable();
      table.enum('visibility', ['public', 'private', 'secret']).defaultTo('public');
      table.jsonb('knowledge_base_ids').defaultTo('[]');
      table.jsonb('gathering_ids').defaultTo('[]');  // Games/Experiences assigned to this project
      table.jsonb('instruction_ids').defaultTo('[]');  // System prompt IDs
      
      // Metadata
      table.boolean('is_active').defaultTo(true);
      table.string('created_by').notNullable();
      table.timestamps(true, true);

      // Indexes
      table.index(['platform_id']);
      table.index(['slug']);
      table.index(['handle']);
      table.index(['visibility']);
      table.index(['is_active']);
      
      // Unique constraint: slug must be unique within a platform
      table.unique(['platform_id', 'slug']);
    });
  } else {
    // Table exists, add missing columns or drop deprecated ones
    const hasInstructionIds = await knex.schema.hasColumn('projects', 'instruction_ids');
    const hasInstructions = await knex.schema.hasColumn('projects', 'instructions');
    
    await knex.schema.alterTable('projects', (table) => {
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
  await knex.schema.dropTableIfExists('projects');
}