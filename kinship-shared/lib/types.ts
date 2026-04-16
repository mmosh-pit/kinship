// ============================================
// Kinship Studio — API Types
// Mirrors kinship-assets backend types
// ============================================

// --- Enums ---

export type AssetType =
  | 'tile'
  | 'sprite'
  | 'object'
  | 'npc'
  | 'avatar'
  | 'ui'
  | 'audio'
  | 'tilemap'
  | 'animation'
export type AOEShape = 'circle' | 'rectangle' | 'polygon' | 'none'
export type InteractionType =
  | 'tap'
  | 'long_press'
  | 'drag'
  | 'proximity'
  | 'none'
export type HeartsFacet = 'H' | 'E' | 'A' | 'R' | 'T' | 'Si' | 'So'

// --- Core Asset ---

export interface Asset {
  id: string
  name: string
  display_name: string
  type: AssetType
  meta_description: string
  file_url: string
  thumbnail_url: string | null
  file_size: number
  mime_type: string
  tags: string[]
  version: number
  is_active: boolean
  created_by: string
  created_at: string
  updated_at: string
}

export interface AssetWithMetadata extends Asset {
  metadata: AssetMetadata | null
}

// --- Metadata ---

export interface AssetMetadata {
  id: string
  asset_id: string
  aoe: AOEConfig
  hitbox: HitboxConfig
  interaction: InteractionConfig
  hearts_mapping: HeartsMapping
  states: string[]
  animations: Record<string, AnimationEntry>
  sprite_sheet: SpriteSheetConfig | null
  spawn: SpawnConfig
  rules: AssetRules
  tile_config: TileConfig
  audio_config: AudioConfig
  tilemap_config: TilemapConfig
  movement: MovementConfig
  custom_properties: Record<string, unknown>
}

export interface AOEConfig {
  shape: AOEShape
  radius?: number
  width?: number
  height?: number
  vertices?: { x: number; y: number }[]
  unit: 'tiles' | 'pixels'
}

export interface HitboxConfig {
  width: number
  height: number
  offset_x: number
  offset_y: number
}

export interface InteractionConfig {
  type: InteractionType
  range: number
  cooldown_ms: number
  requires_facing: boolean
}

export interface HeartsMapping {
  primary_facet: HeartsFacet | null
  secondary_facet: HeartsFacet | null
  base_delta: number
  description: string
}

export interface AnimationEntry {
  file: string
  frames: number
  fps: number
  loop: boolean
}

// --- Sprite Sheet Config ---

export interface SpriteStateConfig {
  row: number
  start_col: number
  end_col: number
  fps: number
  loop: boolean
}

export interface SpriteSheetConfig {
  frame_width: number
  frame_height: number
  columns: number
  rows: number
  anchor_x: number
  anchor_y: number
  padding: number
  direction_map: Record<string, string> | null
  states: Record<string, SpriteStateConfig>
}

export interface SpawnConfig {
  default_position: { x: number; y: number }
  layer: string
  z_index: number
  facing: string
}

export interface AssetRules {
  requires_item: string | null
  max_users: number
  description: string
  is_movable: boolean
  is_destructible: boolean
  level_required: number
}

// --- Tile Config ---

export type TileWalkability = 'walkable' | 'blocked' | 'slow' | 'hazard'

export interface TileConfig {
  walkable: TileWalkability
  terrain_cost: number
  terrain_type: string
  auto_group: string
  is_edge: boolean
}

// --- Audio Config ---

export type AudioTrigger = 'ambient' | 'proximity' | 'event' | 'interaction'
export type AudioCategory = 'sfx' | 'music' | 'ambient' | 'ui' | 'voice'

export interface AudioConfig {
  volume: number
  loop: boolean
  fade_in_ms: number
  fade_out_ms: number
  spatial: boolean
  trigger: AudioTrigger
  radius: number
  category: AudioCategory
}

// --- Tilemap Config ---

export type TilemapOrientation = 'isometric' | 'orthogonal' | 'hexagonal'

export interface TilemapConfig {
  grid_width: number
  grid_height: number
  tile_size: number
  layer_count: number
  orientation: TilemapOrientation
}

// --- Movement Config ---

export type MoveType = 'static' | 'wander' | 'patrol' | 'follow' | 'flee'
export type MovePersonality =
  | 'calm'
  | 'energetic'
  | 'nervous'
  | 'lazy'
  | 'curious'
  | 'guard'
  | 'ambient'
  | 'playful'
  | 'shy'
  | 'aggressive'
  | 'graceful'
  | 'erratic'
  | 'social'
  | 'patrol'
  | ''

export interface MovementConfig {
  speed: number
  type: MoveType
  wander_radius: number
  patrol_path: { x: number; y: number }[] | null
  avoid_obstacles: boolean
  personality: MovePersonality
}

// --- Scene ---

export interface Scene {
  id: string
  scene_name: string
  name?: string // Backward compatibility
  scene_type: string // free text
  tile_map_url: string
  spawn_points: SpawnPoint[]
  ambient: AmbientConfig
  system_prompt: string | null
  description: string | null
  version: number
  is_active: boolean
  created_by: string
  created_at: string
  updated_at: string
  asset_ids?: string[]
}

export interface SpawnPoint {
  id: string
  label: string
  position: { x: number; y: number }
  type: 'player' | 'npc' | 'object'
  assigned_asset_id: string | null
}

export interface AmbientConfig {
  music_track: string | null
  lighting: 'day' | 'night' | 'dawn' | 'dusk'
  weather: 'clear' | 'rain' | 'fog' | 'snow' | 'none'
}

export interface SceneManifest extends Scene {
  assets?: (Asset & {
    position_x: number
    position_y: number
    z_index: number
    overrides: Record<string, unknown>
    metadata: AssetMetadata | null
  })[]
}

// GCS Manifest layer - contains NPCs, challenges, routes for a scene
export interface GCSManifest {
  npcs?: Array<{
    npc_id?: string
    id?: string
    name: string
    actor_type?: string
    role?: string
    personality?: string
    greeting?: string
    position?: { x: number; y: number }
    x?: number
    y?: number
    facet?: string
  }>
  challenges?: Array<{
    challenge_id?: string
    id?: string
    name: string
    mechanic_type?: string
    mechanic_id?: string
    description?: string
    difficulty?: number
    trigger?: Record<string, unknown>
    on_complete?: Record<string, unknown>
  }>
  routes?: Array<{
    from_scene_id?: string
    from_scene_name?: string
    to_scene_id?: string
    to_scene_name?: string
    trigger?: { type?: string } & Record<string, unknown>
  }>
}

// API response for scene manifest endpoint
export interface SceneManifestResponse {
  scene: SceneManifest
  assets: (Asset & {
    position_x: number
    position_y: number
    z_index: number
    overrides?: Record<string, unknown>
    metadata?: AssetMetadata | null
  })[]
  // GCS manifest layer - returned when fullManifest=true
  gcsManifest?: GCSManifest
}

// --- Audit ---

export interface AuditLogEntry {
  id: string
  asset_id: string
  action: 'created' | 'updated' | 'deleted' | 'uploaded' | 'metadata_changed'
  performed_by: string
  changes: Record<string, unknown>
  performed_at: string
}

// --- API Responses ---

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    total_pages: number
  }
}

export interface ApiError {
  error: string
  message: string
  details?: unknown
}

// --- Request types ---

export interface CreateAssetPayload {
  name: string
  display_name: string
  type: AssetType
  meta_description?: string
  tags?: string[]
  created_by: string
}

export interface UpdateAssetPayload {
  name?: string
  display_name?: string
  type?: AssetType
  meta_description?: string
  tags?: string[]
  is_active?: boolean
}

export interface CreateMetadataPayload {
  aoe?: Partial<AOEConfig>
  hitbox?: Partial<HitboxConfig>
  interaction?: Partial<InteractionConfig>
  hearts_mapping?: Partial<HeartsMapping>
  states?: string[]
  animations?: Record<string, AnimationEntry>
  sprite_sheet?: Partial<SpriteSheetConfig>
  spawn?: Partial<SpawnConfig>
  rules?: Partial<AssetRules>
  tile_config?: Partial<TileConfig>
  audio_config?: Partial<AudioConfig>
  tilemap_config?: Partial<TilemapConfig>
  movement?: Partial<MovementConfig>
  custom_properties?: Record<string, unknown>
}

// --- Asset Knowledge (AI-generated semantic data) ---

export type SceneRole =
  | 'ground_fill'
  | 'path'
  | 'boundary'
  | 'focal_point'
  | 'furniture'
  | 'shelter'
  | 'accent'
  | 'scatter'
  | 'utility'
  | 'lighting'
  | 'signage'
  | 'vegetation'
  | 'prop'
export type PlacementHint =
  | 'single'
  | 'pair'
  | 'cluster'
  | 'scatter'
  | 'line'
  | 'ring'
  | 'border'
  | 'grid'

export interface AssetKnowledge {
  id: string
  asset_id: string
  visual_description: string
  color_palette: string[]
  visual_mood: string[]
  art_style: string
  scene_role: SceneRole
  placement_hint: PlacementHint
  pair_with: string[]
  avoid_near: string[]
  composition_notes: string
  suitable_scenes: string[]
  suitable_facets: string[]
  therapeutic_use: string
  narrative_hook: string
  generated_by: string
  generated_at: string
  generation_version: number
  created_at: string
  updated_at: string
  // AI-generated placement fields
  affordances: string[]
  capabilities: string[]
  placement_type: string
  requires_nearby: string[]
  provides_attachment: string[]
  context_functions: Record<string, string>
}

export interface AssetKnowledgePayload {
  visual_description?: string
  color_palette?: string[]
  visual_mood?: string[]
  art_style?: string
  scene_role?: SceneRole
  placement_hint?: PlacementHint
  pair_with?: string[]
  avoid_near?: string[]
  composition_notes?: string
  suitable_scenes?: string[]
  suitable_facets?: string[]
  therapeutic_use?: string
  narrative_hook?: string
  generated_by?: string
  // AI-generated placement fields
  affordances?: string[]
  capabilities?: string[]
  placement_type?: string
  requires_nearby?: string[]
  provides_attachment?: string[]
  context_functions?: Record<string, string>
}

export interface AssetQueryParams {
  type?: AssetType
  platform_id?: string
  scene_id?: string
  tags?: string
  is_active?: string
  search?: string
  page?: number
  limit?: number
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export interface CreateScenePayload {
  scene_name: string
  scene_type: string
  tile_map_url?: string
  spawn_points?: SpawnPoint[]
  ambient?: Partial<AmbientConfig>
  system_prompt?: string
  description?: string
  created_by: string
}

export interface UpdateScenePayload {
  scene_name?: string
  scene_type?: string
  tile_map_url?: string
  spawn_points?: SpawnPoint[]
  ambient?: Partial<AmbientConfig>
  system_prompt?: string | null
  description?: string | null
  is_active?: boolean
}

// --- Quest (Narrative Beat) ---

export type BeatType =
  | 'Introduction'
  | 'Exploration'
  | 'Challenge'
  | 'Climax'
  | 'Reflection'
  | 'Resolution'
export type QuestStatus = 'draft' | 'published' | 'archived'

export interface Quest {
  id: string
  name: string
  beat_type: BeatType
  facet: HeartsFacet
  game_id: string | null
  scene_id: string | null
  description: string
  narrative_content: string
  completion_conditions: Record<string, any>
  prerequisites: any[]
  rewards: Record<string, any>
  learning_objectives: string[]
  sequence_order: number
  status: QuestStatus
  created_at: string
  updated_at: string
}

export interface CreateQuestPayload {
  name: string
  beat_type: BeatType
  facet: HeartsFacet
  scene_id?: string | null
  description?: string
  narrative_content?: string
  completion_conditions?: Record<string, any>
  prerequisites?: any[]
  rewards?: Record<string, any>
  learning_objectives?: string[]
  sequence_order?: number
  status?: QuestStatus
}

export interface UpdateQuestPayload {
  name?: string
  beat_type?: BeatType
  facet?: HeartsFacet
  scene_id?: string | null
  description?: string
  narrative_content?: string
  completion_conditions?: Record<string, any>
  prerequisites?: any[]
  rewards?: Record<string, any>
  learning_objectives?: string[]
  sequence_order?: number
  status?: QuestStatus
}

export interface QuestQueryParams {
  game_id?: string
  scene_id?: string
  beat_type?: BeatType
  facet?: HeartsFacet
  status?: QuestStatus
  page?: number
  limit?: number
}

// --- Challenge ---

export type Difficulty = 'Easy' | 'Medium' | 'Hard'
export type ChallengeStatus = 'draft' | 'active' | 'archived'
export type Status =
  | 'draft'
  | 'active'
  | 'published'
  | 'archived'
  | 'inactive'
  | 'pending'
  | 'ingested'

// Alias for HEARTS facet keys
export type HeartsFacetKey = HeartsFacet

// Challenge Step
export interface ChallengeStep {
  order: number
  description: string
  hint?: string
}

export interface Challenge {
  id: string
  name: string
  description: string
  game_id: string | null
  scene_id: string | null
  facets: HeartsFacet[]
  difficulty: Difficulty
  mechanic_type: string | null
  steps: ChallengeStep[]
  correct_answers: any[]
  hints: string[]
  feedback: Record<string, any>
  scoring_rubric: Record<string, any>
  learning_objectives: string[]
  success_criteria: string
  base_delta: number
  time_limit_sec: number | null
  status: ChallengeStatus
  created_at: string
  updated_at: string
}

export interface ChallengeCreate {
  name: string
  description?: string
  scene_id?: string | null
  facets?: HeartsFacet[]
  difficulty?: Difficulty
  mechanic_type?: string
  steps?: ChallengeStep[]
  correct_answers?: any[]
  hints?: string[]
  feedback?: Record<string, any>
  scoring_rubric?: Record<string, any>
  learning_objectives?: string[]
  success_criteria?: string
  base_delta?: number
  time_limit_sec?: number | null
  status?: ChallengeStatus
}

export interface ChallengeUpdate {
  name?: string
  description?: string
  scene_id?: string | null
  facets?: HeartsFacet[]
  difficulty?: Difficulty
  mechanic_type?: string
  steps?: ChallengeStep[]
  correct_answers?: any[]
  hints?: string[]
  feedback?: Record<string, any>
  scoring_rubric?: Record<string, any>
  learning_objectives?: string[]
  success_criteria?: string
  base_delta?: number
  time_limit_sec?: number | null
  status?: ChallengeStatus
}

export interface ChallengeQueryParams {
  game_id?: string
  scene_id?: string
  difficulty?: Difficulty
  status?: ChallengeStatus
  page?: number
  limit?: number
}

// Pagination types for challenges
export interface ChallengePaginationMeta {
  page: number
  limit: number
  total: number
  total_pages: number
}

export interface PaginatedChallengeResponse {
  data: Challenge[]
  pagination: ChallengePaginationMeta
}

// --- NPC ---

export type NPCStatus = 'draft' | 'active' | 'archived'

export type ActorType =
  | 'character'
  | 'creature'
  | 'collectible'
  | 'obstacle'
  | 'interactive'
  | 'ambient'
  | 'enemy'
  | 'companion'

export interface Actor {
  id: string
  name: string
  actor_type: ActorType
  role: string
  game_id: string | null
  scene_id: string | null
  facet: HeartsFacet
  // Character fields
  personality: string
  background: string
  dialogue_style: string
  catchphrases: string[]
  greeting: string | null
  dialogue_tree: any[]
  interaction_rules: Record<string, any>
  // Movement & behavior
  movement_pattern: Record<string, any>
  behavior_config: Record<string, any>
  states: any[]
  collision_effect: Record<string, any>
  spawn_config: Record<string, any>
  // Visual
  sprite_asset_id: string | null
  status: NPCStatus
  created_at: string
  updated_at: string
}

export interface ActorCreate {
  name: string
  actor_type?: ActorType
  role?: string
  scene_id?: string | null
  facet?: HeartsFacet
  personality?: string
  background?: string
  dialogue_style?: string
  catchphrases?: string[]
  greeting?: string
  dialogue_tree?: any[]
  interaction_rules?: Record<string, any>
  movement_pattern?: Record<string, any>
  behavior_config?: Record<string, any>
  states?: any[]
  collision_effect?: Record<string, any>
  spawn_config?: Record<string, any>
  sprite_asset_id?: string | null
  status?: NPCStatus
}

export interface ActorUpdate {
  name?: string
  actor_type?: ActorType
  role?: string
  scene_id?: string | null
  facet?: HeartsFacet
  personality?: string
  background?: string
  dialogue_style?: string
  catchphrases?: string[]
  greeting?: string
  dialogue_tree?: any[]
  interaction_rules?: Record<string, any>
  movement_pattern?: Record<string, any>
  behavior_config?: Record<string, any>
  states?: any[]
  collision_effect?: Record<string, any>
  spawn_config?: Record<string, any>
  sprite_asset_id?: string | null
  status?: NPCStatus
}

export interface ActorQueryParams {
  game_id?: string
  scene_id?: string
  actor_type?: string
  facet?: HeartsFacet
  status?: NPCStatus
  page?: number
  limit?: number
}

// Backward-compat aliases
export type NPC = Actor
export type NPCCreate = ActorCreate
export type NPCUpdate = ActorUpdate
export type NPCQueryParams = ActorQueryParams

// Pagination types for NPCs
export interface NPCPaginationMeta {
  page: number
  limit: number
  total: number
  total_pages: number
}

export interface PaginatedNPCResponse {
  data: NPC[]
  pagination: NPCPaginationMeta
}

// --- Knowledge ---

export type KnowledgeCategory =
  | 'HEARTS'
  | 'Scene'
  | 'NPC'
  | 'Challenge'
  | 'General'
  | 'Sages'
export type KnowledgeType =
  | 'facet_definition'
  | 'scene_rules'
  | 'persona'
  | 'pattern'
  | 'guideline'
  | 'reference'
export type IngestStatus = 'pending' | 'ingested' | 'failed' | 'draft'

export interface KnowledgeDocument {
  id: string
  title: string
  content: string
  category: KnowledgeCategory
  doc_type: KnowledgeType
  tags: string[]
  facets: HeartsFacet[]
  source_url: string | null
  file_url: string | null
  file_name: string | null
  pinecone_namespace: string
  chunk_count: number
  ingest_status: IngestStatus
  last_ingested_at: string | null
  platform_id: string | null
  created_at: string
  updated_at: string
}

export interface KnowledgeCreate {
  title: string
  content: string
  category?: KnowledgeCategory
  doc_type?: KnowledgeType
  tags?: string[]
  facets?: HeartsFacet[]
  source_url?: string | null
  ingest_status?: IngestStatus
  platform_id?: string | null
}

export interface KnowledgeUpdate {
  title?: string
  content?: string
  category?: KnowledgeCategory
  doc_type?: KnowledgeType
  tags?: string[]
  facets?: HeartsFacet[]
  source_url?: string | null
  ingest_status?: IngestStatus
  platform_id?: string | null
}

export interface KnowledgeQueryParams {
  category?: KnowledgeCategory
  doc_type?: KnowledgeType
  ingest_status?: IngestStatus
  facet?: HeartsFacet
  platform_id?: string
  search?: string
  page?: number
  limit?: number
}

// --- Prompts ---

export type PromptTier = 1 | 2 | 3
export type PromptStatus = 'draft' | 'active' | 'archived'

export interface Prompt {
  id: string
  name: string
  content: string
  tier: PromptTier
  category: string
  scene_type: string | null
  npc_id: string | null
  priority: number
  is_guardian: boolean
  status: PromptStatus
  platform_id: string | null
  version: number
  created_at: string
  updated_at: string
}

export interface PromptCreate {
  name: string
  content: string
  tier?: PromptTier
  category?: string
  scene_type?: string | null
  npc_id?: string | null
  priority?: number
  is_guardian?: boolean
  status?: PromptStatus
  platform_id?: string | null
}

export interface PromptUpdate {
  name?: string
  content?: string
  tier?: PromptTier
  category?: string
  scene_type?: string | null
  npc_id?: string | null
  priority?: number
  is_guardian?: boolean
  status?: PromptStatus
  platform_id?: string | null
}

export interface PromptQueryParams {
  tier?: PromptTier
  category?: string
  scene_type?: string
  is_guardian?: boolean
  status?: PromptStatus
  platform_id?: string
  page?: number
  limit?: number
}

// --- HEARTS API ---

export interface HeartsFacetData {
  key: string
  name: string
  description: string | null
  definition: string | null
  under_pattern: string | null
  over_pattern: string | null
  color: string | null
  updated_at: string
}

export interface HeartsFacetUpdate {
  name?: string
  description?: string
  definition?: string
  under_pattern?: string
  over_pattern?: string
  color?: string
}

export interface HeartsRubricEntry {
  id: string
  move_type: string
  facet_key: string
  delta: number
  updated_at: string
}

export interface HeartsRubricCreate {
  move_type: string
  facet_key: string
  delta: number
}

export interface HeartsRubricBulkUpdate {
  entries: HeartsRubricCreate[]
}

export interface HeartsStats {
  total_players: number
  averages: Record<string, number>
  distributions: Record<string, number[]>
}

// --- Routes ---

export interface RouteCondition {
  type: string
  facet?: string | null
  value?: string | null
  label?: string
}

export interface Route {
  id: string
  name: string
  game_id: string | null
  from_scene: string | null
  to_scene: string | null
  from_challenge: string | null
  to_challenge: string | null
  description: string | null
  trigger_type: string | null
  trigger_value: string | null
  conditions: RouteCondition[]
  bidirectional: boolean
  show_in_map: boolean
  hidden_until_triggered: boolean
  status: string
  created_at: string
  updated_at: string
}

export interface RouteCreate {
  name: string
  from_scene?: string | null
  to_scene?: string | null
  from_challenge?: string | null
  to_challenge?: string | null
  description?: string | null
  trigger_type?: string | null
  trigger_value?: string | null
  conditions?: RouteCondition[]
  bidirectional?: boolean
  show_in_map?: boolean
  hidden_until_triggered?: boolean
  status?: string
}

export interface RouteUpdate {
  name?: string
  from_scene?: string | null
  to_scene?: string | null
  from_challenge?: string | null
  to_challenge?: string | null
  description?: string | null
  trigger_type?: string | null
  trigger_value?: string | null
  conditions?: RouteCondition[]
  bidirectional?: boolean
  show_in_map?: boolean
  hidden_until_triggered?: boolean
  status?: string
}

export interface RouteQueryParams {
  game_id?: string
  from_scene?: string
  to_scene?: string
  status?: string
}

// ============================================
// Platform & Game Types
// ============================================

export interface Platform {
  id: string
  name: string
  slug: string
  description: string
  icon: string
  color: string
  is_active: boolean
  created_by: string
  created_at: string
  updated_at: string
  assets_count: number
  games_count: number
}

export interface CreatePlatformPayload {
  name: string
  description?: string
  icon?: string
  color?: string
  created_by: string
}

export interface UpdatePlatformPayload {
  name?: string
  description?: string
  icon?: string
  color?: string
  is_active?: boolean
}

export type GameStatus = 'draft' | 'published' | 'archived'

// Extended config types for game settings
export interface HeartsConfig {
  enabled_facets: HeartsFacet[]
  weights: Record<string, number>
  display_mode: 'bars' | 'radar' | 'minimal'
}

export interface DifficultyConfig {
  global_multiplier: number
  time_limits_enabled: boolean
  default_time_limit_sec: number
  hints_mode: 'always' | 'after_attempts' | 'never'
  hints_after_attempts: number
  show_correct_answer: boolean
}

export interface PlayerConfig {
  starting_lives: number
  max_lives: number
  starting_inventory: string[]
  respawn_behavior: 'restart_scene' | 'checkpoint' | 'game_over'
  checkpoint_enabled: boolean
}

export interface PublishConfig {
  visibility: 'private' | 'unlisted' | 'public'
  allow_embedding: boolean
  show_leaderboard: boolean
  collect_analytics: boolean
}

export interface GameConfig {
  grid_width: number
  grid_height: number
  tile_width: number
  tile_height: number
  // Extended optional configs
  hearts?: HeartsConfig
  difficulty?: DifficultyConfig
  player?: PlayerConfig
  publish?: PublishConfig
}

export interface Game {
  id: string
  platform_id: string
  name: string
  slug: string
  description: string
  icon: string
  image_url: string | null
  status: GameStatus
  starting_scene_id: string | null
  config: GameConfig
  is_active: boolean
  created_by: string
  created_at: string
  updated_at: string
  scenes_count: number
  quests_count: number
}

export interface CreateGamePayload {
  platform_id: string
  name: string
  description?: string
  icon?: string
  image_url?: string
  config?: Partial<GameConfig>
  status?: GameStatus
  created_by: string
}

export interface UpdateGamePayload {
  name?: string
  description?: string
  icon?: string
  image_url?: string | null
  status?: GameStatus
  starting_scene_id?: string | null
  config?: Partial<GameConfig>
  is_active?: boolean
}

// ============================================
// Kinship Knowledge API v2 Types
// ============================================

export interface EditChange {
  edit_type:
  | 'add_object'
  | 'remove_object'
  | 'modify_scene'
  | 'add_npc'
  | 'remove_npc'
  | 'add_challenge'
  | 'remove_challenge'
  | 'add_route'
  | 'remove_route'
  | 'modify_npc'
  | 'modify_challenge'
  | string
  description: string
}

export interface GameGenerateStats {
  scenes: number
  npcs: number
  challenges: number
  routes: number
}

export interface GenerateResponse {
  success: boolean
  game_id: string
  manifest: Record<string, unknown>
  stats: GameGenerateStats
  duration_ms: number
  seed?: string
  warnings: string[]
  synced?: {
    scenes?: Array<{ id: string; name: string; index: number }>
  }
}

export interface EditResponse {
  success: boolean
  game_id: string
  manifest: Record<string, unknown>
  version: number
  changes: EditChange[]
  can_undo: boolean
  duration_ms: number
  warnings: string[]
  synced?: {
    scenes?: Array<{ id: string; name: string; index: number }>
  }
}

export type GameStateStatus = 'ready' | 'generating' | 'error'

export interface GameStateResponse {
  game_id: string
  version: number
  status: GameStateStatus
  manifest: Record<string, unknown>
  can_undo: boolean
  can_redo: boolean
}

export interface UndoRedoResponse {
  success: boolean
  undone?: EditChange
  redone?: EditChange
  version: number
  can_undo: boolean
  can_redo: boolean
}

export interface EditHistoryItem {
  change: EditChange
  version: number
  timestamp: Date
}

// ═══════════════════════════════════════════════════════════════
// API v2 Clarification Flow Types
// ═══════════════════════════════════════════════════════════════

export interface ClarificationQuestion {
  question: string
  field: string
  options: string[]
  required: boolean
}

// Response when API needs clarification
export interface ClarificationResponse {
  success: false
  needs_clarification: true
  message: string
  questions: ClarificationQuestion[]
  understood: Record<string, unknown>
  confidence: number
  hint: string
}

// Response when generation succeeds
export interface GenerateSuccessResponse {
  success: true
  game_id: string
  manifest: Record<string, unknown>
  stats: { scenes: number; npcs: number; challenges: number; routes: number }
  duration_ms: number
  seed?: string
  warnings: string[]
  synced?: { scenes?: Array<{ id: string; name: string; index: number }> }
}

// Combined response type for /api/v2/generate
export type GenerateApiResponse = ClarificationResponse | GenerateSuccessResponse

// Type guard to check if response needs clarification
export function needsClarification(response: GenerateApiResponse): response is ClarificationResponse {
  return 'needs_clarification' in response && response.needs_clarification === true
}

// ═══════════════════════════════════════════════════════════════
// Validation API Types
// ═══════════════════════════════════════════════════════════════

export interface ValidationError {
  code: string
  message: string
  location: string
}

export interface ValidatorResult {
  name: string
  passed: boolean
  errors: ValidationError[]
  warnings: ValidationError[]
  duration_ms: number
}

export interface ValidateResponse {
  valid: boolean
  total_errors: number
  total_warnings: number
  duration_ms: number
  validators: ValidatorResult[]
  summary: string
}

// ═══════════════════════════════════════════════════════════════
// Mechanics API Types
// ═══════════════════════════════════════════════════════════════

export interface MechanicSummary {
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
}

export interface MechanicsListResponse {
  count: number
  mechanics: MechanicSummary[]
}

export interface ObjectSlotConfig {
  affordance: string
  capability: string | null
  min_count: number
  max_count: number
  is_draggable: boolean
  is_collectible: boolean
  is_interactable: boolean
}

export interface MechanicTemplate {
  difficulty_range: [number, number]
  estimated_time_seconds: number
  constraints: Record<string, { min: number; max: number; default: number }>
  base_score: number
  base_hearts: number
}

export interface MechanicDetail extends Omit<MechanicSummary, 'object_slots'> {
  object_slots: Record<string, ObjectSlotConfig>
  has_template: boolean
  supported_npc_roles: string[]
  template: MechanicTemplate | null
}

// ═══════════════════════════════════════════════════════════════
// Templates API Types
// ═══════════════════════════════════════════════════════════════

export interface ChallengeTemplate {
  id: string
  mechanic_id: string
  mechanic_name: string
  difficulty_range: [number, number]
  estimated_time_seconds: number
  constraints: Record<string, { min: number; max: number; default: number }>
  base_score: number
  base_hearts: number
}

export interface TemplatesListResponse {
  count: number
  templates: ChallengeTemplate[]
}

// ═══════════════════════════════════════════════════════════════
// NPC Roles API Types
// ═══════════════════════════════════════════════════════════════

export interface NpcRole {
  role: string
  supported_mechanics: string[]
  description: string
}

export interface NpcRolesResponse {
  count: number
  roles: NpcRole[]
  mechanic_to_role: Record<string, string[]>
}

// ═══════════════════════════════════════════════════════════════
// Reference Data Types
// ═══════════════════════════════════════════════════════════════

export interface IdNamePair {
  id: string
  name: string
}

export interface GoalTypesResponse {
  goal_types: IdNamePair[]
}

export interface AudienceTypesResponse {
  audience_types: IdNamePair[]
}

export interface DifficultyCurvesResponse {
  curve_types: IdNamePair[]
}

// ═══════════════════════════════════════════════════════════════
// Pipeline Info Types
// ═══════════════════════════════════════════════════════════════

export interface PipelineCapabilities {
  mechanics_count: number
  templates_count: number
  npc_roles: string[]
  goal_types: string[]
  audience_types: string[]
  difficulty_curves: string[]
  supports_validation: boolean
  ai_provider: string
}

export interface PipelineInfoResponse {
  version: string
  pipeline: {
    stages: string[]
    validators: string[]
  }
  capabilities: PipelineCapabilities
}

// ═══════════════════════════════════════════════════════════════
// State List Types
// ═══════════════════════════════════════════════════════════════

export interface GameStateSummary {
  game_id: string
  version: number
  status: string
  scene_count: number
  edit_count: number
}

export interface StatesListResponse {
  count: number
  states: GameStateSummary[]
}

// ═══════════════════════════════════════════════════════════════
// Access Code Types
// ═══════════════════════════════════════════════════════════════

export type AccessType = 'ecosystem' | 'gathering'
export type CodeStatus = 'active' | 'expired' | 'disabled' | 'redeemed'
export type CodeRole = 'guest' | 'member'

export interface ContextSummary {
  id: string
  name: string
  slug: string
}

export interface GatheringSummary {
  id: string
  name: string
  slug: string
}

export interface ScopeSummary {
  id: string
  name: string
  permissions?: string[]
}

export interface AccessCode {
  id: string
  code: string
  accessType: AccessType
  contextId: string
  gatheringId: string | null
  scopeId: string | null
  role: CodeRole
  price: number | null
  discount: number | null
  expiresAt: string | null
  maxUses: number | null
  currentUses: number
  isActive: boolean
  status: CodeStatus
  createdBy: string
  createdAt: string
  updatedAt: string
  // Related entities (populated when available)
  context?: ContextSummary
  gathering?: GatheringSummary
  scope?: ScopeSummary
}

export interface CodeListResponse {
  codes: AccessCode[]
  count: number
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface CreateCodePayload {
  accessType?: AccessType
  contextId: string
  gatheringId?: string
  scopeId?: string
  role?: CodeRole
  price?: number
  discount?: number
  expiresAt?: string
  maxUses?: number
  creatorWallet: string
}

export interface UpdateCodePayload {
  gatheringId?: string
  scopeId?: string
  role?: CodeRole
  price?: number
  discount?: number
  expiresAt?: string
  maxUses?: number
  status?: CodeStatus
}

export interface CodeFilters {
  contextId?: string
  gatheringId?: string
  accessType?: AccessType
  role?: CodeRole
  status?: CodeStatus
  isActive?: boolean
  creatorWallet?: string
  page?: number
  limit?: number
}

export interface ValidateCodeResponse {
  valid: boolean
  code?: string
  accessType?: AccessType
  contextId?: string
  gatheringId?: string
  scopeId?: string
  role?: CodeRole
  contextName?: string
  gatheringName?: string
  scopeName?: string
  reason?: string
}

export interface RedeemCodeResponse {
  success: boolean
  code: string
  accessType: AccessType
  contextId: string
  gatheringId?: string
  scopeId?: string
  role: CodeRole
  currentUses: number
  maxUses?: number
  reason?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Accessible Codes Types
// ─────────────────────────────────────────────────────────────────────────────

export type AccessSource = 'own' | 'permission'

export interface AccessibleCode extends AccessCode {
  accessSource: AccessSource
  contextName?: string
  roleName?: string
  hasInvitePermission: boolean
}

export interface AccessibleCodesResponse {
  codes: AccessibleCode[]
  total: number
  ownCount: number
  permittedCount: number
}

export interface RoleSummary {
  id: string
  name: string
  permissions: string[]
}

export interface PermittedContext {
  id: string
  name: string
  slug: string
  roles: RoleSummary[]
}

export interface PermittedContextsResponse {
  contexts: PermittedContext[]
  total: number
}