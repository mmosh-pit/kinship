import type { AssetType } from './types'

/**
 * Defines which metadata sections are visible for each asset type.
 *
 * ┌────────────────┬──────┬────────┬────────┬─────┬────────┬────┬───────┬─────────┬───────────┐
 * │    Section     │ tile │ sprite │ object │ npc │ avatar │ ui │ audio │ tilemap │ animation │
 * ├────────────────┼──────┼────────┼────────┼─────┼────────┼────┼───────┼─────────┼───────────┤
 * │ dimensions     │  ✓   │   ✓    │   ✓    │  ✓  │   ✓    │  ✓ │       │         │     ✓     │
 * │ tile_config    │  ✓   │        │        │     │        │    │       │         │           │
 * │ sprite_sheet   │      │   ✓    │        │  ✓  │   ✓    │    │       │         │     ✓     │
 * │ hitbox         │  ✓   │   ✓    │   ✓    │  ✓  │   ✓    │    │       │         │           │
 * │ aoe            │      │        │   ✓    │  ✓  │        │    │   ✓   │         │           │
 * │ interaction    │      │   ✓    │   ✓    │  ✓  │        │  ✓ │       │         │     ✓     │
 * │ movement       │      │   ✓    │        │  ✓  │   ✓    │    │       │         │           │
 * │ spawn          │      │   ✓    │   ✓    │  ✓  │   ✓    │    │       │         │     ✓     │
 * │ hearts         │      │   ✓    │   ✓    │  ✓  │        │    │   ✓   │         │     ✓     │
 * │ rules          │      │   ✓    │   ✓    │  ✓  │        │    │       │         │           │
 * │ audio_config   │      │        │        │     │        │    │   ✓   │         │           │
 * │ tilemap_config │      │        │        │     │        │    │       │    ✓    │           │
 * └────────────────┴──────┴────────┴────────┴─────┴────────┴────┴───────┴─────────┴───────────┘
 */

export type MetadataSection =
  | 'dimensions'
  | 'tile_config'
  | 'sprite_sheet'
  | 'hitbox'
  | 'aoe'
  | 'interaction'
  | 'movement'
  | 'spawn'
  | 'hearts'
  | 'rules'
  | 'audio_config'
  | 'tilemap_config'

const SECTION_MAP: Record<AssetType, MetadataSection[]> = {
  tile: ['dimensions', 'tile_config', 'hitbox'],
  sprite: [
    'dimensions',
    'sprite_sheet',
    'hitbox',
    'interaction',
    'movement',
    'spawn',
    'hearts',
    'rules',
  ],
  object: [
    'dimensions',
    'hitbox',
    'aoe',
    'interaction',
    'spawn',
    'hearts',
    'rules',
  ],
  npc: [
    'dimensions',
    'sprite_sheet',
    'hitbox',
    'aoe',
    'interaction',
    'movement',
    'spawn',
    'hearts',
    'rules',
  ],
  avatar: ['dimensions', 'sprite_sheet', 'hitbox', 'movement', 'spawn'],
  ui: ['dimensions', 'interaction'],
  audio: ['audio_config', 'aoe', 'hearts'],
  tilemap: ['tilemap_config'],
  animation: ['dimensions', 'sprite_sheet', 'interaction', 'spawn', 'hearts'],
}

export function getSectionsForType(type: AssetType): MetadataSection[] {
  return SECTION_MAP[type] || []
}

export function showSection(
  type: AssetType,
  section: MetadataSection
): boolean {
  return SECTION_MAP[type]?.includes(section) ?? false
}
