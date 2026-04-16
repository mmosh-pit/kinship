// ============================================
// Kinship Studio — Mock Data & Constants
// ============================================

// HEARTS Facets
export const HEARTS_FACETS = [
  {
    key: 'H',
    name: 'Harmony',
    color: '#9B7BB8',
    bg: 'bg-[#9B7BB8]',
    text: 'text-[#9B7BB8]',
    description: 'Balance, peace, and inner alignment',
  },
  {
    key: 'E',
    name: 'Empowerment',
    color: '#E07B4C',
    bg: 'bg-[#E07B4C]',
    text: 'text-[#E07B4C]',
    description: 'Strength, confidence, and agency',
  },
  {
    key: 'A',
    name: 'Awareness',
    color: '#4CADA8',
    bg: 'bg-[#4CADA8]',
    text: 'text-[#4CADA8]',
    description: 'Mindfulness, presence, and perception',
  },
  {
    key: 'R',
    name: 'Resilience',
    color: '#5B8DB8',
    bg: 'bg-[#5B8DB8]',
    text: 'text-[#5B8DB8]',
    description: 'Adaptability, recovery, and perseverance',
  },
  {
    key: 'T',
    name: 'Tenacity',
    color: '#C9A227',
    bg: 'bg-[#C9A227]',
    text: 'text-[#C9A227]',
    description: 'Determination, grit, and follow-through',
  },
  {
    key: 'Si',
    name: 'Self-insight',
    color: '#5C5A8D',
    bg: 'bg-[#5C5A8D]',
    text: 'text-[#5C5A8D]',
    description: 'Self-knowledge, reflection, and growth',
  },
  {
    key: 'So',
    name: 'Social',
    color: '#D4737A',
    bg: 'bg-[#D4737A]',
    text: 'text-[#D4737A]',
    description: 'Connection, empathy, and community',
  },
]

// Asset Types
export const ASSET_TYPES = [
  { value: 'tile', label: 'Tile', icon: '🟫' },
  { value: 'sprite', label: 'Sprite', icon: '🖼️' },
  { value: 'object', label: 'Object', icon: '📦' },
  { value: 'npc', label: 'NPC', icon: '🧑' },
  { value: 'avatar', label: 'Avatar', icon: '🧙' },
  { value: 'ui', label: 'UI', icon: '🎨' },
  { value: 'audio', label: 'Audio', icon: '🔊' },
  { value: 'tilemap', label: 'Tilemap', icon: '🗺️' },
  { value: 'animation', label: 'Animation', icon: '🎬' },
]

// Mock Assets
export const MOCK_ASSETS = [
  {
    id: '1',
    name: 'treadmill_01',
    display_name: 'Treadmill',
    type: 'object',
    meta_description: 'High-end cardio treadmill for gym scene',
    tags: ['gym', 'equipment', 'cardio'],
    is_active: true,
    file_url: '',
    created_at: '2026-01-28',
    hearts_facet: 'E',
  },
  {
    id: '2',
    name: 'oak_tree_01',
    display_name: 'Oak Tree',
    type: 'sprite',
    meta_description: 'Large oak tree for garden decoration',
    tags: ['garden', 'nature', 'tree'],
    is_active: true,
    file_url: '',
    created_at: '2026-01-28',
    hearts_facet: 'A',
  },
  {
    id: '3',
    name: 'grass_tile_01',
    display_name: 'Grass Tile',
    type: 'tile',
    meta_description: 'Base grass tile for outdoor scenes',
    tags: ['ground', 'nature'],
    is_active: true,
    file_url: '',
    created_at: '2026-01-27',
    hearts_facet: null,
  },
  {
    id: '4',
    name: 'weights_rack_01',
    display_name: 'Weight Rack',
    type: 'object',
    meta_description: 'Dumbbell rack with various weights',
    tags: ['gym', 'equipment', 'strength'],
    is_active: true,
    file_url: '',
    created_at: '2026-01-29',
    hearts_facet: 'T',
  },
  {
    id: '5',
    name: 'flower_bed_01',
    display_name: 'Flower Bed',
    type: 'object',
    meta_description: 'Colorful flower bed that grows over time',
    tags: ['garden', 'growth', 'nature'],
    is_active: true,
    file_url: '',
    created_at: '2026-01-29',
    hearts_facet: 'H',
  },
  {
    id: '6',
    name: 'morning_birds_01',
    display_name: 'Morning Birds',
    type: 'audio',
    meta_description: 'Ambient morning bird sounds',
    tags: ['ambient', 'nature', 'morning'],
    is_active: true,
    file_url: '',
    created_at: '2026-01-30',
    hearts_facet: null,
  },
  {
    id: '7',
    name: 'stone_path_01',
    display_name: 'Stone Path',
    type: 'tile',
    meta_description: 'Cobblestone path tile',
    tags: ['ground', 'path'],
    is_active: true,
    file_url: '',
    created_at: '2026-01-30',
    hearts_facet: null,
  },
  {
    id: '8',
    name: 'bench_press_01',
    display_name: 'Bench Press',
    type: 'object',
    meta_description: 'Flat bench press station',
    tags: ['gym', 'equipment', 'strength'],
    is_active: false,
    file_url: '',
    created_at: '2026-01-30',
    hearts_facet: 'E',
  },
]

// Mock NPCs — scene references full scene name
export const MOCK_NPCS = [
  {
    id: '1',
    name: 'Coach Ray',
    role: 'Trainer',
    scene: 'Forest Gym - Morning',
    facet: 'E',
    personality: 'Motivating, high-energy, direct',
    status: 'active',
    sprite_id: null,
  },
  {
    id: '2',
    name: 'Sage Willow',
    role: 'Gardener',
    scene: 'Zen Garden - Dawn',
    facet: 'A',
    personality: 'Calm, nurturing, wise',
    status: 'active',
    sprite_id: null,
  },
  {
    id: '3',
    name: 'Old Barley',
    role: 'Farmer',
    scene: 'Harvest Farm - Afternoon',
    facet: 'T',
    personality: 'Patient, hardworking, storyteller',
    status: 'draft',
    sprite_id: null,
  },
  {
    id: '4',
    name: 'Luna',
    role: 'Guide',
    scene: 'Crystal Lobby',
    facet: 'Si',
    personality: 'Gentle, curious, encouraging',
    status: 'active',
    sprite_id: null,
  },
]

// Mock Challenges — scene references full scene name
export const MOCK_CHALLENGES = [
  {
    id: '1',
    name: 'Cardio Champion',
    description: 'Complete 3 rounds on the treadmill',
    scene: 'Forest Gym - Morning',
    facets: ['E', 'T'],
    difficulty: 'Medium',
    steps: 3,
    status: 'active',
  },
  {
    id: '2',
    name: 'Garden Meditation',
    description: 'Spend 5 minutes in the zen garden',
    scene: 'Zen Garden - Dawn',
    facets: ['A', 'H'],
    difficulty: 'Easy',
    steps: 1,
    status: 'active',
  },
  {
    id: '3',
    name: 'Harvest Helper',
    description: 'Help Old Barley harvest 10 crops',
    scene: 'Harvest Farm - Afternoon',
    facets: ['T', 'So'],
    difficulty: 'Hard',
    steps: 10,
    status: 'draft',
  },
  {
    id: '4',
    name: 'Strength Circuit',
    description: 'Use 3 different weight stations',
    scene: 'Forest Gym - Morning',
    facets: ['E', 'R'],
    difficulty: 'Medium',
    steps: 3,
    status: 'active',
  },
  {
    id: '5',
    name: 'Plant a Seed',
    description: 'Choose and plant a seed that reflects your intention',
    scene: 'Zen Garden - Dawn',
    facets: ['Si', 'H'],
    difficulty: 'Easy',
    steps: 2,
    status: 'active',
  },
]

// Mock Quests (formerly Stories)
export const MOCK_QUESTS = [
  {
    id: '1',
    name: 'The First Step',
    beat_type: 'Introduction',
    facet: 'E',
    scene: 'Forest Gym - Morning',
    description: 'Player enters the gym for the first time and meets Coach Ray',
    status: 'published',
  },
  {
    id: '2',
    name: 'Roots of Calm',
    beat_type: 'Exploration',
    facet: 'A',
    scene: 'Zen Garden - Dawn',
    description: 'Sage Willow introduces the player to mindful gardening',
    status: 'published',
  },
  {
    id: '3',
    name: 'Seeds of Change',
    beat_type: 'Challenge',
    facet: 'H',
    scene: 'Zen Garden - Dawn',
    description:
      'Player must choose which seeds to plant based on their HEARTS profile',
    status: 'draft',
  },
  {
    id: '4',
    name: 'Breaking Through',
    beat_type: 'Climax',
    facet: 'T',
    scene: 'Forest Gym - Morning',
    description: 'Coach Ray pushes the player past their comfort zone',
    status: 'draft',
  },
  {
    id: '5',
    name: 'Harvest Moon',
    beat_type: 'Reflection',
    facet: 'Si',
    scene: 'Harvest Farm - Afternoon',
    description:
      'Player reflects on their growth while harvesting with Old Barley',
    status: 'draft',
  },
]

// Mock Scenes — type is FREE TEXT, creator-defined
export const MOCK_SCENES = [
  {
    id: '1',
    name: 'Forest Gym - Morning',
    type: 'Forest Gym',
    assets: 12,
    npcs: 1,
    challenges: 3,
    status: 'published',
    lighting: 'day',
  },
  {
    id: '2',
    name: 'Zen Garden - Dawn',
    type: 'Zen Garden',
    assets: 18,
    npcs: 1,
    challenges: 2,
    status: 'published',
    lighting: 'dawn',
  },
  {
    id: '3',
    name: 'Harvest Farm - Afternoon',
    type: 'Harvest Farm',
    assets: 15,
    npcs: 1,
    challenges: 2,
    status: 'draft',
    lighting: 'day',
  },
]

// Mock Routes — connections between scenes
export const MOCK_ROUTES = [
  {
    id: '1',
    name: 'Lobby → Gym (First Quest)',
    from_scene: 'Crystal Lobby',
    to_scene: 'Forest Gym - Morning',
    trigger_type: 'quest_complete',
    trigger_value: 'The First Step',
    conditions: [],
    description:
      'Player completes introduction quest with Luna and chooses to visit the gym',
    status: 'active',
  },
  {
    id: '2',
    name: 'Lobby → Garden (Calm Path)',
    from_scene: 'Crystal Lobby',
    to_scene: 'Zen Garden - Dawn',
    trigger_type: 'npc_dialogue',
    trigger_value: 'Luna suggests garden',
    conditions: [
      {
        type: 'hearts_below',
        facet: 'H',
        threshold: 40,
        label: 'Harmony < 40',
      },
    ],
    description:
      'Luna guides low-Harmony players to the garden for calming activities',
    status: 'active',
  },
  {
    id: '3',
    name: 'Gym → Farm (After Strength)',
    from_scene: 'Forest Gym - Morning',
    to_scene: 'Harvest Farm - Afternoon',
    trigger_type: 'challenge_complete',
    trigger_value: 'Strength Circuit',
    conditions: [
      {
        type: 'hearts_above',
        facet: 'E',
        threshold: 50,
        label: 'Empowerment > 50',
      },
    ],
    description:
      'After building confidence in the gym, player unlocks the farm for patience-based challenges',
    status: 'draft',
  },
  {
    id: '4',
    name: 'Garden → Farm (Growth Path)',
    from_scene: 'Zen Garden - Dawn',
    to_scene: 'Harvest Farm - Afternoon',
    trigger_type: 'quest_complete',
    trigger_value: 'Seeds of Change',
    conditions: [],
    description:
      'Completing the garden quest naturally leads to the farm where seeds become crops',
    status: 'draft',
  },
  {
    id: '5',
    name: 'Any → Lobby (Return)',
    from_scene: '*',
    to_scene: 'Crystal Lobby',
    trigger_type: 'exit_zone',
    trigger_value: 'Door / portal interaction',
    conditions: [],
    description:
      'Player can always return to lobby via exit zones in any scene',
    status: 'active',
  },
]

// Derive existing scene names for dropdowns (picks from actual scenes)
export function getExistingSceneNames(): string[] {
  return MOCK_SCENES.map((s) => s.name)
}

// Derive unique scene types for autocomplete suggestions
export function getExistingSceneTypes(): string[] {
  return [...new Set(MOCK_SCENES.map((s) => s.type))]
}

// Mock Knowledge Docs
export const MOCK_KNOWLEDGE = [
  {
    id: '1',
    title: 'Harmony Facet Definition',
    category: 'HEARTS',
    type: 'facet_definition',
    status: 'ingested',
    updated: '2026-01-29',
  },
  {
    id: '2',
    title: 'Empowerment Facet Definition',
    category: 'HEARTS',
    type: 'facet_definition',
    status: 'ingested',
    updated: '2026-01-29',
  },
  {
    id: '3',
    title: 'Gym Scene Rules',
    category: 'Scene',
    type: 'scene_rules',
    status: 'ingested',
    updated: '2026-01-30',
  },
  {
    id: '4',
    title: 'Coach Ray Persona',
    category: 'NPC',
    type: 'persona',
    status: 'pending',
    updated: '2026-01-31',
  },
  {
    id: '5',
    title: 'Garden Scene Rules',
    category: 'Scene',
    type: 'scene_rules',
    status: 'ingested',
    updated: '2026-01-30',
  },
  {
    id: '6',
    title: 'Under-pattern Indicators',
    category: 'HEARTS',
    type: 'pattern',
    status: 'draft',
    updated: '2026-02-01',
  },
]

// Mock Prompts — scene references full scene name
export const MOCK_PROMPTS = [
  {
    id: '1',
    name: 'Global Constitution',
    type: 'global',
    scene: null,
    status: 'active',
    updated: '2026-01-30',
  },
  {
    id: '2',
    name: 'Forest Gym Prompt',
    type: 'scene',
    scene: 'Forest Gym - Morning',
    status: 'active',
    updated: '2026-01-31',
  },
  {
    id: '3',
    name: 'Zen Garden Prompt',
    type: 'scene',
    scene: 'Zen Garden - Dawn',
    status: 'active',
    updated: '2026-01-31',
  },
  {
    id: '4',
    name: 'Harvest Farm Prompt',
    type: 'scene',
    scene: 'Harvest Farm - Afternoon',
    status: 'draft',
    updated: '2026-02-01',
  },
  {
    id: '5',
    name: 'Coach Ray Guardian',
    type: 'guardian',
    scene: 'Forest Gym - Morning',
    status: 'active',
    updated: '2026-01-31',
  },
  {
    id: '6',
    name: 'Sage Willow Guardian',
    type: 'guardian',
    scene: 'Zen Garden - Dawn',
    status: 'draft',
    updated: '2026-02-01',
  },
]

// Navigation
export const NAV_ITEMS = [
  {
    label: 'Content',
    items: [
      { href: '/assets', label: 'Assets', icon: '📦', countKey: 'assets' },
      { href: '/quests', label: 'Quests', icon: '⚔️' },
      { href: '/npcs', label: 'NPCs', icon: '🧑' },
      { href: '/challenges', label: 'Challenges', icon: '⚡' },
    ],
  },
  {
    label: 'World',
    items: [
      { href: '/scenes', label: 'Scenes', icon: '🗺️', countKey: 'scenes' },
      { href: '/routes', label: 'Routes', icon: '🔀' },
      { href: '/progress', label: 'Progress', icon: '🔄' },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { href: '/knowledge', label: 'Knowledge', icon: '🧠' },
      { href: '/prompts', label: 'Prompts', icon: '💬' },
    ],
  },
]
