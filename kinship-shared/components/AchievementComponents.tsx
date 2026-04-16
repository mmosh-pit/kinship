'use client'

import { useState } from 'react'
import {
  Achievement,
  AchievementTier,
  AchievementType,
  TriggerEvent,
  TIER_META,
  TYPE_META,
  TRIGGER_META,
} from '../hooks/useAchievements'

// ═══════════════════════════════════════════════════════════════════
//  Achievement Card
// ═══════════════════════════════════════════════════════════════════

interface AchievementCardProps {
  achievement: Achievement
  onEdit: () => void
  onDelete: () => void
  onToggleEnabled: () => void
}

export function AchievementCard({
  achievement,
  onEdit,
  onDelete,
  onToggleEnabled,
}: AchievementCardProps) {
  const tierMeta = TIER_META[achievement.tier]
  const typeMeta = TYPE_META[achievement.achievement_type]

  return (
    <div
      className={`rounded-xl border p-4 transition-all ${
        achievement.is_enabled
          ? 'bg-card/40 border-card-border'
          : 'bg-sidebar/40 border-card-border opacity-60'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
            style={{ backgroundColor: `${tierMeta.color}20` }}
          >
            {achievement.icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">
                {achievement.name}
              </h3>
              {achievement.is_secret && (
                <span className="text-[10px] text-purple-400">🔒 Secret</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: `${tierMeta.color}30`,
                  color: tierMeta.color,
                }}
              >
                {tierMeta.icon} {tierMeta.label}
              </span>
              <span className="text-[10px] text-muted">
                {typeMeta.icon} {typeMeta.label}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={onToggleEnabled}
          className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
            achievement.is_enabled
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-input/50 text-muted'
          }`}
        >
          {achievement.is_enabled ? 'Active' : 'Inactive'}
        </button>
      </div>

      <p className="text-xs text-white/70 mb-3 line-clamp-2">
        {achievement.description}
      </p>

      {/* Stats */}
      <div className="flex items-center gap-4 mb-3 text-[10px] text-muted">
        <span>
          🎯 {TRIGGER_META[achievement.trigger_event]?.label || 'Custom'}
        </span>
        {achievement.requires_progress && (
          <span>📊 0/{achievement.progress_max}</span>
        )}
        {achievement.xp_reward > 0 && (
          <span>⭐ {achievement.xp_reward} XP</span>
        )}
        {achievement.unlock_percentage !== null && (
          <span>👥 {achievement.unlock_percentage.toFixed(1)}% unlocked</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-card-border">
        <button
          onClick={onEdit}
          className="flex-1 py-1.5 rounded text-[10px] font-semibold text-white/70 hover:bg-input transition-colors"
        >
          ✏️ Edit
        </button>
        <button
          onClick={onDelete}
          className="py-1.5 px-3 rounded text-[10px] font-semibold text-red-400 hover:bg-red-500/10 transition-colors"
        >
          🗑️
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Achievement Form Modal
// ═══════════════════════════════════════════════════════════════════

interface AchievementFormData {
  name: string
  description: string
  hint: string
  icon: string
  tier: AchievementTier
  achievement_type: AchievementType
  category: string
  is_enabled: boolean
  is_secret: boolean
  xp_reward: number
  points_reward: number
  trigger_event: TriggerEvent
  requires_progress: boolean
  progress_max: number
  progress_unit: string
  // Trigger conditions
  trigger_count: number
  trigger_threshold: number
  trigger_time_limit: number
  trigger_target_id: string
}

interface AchievementFormModalProps {
  initialData?: Partial<AchievementFormData>
  onSave: (data: any) => Promise<void>
  onClose: () => void
  isEdit?: boolean
}

export function AchievementFormModal({
  initialData,
  onSave,
  onClose,
  isEdit = false,
}: AchievementFormModalProps) {
  const [formData, setFormData] = useState<AchievementFormData>({
    name: initialData?.name || '',
    description: initialData?.description || '',
    hint: initialData?.hint || '',
    icon: initialData?.icon || '🏅',
    tier: initialData?.tier || 'bronze',
    achievement_type: initialData?.achievement_type || 'progress',
    category: initialData?.category || '',
    is_enabled: initialData?.is_enabled ?? true,
    is_secret: initialData?.is_secret ?? false,
    xp_reward: initialData?.xp_reward ?? 10,
    points_reward: initialData?.points_reward ?? 0,
    trigger_event: initialData?.trigger_event || 'challenge_complete',
    requires_progress: initialData?.requires_progress ?? true,
    progress_max: initialData?.progress_max ?? 1,
    progress_unit: initialData?.progress_unit || '',
    trigger_count: 1,
    trigger_threshold: 0,
    trigger_time_limit: 0,
    trigger_target_id: '',
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const conditions: Record<string, any> = {}
      if (formData.trigger_count > 0) conditions.count = formData.trigger_count
      if (formData.trigger_threshold > 0)
        conditions.threshold = formData.trigger_threshold
      if (formData.trigger_time_limit > 0)
        conditions.time_limit = formData.trigger_time_limit
      if (formData.trigger_target_id)
        conditions.target_id = formData.trigger_target_id

      await onSave({
        name: formData.name,
        description: formData.description,
        hint: formData.hint || null,
        icon: formData.icon,
        tier: formData.tier,
        achievement_type: formData.achievement_type,
        category: formData.category || null,
        is_enabled: formData.is_enabled,
        is_secret: formData.is_secret,
        xp_reward: formData.xp_reward,
        points_reward: formData.points_reward,
        trigger_event: formData.trigger_event,
        trigger_conditions:
          Object.keys(conditions).length > 0 ? conditions : null,
        requires_progress: formData.requires_progress,
        progress_max: formData.progress_max,
        progress_unit: formData.progress_unit || null,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const update = (field: keyof AchievementFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-sidebar rounded-2xl border border-card-border w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div className="flex items-center justify-between p-4 border-b border-card-border">
            <h2 className="text-lg font-bold text-white">
              {isEdit ? 'Edit Achievement' : 'Create Achievement'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-muted hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Basic Info */}
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-2">
                <label className="block text-xs text-white/70 mb-1">Icon</label>
                <input
                  type="text"
                  value={formData.icon}
                  onChange={(e) => update('icon', e.target.value)}
                  className="w-full px-3 py-2 bg-card border border-card-border rounded-lg text-2xl text-center focus:outline-none focus:border-accent/50"
                />
              </div>
              <div className="col-span-10">
                <label className="block text-xs text-white/70 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => update('name', e.target.value)}
                  className="w-full px-3 py-2 bg-card border border-card-border rounded-lg text-sm text-white focus:outline-none focus:border-accent/50"
                  placeholder="First Steps"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-white/70 mb-1">
                Description *
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => update('description', e.target.value)}
                className="w-full px-3 py-2 bg-card border border-card-border rounded-lg text-sm text-white focus:outline-none focus:border-accent/50 resize-none"
                rows={2}
                placeholder="Complete your first challenge"
                required
              />
            </div>

            {/* Tier & Type */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-white/70 mb-1">Tier</label>
                <select
                  value={formData.tier}
                  onChange={(e) =>
                    update('tier', e.target.value as AchievementTier)
                  }
                  className="w-full px-3 py-2 bg-card border border-card-border rounded-lg text-sm text-white focus:outline-none focus:border-accent/50"
                >
                  {Object.entries(TIER_META).map(([key, meta]) => (
                    <option key={key} value={key}>
                      {meta.icon} {meta.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/70 mb-1">Type</label>
                <select
                  value={formData.achievement_type}
                  onChange={(e) =>
                    update(
                      'achievement_type',
                      e.target.value as AchievementType
                    )
                  }
                  className="w-full px-3 py-2 bg-card border border-card-border rounded-lg text-sm text-white focus:outline-none focus:border-accent/50"
                >
                  {Object.entries(TYPE_META).map(([key, meta]) => (
                    <option key={key} value={key}>
                      {meta.icon} {meta.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Trigger */}
            <div>
              <label className="block text-xs text-white/70 mb-1">
                Trigger Event
              </label>
              <select
                value={formData.trigger_event}
                onChange={(e) =>
                  update('trigger_event', e.target.value as TriggerEvent)
                }
                className="w-full px-3 py-2 bg-card border border-card-border rounded-lg text-sm text-white focus:outline-none focus:border-accent/50"
              >
                {Object.entries(TRIGGER_META).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.icon} {meta.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Progress */}
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.requires_progress}
                  onChange={(e) =>
                    update('requires_progress', e.target.checked)
                  }
                  className="w-4 h-4 rounded border-white/[0.15] bg-card text-accent focus:ring-accent/50"
                />
                <span className="text-xs text-white/70">Requires Progress</span>
              </label>
              {formData.requires_progress && (
                <>
                  <input
                    type="number"
                    value={formData.progress_max}
                    onChange={(e) =>
                      update('progress_max', parseInt(e.target.value) || 1)
                    }
                    className="w-20 px-2 py-1 bg-card border border-card-border rounded text-sm text-white text-center"
                    min={1}
                  />
                  <input
                    type="text"
                    value={formData.progress_unit}
                    onChange={(e) => update('progress_unit', e.target.value)}
                    className="w-32 px-2 py-1 bg-card border border-card-border rounded text-sm text-white"
                    placeholder="challenges"
                  />
                </>
              )}
            </div>

            {/* Rewards */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-white/70 mb-1">
                  XP Reward
                </label>
                <input
                  type="number"
                  value={formData.xp_reward}
                  onChange={(e) =>
                    update('xp_reward', parseInt(e.target.value) || 0)
                  }
                  className="w-full px-3 py-2 bg-card border border-card-border rounded-lg text-sm text-white focus:outline-none focus:border-accent/50"
                  min={0}
                />
              </div>
              <div>
                <label className="block text-xs text-white/70 mb-1">
                  Points Reward
                </label>
                <input
                  type="number"
                  value={formData.points_reward}
                  onChange={(e) =>
                    update('points_reward', parseInt(e.target.value) || 0)
                  }
                  className="w-full px-3 py-2 bg-card border border-card-border rounded-lg text-sm text-white focus:outline-none focus:border-accent/50"
                  min={0}
                />
              </div>
            </div>

            {/* Flags */}
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_enabled}
                  onChange={(e) => update('is_enabled', e.target.checked)}
                  className="w-4 h-4 rounded border-white/[0.15] bg-card text-accent focus:ring-accent/50"
                />
                <span className="text-xs text-white/70">Enabled</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_secret}
                  onChange={(e) => update('is_secret', e.target.checked)}
                  className="w-4 h-4 rounded border-white/[0.15] bg-card text-accent focus:ring-accent/50"
                />
                <span className="text-xs text-white/70">
                  Secret (hidden until unlocked)
                </span>
              </label>
            </div>

            {formData.is_secret && (
              <div>
                <label className="block text-xs text-white/70 mb-1">
                  Hint (shown when locked)
                </label>
                <input
                  type="text"
                  value={formData.hint}
                  onChange={(e) => update('hint', e.target.value)}
                  className="w-full px-3 py-2 bg-card border border-card-border rounded-lg text-sm text-white focus:outline-none focus:border-accent/50"
                  placeholder="Try failing a lot..."
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 p-4 border-t border-card-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-white/70 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !formData.name || !formData.description}
              className="px-4 py-2 bg-accent hover:bg-accent-dark text-white font-bold rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {saving
                ? 'Saving...'
                : isEdit
                  ? 'Save Changes'
                  : 'Create Achievement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Empty State
// ═══════════════════════════════════════════════════════════════════

interface EmptyAchievementsProps {
  onCreateClick: () => void
  onCreateDefaults: () => void
}

export function EmptyAchievements({
  onCreateClick,
  onCreateDefaults,
}: EmptyAchievementsProps) {
  return (
    <div className="text-center py-12">
      <div className="text-5xl mb-4">🏅</div>
      <h3 className="text-lg font-bold text-white mb-2">No Achievements Yet</h3>
      <p className="text-white/70 text-sm mb-6 max-w-md mx-auto">
        Create achievements to reward players for their progress and
        accomplishments.
      </p>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={onCreateClick}
          className="px-4 py-2 bg-accent hover:bg-accent-dark text-white font-bold rounded-xl text-sm transition-colors"
        >
          + Create Achievement
        </button>
        <button
          onClick={onCreateDefaults}
          className="px-4 py-2 bg-white/[0.1] hover:bg-white/[0.1] text-white font-semibold rounded-xl text-sm transition-colors"
        >
          🎯 Create Defaults
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Tier Filter
// ═══════════════════════════════════════════════════════════════════

interface TierFilterProps {
  selected: AchievementTier | 'all'
  onChange: (tier: AchievementTier | 'all') => void
}

export function TierFilter({ selected, onChange }: TierFilterProps) {
  return (
    <div className="flex items-center gap-1 p-1 bg-card/40 rounded-xl">
      <button
        onClick={() => onChange('all')}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
          selected === 'all'
            ? 'bg-accent/15 text-accent'
            : 'text-muted hover:text-white/70'
        }`}
      >
        All
      </button>
      {Object.entries(TIER_META).map(([tier, meta]) => (
        <button
          key={tier}
          onClick={() => onChange(tier as AchievementTier)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            selected === tier
              ? 'bg-accent/15 text-accent'
              : 'text-muted hover:text-white/70'
          }`}
        >
          {meta.icon}
        </button>
      ))}
    </div>
  )
}
