import db from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import type { Platform, PlatformWithCounts, PlatformWithProjects, CreatePlatformRequest, UpdatePlatformRequest, PlatformType, Project, ProjectWithCounts } from '../types';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

class PlatformService {
  async create(data: CreatePlatformRequest): Promise<PlatformWithCounts> {
    const id = uuidv4();
    const slug = slugify(data.name);

    // Check for duplicate slug
    const existing = await db('platforms')
      .where({ slug })
      .first();
    const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

    // Check for duplicate handle if provided (only if handle column exists)
    if (data.handle) {
      try {
        const handleExists = await db('platforms')
          .where({ handle: data.handle.toLowerCase() })
          .first();
        if (handleExists) {
          throw new Error(`Handle @${data.handle} is already taken`);
        }
      } catch (e: any) {
        // Handle column might not exist yet - ignore
        if (!e.message?.includes('column') && !e.message?.includes('does not exist')) {
          throw e;
        }
      }
    }

    // Build insert data - only include fields that exist in the table
    const insertData: any = {
      id,
      name: data.name,
      slug: finalSlug,
      description: data.description || '',
      icon: data.icon || '🎮',
      color: data.color || '#4CADA8',
      created_by: data.created_by,
    };

    // Add optional fields that may or may not exist in the schema
    if (data.handle) insertData.handle = data.handle.toLowerCase();
    if (Array.isArray(data.presence_ids)) insertData.presence_id = JSON.stringify(data.presence_ids);
    if (data.visibility) insertData.visibility = data.visibility;
    if (data.knowledge_base_ids) insertData.knowledge_base_ids = JSON.stringify(data.knowledge_base_ids);
    if (data.instruction_ids) insertData.instruction_ids = JSON.stringify(data.instruction_ids);
    if (data.instructions) insertData.instructions = data.instructions;

    const [platform] = await db('platforms')
      .insert(insertData)
      .returning('*');

    // Parse JSON fields
    if (platform.knowledge_base_ids && typeof platform.knowledge_base_ids === 'string') {
      platform.knowledge_base_ids = JSON.parse(platform.knowledge_base_ids);
    } else {
      platform.knowledge_base_ids = platform.knowledge_base_ids || [];
    }
    if (platform.instruction_ids && typeof platform.instruction_ids === 'string') {
      platform.instruction_ids = JSON.parse(platform.instruction_ids);
    } else {
      platform.instruction_ids = platform.instruction_ids || [];
    }
    // Parse presence_id column as array (stored as JSON string)
    if (platform.presence_id && typeof platform.presence_id === 'string') {
      try {
        const parsed = JSON.parse(platform.presence_id);
        platform.presence_ids = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        // If not valid JSON, treat as single ID
        platform.presence_ids = platform.presence_id ? [platform.presence_id] : [];
      }
    } else {
      platform.presence_ids = [];
    }

    logger.info(`Platform created: ${data.name} (${id})`);
    return { ...platform, assets_count: 0, games_count: 0, projects_count: 0 };
  }

  async getById(id: string): Promise<PlatformWithCounts | null> {
    const platform = await db('platforms').where({ id }).first();
    if (!platform) return null;
    return this.withCounts(platform);
  }

  async getBySlug(slug: string): Promise<PlatformWithCounts | null> {
    const platform = await db('platforms').where({ slug }).first();
    if (!platform) return null;
    return this.withCounts(platform);
  }

  async getByHandle(handle: string): Promise<PlatformWithCounts | null> {
    const platform = await db('platforms').where({ handle: handle.toLowerCase() }).first();
    if (!platform) return null;
    return this.withCounts(platform);
  }

  async list(options?: {
    type?: PlatformType;
    parent_id?: string;
    visibility?: string;
    is_active?: boolean;
  }): Promise<PlatformWithCounts[]> {
    let query = db('platforms').where({ is_active: true });

    // Note: visibility column may not exist in older schemas
    // Only filter by visibility if specifically requested
    if (options?.visibility) {
      try {
        query = query.where({ visibility: options.visibility });
      } catch (e) {
        // Column might not exist - ignore
      }
    }

    const platforms = await query.orderBy('created_at', 'asc');

    return Promise.all(platforms.map((p: Platform) => this.withCounts(p)));
  }

  /**
   * List all platforms with their projects embedded (from the new projects table)
   */
  async listWithProjects(options?: {
    visibility?: string;
  }): Promise<PlatformWithProjects[]> {
    // Get all platforms
    let query = db('platforms')
      .where({ is_active: true });

    // Note: visibility column may not exist in older schemas
    if (options?.visibility) {
      try {
        query = query.where({ visibility: options.visibility });
      } catch (e) {
        // Column might not exist - ignore
      }
    }

    const platforms = await query.orderBy('created_at', 'asc');

    // For each platform, get its projects from the projects table
    const result: PlatformWithProjects[] = [];
    
    for (const platform of platforms) {
      const platformWithCounts = await this.withCounts(platform);
      
      // Get projects from the new projects table (if it exists)
      let projectsWithCounts: ProjectWithCounts[] = [];
      try {
        const projects = await db('projects')
          .where({ platform_id: platform.id, is_active: true })
          .orderBy('created_at', 'asc');

        // Parse JSON fields and add counts for each project
        projectsWithCounts = projects.map((p: any) => ({
          ...p,
          knowledge_base_ids: typeof p.knowledge_base_ids === 'string' 
            ? JSON.parse(p.knowledge_base_ids) 
            : p.knowledge_base_ids || [],
          gathering_ids: typeof p.gathering_ids === 'string' 
            ? JSON.parse(p.gathering_ids) 
            : p.gathering_ids || [],
          assets_count: 0,
          games_count: 0,
        }));
      } catch (e) {
        // Projects table might not exist yet
        projectsWithCounts = [];
      }

      result.push({
        ...platformWithCounts,
        projects_count: projectsWithCounts.length,
        projects: projectsWithCounts,
      });
    }

    return result;
  }

  /**
   * @deprecated Use getProjectsForPlatform instead - projects are now in a separate table
   */
  async listProjectsForPlatform(platformId: string): Promise<PlatformWithCounts[]> {
    // Redirect to the new projects table method
    return this.getProjectsForPlatform(platformId) as any;
  }

  /**
   * Get projects from the new projects table for a specific platform
   */
  async getProjectsForPlatform(platformId: string): Promise<ProjectWithCounts[]> {
    try {
      const projects = await db('projects')
        .where({ platform_id: platformId, is_active: true })
        .orderBy('created_at', 'asc');

      return projects.map((p: any) => ({
        ...p,
        knowledge_base_ids: typeof p.knowledge_base_ids === 'string' 
          ? JSON.parse(p.knowledge_base_ids) 
          : p.knowledge_base_ids || [],
        gathering_ids: typeof p.gathering_ids === 'string' 
          ? JSON.parse(p.gathering_ids) 
          : p.gathering_ids || [],
        assets_count: 0,
        games_count: 0,
      }));
    } catch (e) {
      // Projects table might not exist yet
      return [];
    }
  }

  async update(id: string, data: UpdatePlatformRequest): Promise<PlatformWithCounts | null> {
    const updateData: any = { ...data, updated_at: db.fn.now() };

    // If name changed, update slug too
    if (data.name) {
      updateData.slug = slugify(data.name);
    }

    // Handle JSON fields
    if (data.knowledge_base_ids) {
      updateData.knowledge_base_ids = JSON.stringify(data.knowledge_base_ids);
    }
    if (data.instruction_ids) {
      updateData.instruction_ids = JSON.stringify(data.instruction_ids);
    }
    // Convert presence_ids array to presence_id column (JSON string)
    if (Array.isArray(data.presence_ids)) {
      updateData.presence_id = JSON.stringify(data.presence_ids);
    }
    // Remove presence_ids key - DB column is presence_id
    delete updateData.presence_ids;

    // Validate handle uniqueness if being updated
    if (data.handle) {
      updateData.handle = data.handle.toLowerCase();
      const handleExists = await db('platforms')
        .where({ handle: updateData.handle })
        .whereNot({ id })
        .first();
      if (handleExists) {
        throw new Error(`Handle @${data.handle} is already taken`);
      }
    }

    const [platform] = await db('platforms')
      .where({ id })
      .update(updateData)
      .returning('*');

    if (!platform) return null;

    // Parse JSON fields
    platform.knowledge_base_ids = typeof platform.knowledge_base_ids === 'string' 
      ? JSON.parse(platform.knowledge_base_ids) 
      : platform.knowledge_base_ids || [];
    platform.instruction_ids = typeof platform.instruction_ids === 'string' 
      ? JSON.parse(platform.instruction_ids) 
      : platform.instruction_ids || [];
    // Parse presence_id column as array
    if (platform.presence_id && typeof platform.presence_id === 'string') {
      try {
        const parsed = JSON.parse(platform.presence_id);
        platform.presence_ids = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        platform.presence_ids = platform.presence_id ? [platform.presence_id] : [];
      }
    } else {
      platform.presence_ids = [];
    }

    return this.withCounts(platform);
  }

  async delete(id: string): Promise<boolean> {
    const count = await db('platforms').where({ id }).del();
    if (count > 0) {
      logger.info(`Platform/Project deleted: ${id}`);
    }
    return count > 0;
  }

  private async withCounts(platform: Platform): Promise<PlatformWithCounts> {
    // Parse JSON fields if needed
    if (typeof platform.knowledge_base_ids === 'string') {
      platform.knowledge_base_ids = JSON.parse(platform.knowledge_base_ids);
    }
    if (typeof platform.instruction_ids === 'string') {
      platform.instruction_ids = JSON.parse(platform.instruction_ids);
    } else if (!platform.instruction_ids) {
      platform.instruction_ids = [];
    }
    // Parse presence_id column as array
    if ((platform as any).presence_id && typeof (platform as any).presence_id === 'string') {
      try {
        const parsed = JSON.parse((platform as any).presence_id);
        platform.presence_ids = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        platform.presence_ids = (platform as any).presence_id ? [(platform as any).presence_id] : [];
      }
    } else if (!platform.presence_ids) {
      platform.presence_ids = [];
    }

    const [assetCount] = await db('assets')
      .where({ platform_id: platform.id, is_active: true })
      .count('id as count');

    const [gameCount] = await db('games')
      .where({ platform_id: platform.id, is_active: true })
      .count('id as count');

    // Count child projects from the projects table
    let projectsCount = 0;
    // Check if projects table exists before counting
    try {
      const [projectCount] = await db('projects')
        .where({ platform_id: platform.id, is_active: true })
        .count('id as count');
      projectsCount = Number(projectCount?.count || 0);
    } catch (e) {
      // Projects table may not exist yet
      projectsCount = 0;
    }

    return {
      ...platform,
      assets_count: Number(assetCount?.count || 0),
      games_count: Number(gameCount?.count || 0),
      projects_count: projectsCount,
    };
  }
}

export const platformService = new PlatformService();
export default PlatformService;