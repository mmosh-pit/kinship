import db from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import type { Project, ProjectWithCounts, CreateProjectRequest, UpdateProjectRequest } from '../types';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

class ProjectService {
  async create(data: CreateProjectRequest): Promise<ProjectWithCounts> {
    const id = uuidv4();
    const slug = slugify(data.name);

    // Check for duplicate slug within the same platform
    const existing = await db('projects')
      .where({ slug, platform_id: data.platform_id })
      .first();
    const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

    // Check for duplicate handle if provided
    if (data.handle) {
      const handleExists = await db('projects')
        .where({ handle: data.handle.toLowerCase() })
        .first();
      if (handleExists) {
        throw new Error(`Handle @${data.handle} is already taken`);
      }
    }

    // Verify platform exists
    const platform = await db('platforms').where({ id: data.platform_id }).first();
    if (!platform) {
      throw new Error('Platform not found');
    }

    const [project] = await db('projects')
      .insert({
        id,
        platform_id: data.platform_id,
        name: data.name,
        slug: finalSlug,
        handle: data.handle?.toLowerCase() || null,
        description: data.description || '',
        icon: data.icon || '📁',
        color: data.color || '#A855F7',
        presence_id: JSON.stringify(data.presence_ids || []),
        visibility: data.visibility || 'public',
        knowledge_base_ids: JSON.stringify(data.knowledge_base_ids || []),
        gathering_ids: JSON.stringify(data.gathering_ids || []),
        instruction_ids: JSON.stringify(data.instruction_ids || []),
        created_by: data.created_by,
      })
      .returning('*');

    // Parse JSON fields
    project.knowledge_base_ids = typeof project.knowledge_base_ids === 'string'
      ? JSON.parse(project.knowledge_base_ids)
      : project.knowledge_base_ids || [];
    project.gathering_ids = typeof project.gathering_ids === 'string'
      ? JSON.parse(project.gathering_ids)
      : project.gathering_ids || [];
    project.instruction_ids = typeof project.instruction_ids === 'string'
      ? JSON.parse(project.instruction_ids)
      : project.instruction_ids || [];
    // Parse presence_id column as array
    if (project.presence_id && typeof project.presence_id === 'string') {
      try {
        const parsed = JSON.parse(project.presence_id);
        project.presence_ids = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        project.presence_ids = project.presence_id ? [project.presence_id] : [];
      }
    } else {
      project.presence_ids = [];
    }

    logger.info(`Project created: ${data.name} (${id}) under platform ${data.platform_id}`);
    return { ...project, assets_count: 0, games_count: 0 };
  }

  async getById(id: string): Promise<ProjectWithCounts | null> {
    const project = await db('projects').where({ id }).first();
    if (!project) return null;
    return this.withCounts(project);
  }

  async getBySlug(platformId: string, slug: string): Promise<ProjectWithCounts | null> {
    const project = await db('projects').where({ platform_id: platformId, slug }).first();
    if (!project) return null;
    return this.withCounts(project);
  }

  async getByHandle(handle: string): Promise<ProjectWithCounts | null> {
    const project = await db('projects').where({ handle: handle.toLowerCase() }).first();
    if (!project) return null;
    return this.withCounts(project);
  }

  async list(options?: {
    platform_id?: string;
    visibility?: string;
    is_active?: boolean;
  }): Promise<ProjectWithCounts[]> {
    let query = db('projects').where({ is_active: true });

    if (options?.platform_id) {
      query = query.where({ platform_id: options.platform_id });
    }
    if (options?.visibility) {
      query = query.where({ visibility: options.visibility });
    }

    const projects = await query.orderBy('created_at', 'asc');

    return Promise.all(projects.map((p: Project) => this.withCounts(p)));
  }

  async listByPlatformId(platformId: string): Promise<ProjectWithCounts[]> {
    const projects = await db('projects')
      .where({ platform_id: platformId, is_active: true })
      .orderBy('created_at', 'asc');

    return Promise.all(projects.map((p: Project) => this.withCounts(p)));
  }

  async update(id: string, data: UpdateProjectRequest): Promise<ProjectWithCounts | null> {
    const updateData: any = { ...data, updated_at: db.fn.now() };

    // If name changed, update slug too
    if (data.name) {
      updateData.slug = slugify(data.name);
    }

    // Handle JSON fields
    if (data.knowledge_base_ids) {
      updateData.knowledge_base_ids = JSON.stringify(data.knowledge_base_ids);
    }
    if (data.gathering_ids) {
      updateData.gathering_ids = JSON.stringify(data.gathering_ids);
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
      const handleExists = await db('projects')
        .where({ handle: updateData.handle })
        .whereNot({ id })
        .first();
      if (handleExists) {
        throw new Error(`Handle @${data.handle} is already taken`);
      }
    }

    const [project] = await db('projects')
      .where({ id })
      .update(updateData)
      .returning('*');

    if (!project) return null;

    // Parse JSON fields
    project.knowledge_base_ids = typeof project.knowledge_base_ids === 'string'
      ? JSON.parse(project.knowledge_base_ids)
      : project.knowledge_base_ids || [];
    project.gathering_ids = typeof project.gathering_ids === 'string'
      ? JSON.parse(project.gathering_ids)
      : project.gathering_ids || [];
    project.instruction_ids = typeof project.instruction_ids === 'string'
      ? JSON.parse(project.instruction_ids)
      : project.instruction_ids || [];
    // Parse presence_id column as array
    if (project.presence_id && typeof project.presence_id === 'string') {
      try {
        const parsed = JSON.parse(project.presence_id);
        project.presence_ids = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        project.presence_ids = project.presence_id ? [project.presence_id] : [];
      }
    } else {
      project.presence_ids = [];
    }

    return this.withCounts(project);
  }

  async delete(id: string): Promise<boolean> {
    const count = await db('projects').where({ id }).del();
    if (count > 0) {
      logger.info(`Project deleted: ${id}`);
    }
    return count > 0;
  }

  private async withCounts(project: Project): Promise<ProjectWithCounts> {
    // Parse JSON fields if needed
    if (typeof project.knowledge_base_ids === 'string') {
      project.knowledge_base_ids = JSON.parse(project.knowledge_base_ids);
    }
    if (typeof project.gathering_ids === 'string') {
      project.gathering_ids = JSON.parse(project.gathering_ids);
    }
    if (typeof project.instruction_ids === 'string') {
      project.instruction_ids = JSON.parse(project.instruction_ids);
    } else if (!project.instruction_ids) {
      project.instruction_ids = [];
    }
    // Parse presence_id column as array
    if ((project as any).presence_id && typeof (project as any).presence_id === 'string') {
      try {
        const parsed = JSON.parse((project as any).presence_id);
        project.presence_ids = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        project.presence_ids = (project as any).presence_id ? [(project as any).presence_id] : [];
      }
    } else if (!project.presence_ids) {
      project.presence_ids = [];
    }

    // For now, projects don't have direct asset/game counts
    // In the future, this can be expanded if projects have their own assets/games
    return {
      ...project,
      assets_count: 0,
      games_count: 0,
    };
  }
}

export const projectService = new ProjectService();
export default ProjectService;