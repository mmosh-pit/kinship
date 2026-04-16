import db from "../config/database";
import { v4 as uuidv4 } from "uuid";
import logger from "../utils/logger";
import { assetService } from "./asset.service";
import type { SceneManifest, AssetWithMetadata } from "../types";

class SceneService {
  async create(data: {
    scene_name: string;
    scene_type: string;
    tile_map_url?: string;
    spawn_points?: any[];
    ambient?: any;
    system_prompt?: string;
    description?: string;
    game_id?: string | null;
    created_by: string;
    actors?: any[];
    challenges?: any[];
    routes?: any[];
  }): Promise<SceneManifest> {
    const id = uuidv4();

    const [scene] = await db("scenes")
      .insert({
        id,
        scene_name: data.scene_name,
        scene_type: data.scene_type,
        tile_map_url: data.tile_map_url || null,
        spawn_points: JSON.stringify(data.spawn_points || []),
        ambient: JSON.stringify(
          data.ambient || {
            lighting: "day",
            weather: "clear",
            music_track: null,
          },
        ),
        system_prompt: data.system_prompt || null,
        description: data.description || null,
        game_id: data.game_id || null,
        created_by: data.created_by,
        actors: JSON.stringify(data.actors || []),
        challenges: JSON.stringify(data.challenges || []),
        routes: JSON.stringify(data.routes || []),
      })
      .returning("*");

    logger.info(`Scene created: ${data.scene_name} (${id})`);
    return this.formatScene(scene);
  }

  async getById(id: string): Promise<SceneManifest | null> {
    const scene = await db("scenes").where({ id }).first();
    return scene ? this.formatScene(scene) : null;
  }

  async list(sceneType?: string, gameId?: string): Promise<SceneManifest[]> {
    let query = db('scenes').where({ is_active: true });
    if (sceneType) query = query.where({ scene_type: sceneType });
    if (gameId) query = query.where({ game_id: gameId });

    const scenes = await query.orderBy("created_at", "desc");
    return scenes.map((s: any) => this.formatScene(s));
  }

  async update(
    id: string,
    data: Partial<{
      scene_name: string;
      scene_type: string;
      tile_map_url: string;
      spawn_points: any[];
      ambient: any;
      system_prompt: string | null;
      description: string | null;
      is_active: boolean;
      actors: any[];
      challenges: any[];
      routes: any[];
    }>,
  ): Promise<SceneManifest | null> {
    const updateData: any = { ...data, updated_at: db.fn.now() };
    if (data.spawn_points)
      updateData.spawn_points = JSON.stringify(data.spawn_points);
    if (data.ambient) updateData.ambient = JSON.stringify(data.ambient);
    if (data.actors) updateData.actors = JSON.stringify(data.actors);
    if (data.challenges) updateData.challenges = JSON.stringify(data.challenges);
    if (data.routes) updateData.routes = JSON.stringify(data.routes);

    const [scene] = await db("scenes")
      .where({ id })
      .update(updateData)
      .returning("*");

    return scene ? this.formatScene(scene) : null;
  }

  async delete(id: string): Promise<boolean> {
    const count = await db("scenes").where({ id }).del();
    return count > 0;
  }

  /**
   * Get scene ID by name within a game
   */
  async getSceneIdByName(sceneName: string, gameId: string): Promise<string | null> {
    const scene = await db('scenes')
      .where({ scene_name: sceneName, game_id: gameId, is_active: true })
      .first();
    return scene?.id || null;
  }

  /**
   * Build a map of scene names to IDs for a game
   */
  async buildSceneNameToIdMap(gameId: string): Promise<Record<string, string>> {
    const scenes = await db('scenes')
      .where({ game_id: gameId, is_active: true })
      .select('id', 'scene_name');

    const map: Record<string, string> = {};
    for (const scene of scenes) {
      if (scene.scene_name) {
        map[scene.scene_name] = scene.id;
      }
    }
    return map;
  }

  /**
   * Enrich routes with scene IDs by looking up scene names
   */
  async enrichRoutesWithSceneIds(
    routes: any[],
    gameId: string | null
  ): Promise<any[]> {
    if (!routes || routes.length === 0 || !gameId) {
      return routes || [];
    }

    // Build name-to-ID map for this game
    const sceneNameToId = await this.buildSceneNameToIdMap(gameId);

    return routes.map((route) => {
      const enriched = { ...route };

      // Add from_scene_id if missing
      if (!enriched.from_scene_id && enriched.from_scene_name) {
        const fromId = sceneNameToId[enriched.from_scene_name];
        if (fromId) {
          enriched.from_scene_id = fromId;
        }
      }

      // Add to_scene_id if missing
      if (!enriched.to_scene_id && enriched.to_scene_name) {
        const toId = sceneNameToId[enriched.to_scene_name];
        if (toId) {
          enriched.to_scene_id = toId;
        }
      }

      return enriched;
    });
  }

  /**
   * Get full scene manifest with all assets and their metadata.
   *
   * @param id          Scene UUID
   * @param fullManifest  When true, also fetches the GCS JSON stored in
   *                      tile_map_url (AI-generated scenes) and returns it
   *                      as `gcsManifest` in the response. This avoids a
   *                      browser-side CORS fetch from the frontend.
   */
  async getFullManifest(
    id: string,
    fullManifest: boolean = false,
  ): Promise<{
    scene: SceneManifest;
    assets: AssetWithMetadata[];
    gcsManifest?: any;
  } | null> {
    const scene = await this.getById(id);
    if (!scene) return null;

    const assets = await assetService.getAssetsByScene(id);

    // When fullManifest=true and scene has a tile_map_url, fetch the GCS JSON
    // server-side (no CORS restriction) and embed it in the response.
    let gcsManifest: any = undefined;
    if (fullManifest && scene.tile_map_url) {
      try {
        logger.info(
          `Fetching GCS manifest for scene ${id}: ${scene.tile_map_url}`,
        );
        const res = await fetch(scene.tile_map_url);
        if (res.ok) {
          gcsManifest = await res.json();
          logger.info(`GCS manifest loaded — ${gcsManifest?.asset_placements?.length ?? 0} placements`);

          // ═══════════════════════════════════════════════════════════════════
          // ENRICHMENT: Add scene IDs to routes if missing
          // This ensures Flutter can navigate to scenes by ID
          // ═══════════════════════════════════════════════════════════════════
          if (gcsManifest?.routes && Array.isArray(gcsManifest.routes)) {
            const gameId = (scene as any).game_id;
            if (gameId) {
              gcsManifest.routes = await this.enrichRoutesWithSceneIds(
                gcsManifest.routes,
                gameId
              );
              logger.info(`Routes enriched with scene IDs for scene ${id}`);
            }
          }
        } else {
          logger.warn(
            `GCS manifest fetch returned ${res.status} for scene ${id}`,
          );
        }
      } catch (err) {
        logger.error(
          `Failed to fetch GCS manifest for scene ${id}: ${(err as Error).message}`,
        );
      }
    }

    // Merge background_color from GCS manifest into scene.ambient so the
    // Scene Detail page always receives it — even for scenes saved before
    // background_color was added to the GCS JSON.
    // Priority: gcsManifest.scene.background_color > scene.ambient.background_color
    const gcsBackgroundColor: string | null =
      gcsManifest?.scene?.background_color ?? null;
    if (gcsBackgroundColor && scene.ambient) {
      (scene as any).ambient = {
        ...scene.ambient,
        background_color: gcsBackgroundColor,
      };
    }

    return { scene, assets, ...(gcsManifest !== undefined && { gcsManifest }) };
  }

  /**
   * Add asset to scene
   */
  async addAssetToScene(
    sceneId: string,
    assetId: string,
    position?: { x: number; y: number },
    zIndex?: number,
  ): Promise<void> {
    await db("scene_assets")
      .insert({
        scene_id: sceneId,
        asset_id: assetId,
        position_x: position?.x || 0,
        position_y: position?.y || 0,
        z_index: zIndex || 1,
      })
      .onConflict(["scene_id", "asset_id"])
      .merge();
  }

  /**
   * Remove asset from scene
   */
  async removeAssetFromScene(sceneId: string, assetId: string): Promise<void> {
    await db("scene_assets")
      .where({ scene_id: sceneId, asset_id: assetId })
      .del();
  }

  private formatScene(row: any): SceneManifest {
    return {
      ...row,
      spawn_points:
        typeof row.spawn_points === "string"
          ? JSON.parse(row.spawn_points)
          : row.spawn_points,
      ambient:
        typeof row.ambient === "string" ? JSON.parse(row.ambient) : row.ambient,
      actors:
        typeof row.actors === "string" ? JSON.parse(row.actors) : (row.actors || []),
      challenges:
        typeof row.challenges === "string" ? JSON.parse(row.challenges) : (row.challenges || []),
      routes:
        typeof row.routes === "string" ? JSON.parse(row.routes) : (row.routes || []),
      asset_ids: [],
    };
  }
}

export const sceneService = new SceneService();
export default SceneService;
