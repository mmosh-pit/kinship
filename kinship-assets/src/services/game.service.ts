import db from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import type { Game, GameWithCounts, CreateGameRequest, UpdateGameRequest } from '../types';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

class GameService {
  async create(data: CreateGameRequest): Promise<GameWithCounts> {
    const id = uuidv4();
    const slug = slugify(data.name);

    // Check for duplicate slug within platform
    const existing = await db('games')
      .where({ platform_id: data.platform_id, slug })
      .first();
    const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

    const config = {
      grid_width: 16,
      grid_height: 16,
      tile_width: 128,
      tile_height: 64,
      ...(data.config || {}),
    };

    const [game] = await db('games')
      .insert({
        id,
        platform_id: data.platform_id,
        name: data.name,
        slug: finalSlug,
        description: data.description || '',
        icon: data.icon || '🌿',
        image_url: data.image_url || null,
        config: JSON.stringify(config),
        created_by: data.created_by,
      })
      .returning('*');

    logger.info(`Game created: ${data.name} (${id}) in platform ${data.platform_id}`);
    return this.formatGame({ ...game, scenes_count: 0, quests_count: 0 });
  }

  async getById(id: string): Promise<GameWithCounts | null> {
    const game = await db('games').where({ id }).first();
    if (!game) return null;
    return this.withCounts(game);
  }

  async listByPlatform(platformId: string, options?: {
    status?: string;
    is_active?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ data: GameWithCounts[]; total: number }> {
    let query = db('games').where({ platform_id: platformId });

    if (options?.status) query = query.where({ status: options.status });
    if (options?.is_active !== undefined) query = query.where({ is_active: options.is_active });
    else query = query.where({ is_active: true });

    const page = options?.page || 1;
    const limit = options?.limit || 50;

    const [{ count }] = await query.clone().count('id as count');
    const games = await query
      .orderBy('created_at', 'asc')
      .limit(limit)
      .offset((page - 1) * limit);

    const withCounts = await Promise.all(games.map((g: Game) => this.withCounts(g)));
    return { data: withCounts, total: Number(count) };
  }

  async listAll(options?: {
    status?: string;
    is_active?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ data: GameWithCounts[]; total: number }> {
    let query = db('games');

    if (options?.status) query = query.where({ status: options.status });
    if (options?.is_active !== undefined) query = query.where({ is_active: options.is_active });
    else query = query.where({ is_active: true });

    const page = options?.page || 1;
    const limit = options?.limit || 50;

    const [{ count }] = await query.clone().count('id as count');
    const games = await query
      .orderBy('created_at', 'asc')
      .limit(limit)
      .offset((page - 1) * limit);

    const withCounts = await Promise.all(games.map((g: Game) => this.withCounts(g)));
    return { data: withCounts, total: Number(count) };
  }

  async update(id: string, data: UpdateGameRequest): Promise<GameWithCounts | null> {
    const updateData: any = { ...data, updated_at: db.fn.now() };

    if (data.config) {
      // Merge with existing config
      const existing = await db('games').where({ id }).first();
      if (!existing) return null;
      const existingConfig = typeof existing.config === 'string'
        ? JSON.parse(existing.config)
        : existing.config;
      updateData.config = JSON.stringify({ ...existingConfig, ...data.config });
    }

    if (data.name) {
      updateData.slug = slugify(data.name);
    }

    const [game] = await db('games')
      .where({ id })
      .update(updateData)
      .returning('*');

    if (!game) return null;
    return this.withCounts(game);
  }

  async delete(id: string): Promise<boolean> {
    const count = await db('games').where({ id }).del();
    if (count > 0) {
      logger.info(`Game deleted: ${id}`);
    }
    return count > 0;
  }

  private async withCounts(game: Game): Promise<GameWithCounts> {
    const [sceneCount] = await db('scenes')
      .where({ game_id: game.id, is_active: true })
      .count('id as count');

    // quests table may not exist yet, handle gracefully
    let questCount = 0;
    try {
      const [qc] = await db('quests')
        .where({ game_id: game.id })
        .count('id as count');
      questCount = Number(qc?.count || 0);
    } catch {
      // quests table doesn't exist yet
    }

    return {
      ...this.formatGame(game),
      scenes_count: Number(sceneCount?.count || 0),
      quests_count: questCount,
    };
  }

  private formatGame(row: any): GameWithCounts {
    return {
      ...row,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
      scenes_count: row.scenes_count || 0,
      quests_count: row.quests_count || 0,
    };
  }
}

export const gameService = new GameService();
export default GameService;