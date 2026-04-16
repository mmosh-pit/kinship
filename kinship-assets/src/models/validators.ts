import { z } from "zod";

// --- Enums ---

export const AssetTypeEnum = z.enum([
  "tile",
  "sprite",
  "object",
  "npc",
  "avatar",
  "ui",
  "audio",
  "tilemap",
  "animation",
]);

export const SceneTypeEnum = z
  .string()
  .min(1)
  .max(100)
  .describe("Free text — creator-defined scene type");

export const AOEShapeEnum = z.enum(["circle", "rectangle", "polygon", "none"]);

export const InteractionTypeEnum = z.enum([
  "tap",
  "long_press",
  "drag",
  "proximity",
  "none",
]);

export const HeartsFacetEnum = z.enum(["H", "E", "A", "R", "T", "Si", "So"]);

// --- Asset Schemas ---

export const CreateAssetSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(
      /^[a-z0-9_]+$/,
      "Name must be lowercase alphanumeric with underscores",
    ),
  display_name: z.string().min(1).max(200),
  type: AssetTypeEnum,
  meta_description: z.string().max(1000).optional().default(""),
  tags: z.array(z.string()).optional().default([]),
  created_by: z.string().min(1),
});

export const UpdateAssetSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+$/)
    .optional(),
  display_name: z.string().min(1).max(200).optional(),
  type: AssetTypeEnum.optional(),
  meta_description: z.string().max(1000).optional(),
  tags: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
});

// --- Metadata Schemas ---

export const AOEConfigSchema = z.object({
  shape: AOEShapeEnum.default("none"),
  radius: z.number().positive().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  vertices: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
  unit: z.enum(["tiles", "pixels"]).default("tiles"),
});

export const HitboxConfigSchema = z.object({
  width: z.number().positive().default(1),
  height: z.number().positive().default(1),
  offset_x: z.number().default(0),
  offset_y: z.number().default(0),
});

export const InteractionConfigSchema = z.object({
  type: InteractionTypeEnum.default("tap"),
  range: z.number().min(0).default(1.5),
  cooldown_ms: z.number().int().min(0).default(500),
  requires_facing: z.boolean().default(false),
});

export const HeartsMappingSchema = z.object({
  primary_facet: HeartsFacetEnum.nullable().default(null),
  secondary_facet: HeartsFacetEnum.nullable().default(null),
  base_delta: z.number().default(0),
  description: z.string().default(""),
});

export const SpawnConfigSchema = z.object({
  default_position: z
    .object({ x: z.number(), y: z.number() })
    .default({ x: 0, y: 0 }),
  layer: z.string().default("objects"),
  z_index: z.number().int().default(1),
  facing: z.string().default("south"),
});

export const AssetRulesSchema = z.object({
  requires_item: z.string().nullable().default(null),
  max_users: z.number().int().min(0).default(1),
  description: z.string().default(""),
  is_movable: z.boolean().default(false),
  is_destructible: z.boolean().default(false),
  level_required: z.number().int().min(0).default(0),
});

export const SpriteStateConfigSchema = z.object({
  row: z.number().int().min(0).default(0),
  start_col: z.number().int().min(0).default(0),
  end_col: z.number().int().min(0).default(0),
  fps: z.number().positive().default(1),
  loop: z.boolean().default(true),
});

export const SpriteSheetConfigSchema = z.object({
  frame_width: z
    .number()
    .int()
    .positive()
    .describe("Pixel width of each frame"),
  frame_height: z
    .number()
    .int()
    .positive()
    .describe("Pixel height of each frame"),
  columns: z
    .number()
    .int()
    .positive()
    .default(1)
    .describe("Frames per row in the sheet"),
  rows: z
    .number()
    .int()
    .positive()
    .default(1)
    .describe("Total rows in the sheet"),
  anchor_x: z
    .number()
    .min(0)
    .max(1)
    .default(0.5)
    .describe("Horizontal anchor 0.0-1.0"),
  anchor_y: z
    .number()
    .min(0)
    .max(1)
    .default(1.0)
    .describe("Vertical anchor 0.0-1.0 (1.0 = feet)"),
  padding: z.number().int().min(0).default(0).describe("Pixels between frames"),
  direction_map: z
    .record(z.string())
    .nullable()
    .default(null)
    .describe(
      'Row index → direction name, e.g. {"0":"down","1":"left","2":"right","3":"up"}',
    ),
  states: z
    .record(SpriteStateConfigSchema)
    .default({
      idle: { row: 0, start_col: 0, end_col: 0, fps: 1, loop: true },
    })
    .describe("Animation state definitions"),
});

// --- Tile Config ---

export const TileWalkabilityEnum = z.enum([
  "walkable",
  "blocked",
  "slow",
  "hazard",
]);

export const TileConfigSchema = z.object({
  walkable: TileWalkabilityEnum.default("walkable"),
  terrain_cost: z.number().min(0).default(1.0),
  terrain_type: z.string().max(50).default(""),
  auto_group: z.string().max(100).default(""),
  is_edge: z.boolean().default(false),
});

// --- Audio Config ---

export const AudioTriggerEnum = z.enum([
  "ambient",
  "proximity",
  "event",
  "interaction",
]);
export const AudioCategoryEnum = z.enum([
  "sfx",
  "music",
  "ambient",
  "ui",
  "voice",
]);

export const AudioConfigSchema = z.object({
  volume: z.number().min(0).max(1).default(1.0),
  loop: z.boolean().default(true),
  fade_in_ms: z.number().int().min(0).default(0),
  fade_out_ms: z.number().int().min(0).default(0),
  spatial: z.boolean().default(false),
  trigger: AudioTriggerEnum.default("ambient"),
  radius: z.number().min(0).default(5.0),
  category: AudioCategoryEnum.default("sfx"),
});

// --- Tilemap Config ---

export const TilemapOrientationEnum = z.enum([
  "isometric",
  "orthogonal",
  "hexagonal",
]);

export const TilemapConfigSchema = z.object({
  grid_width: z.number().int().min(0).default(0),
  grid_height: z.number().int().min(0).default(0),
  tile_size: z.number().int().positive().default(64),
  layer_count: z.number().int().positive().default(1),
  orientation: TilemapOrientationEnum.default("isometric"),
});

// --- Movement Config ---

export const MoveTypeEnum = z.enum([
  "static",
  "wander",
  "patrol",
  "follow",
  "flee",
]);

export const MovementConfigSchema = z.object({
  speed: z.number().min(0).default(1.0),
  type: MoveTypeEnum.default("static"),
  wander_radius: z.number().min(0).default(3.0),
  patrol_path: z
    .array(z.object({ x: z.number(), y: z.number() }))
    .nullable()
    .default(null),
  avoid_obstacles: z.boolean().default(true),
});

export const CreateMetadataSchema = z.object({
  aoe: AOEConfigSchema.optional(),
  hitbox: HitboxConfigSchema.optional(),
  interaction: InteractionConfigSchema.optional(),
  hearts_mapping: HeartsMappingSchema.optional(),
  states: z.array(z.string()).optional().default(["idle"]),
  animations: z
    .record(
      z.object({
        file: z.string(),
        frames: z.number().int().positive(),
        fps: z.number().positive(),
        loop: z.boolean(),
      }),
    )
    .optional()
    .default({}),
  sprite_sheet: SpriteSheetConfigSchema.optional(),
  spawn: SpawnConfigSchema.optional(),
  rules: AssetRulesSchema.optional(),
  tile_config: TileConfigSchema.optional(),
  audio_config: AudioConfigSchema.optional(),
  tilemap_config: TilemapConfigSchema.optional(),
  movement: MovementConfigSchema.optional(),
  custom_properties: z.record(z.unknown()).optional().default({}),
});

export const UpdateMetadataSchema = CreateMetadataSchema.partial();

// --- Scene Schemas ---

export const SpawnPointSchema = z.object({
  id: z.string(),
  label: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  type: z.enum(["player", "npc", "object"]),
  assigned_asset_id: z.string().uuid().nullable().default(null),
});

export const AmbientConfigSchema = z.object({
  music_track: z.string().nullable().default(null),
  lighting: z.enum(["day", "night", "dawn", "dusk"]).default("day"),
  weather: z.enum(["clear", "rain", "fog", "snow", "none"]).default("clear"),
  background_color: z.string().nullable().default(null),
});

export const CreateSceneSchema = z.object({
  scene_name: z.string().min(1).max(200),
  scene_type: SceneTypeEnum,
  tile_map_url: z.string().url().optional(),
  spawn_points: z.array(SpawnPointSchema).optional().default([]),
  ambient: AmbientConfigSchema.optional(),
  system_prompt: z.string().optional(),
  description: z.string().optional(),
  game_id: z.string().uuid().optional().nullable(),
  created_by: z.string().min(1),
  // Game data stored in DB for quick retrieval
  actors: z.array(z.any()).optional().default([]),
  challenges: z.array(z.any()).optional().default([]),
  routes: z.array(z.any()).optional().default([]),
});

export const UpdateSceneSchema = z.object({
  scene_name: z.string().min(1).max(200).optional(),
  scene_type: SceneTypeEnum.optional(),
  tile_map_url: z.string().url().optional(),
  spawn_points: z.array(SpawnPointSchema).optional(),
  ambient: AmbientConfigSchema.optional(),
  system_prompt: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
  // Game data stored in DB for quick retrieval
  actors: z.array(z.any()).optional(),
  challenges: z.array(z.any()).optional(),
  routes: z.array(z.any()).optional(),
});

// --- Query Schemas ---

export const AssetQuerySchema = z.object({
  type: AssetTypeEnum.optional(),
  scene_id: z.string().uuid().optional(), // Filter via junction table
  scene_type: SceneTypeEnum.optional(),
  platform_id: z.string().uuid().optional(),
  tags: z.string().optional(), // comma-separated
  is_active: z.enum(["true", "false"]).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort_by: z.string().default("created_at"),
  sort_order: z.enum(["asc", "desc"]).default("desc"),
});

// --- Platform Schemas ---

export const PlatformTypeEnum = z.enum(['platform', 'project']);
export const VisibilityLevelEnum = z.enum(['public', 'private', 'secret']);

// Handle validation: lowercase alphanumeric with underscores and periods, max 25 chars
const HandleSchema = z.string()
  .min(1)
  .max(25)
  .regex(/^[a-zA-Z0-9_.]+$/, 'Handle must contain only letters, numbers, underscores, and periods')
  .transform(val => val.toLowerCase());

export const CreatePlatformSchema = z.object({
  name: z.string().min(1).max(200),
  handle: HandleSchema.optional(),
  description: z.string().max(2000).optional().default(''),
  icon: z.string().max(10).optional().default('🎮'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#4CADA8'),
  type: PlatformTypeEnum.optional().default('platform'),
  parent_id: z.string().uuid().optional().nullable(),
  presence_ids: z.array(z.string()).optional().default([]),
  visibility: VisibilityLevelEnum.optional().default('public'),
  knowledge_base_ids: z.array(z.string()).optional().default([]),
  instruction_ids: z.array(z.string()).optional().default([]),
  instructions: z.string().max(10000).optional().default(''),
  created_by: z.string().min(1),
});

export const UpdatePlatformSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  handle: HandleSchema.optional(),
  description: z.string().max(2000).optional(),
  icon: z.string().max(10).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  presence_ids: z.array(z.string()).optional(),
  visibility: VisibilityLevelEnum.optional(),
  knowledge_base_ids: z.array(z.string()).optional(),
  instruction_ids: z.array(z.string()).optional(),
  instructions: z.string().max(10000).optional(),
  is_active: z.boolean().optional(),
});

export const PlatformQuerySchema = z.object({
  type: PlatformTypeEnum.optional(),
  parent_id: z.string().uuid().optional(),
  visibility: VisibilityLevelEnum.optional(),
  is_active: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

// --- Game Schemas ---

export const GameStatusEnum = z.enum(['draft', 'published', 'archived']);

export const GameConfigSchema = z.object({
  grid_width: z.number().int().positive().default(16),
  grid_height: z.number().int().positive().default(16),
  tile_width: z.number().int().positive().default(128),
  tile_height: z.number().int().positive().default(64),
});

export const CreateGameSchema = z.object({
  platform_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(''),
  icon: z.string().max(10).optional().default('🌿'),
  image_url: z.string().url().max(500).optional().nullable(),
  config: GameConfigSchema.partial().optional(),
  created_by: z.string().min(1),
});

export const UpdateGameSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  icon: z.string().max(10).optional(),
  image_url: z.string().url().max(500).optional().nullable(),
  status: GameStatusEnum.optional(),
  starting_scene_id: z.string().uuid().nullable().optional(),
  config: GameConfigSchema.partial().optional(),
  is_active: z.boolean().optional(),
});

export const GameQuerySchema = z.object({
  platform_id: z.string().uuid().optional(),
  status: GameStatusEnum.optional(),
  is_active: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// --- Project Schemas ---

export const CreateProjectSchema = z.object({
  platform_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  handle: HandleSchema.optional(),
  description: z.string().max(2000).optional().default(''),
  icon: z.string().max(10).optional().default('📁'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#A855F7'),
  presence_ids: z.array(z.string()).optional().default([]),
  visibility: VisibilityLevelEnum.optional().default('public'),
  knowledge_base_ids: z.array(z.string()).optional().default([]),
  gathering_ids: z.array(z.string()).optional().default([]),
  instruction_ids: z.array(z.string()).optional().default([]),
  instructions: z.string().max(10000).optional().default(''),
  created_by: z.string().min(1),
});

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  handle: HandleSchema.optional(),
  description: z.string().max(2000).optional(),
  icon: z.string().max(10).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  presence_ids: z.array(z.string()).optional(),
  visibility: VisibilityLevelEnum.optional(),
  knowledge_base_ids: z.array(z.string()).optional(),
  gathering_ids: z.array(z.string()).optional(),
  instruction_ids: z.array(z.string()).optional(),
  instructions: z.string().max(10000).optional(),
  is_active: z.boolean().optional(),
});

export const ProjectQuerySchema = z.object({
  platform_id: z.string().uuid().optional(),
  visibility: VisibilityLevelEnum.optional(),
  is_active: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});