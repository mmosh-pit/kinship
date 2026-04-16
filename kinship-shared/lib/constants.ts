// ============================================
// Kinship Studio — Constants
// ============================================

// Challenge Difficulties
export const DIFFICULTIES = [
  { value: 'Easy', label: 'Easy', color: 'emerald' },
  { value: 'Medium', label: 'Medium', color: 'amber' },
  { value: 'Hard', label: 'Hard', color: 'red' },
] as const

export type Difficulty = (typeof DIFFICULTIES)[number]['value']

// General Statuses
export const STATUSES = [
  { value: 'draft', label: 'Draft', color: 'amber' },
  { value: 'active', label: 'Active', color: 'emerald' },
  { value: 'published', label: 'Published', color: 'emerald' },
  { value: 'archived', label: 'Archived', color: 'gray' },
  { value: 'inactive', label: 'Inactive', color: 'gray' },
] as const

export type Status = (typeof STATUSES)[number]['value']

// Beat Types for Quests
export const BEAT_TYPES = [
  'Introduction',
  'Exploration',
  'Challenge',
  'Climax',
  'Reflection',
  'Resolution',
] as const

export type BeatType = (typeof BEAT_TYPES)[number]

// Route Trigger Types
export const TRIGGER_TYPES = [
  {
    value: 'manual',
    label: 'Manual',
    description: 'Player manually triggers transition',
  },
  {
    value: 'quest_complete',
    label: 'Quest Complete',
    description: 'Triggered when a quest is completed',
  },
  {
    value: 'challenge_complete',
    label: 'Challenge Complete',
    description: 'Triggered when a challenge is completed',
  },
  {
    value: 'npc_dialogue',
    label: 'NPC Dialogue',
    description: 'Triggered by specific NPC conversation',
  },
  {
    value: 'hearts_threshold',
    label: 'HEARTS Threshold',
    description: 'Triggered when HEARTS score reaches threshold',
  },
  {
    value: 'exit_zone',
    label: 'Exit Zone',
    description: 'Triggered when player enters exit area',
  },
] as const

export type TriggerType = (typeof TRIGGER_TYPES)[number]['value']

// Knowledge Categories
export const KNOWLEDGE_CATEGORIES = [
  { value: 'HEARTS', label: 'HEARTS Framework' },
  { value: 'Scene', label: 'Scene Rules' },
  { value: 'NPC', label: 'NPC Personas' },
  { value: 'Challenge', label: 'Challenge Guidelines' },
  { value: 'General', label: 'General Knowledge' },
] as const

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number]['value']

// Knowledge Document Types
export const KNOWLEDGE_TYPES = [
  { value: 'facet_definition', label: 'Facet Definition' },
  { value: 'scene_rules', label: 'Scene Rules' },
  { value: 'persona', label: 'Persona Document' },
  { value: 'pattern', label: 'Pattern Description' },
  { value: 'guideline', label: 'Guideline' },
  { value: 'reference', label: 'Reference Material' },
] as const

export type KnowledgeType = (typeof KNOWLEDGE_TYPES)[number]['value']

// Ingest Statuses
export const INGEST_STATUSES = [
  { value: 'pending', label: 'Pending', color: 'blue' },
  { value: 'ingested', label: 'Ingested', color: 'emerald' },
  { value: 'failed', label: 'Failed', color: 'red' },
  { value: 'draft', label: 'Draft', color: 'amber' },
] as const

export type IngestStatus = (typeof INGEST_STATUSES)[number]['value']

// Prompt Tiers
export const PROMPT_TIERS = [
  {
    value: 1,
    label: 'Tier 1 — Global',
    description: 'Applied to all conversations',
  },
  {
    value: 2,
    label: 'Tier 2 — Scene',
    description: 'Applied within specific scenes',
  },
  {
    value: 3,
    label: 'Tier 3 — NPC',
    description: 'Applied to specific NPC conversations',
  },
] as const

export type PromptTier = (typeof PROMPT_TIERS)[number]['value']

// Lighting Options
export const LIGHTING_OPTIONS = [
  { value: 'day', label: 'Day', icon: '☀️' },
  { value: 'night', label: 'Night', icon: '🌙' },
  { value: 'dawn', label: 'Dawn', icon: '🌅' },
  { value: 'dusk', label: 'Dusk', icon: '🌇' },
] as const

export type Lighting = (typeof LIGHTING_OPTIONS)[number]['value']

// Weather Options
export const WEATHER_OPTIONS = [
  { value: 'clear', label: 'Clear', icon: '☀️' },
  { value: 'rain', label: 'Rain', icon: '🌧️' },
  { value: 'fog', label: 'Fog', icon: '🌫️' },
  { value: 'snow', label: 'Snow', icon: '❄️' },
  { value: 'none', label: 'None', icon: '—' },
] as const

export type Weather = (typeof WEATHER_OPTIONS)[number]['value']
