// ============================================
// Kinship Studio â€” API Client
// Connects to kinship-assets backend
// ============================================

import type {
  Asset,
  AssetWithMetadata,
  AssetMetadata,
  AssetQueryParams,
  CreateAssetPayload,
  UpdateAssetPayload,
  CreateMetadataPayload,
  AssetKnowledge,
  AssetKnowledgePayload,
  PaginatedResponse,
  AuditLogEntry,
  Scene,
  SceneManifest,
  SceneManifestResponse,
  CreateScenePayload,
  UpdateScenePayload,
  Quest,
  CreateQuestPayload,
  UpdateQuestPayload,
  QuestQueryParams,
  Challenge,
  ChallengeCreate,
  ChallengeUpdate,
  ChallengeQueryParams,
  PaginatedChallengeResponse,
  NPC,
  NPCCreate,
  NPCUpdate,
  NPCQueryParams,
  PaginatedNPCResponse,
  KnowledgeDocument,
  KnowledgeCreate,
  KnowledgeUpdate,
  KnowledgeQueryParams,
  Prompt,
  PromptCreate,
  PromptUpdate,
  PromptQueryParams,
  HeartsFacetData,
  HeartsFacetUpdate,
  HeartsRubricEntry,
  HeartsRubricBulkUpdate,
  HeartsStats,
  Route,
  RouteCreate,
  RouteUpdate,
  RouteQueryParams,
  Platform,
  CreatePlatformPayload,
  UpdatePlatformPayload,
  Game,
  CreateGamePayload,
  UpdateGamePayload,
  GenerateApiResponse,
} from './types'

// Base URLs â€” configurable via env
const ASSETS_API_BASE =
  process.env.NEXT_PUBLIC_ASSETS_API_URL || 'http://localhost:4000/api/v1'
const BACKEND_API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ============================================
// Generic fetch wrapper
// ============================================

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`

    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }))
      throw new ApiRequestError(
        res.status,
        error.message || res.statusText,
        error
      )
    }

    // 204 No Content
    if (res.status === 204) {
      return undefined as T
    }

    return res.json()
  }

  // Build query string from params
  private qs(params?: Record<string, unknown>): string {
    if (!params) return ''
    const entries = Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null && v !== ''
    )
    if (entries.length === 0) return ''
    return (
      '?' +
      new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
    )
  }

  // ==========================================
  // ASSETS
  // ==========================================

  async listAssets(
    params?: AssetQueryParams
  ): Promise<PaginatedResponse<Asset>> {
    return this.request(`/assets${this.qs(params as Record<string, unknown>)}`)
  }

  async getAsset(id: string): Promise<AssetWithMetadata> {
    return this.request(`/assets/${id}`)
  }

  async createAsset(file: File, payload: CreateAssetPayload): Promise<Asset> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('name', payload.name)
    formData.append('display_name', payload.display_name)
    formData.append('type', payload.type)
    formData.append('created_by', payload.created_by)
    if (payload.meta_description)
      formData.append('meta_description', payload.meta_description)
    if (payload.tags) formData.append('tags', JSON.stringify(payload.tags))

    const url = `${this.baseUrl}/assets`
    const res = await fetch(url, { method: 'POST', body: formData })

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }))
      throw new ApiRequestError(
        res.status,
        error.message || res.statusText,
        error
      )
    }

    return res.json()
  }

  async updateAsset(id: string, payload: UpdateAssetPayload): Promise<Asset> {
    return this.request(`/assets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  }

  async deleteAsset(id: string): Promise<void> {
    return this.request(`/assets/${id}`, { method: 'DELETE' })
  }

  // ==========================================
  // METADATA
  // ==========================================

  async getMetadata(assetId: string): Promise<AssetMetadata> {
    return this.request(`/assets/${assetId}/metadata`)
  }

  async createMetadata(
    assetId: string,
    payload: CreateMetadataPayload
  ): Promise<AssetMetadata> {
    return this.request(`/assets/${assetId}/metadata`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async updateMetadata(
    assetId: string,
    payload: CreateMetadataPayload
  ): Promise<AssetMetadata> {
    return this.request(`/assets/${assetId}/metadata`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  }

  // ==========================================
  // ASSET KNOWLEDGE (AI-generated semantic data)
  // ==========================================

  async getAssetKnowledge(assetId: string): Promise<AssetKnowledge | null> {
    try {
      return await this.request(`/assets/${assetId}/knowledge`)
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) {
        return null
      }
      throw err
    }
  }

  async saveAssetKnowledge(
    assetId: string,
    payload: AssetKnowledgePayload
  ): Promise<AssetKnowledge> {
    return this.request(`/assets/${assetId}/knowledge`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  }

  async deleteAssetKnowledge(assetId: string): Promise<void> {
    return this.request(`/assets/${assetId}/knowledge`, { method: 'DELETE' })
  }

  async getAssetKnowledgeStats(): Promise<{
    total_assets: number
    with_knowledge: number
    without_knowledge: number
    by_role: Record<string, number>
  }> {
    return this.request('/assets/knowledge/stats')
  }

  // ==========================================
  // SPECIAL QUERIES
  // ==========================================

  async getAssetsByFacet(facet: string): Promise<Asset[]> {
    return this.request(`/assets/by-facet/${facet}`)
  }

  async getAuditLog(assetId: string): Promise<AuditLogEntry[]> {
    return this.request(`/assets/${assetId}/audit`)
  }

  // ==========================================
  // SCENES
  // ==========================================

  async listScenes(sceneType?: string, gameId?: string): Promise<Scene[]> {
    const params = new URLSearchParams()
    if (sceneType) params.set('scene_type', sceneType)
    if (gameId) params.set('game_id', gameId)
    const qs = params.toString() ? `?${params.toString()}` : ''
    return this.request(`/scenes${qs}`)
  }

  async getScene(id: string): Promise<Scene> {
    return this.request(`/scenes/${id}`)
  }

  async getSceneManifest(id: string): Promise<SceneManifestResponse> {
    return this.request(`/scenes/${id}/manifest?fullManifest=true`)
  }

  async createScene(payload: CreateScenePayload): Promise<Scene> {
    return this.request('/scenes', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async updateScene(id: string, payload: UpdateScenePayload): Promise<Scene> {
    return this.request(`/scenes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  }

  async deleteScene(id: string): Promise<void> {
    return this.request(`/scenes/${id}`, { method: 'DELETE' })
  }

  async addAssetToScene(
    sceneId: string,
    assetId: string,
    position?: { x: number; y: number },
    z_index?: number
  ): Promise<void> {
    return this.request(`/scenes/${sceneId}/assets/${assetId}`, {
      method: 'POST',
      body: JSON.stringify({ position, z_index }),
    })
  }

  async removeAssetFromScene(sceneId: string, assetId: string): Promise<void> {
    return this.request(`/scenes/${sceneId}/assets/${assetId}`, {
      method: 'DELETE',
    })
  }

  // ==========================================
  // PLATFORMS
  // ==========================================

  async listPlatforms(): Promise<Platform[]> {
    return this.request('/platforms')
  }

  async getPlatform(id: string): Promise<Platform> {
    return this.request(`/platforms/${id}`)
  }

  async createPlatform(data: CreatePlatformPayload): Promise<Platform> {
    return this.request('/platforms', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updatePlatform(
    id: string,
    data: UpdatePlatformPayload
  ): Promise<Platform> {
    return this.request(`/platforms/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deletePlatform(id: string): Promise<void> {
    return this.request(`/platforms/${id}`, { method: 'DELETE' })
  }

  // ==========================================
  // GAMES
  // ==========================================

  async listGames(
    platformId: string,
    params?: { status?: string; page?: number; limit?: number }
  ): Promise<{ data: Game[]; total: number }> {
    const query = new URLSearchParams({ platform_id: platformId })
    if (params?.status) query.set('status', params.status)
    if (params?.page) query.set('page', String(params.page))
    if (params?.limit) query.set('limit', String(params.limit))
    return this.request(`/games?${query}`)
  }

  async getGame(id: string): Promise<Game> {
    return this.request(`/games/${id}`)
  }

  async createGame(data: CreateGamePayload): Promise<Game> {
    return this.request('/games', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateGame(id: string, data: UpdateGamePayload): Promise<Game> {
    return this.request(`/games/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteGame(id: string): Promise<void> {
    return this.request(`/games/${id}`, { method: 'DELETE' })
  }

  // ==========================================
  // FILE UPLOAD (GCS)
  // ==========================================

  async uploadFile(
    file: File,
    folder: string = 'games'
  ): Promise<{ url: string; file_url: string; filename: string }> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('folder', folder)

    const response = await fetch(`${this.baseUrl}/upload`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: 'Upload failed' }))
      throw new Error(error.error || error.detail || `HTTP ${response.status}`)
    }

    return response.json()
  }

  // ==========================================
  // HEALTH
  // ==========================================

  async health(): Promise<{ status: string; db: string; gcs: string }> {
    return this.request('/health')
  }
}

// ============================================
// Backend API Client (kinship-backend)
// ============================================

class BackendApiClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`

    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }))
      throw new ApiRequestError(
        res.status,
        error.message || error.detail || res.statusText,
        error
      )
    }

    if (res.status === 204) {
      return undefined as T
    }

    return res.json()
  }

  private qs(params?: Record<string, unknown>): string {
    if (!params) return ''
    const entries = Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null && v !== ''
    )
    if (entries.length === 0) return ''
    return (
      '?' +
      new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
    )
  }

  // ==========================================
  // QUESTS
  // ==========================================

  async listQuests(params?: QuestQueryParams): Promise<Quest[]> {
    return this.request(
      `/api/quests${this.qs(params as Record<string, unknown>)}`
    )
  }

  async getQuest(id: string): Promise<Quest> {
    return this.request(`/api/quests/${id}`)
  }

  async createQuest(payload: CreateQuestPayload): Promise<Quest> {
    return this.request('/api/quests', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async updateQuest(id: string, payload: UpdateQuestPayload): Promise<Quest> {
    return this.request(`/api/quests/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  }

  async deleteQuest(id: string): Promise<void> {
    return this.request(`/api/quests/${id}`, { method: 'DELETE' })
  }

  // ==========================================
  // CHALLENGES
  // ==========================================

  async listChallenges(params?: ChallengeQueryParams): Promise<PaginatedChallengeResponse> {
    return this.request(
      `/api/challenges${this.qs(params as Record<string, unknown>)}`
    )
  }

  async getChallenge(id: string): Promise<Challenge> {
    return this.request(`/api/challenges/${id}`)
  }

  async createChallenge(payload: ChallengeCreate): Promise<Challenge> {
    return this.request('/api/challenges', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async updateChallenge(
    id: string,
    payload: ChallengeUpdate
  ): Promise<Challenge> {
    return this.request(`/api/challenges/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  }

  async deleteChallenge(id: string): Promise<void> {
    return this.request(`/api/challenges/${id}`, { method: 'DELETE' })
  }

  // ==========================================
  // NPCS
  // ==========================================

  async listNPCs(params?: NPCQueryParams): Promise<PaginatedNPCResponse> {
    return this.request(
      `/api/npcs${this.qs(params as Record<string, unknown>)}`
    )
  }

  async getNPC(id: string): Promise<NPC> {
    return this.request(`/api/npcs/${id}`)
  }

  async createNPC(payload: NPCCreate): Promise<NPC> {
    return this.request('/api/npcs', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async updateNPC(id: string, payload: NPCUpdate): Promise<NPC> {
    return this.request(`/api/npcs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  }

  async deleteNPC(id: string): Promise<void> {
    return this.request(`/api/npcs/${id}`, { method: 'DELETE' })
  }

  // ==========================================
  // SCENES (for dropdown references)
  // ==========================================

  async listScenes(): Promise<
    { id: string; scene_name: string; scene_type: string }[]
  > {
    // Fetch from assets service for scene list
    const res = await fetch(`${ASSETS_API_BASE}/scenes`)
    if (!res.ok) return []
    return res.json()
  }

  // ==========================================
  // KNOWLEDGE
  // ==========================================

  async listKnowledge(
    params?: KnowledgeQueryParams
  ): Promise<KnowledgeDocument[]> {
    const query = params
      ? `?${new URLSearchParams(params as Record<string, string>).toString()}`
      : ''
    return this.request(`/api/knowledge${query}`)
  }

  async getKnowledge(id: string): Promise<KnowledgeDocument> {
    return this.request(`/api/knowledge/${id}`)
  }

  async createKnowledge(data: KnowledgeCreate): Promise<KnowledgeDocument> {
    return this.request('/api/knowledge', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateKnowledge(
    id: string,
    data: KnowledgeUpdate
  ): Promise<KnowledgeDocument> {
    return this.request(`/api/knowledge/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteKnowledge(id: string): Promise<void> {
    return this.request(`/api/knowledge/${id}`, {
      method: 'DELETE',
    })
  }

  async ingestKnowledge(id: string): Promise<KnowledgeDocument> {
    return this.request(`/api/knowledge/${id}/ingest`, {
      method: 'POST',
    })
  }

  async uploadKnowledge(
    file: File,
    options: {
      title?: string
      category?: string
      doc_type?: string
      tags?: string[]
      facets?: string[]
      platform_id?: string
    } = {}
  ): Promise<KnowledgeDocument> {
    const formData = new FormData()
    formData.append('file', file)
    if (options.title) formData.append('title', options.title)
    if (options.category) formData.append('category', options.category)
    if (options.doc_type) formData.append('doc_type', options.doc_type)
    if (options.tags?.length) formData.append('tags', options.tags.join(','))
    if (options.facets?.length)
      formData.append('facets', options.facets.join(','))
    if (options.platform_id) formData.append('platform_id', options.platform_id)

    const response = await fetch(`${this.baseUrl}/api/knowledge/upload`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ detail: 'Upload failed' }))
      throw new Error(error.detail || `HTTP ${response.status}`)
    }

    return response.json()
  }

  // ==========================================
  // PROMPTS
  // ==========================================

  async listPrompts(params?: PromptQueryParams): Promise<Prompt[]> {
    const query = params
      ? `?${new URLSearchParams(params as Record<string, string>).toString()}`
      : ''
    return this.request(`/api/prompts${query}`)
  }

  async getPrompt(id: string): Promise<Prompt> {
    return this.request(`/api/prompts/${id}`)
  }

  async createPrompt(data: PromptCreate): Promise<Prompt> {
    return this.request('/api/prompts', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updatePrompt(id: string, data: PromptUpdate): Promise<Prompt> {
    return this.request(`/api/prompts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deletePrompt(id: string): Promise<void> {
    return this.request(`/api/prompts/${id}`, {
      method: 'DELETE',
    })
  }

  // ==========================================
  // HEARTS
  // ==========================================

  async listHeartsFacets(): Promise<HeartsFacetData[]> {
    return this.request('/api/hearts/facets')
  }

  async getHeartsStats(): Promise<HeartsStats> {
    return this.request('/api/hearts/stats')
  }

  async getHeartsFacet(key: string): Promise<HeartsFacetData> {
    return this.request(`/api/hearts/facets/${key}`)
  }

  async updateHeartsFacet(
    key: string,
    data: HeartsFacetUpdate
  ): Promise<HeartsFacetData> {
    return this.request(`/api/hearts/facets/${key}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async listHeartsRubric(): Promise<HeartsRubricEntry[]> {
    return this.request('/api/hearts/rubric')
  }

  async updateHeartsRubric(
    data: HeartsRubricBulkUpdate
  ): Promise<HeartsRubricEntry[]> {
    return this.request('/api/hearts/rubric', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  // ==========================================
  // ROUTES
  // ==========================================

  async listRoutes(params?: RouteQueryParams): Promise<Route[]> {
    return this.request(
      `/api/routes${this.qs(params as Record<string, unknown>)}`
    )
  }

  async getRoute(id: string): Promise<Route> {
    return this.request(`/api/routes/${id}`)
  }

  async createRoute(data: RouteCreate): Promise<Route> {
    return this.request('/api/routes', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateRoute(id: string, data: RouteUpdate): Promise<Route> {
    return this.request(`/api/routes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteRoute(id: string): Promise<void> {
    return this.request(`/api/routes/${id}`, {
      method: 'DELETE',
    })
  }

  // ==========================================
  // HEALTH
  // ==========================================

  async health(): Promise<{ status: string; websocket_stats?: unknown }> {
    return this.request('/health')
  }

  // ==========================================
  // ASSET KNOWLEDGE GENERATION (Claude Vision)
  // ==========================================

  async generateAssetKnowledge(assetId: string): Promise<{
    status: string
    asset_id: string
    asset_name: string
    knowledge: Record<string, unknown>
  }> {
    return this.request(`/api/asset-knowledge/generate/${assetId}`, {
      method: 'POST',
    })
  }

  async generateAllAssetKnowledge(options?: {
    skip_existing?: boolean
    regenerate_design?: boolean
  }): Promise<Record<string, unknown>> {
    return this.request('/api/asset-knowledge/generate-all', {
      method: 'POST',
      body: JSON.stringify(options || {}),
    })
  }

  async syncAssetKnowledge(options?: {
    force_regenerate?: boolean
    skip_knowledge?: boolean
    skip_design?: boolean
  }): Promise<Record<string, unknown>> {
    return this.request('/api/asset-knowledge/sync', {
      method: 'POST',
      body: JSON.stringify(options || {}),
    })
  }

  async getAssetKnowledgeCoverage(): Promise<{
    total_assets: number
    with_knowledge: number
    without_knowledge: number
    coverage_pct: number
    missing: string[]
    by_scene_role: Record<string, number>
  }> {
    return this.request('/api/asset-knowledge/coverage')
  }

  async deleteAssetEmbedding(
    assetId: string
  ): Promise<{ status: string; asset_id: string; deleted: boolean }> {
    return this.request(`/api/embeddings/asset/${assetId}`, {
      method: 'DELETE',
    })
  }

  /**
   * Analyze a sprite sheet image with AI â€” returns metadata suggestions.
   * Used by upload form to auto-fill sprite_sheet, type, personality, etc.
   */
  async analyzeSprite(
    file: File,
    width: number,
    height: number
  ): Promise<{
    status: string
    analysis?: {
      asset_type: string
      sprite_sheet: {
        is_sprite_sheet: boolean
        columns: number
        rows: number
        frame_width: number
        frame_height: number
        padding: number
        anchor_x: number
        anchor_y: number
        direction_map: Record<string, number> | null
        states: Record<
          string,
          {
            row: number
            start_col: number
            end_col: number
            fps: number
            loop: boolean
          }
        >
      }
      movement: {
        type: string
        speed: number
        wander_radius: number
        personality: string
      }
      tile_config: {
        walkable: string
        terrain_cost: number
        terrain_type: string
      }
      hitbox: {
        width: number
        height: number
        offset_x: number
        offset_y: number
      }
      spawn_config: {
        default_position: { x: number; y: number }
        layer: string
        z_index: number
        facing: string
      }
      hearts_mapping: {
        primary_facet: string | null
        secondary_facet: string | null
        base_delta: number
        description: string
      }
      rules: {
        requires_item: string | null
        max_users: number
        description: string
        is_movable: boolean
        is_destructible: boolean
        level_required: number
      }
      interaction: { type: string }
      display_name: string
      description: string
      tags: string[]
      scene_roles: string[]
      personality_reason: string
    }
    model?: string
    message?: string
  }> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('filename', file.name)
    formData.append('width', String(width))
    formData.append('height', String(height))

    const response = await fetch(`${this.baseUrl}/api/analyze-sprite`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      throw new ApiRequestError(
        response.status,
        `Sprite analysis failed: ${response.statusText}`
      )
    }

    return response.json()
  }
}

// ============================================
// Kinship Knowledge API v2 Client
// ============================================

const KNOWLEDGE_API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

class KnowledgeApiClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`

    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }))
      throw new ApiRequestError(
        res.status,
        error.detail || error.message || res.statusText,
        error
      )
    }

    if (res.status === 204) {
      return undefined as T
    }

    return res.json()
  }

  // Generate new game from prompt (handles clarification flow)
  async generate(
    prompt: string,
    options?: {
      game_id?: string
      clarifications?: Record<string, string>
      skip_clarification?: boolean
    }
  ): Promise<GenerateApiResponse> {
    return this.request('/api/v2/generate', {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        ...(options?.game_id && { game_id: options.game_id }),
        ...(options?.clarifications && { clarifications: options.clarifications }),
        ...(options?.skip_clarification && { skip_clarification: options.skip_clarification }),
      }),
    })
  }

  // Edit existing game with instruction
  async edit(
    gameId: string,
    instruction: string,
    options?: {
      fetch_from_gcs?: boolean
    }
  ): Promise<{
    success: boolean
    game_id: string
    manifest: Record<string, unknown>
    version: number
    changes: Array<{ edit_type: string; description: string }>
    can_undo: boolean
    duration_ms: number
    warnings: string[]
    synced?: { scenes?: Array<{ id: string; name: string; index: number }> }
  }> {
    return this.request('/api/v2/generate', {
      method: 'POST',
      body: JSON.stringify({
        game_id: gameId,
        instruction,
        fetch_from_gcs: options?.fetch_from_gcs ?? true, // Default to true
      }),
    })
  }

  // Get game state
  async getState(gameId: string): Promise<{
    game_id: string
    version: number
    status: 'ready' | 'generating' | 'error'
    manifest: Record<string, unknown>
    can_undo: boolean
    can_redo: boolean
  }> {
    return this.request(`/api/v2/state/${gameId}`)
  }

  // Undo last edit
  async undo(gameId: string): Promise<{
    success: boolean
    undone?: { edit_type: string; description: string }
    version: number
    can_undo: boolean
    can_redo: boolean
  }> {
    return this.request(`/api/v2/state/${gameId}/undo`, {
      method: 'POST',
    })
  }

  // Redo undone edit
  async redo(gameId: string): Promise<{
    success: boolean
    redone?: { edit_type: string; description: string }
    version: number
    can_undo: boolean
    can_redo: boolean
  }> {
    return this.request(`/api/v2/state/${gameId}/redo`, {
      method: 'POST',
    })
  }

  // Delete game state from memory
  async deleteState(gameId: string): Promise<void> {
    return this.request(`/api/v2/state/${gameId}`, {
      method: 'DELETE',
    })
  }

  // List all active game states
  async listStates(options?: {
    limit?: number
    status?: string
  }): Promise<{
    count: number
    states: Array<{
      game_id: string
      version: number
      status: string
      scene_count: number
      edit_count: number
    }>
  }> {
    const params = new URLSearchParams()
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.status) params.set('status', options.status)
    const qs = params.toString() ? `?${params}` : ''
    return this.request(`/api/v2/states${qs}`)
  }

  // ═══════════════════════════════════════════════════════════════
  // Validation API
  // ═══════════════════════════════════════════════════════════════

  async validate(
    manifest: Record<string, unknown>,
    options?: {
      stop_on_error?: boolean
      skip_validators?: string[]
    }
  ): Promise<{
    valid: boolean
    total_errors: number
    total_warnings: number
    duration_ms: number
    validators: Array<{
      name: string
      passed: boolean
      errors: Array<{ code: string; message: string; location: string }>
      warnings: Array<{ code: string; message: string; location: string }>
      duration_ms: number
    }>
    summary: string
  }> {
    return this.request('/api/v2/validate', {
      method: 'POST',
      body: JSON.stringify({
        manifest,
        ...options,
      }),
    })
  }

  // ═══════════════════════════════════════════════════════════════
  // Mechanics API
  // ═══════════════════════════════════════════════════════════════

  async getMechanics(): Promise<{
    count: number
    mechanics: Array<{
      id: string
      name: string
      description: string
      category: string
      pack: string
      required_affordances: string[]
      required_capabilities: string[]
      base_difficulty: number
      hearts_facets: string[]
      object_slots: string[]
    }>
  }> {
    return this.request('/api/v2/mechanics')
  }

  async getMechanic(mechanicId: string): Promise<{
    id: string
    name: string
    description: string
    category: string
    pack: string
    base_difficulty: number
    required_affordances: string[]
    required_capabilities: string[]
    hearts_facets: string[]
    object_slots: Record<
      string,
      {
        affordance: string
        capability: string | null
        min_count: number
        max_count: number
        is_draggable: boolean
        is_collectible: boolean
        is_interactable: boolean
      }
    >
    has_template: boolean
    supported_npc_roles: string[]
    template: {
      difficulty_range: [number, number]
      estimated_time_seconds: number
      constraints: Record<string, { min: number; max: number; default: number }>
      base_score: number
      base_hearts: number
    } | null
  }> {
    return this.request(`/api/v2/mechanics/${mechanicId}`)
  }

  // ═══════════════════════════════════════════════════════════════
  // Templates API
  // ═══════════════════════════════════════════════════════════════

  async getTemplates(): Promise<{
    count: number
    templates: Array<{
      id: string
      mechanic_id: string
      mechanic_name: string
      difficulty_range: [number, number]
      estimated_time_seconds: number
      constraints: Record<string, { min: number; max: number; default: number }>
      base_score: number
      base_hearts: number
    }>
  }> {
    return this.request('/api/v2/templates')
  }

  // ═══════════════════════════════════════════════════════════════
  // NPC Roles API
  // ═══════════════════════════════════════════════════════════════

  async getNpcRoles(): Promise<{
    count: number
    roles: Array<{
      role: string
      supported_mechanics: string[]
      description: string
    }>
    mechanic_to_role: Record<string, string[]>
  }> {
    return this.request('/api/v2/npc-roles')
  }

  // ═══════════════════════════════════════════════════════════════
  // Reference Data APIs
  // ═══════════════════════════════════════════════════════════════

  async getGoalTypes(): Promise<{
    goal_types: Array<{ id: string; name: string }>
  }> {
    return this.request('/api/v2/goal-types')
  }

  async getAudienceTypes(): Promise<{
    audience_types: Array<{ id: string; name: string }>
  }> {
    return this.request('/api/v2/audience-types')
  }

  async getDifficultyCurves(): Promise<{
    curve_types: Array<{ id: string; name: string }>
  }> {
    return this.request('/api/v2/difficulty-curves')
  }

  async getInfo(): Promise<{
    version: string
    pipeline: {
      stages: string[]
      validators: string[]
    }
    capabilities: {
      mechanics_count: number
      templates_count: number
      npc_roles: string[]
      goal_types: string[]
      audience_types: string[]
      difficulty_curves: string[]
      supports_validation: boolean
      ai_provider: string
    }
  }> {
    return this.request('/api/v2/info')
  }
}

// ============================================
// Custom error class
// ============================================

export class ApiRequestError extends Error {
  status: number
  details: unknown

  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.details = details
  }
}

// ============================================
// Singleton exports
// ============================================

export const api = new ApiClient(ASSETS_API_BASE)
export const backendApi = new BackendApiClient(BACKEND_API_BASE)
export const knowledgeApi = new KnowledgeApiClient(KNOWLEDGE_API_BASE)