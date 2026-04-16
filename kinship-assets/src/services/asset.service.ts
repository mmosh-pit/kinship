import db from "../config/database";
import { v4 as uuidv4 } from "uuid";
import logger from "../utils/logger";
import type {
  Asset,
  AssetMetadata,
  AssetKnowledge,
  AssetWithMetadata,
  AssetQueryParams,
  PaginatedResponse,
  CreateAssetRequest,
  UpdateAssetRequest,
  CreateMetadataRequest,
} from "../types";

class AssetService {
  // ==========================================
  // ASSET CRUD
  // ==========================================

  async create(
    data: CreateAssetRequest & {
      file_url: string;
      thumbnail_url?: string;
      file_size: number;
      mime_type: string;
    },
  ): Promise<Asset> {
    const id = uuidv4();

    const [asset] = await db("assets")
      .insert({
        id,
        name: data.name,
        display_name: data.display_name,
        type: data.type,
        meta_description: data.meta_description || "",
        file_url: data.file_url,
        thumbnail_url: data.thumbnail_url || null,
        file_size: data.file_size,
        mime_type: data.mime_type,
        tags: data.tags || [],
        platform_id: data.platform_id || null,
        created_by: data.created_by,
      })
      .returning("*");

    await this.logAudit(id, "created", data.created_by, {
      name: data.name,
      type: data.type,
    });

    logger.info(`Asset created: ${data.name} (${id})${data.platform_id ? ` in platform ${data.platform_id}` : ''}`);
    return asset;
  }

  async getById(id: string): Promise<AssetWithMetadata | null> {
    const asset = await db("assets").where({ id }).first();
    if (!asset) return null;

    const metadata = await db("asset_metadata").where({ asset_id: id }).first();
    const knowledge = await db("asset_knowledge")
      .where({ asset_id: id })
      .first();

    return {
      ...asset,
      metadata: metadata ? this.formatMetadata(metadata) : null,
      knowledge: knowledge ? this.formatKnowledge(knowledge) : null,
    };
  }

  async getByName(name: string): Promise<AssetWithMetadata | null> {
    const asset = await db("assets").where({ name }).first();
    if (!asset) return null;

    const metadata = await db("asset_metadata")
      .where({ asset_id: asset.id })
      .first();

    // FIX: Also fetch knowledge (was missing)
    const knowledge = await db("asset_knowledge")
      .where({ asset_id: asset.id })
      .first();

    return {
      ...asset,
      metadata: metadata ? this.formatMetadata(metadata) : null,
      knowledge: knowledge ? this.formatKnowledge(knowledge) : null,
    };
  }

  async list(
    params: AssetQueryParams,
  ): Promise<PaginatedResponse<AssetWithMetadata>> {
    const {
      type, scene_id, scene_type, tags, is_active, platform_id,
      search, page = 1, limit = 20, sort_by = 'created_at', sort_order = 'desc',
    } = params;

    let query = db("assets").select("assets.*");

    // ── Platform filter ──
    if (platform_id) query = query.where('assets.platform_id', platform_id);

    // Filters
    if (type) query = query.where("assets.type", type);
    if (scene_id) {
      query = query
        .join("scene_assets", "assets.id", "scene_assets.asset_id")
        .where("scene_assets.scene_id", scene_id);
    }
    if (is_active !== undefined)
      query = query.where("assets.is_active", is_active);
    if (tags && tags.length > 0) {
      query = query.whereRaw("assets.tags && ?", [tags]);
    }
    if (scene_type) {
      query = query
        .join("scene_assets as sa_type", "assets.id", "sa_type.asset_id")
        .join("scenes", "sa_type.scene_id", "scenes.id")
        .where("scenes.scene_type", scene_type);
    }
    if (search) {
      query = query.where(function () {
        this.where("assets.name", "ilike", `%${search}%`)
          .orWhere("assets.display_name", "ilike", `%${search}%`)
          .orWhere("assets.meta_description", "ilike", `%${search}%`);
      });
    }

    // Count total
    const countQuery = query.clone();
    const [{ count }] = await countQuery
      .clearSelect()
      .count("assets.id as count");
    const total = parseInt(count as string, 10);

    // Paginate
    const offset = (page - 1) * limit;
    const assets = await query
      .orderBy(`assets.${sort_by}`, sort_order)
      .limit(limit)
      .offset(offset);

    // Fetch metadata for all assets
    const assetIds = assets.map((a: Asset) => a.id);

    const metadataRows = await db("asset_metadata").whereIn(
      "asset_id",
      assetIds,
    );
    const metadataMap = new Map(
      metadataRows.map((m: any) => [m.asset_id, this.formatMetadata(m)]),
    );

    // ═══ FIX: Also fetch knowledge for all assets ═══
    const knowledgeRows = await db("asset_knowledge").whereIn(
      "asset_id",
      assetIds,
    );
    const knowledgeMap = new Map(
      knowledgeRows.map((k: any) => [k.asset_id, this.formatKnowledge(k)]),
    );

    const data: AssetWithMetadata[] = assets.map((asset: Asset) => ({
      ...asset,
      metadata: metadataMap.get(asset.id) || null,
      knowledge: knowledgeMap.get(asset.id) || null,
    }));

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async update(
    id: string,
    data: UpdateAssetRequest,
    updatedBy: string,
  ): Promise<Asset | null> {
    const [asset] = await db("assets")
      .where({ id })
      .update({ ...data, updated_at: db.fn.now() })
      .returning("*");

    if (asset) {
      await this.logAudit(id, "updated", updatedBy, data);
      logger.info(`Asset updated: ${id}`);
    }

    return asset || null;
  }

  async delete(id: string, deletedBy: string): Promise<boolean> {
    return db.transaction(async (trx) => {
      const exists = await trx("assets").where({ id }).first();
      if (!exists) return false;

      await trx("asset_audit_log").insert({
        asset_id: id,
        action: "deleted",
        performed_by: deletedBy,
        changes: JSON.stringify({ name: exists.name, type: exists.type }),
      });

      await trx("assets").where({ id }).del();

      logger.info(`Asset deleted: ${exists.name} (${id})`);
      return true;
    });
  }

  // ==========================================
  // METADATA CRUD
  // ==========================================

  async createMetadata(
    assetId: string,
    data: CreateMetadataRequest,
  ): Promise<AssetMetadata> {
    const row = this.flattenMetadata(assetId, data);

    const [metadata] = await db("asset_metadata").insert(row).returning("*");

    logger.info(`Metadata created for asset: ${assetId}`);
    return this.formatMetadata(metadata);
  }

  async updateMetadata(
    assetId: string,
    data: Partial<CreateMetadataRequest>,
    updatedBy: string,
  ): Promise<AssetMetadata | null> {
    const existing = await db("asset_metadata")
      .where({ asset_id: assetId })
      .first();
    if (!existing) return null;

    const row = this.flattenMetadata(assetId, data);
    delete (row as any).id;
    delete (row as any).asset_id;

    const [metadata] = await db("asset_metadata")
      .where({ asset_id: assetId })
      .update({ ...row, updated_at: db.fn.now() })
      .returning("*");

    await this.logAudit(assetId, "metadata_changed", updatedBy, data);
    logger.info(`Metadata updated for asset: ${assetId}`);

    return this.formatMetadata(metadata);
  }

  async getMetadata(assetId: string): Promise<AssetMetadata | null> {
    const metadata = await db("asset_metadata")
      .where({ asset_id: assetId })
      .first();
    return metadata ? this.formatMetadata(metadata) : null;
  }

  // ==========================================
  // SCENE QUERIES
  // ==========================================

  async setPixelDimensions(
    assetId: string,
    width: number,
    height: number,
  ): Promise<void> {
    const existing = await db("asset_metadata")
      .where({ asset_id: assetId })
      .first();

    if (existing) {
      await db("asset_metadata")
        .where({ asset_id: assetId })
        .update({
          pixel_width: width,
          pixel_height: height,
          updated_at: db.fn.now(),
        });
    } else {
      await db("asset_metadata").insert({
        id: uuidv4(),
        asset_id: assetId,
        pixel_width: width,
        pixel_height: height,
      });
    }
    logger.info(`Pixel dimensions set for ${assetId}: ${width}×${height}`);
  }

  async getAssetsByScene(sceneId: string): Promise<AssetWithMetadata[]> {
    const assets = await db("assets")
      .join("scene_assets", "assets.id", "scene_assets.asset_id")
      .where("scene_assets.scene_id", sceneId)
      .where("assets.is_active", true)
      .select(
        "assets.*",
        "scene_assets.position_x",
        "scene_assets.position_y",
        "scene_assets.z_index",
        "scene_assets.overrides",
      );

    const assetIds = assets.map((a: Asset) => a.id);

    const metadataRows = await db("asset_metadata").whereIn(
      "asset_id",
      assetIds,
    );
    const metadataMap = new Map(
      metadataRows.map((m: any) => [m.asset_id, this.formatMetadata(m)]),
    );

    // FIX: Also fetch knowledge
    const knowledgeRows = await db("asset_knowledge").whereIn(
      "asset_id",
      assetIds,
    );
    const knowledgeMap = new Map(
      knowledgeRows.map((k: any) => [k.asset_id, this.formatKnowledge(k)]),
    );

    return assets.map((asset: Asset) => ({
      ...asset,
      metadata: metadataMap.get(asset.id) || null,
      knowledge: knowledgeMap.get(asset.id) || null,
    }));
  }

  async getAssetsByFacet(facet: string): Promise<AssetWithMetadata[]> {
    const metadataRows = await db("asset_metadata")
      .where("hearts_primary_facet", facet)
      .orWhere("hearts_secondary_facet", facet);

    const assetIds = metadataRows.map((m: any) => m.asset_id);
    const assets = await db("assets")
      .whereIn("id", assetIds)
      .where({ is_active: true });

    const metadataMap = new Map(
      metadataRows.map((m: any) => [m.asset_id, this.formatMetadata(m)]),
    );

    // FIX: Also fetch knowledge
    const knowledgeRows = await db("asset_knowledge").whereIn(
      "asset_id",
      assetIds,
    );
    const knowledgeMap = new Map(
      knowledgeRows.map((k: any) => [k.asset_id, this.formatKnowledge(k)]),
    );

    return assets.map((asset: Asset) => ({
      ...asset,
      metadata: metadataMap.get(asset.id) || null,
      knowledge: knowledgeMap.get(asset.id) || null,
    }));
  }

  // ==========================================
  // KNOWLEDGE CRUD (AI-generated)
  // ==========================================

  async getKnowledge(assetId: string): Promise<any | null> {
    const row = await db("asset_knowledge").where({ asset_id: assetId }).first();
    return row ? this.formatKnowledge(row) : null;
  }

  async upsertKnowledge(
    assetId: string,
    data: Record<string, any>,
  ): Promise<any> {
    const existing = await db("asset_knowledge")
      .where({ asset_id: assetId })
      .first();

    const VALID_PLACEMENT_HINTS = ['single', 'pair', 'cluster', 'scatter', 'line', 'ring', 'border', 'grid'];
    const VALID_SCENE_ROLES = ['ground_fill', 'path', 'boundary', 'focal_point', 'furniture', 'shelter', 'accent', 'scatter', 'utility', 'lighting', 'signage', 'vegetation', 'prop'];

    const placementHint = VALID_PLACEMENT_HINTS.includes(data.placement_hint)
      ? data.placement_hint
      : 'single';
    const sceneRole = VALID_SCENE_ROLES.includes(data.scene_role)
      ? data.scene_role
      : 'prop';

    const row = {
      asset_id: assetId,
      visual_description: data.visual_description || "",
      color_palette: data.color_palette || [],
      visual_mood: data.visual_mood || [],
      art_style: data.art_style || "",
      scene_role: sceneRole,
      placement_hint: placementHint,
      pair_with: data.pair_with || [],
      avoid_near: data.avoid_near || [],
      composition_notes: data.composition_notes || "",
      suitable_scenes: data.suitable_scenes || [],
      suitable_facets: data.suitable_facets || [],
      therapeutic_use: data.therapeutic_use || "",
      narrative_hook: data.narrative_hook || "",
      generated_by: data.generated_by || "claude-vision",
      generated_at: new Date(),
      affordances: data.affordances || [],
      capabilities: data.capabilities || [],
      placement_type: data.placement_type || "standalone",
      requires_nearby: data.requires_nearby || [],
      provides_attachment: data.provides_attachment || [],
      context_functions: data.context_functions || {},
    };

    logger.info(`[upsertKnowledge] Saving knowledge for asset ${assetId}, affordances=${(data.affordances || []).join(',')}, capabilities=${(data.capabilities || []).join(',')}`);

    if (existing) {
      const [result] = await db("asset_knowledge")
        .where({ asset_id: assetId })
        .update({
          ...row,
          generation_version: (existing.generation_version || 0) + 1,
          updated_at: db.fn.now(),
        })
        .returning("*");
      logger.info(`[upsertKnowledge] Updated knowledge for asset ${assetId}, version ${result.generation_version}`);
      return result;
    } else {
      const [result] = await db("asset_knowledge")
        .insert({ ...row, generation_version: 1 })
        .returning("*");
      logger.info(`[upsertKnowledge] Created knowledge for asset ${assetId}`);
      return result;
    }
  }

  async deleteKnowledge(assetId: string): Promise<boolean> {
    const deleted = await db("asset_knowledge")
      .where({ asset_id: assetId })
      .del();
    return deleted > 0;
  }

  async getKnowledgeStats(): Promise<any> {
    const totalAssets = await db("assets")
      .where("is_active", true)
      .count("id as count")
      .first();
    const withKnowledge = await db("asset_knowledge")
      .count("id as count")
      .first();
    const withAffordances = await db("asset_knowledge")
      .whereRaw("array_length(affordances, 1) > 0")
      .count("id as count")
      .first();
    const byRole = await db("asset_knowledge")
      .select("scene_role")
      .count("id as count")
      .groupBy("scene_role");

    const total = parseInt(totalAssets?.count as string) || 0;
    const known = parseInt(withKnowledge?.count as string) || 0;
    const withAff = parseInt(withAffordances?.count as string) || 0;

    return {
      total_assets: total,
      with_knowledge: known,
      with_affordances: withAff,
      coverage_pct: total ? Math.round((known / total) * 100) : 0,
      affordance_coverage_pct: total ? Math.round((withAff / total) * 100) : 0,
      by_role: byRole.reduce((acc: Record<string, number>, row: any) => {
        acc[row.scene_role] = parseInt(row.count as string);
        return acc;
      }, {}),
    };
  }

  // ==========================================
  // AUDIT LOG
  // ==========================================

  async logAudit(
    assetId: string,
    action: string,
    performedBy: string,
    changes: object,
  ): Promise<void> {
    await db("asset_audit_log").insert({
      asset_id: assetId,
      action,
      performed_by: performedBy,
      changes: JSON.stringify(changes),
    });
  }

  async getAuditLog(assetId: string, limit: number = 50): Promise<any[]> {
    return db("asset_audit_log")
      .where({ asset_id: assetId })
      .orderBy("performed_at", "desc")
      .limit(limit);
  }

  // ==========================================
  // KNOWLEDGE FORMATTER
  // ==========================================

  /**
   * Format raw asset_knowledge DB row into clean object.
   * Ensures all fields are present with proper types.
   */
  private formatKnowledge(row: any): AssetKnowledge {
    return {
      // Identity (required by AssetKnowledge interface)
      id: row.id,
      asset_id: row.asset_id,
      // Visual
      visual_description: row.visual_description || "",
      color_palette: row.color_palette || [],
      visual_mood: row.visual_mood || [],
      art_style: row.art_style || "",
      // Scene placement
      scene_role: row.scene_role || "prop",
      placement_hint: row.placement_hint || "single",
      pair_with: row.pair_with || [],
      avoid_near: row.avoid_near || [],
      composition_notes: row.composition_notes || "",
      // Usage
      suitable_scenes: row.suitable_scenes || [],
      suitable_facets: row.suitable_facets || [],
      therapeutic_use: row.therapeutic_use || "",
      narrative_hook: row.narrative_hook || "",
      // Affordances & Capabilities (from migration 009)
      affordances: row.affordances || [],
      capabilities: row.capabilities || [],
      placement_type: row.placement_type || "standalone",
      requires_nearby: row.requires_nearby || [],
      provides_attachment: row.provides_attachment || [],
      context_functions: row.context_functions || {},
      // Meta
      generated_by: row.generated_by || "",
      generated_at: row.generated_at || new Date(),
      generation_version: row.generation_version || 0,
    };
  }

  // ==========================================
  // METADATA HELPERS
  // ==========================================

  private flattenMetadata(
    assetId: string,
    data: Partial<CreateMetadataRequest>,
  ): Record<string, any> {
    const row: Record<string, any> = {
      id: uuidv4(),
      asset_id: assetId,
    };

    if (data.aoe) {
      row.aoe_shape = data.aoe.shape || "none";
      row.aoe_radius = data.aoe.radius;
      row.aoe_width = data.aoe.width;
      row.aoe_height = data.aoe.height;
      row.aoe_vertices = data.aoe.vertices
        ? JSON.stringify(data.aoe.vertices)
        : null;
      row.aoe_unit = data.aoe.unit || "tiles";
    }

    if (data.hitbox) {
      row.hitbox_width = data.hitbox.width ?? 1;
      row.hitbox_height = data.hitbox.height ?? 1;
      row.hitbox_offset_x = data.hitbox.offset_x ?? 0;
      row.hitbox_offset_y = data.hitbox.offset_y ?? 0;
    }

    if (data.interaction) {
      row.interaction_type = data.interaction.type || "tap";
      row.interaction_range = data.interaction.range ?? 1.5;
      row.interaction_cooldown_ms = data.interaction.cooldown_ms ?? 500;
      row.interaction_requires_facing =
        data.interaction.requires_facing ?? false;
    }

    if (data.hearts_mapping) {
      row.hearts_primary_facet = data.hearts_mapping.primary_facet;
      row.hearts_secondary_facet = data.hearts_mapping.secondary_facet;
      row.hearts_base_delta = data.hearts_mapping.base_delta ?? 0;
      row.hearts_description = data.hearts_mapping.description || "";
    }

    if (data.states) row.states = data.states;
    if (data.animations) row.animations = JSON.stringify(data.animations);

    if (data.sprite_sheet) {
      row.sprite_frame_width = data.sprite_sheet.frame_width ?? 0;
      row.sprite_frame_height = data.sprite_sheet.frame_height ?? 0;
      row.sprite_columns = data.sprite_sheet.columns ?? 1;
      row.sprite_rows = data.sprite_sheet.rows ?? 1;
      row.sprite_anchor_x = data.sprite_sheet.anchor_x ?? 0.5;
      row.sprite_anchor_y = data.sprite_sheet.anchor_y ?? 1.0;
      row.sprite_padding = data.sprite_sheet.padding ?? 0;
      row.sprite_direction_map = data.sprite_sheet.direction_map
        ? JSON.stringify(data.sprite_sheet.direction_map)
        : null;
      row.sprite_states = data.sprite_sheet.states
        ? JSON.stringify(data.sprite_sheet.states)
        : JSON.stringify({
          idle: { row: 0, start_col: 0, end_col: 0, fps: 1, loop: true },
        });
    }

    if (data.spawn) {
      row.spawn_x = data.spawn.default_position?.x ?? 0;
      row.spawn_y = data.spawn.default_position?.y ?? 0;
      row.spawn_layer = data.spawn.layer || "objects";
      row.spawn_z_index = data.spawn.z_index ?? 1;
      row.spawn_facing = data.spawn.facing || "south";
    }

    if (data.rules) {
      row.requires_item = data.rules.requires_item;
      row.max_users = data.rules.max_users ?? 1;
      row.description = data.rules.description || "";
      row.is_movable = data.rules.is_movable ?? false;
      row.is_destructible = data.rules.is_destructible ?? false;
      row.level_required = data.rules.level_required ?? 0;
    }

    if (data.custom_properties) {
      row.custom_properties = JSON.stringify(data.custom_properties);
    }

    if (data.tile_config) {
      row.tile_walkable = data.tile_config.walkable || "walkable";
      row.tile_terrain_cost = data.tile_config.terrain_cost ?? 1.0;
      row.tile_terrain_type = data.tile_config.terrain_type || "";
      row.tile_auto_group = data.tile_config.auto_group || "";
      row.tile_is_edge = data.tile_config.is_edge ?? false;
    }

    if (data.audio_config) {
      row.audio_volume = data.audio_config.volume ?? 1.0;
      row.audio_loop = data.audio_config.loop ?? true;
      row.audio_fade_in_ms = data.audio_config.fade_in_ms ?? 0;
      row.audio_fade_out_ms = data.audio_config.fade_out_ms ?? 0;
      row.audio_spatial = data.audio_config.spatial ?? false;
      row.audio_trigger = data.audio_config.trigger || "ambient";
      row.audio_radius = data.audio_config.radius ?? 5.0;
      row.audio_category = data.audio_config.category || "sfx";
    }

    if (data.tilemap_config) {
      row.tilemap_grid_width = data.tilemap_config.grid_width ?? 0;
      row.tilemap_grid_height = data.tilemap_config.grid_height ?? 0;
      row.tilemap_tile_size = data.tilemap_config.tile_size ?? 64;
      row.tilemap_layer_count = data.tilemap_config.layer_count ?? 1;
      row.tilemap_orientation = data.tilemap_config.orientation || "isometric";
    }

    if (data.movement) {
      row.move_speed = data.movement.speed ?? 1.0;
      row.move_type = data.movement.type || "static";
      row.move_wander_radius = data.movement.wander_radius ?? 3.0;
      row.move_patrol_path = data.movement.patrol_path
        ? JSON.stringify(data.movement.patrol_path)
        : null;
      row.move_avoid_obstacles = data.movement.avoid_obstacles ?? true;
      row.move_personality = data.movement.personality || "";
    }

    return row;
  }

  private formatMetadata(row: any): AssetMetadata {
    return {
      id: row.id,
      asset_id: row.asset_id,
      pixel_width: row.pixel_width || 0,
      pixel_height: row.pixel_height || 0,
      aoe: {
        shape: row.aoe_shape,
        radius: row.aoe_radius,
        width: row.aoe_width,
        height: row.aoe_height,
        vertices: row.aoe_vertices,
        unit: row.aoe_unit,
      },
      hitbox: {
        width: row.hitbox_width,
        height: row.hitbox_height,
        offset_x: row.hitbox_offset_x,
        offset_y: row.hitbox_offset_y,
      },
      interaction: {
        type: row.interaction_type,
        range: row.interaction_range,
        cooldown_ms: row.interaction_cooldown_ms,
        requires_facing: row.interaction_requires_facing,
      },
      hearts_mapping: {
        primary_facet: row.hearts_primary_facet,
        secondary_facet: row.hearts_secondary_facet,
        base_delta: row.hearts_base_delta,
        description: row.hearts_description,
      },
      states: row.states,
      animations:
        typeof row.animations === "string"
          ? JSON.parse(row.animations)
          : row.animations,
      sprite_sheet:
        row.sprite_frame_width && row.sprite_frame_width > 0
          ? {
            frame_width: row.sprite_frame_width,
            frame_height: row.sprite_frame_height,
            columns: row.sprite_columns ?? 1,
            rows: row.sprite_rows ?? 1,
            anchor_x: row.sprite_anchor_x ?? 0.5,
            anchor_y: row.sprite_anchor_y ?? 1.0,
            padding: row.sprite_padding ?? 0,
            direction_map:
              typeof row.sprite_direction_map === "string"
                ? JSON.parse(row.sprite_direction_map)
                : (row.sprite_direction_map ?? null),
            states:
              typeof row.sprite_states === "string"
                ? JSON.parse(row.sprite_states)
                : (row.sprite_states ?? {}),
          }
          : null,
      spawn: {
        default_position: { x: row.spawn_x, y: row.spawn_y },
        layer: row.spawn_layer,
        z_index: row.spawn_z_index,
        facing: row.spawn_facing,
      },
      rules: {
        requires_item: row.requires_item,
        max_users: row.max_users,
        description: row.description,
        is_movable: row.is_movable,
        is_destructible: row.is_destructible,
        level_required: row.level_required,
      },
      tile_config: {
        walkable: row.tile_walkable || "walkable",
        terrain_cost: row.tile_terrain_cost ?? 1.0,
        terrain_type: row.tile_terrain_type || "",
        auto_group: row.tile_auto_group || "",
        is_edge: row.tile_is_edge ?? false,
      },
      audio_config: {
        volume: row.audio_volume ?? 1.0,
        loop: row.audio_loop ?? true,
        fade_in_ms: row.audio_fade_in_ms ?? 0,
        fade_out_ms: row.audio_fade_out_ms ?? 0,
        spatial: row.audio_spatial ?? false,
        trigger: row.audio_trigger || "ambient",
        radius: row.audio_radius ?? 5.0,
        category: row.audio_category || "sfx",
      },
      tilemap_config: {
        grid_width: row.tilemap_grid_width ?? 0,
        grid_height: row.tilemap_grid_height ?? 0,
        tile_size: row.tilemap_tile_size ?? 64,
        layer_count: row.tilemap_layer_count ?? 1,
        orientation: row.tilemap_orientation || "isometric",
      },
      movement: {
        speed: row.move_speed ?? 1.0,
        type: row.move_type || "static",
        wander_radius: row.move_wander_radius ?? 3.0,
        patrol_path:
          typeof row.move_patrol_path === "string"
            ? JSON.parse(row.move_patrol_path)
            : (row.move_patrol_path ?? null),
        avoid_obstacles: row.move_avoid_obstacles ?? true,
        personality: row.move_personality || "",
      },
      custom_properties:
        typeof row.custom_properties === "string"
          ? JSON.parse(row.custom_properties)
          : row.custom_properties,
    };
  }
}

export const assetService = new AssetService();
export default AssetService;