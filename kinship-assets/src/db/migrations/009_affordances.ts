import type { Knex } from "knex";

/**
 * Migration: Add affordances, capabilities, and placement rules to asset_knowledge
 * 
 * These fields enable the mechanic matching system:
 * - affordances: what players can DO with the asset
 * - capabilities: what the asset can DO
 * - placement_type: how the asset should be placed
 * - requires_nearby: what must be near for valid placement
 * - provides_attachment: what attachment points this asset provides
 * - context_functions: how function changes based on context
 */

export async function up(knex: Knex): Promise<void> {
    const hasAffordances = await knex.schema.hasColumn("asset_knowledge", "affordances");

    if (!hasAffordances) {
        await knex.schema.alterTable("asset_knowledge", (table) => {
            // Affordances & Capabilities
            table.specificType("affordances", "text[]").defaultTo("{}");
            table.specificType("capabilities", "text[]").defaultTo("{}");

            // Placement Rules
            table.string("placement_type").defaultTo("standalone");
            table.specificType("requires_nearby", "text[]").defaultTo("{}");
            table.specificType("provides_attachment", "text[]").defaultTo("{}");
            table.jsonb("context_functions").defaultTo("{}");
        });

        // Add indexes for efficient querying
        await knex.schema.alterTable("asset_knowledge", (table) => {
            table.index(["placement_type"]);
        });

        // Create GIN indexes for array columns (for efficient containment queries)
        await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_asset_knowledge_affordances 
      ON asset_knowledge USING GIN (affordances);
    `);

        await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_asset_knowledge_capabilities 
      ON asset_knowledge USING GIN (capabilities);
    `);
    }
}

export async function down(knex: Knex): Promise<void> {
    // Drop indexes first
    await knex.raw("DROP INDEX IF EXISTS idx_asset_knowledge_affordances");
    await knex.raw("DROP INDEX IF EXISTS idx_asset_knowledge_capabilities");

    // Drop columns
    await knex.schema.alterTable("asset_knowledge", (table) => {
        table.dropColumn("affordances");
        table.dropColumn("capabilities");
        table.dropColumn("placement_type");
        table.dropColumn("requires_nearby");
        table.dropColumn("provides_attachment");
        table.dropColumn("context_functions");
    });
}