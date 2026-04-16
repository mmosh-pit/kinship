// ============================================
// Kinship Assets - Type Definitions
// ============================================

// --- Affordances (what PLAYER can do with asset) ---

export type Affordance =
  // Physics/Movement
  | "push"
  | "pull"
  | "drag"
  | "throw"
  | "stack"
  | "roll"
  | "slide"
  | "bounce"
  // Collection
  | "collect"
  | "gather"
  | "harvest"
  | "mine"
  | "fish"
  | "forage"
  | "loot"
  // Interaction
  | "toggle"
  | "activate"
  | "trigger"
  | "press"
  | "open"
  | "close"
  | "lock"
  | "unlock"
  // Combat
  | "attack"
  | "defend"
  | "equip"
  | "heal"
  | "buff"
  | "debuff"
  // Farming
  | "plant"
  | "water"
  | "tend"
  | "breed"
  // Crafting
  | "combine"
  | "cook"
  | "forge"
  | "brew"
  | "enchant"
  | "upgrade"
  // Social
  | "talk"
  | "trade"
  | "gift"
  | "befriend"
  | "convince"
  | "recruit"
  // Survival
  | "consume"
  | "rest"
  | "shelter"
  | "light"
  // Management
  | "assign"
  | "produce"
  | "schedule"
  | "hire"
  | "expand"
  // Navigation
  | "climb"
  | "swim"
  | "ride"
  | "teleport";

// --- Capabilities (what OBJECT can do) ---

export type Capability =
  // Physical
  | "block_path"
  | "apply_weight"
  | "provide_support"
  | "bridge_gap"
  | "create_shadow"
  // State Change
  | "trigger_event"
  | "toggle_state"
  | "emit_signal"
  | "receive_signal"
  // Storage
  | "store_items"
  | "hide_contents"
  | "dispense_items"
  // Production
  | "grow"
  | "produce_resource"
  | "spawn_entity"
  | "transform"
  // Environment
  | "provide_light"
  | "provide_heat"
  | "provide_shelter"
  | "create_hazard"
  // Interaction
  | "display_text"
  | "play_sound"
  | "show_ui"
  // Combat
  | "deal_damage"
  | "apply_effect"
  | "heal_entity";

// --- Placement Types ---

export type PlacementType =
  | "standalone"    // Can be placed anywhere (trees, rocks)
  | "attached"      // Needs nearby structure (doors, windows)
  | "grouped"       // Should be in clusters (flowers, mushrooms)
  | "contextual"    // Function changes by context (log over water = bridge)
  | "surface";      // Requires specific ground type (indoor furniture)

// --- Asset Types ---

export type AssetType =
  | "tile"
  | "sprite"
  | "object"
  | "npc"
  | "avatar"
  | "ui"
  | "audio"
  | "tilemap"
  | "animation";

export type SceneType = string; // Free text — creator-defined

export type AOEShape = "circle" | "rectangle" | "polygon" | "none";

export type InteractionType =
  | "tap"
  | "long_press"
  | "drag"
  | "proximity"
  | "none";

export type HeartsFacet = "H" | "E" | "A" | "R" | "T" | "Si" | "So";

// --- Core Asset ---

export interface Asset {
  id: string;
  name: string;
  display_name: string;
  type: AssetType;
  meta_description: string;
  file_url: string;
  thumbnail_url: string | null;
  file_size: number;
  mime_type: string;
  tags: string[];
  version: number;
  is_active: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

// --- Asset Metadata ---

export interface AssetMetadata {
  id: string;
  asset_id: string;
  pixel_width: number;
  pixel_height: number;
  aoe: AOEConfig;
  hitbox: HitboxConfig;
  interaction: InteractionConfig;
  hearts_mapping: HeartsMapping;
  states: string[];
  animations: AnimationConfig;
  sprite_sheet: SpriteSheetConfig | null;
  spawn: SpawnConfig;
  rules: AssetRules;
  tile_config: TileConfig;
  audio_config: AudioConfig;
  tilemap_config: TilemapConfig;
  movement: MovementConfig;
  custom_properties: Record<string, unknown>;
}

export interface AOEConfig {
  shape: AOEShape;
  radius?: number;
  width?: number;
  height?: number;
  vertices?: { x: number; y: number }[];
  unit: "tiles" | "pixels";
}

export interface HitboxConfig {
  width: number;
  height: number;
  offset_x: number;
  offset_y: number;
}

export interface InteractionConfig {
  type: InteractionType;
  range: number;
  cooldown_ms: number;
  requires_facing: boolean;
}

export interface HeartsMapping {
  primary_facet: HeartsFacet | null;
  secondary_facet: HeartsFacet | null;
  base_delta: number;
  description: string;
}

export interface AnimationConfig {
  [state: string]: {
    file: string;
    frames: number;
    fps: number;
    loop: boolean;
  };
}

// --- Sprite Sheet Config ---
// Describes how to slice a sprite sheet PNG into individual animation frames.
// Used by Flame's SpriteSheet/SpriteAnimation for correct rendering.

export interface SpriteStateConfig {
  row: number; // which row (or column offset when direction_map is set)
  start_col: number; // first frame column (inclusive)
  end_col: number; // last frame column (inclusive)
  fps: number; // playback speed
  loop: boolean; // repeat or play once
}

export interface SpriteSheetConfig {
  frame_width: number; // pixel width of each frame
  frame_height: number; // pixel height of each frame
  columns: number; // frames per row in the sheet
  rows: number; // total rows in the sheet
  anchor_x: number; // horizontal anchor 0.0–1.0 (0.5 = center)
  anchor_y: number; // vertical anchor 0.0–1.0 (1.0 = feet)
  padding: number; // pixels between frames
  direction_map: Record<string, string> | null; // row_index → direction ("0": "down", etc.)
  states: Record<string, SpriteStateConfig>; // animation state definitions
}

export interface SpawnConfig {
  default_position: { x: number; y: number };
  layer: string;
  z_index: number;
  facing: string;
}

export interface AssetRules {
  requires_item: string | null;
  max_users: number;
  description: string;
  is_movable: boolean;
  is_destructible: boolean;
  level_required: number;
}

// --- Tile Config (walkability, terrain, auto-tiling) ---

export type TileWalkability = "walkable" | "blocked" | "slow" | "hazard";

export interface TileConfig {
  walkable: TileWalkability;
  terrain_cost: number; // pathfinding multiplier (1.0=normal)
  terrain_type: string; // grass | stone | water | sand etc.
  auto_group: string; // auto-tile group for seamless tiling
  is_edge: boolean; // edge/border tile
}

// --- Audio Config (playback, spatialization) ---

export type AudioTrigger = "ambient" | "proximity" | "event" | "interaction";
export type AudioCategory = "sfx" | "music" | "ambient" | "ui" | "voice";

export interface AudioConfig {
  volume: number; // 0.0–1.0
  loop: boolean;
  fade_in_ms: number;
  fade_out_ms: number;
  spatial: boolean; // 3D spatial audio
  trigger: AudioTrigger;
  radius: number; // audible radius in tiles
  category: AudioCategory;
}

// --- Tilemap Config (grid dimensions) ---

export type TilemapOrientation = "isometric" | "orthogonal" | "hexagonal";

export interface TilemapConfig {
  grid_width: number; // map width in tiles
  grid_height: number; // map height in tiles
  tile_size: number; // pixel size per tile
  layer_count: number;
  orientation: TilemapOrientation;
}

// --- Movement Config (for mobile entities) ---

export type MoveType = "static" | "wander" | "patrol" | "follow" | "flee";
export type MovePersonality =
  | "calm"
  | "energetic"
  | "nervous"
  | "lazy"
  | "curious"
  | "guard"
  | "ambient"
  | "playful"
  | "shy"
  | "aggressive"
  | "graceful"
  | "erratic"
  | "social"
  | "patrol"
  | "";

export interface MovementConfig {
  speed: number; // tiles per second
  type: MoveType;
  wander_radius: number;
  patrol_path: { x: number; y: number }[] | null;
  avoid_obstacles: boolean;
  personality: MovePersonality; // drives behavior weights in game engine
}

// --- Scene Manifest ---

export interface SceneManifest {
  id: string;
  scene_name: string;
  scene_type: SceneType;
  tile_map_url: string;
  asset_ids: string[];
  spawn_points: SpawnPoint[];
  ambient: AmbientConfig;
  system_prompt: string | null;
  description: string | null;
  version: number;
  is_active: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  // Game data stored in DB for quick retrieval
  actors?: any[];
  challenges?: any[];
  routes?: any[];
}

export interface SpawnPoint {
  id: string;
  label: string;
  position: { x: number; y: number };
  type: "player" | "npc" | "object";
  assigned_asset_id: string | null;
}

export interface AmbientConfig {
  music_track: string | null;
  lighting: "day" | "night" | "dawn" | "dusk";
  weather: "clear" | "rain" | "fog" | "snow" | "none";
  background_color: string | null;
}

// --- API Request/Response ---

export interface CreateAssetRequest {
  name: string;
  display_name: string;
  type: AssetType;
  meta_description?: string;
  tags?: string[];
  platform_id?: string;
  created_by: string;
}

export interface UpdateAssetRequest {
  name?: string;
  display_name?: string;
  type?: AssetType;
  meta_description?: string;
  tags?: string[];
  is_active?: boolean;
}

export interface CreateMetadataRequest {
  aoe?: Partial<AOEConfig>;
  hitbox?: Partial<HitboxConfig>;
  interaction?: Partial<InteractionConfig>;
  hearts_mapping?: Partial<HeartsMapping>;
  states?: string[];
  animations?: AnimationConfig;
  sprite_sheet?: Partial<SpriteSheetConfig>;
  spawn?: Partial<SpawnConfig>;
  rules?: Partial<AssetRules>;
  tile_config?: Partial<TileConfig>;
  audio_config?: Partial<AudioConfig>;
  tilemap_config?: Partial<TilemapConfig>;
  movement?: Partial<MovementConfig>;
  custom_properties?: Record<string, unknown>;
}

export type SceneRole =
  | "ground_fill"
  | "path"
  | "boundary"
  | "focal_point"
  | "furniture"
  | "shelter"
  | "accent"
  | "scatter"
  | "utility"
  | "lighting"
  | "signage"
  | "vegetation"
  | "prop";
export type PlacementHint =
  | "single"
  | "pair"
  | "cluster"
  | "scatter"
  | "line"
  | "ring"
  | "border"
  | "grid";

export interface AssetKnowledge {
  id: string;
  asset_id: string;

  // Visual Analysis
  visual_description: string;
  color_palette: string[];
  visual_mood: string[];
  art_style: string;

  // Scene Usage
  scene_role: SceneRole;
  placement_hint: PlacementHint;
  pair_with: string[];
  avoid_near: string[];
  composition_notes: string;
  suitable_scenes: string[];
  suitable_facets: string[];
  therapeutic_use: string;
  narrative_hook: string;

  // === NEW: Affordances & Capabilities ===
  affordances: Affordance[];
  capabilities: Capability[];

  // === NEW: Placement Rules ===
  placement_type: PlacementType;
  requires_nearby: string[];       // e.g., ["building", "wall"] for doors
  provides_attachment: string[];   // e.g., ["front", "side"] for buildings
  context_functions: Record<string, string>;  // e.g., {"over:water": "bridge"}

  // Metadata
  generated_by: string;
  generated_at: Date;
  generation_version: number;
}

export interface AssetWithMetadata extends Asset {
  metadata: AssetMetadata | null;
  knowledge?: AssetKnowledge | null;
}

// --- Platform ---

export type PlatformType = 'platform' | 'project';
export type VisibilityLevel = 'public' | 'private' | 'secret';

export interface Platform {
  id: string;
  name: string;
  slug: string;
  handle: string | null;
  description: string;
  icon: string;
  color: string;
  type: PlatformType;
  parent_id: string | null;
  presence_ids: string[];
  visibility: VisibilityLevel;
  knowledge_base_ids: string[];
  instruction_ids: string[];
  instructions: string;
  is_active: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface PlatformWithCounts extends Platform {
  assets_count: number;
  games_count: number;
  projects_count?: number;
}

export interface CreatePlatformRequest {
  name: string;
  handle?: string;
  description?: string;
  icon?: string;
  color?: string;
  type?: PlatformType;
  parent_id?: string;
  presence_ids?: string[];
  visibility?: VisibilityLevel;
  knowledge_base_ids?: string[];
  instruction_ids?: string[];
  instructions?: string;
  created_by: string;
}

export interface UpdatePlatformRequest {
  name?: string;
  handle?: string;
  description?: string;
  icon?: string;
  color?: string;
  presence_ids?: string[];
  visibility?: VisibilityLevel;
  knowledge_base_ids?: string[];
  instruction_ids?: string[];
  instructions?: string;
  is_active?: boolean;
}

export interface PlatformWithProjects extends PlatformWithCounts {
  projects: Project[];
}

// --- Project ---

export interface Project {
  id: string;
  platform_id: string;
  name: string;
  slug: string;
  handle: string | null;
  description: string;
  icon: string;
  color: string;
  presence_ids: string[];
  visibility: VisibilityLevel;
  knowledge_base_ids: string[];
  gathering_ids: string[];
  instruction_ids: string[];
  instructions: string;
  is_active: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface ProjectWithCounts extends Project {
  assets_count: number;
  games_count: number;
}

export interface CreateProjectRequest {
  platform_id: string;
  name: string;
  handle?: string;
  description?: string;
  icon?: string;
  color?: string;
  presence_ids?: string[];
  visibility?: VisibilityLevel;
  knowledge_base_ids?: string[];
  gathering_ids?: string[];
  instruction_ids?: string[];
  instructions?: string;
  created_by: string;
}

export interface UpdateProjectRequest {
  name?: string;
  handle?: string;
  description?: string;
  icon?: string;
  color?: string;
  presence_ids?: string[];
  visibility?: VisibilityLevel;
  knowledge_base_ids?: string[];
  gathering_ids?: string[];
  instruction_ids?: string[];
  instructions?: string;
  is_active?: boolean;
}

// --- Game ---

export type GameStatus = 'draft' | 'published' | 'archived';

export interface GameConfig {
  grid_width: number;
  grid_height: number;
  tile_width: number;
  tile_height: number;
}

export interface Game {
  id: string;
  platform_id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  image_url: string | null;
  status: GameStatus;
  starting_scene_id: string | null;
  config: GameConfig;
  is_active: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface GameWithCounts extends Game {
  scenes_count: number;
  quests_count: number;
}

export interface CreateGameRequest {
  platform_id: string;
  name: string;
  description?: string;
  icon?: string;
  image_url?: string;
  config?: Partial<GameConfig>;
  created_by: string;
}

export interface UpdateGameRequest {
  name?: string;
  description?: string;
  icon?: string;
  image_url?: string | null;
  status?: GameStatus;
  starting_scene_id?: string | null;
  config?: Partial<GameConfig>;
  is_active?: boolean;
}

export interface AssetQueryParams {
  type?: AssetType;
  scene_id?: string;
  scene_type?: SceneType;
  tags?: string[];
  is_active?: boolean;
  search?: string;
  platform_id?: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: "asc" | "desc";
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface UploadResult {
  file_url: string;
  thumbnail_url: string | null;
  file_size: number;
  mime_type: string;
}