'use client'

import { useState } from 'react'
import {
  LeaderboardConfig,
  LeaderboardType,
  LEADERBOARD_TYPE_META,
} from '../hooks/useLeaderboards'

// ═══════════════════════════════════════════════════════════════════
//  Leaderboard Config Card
// ═══════════════════════════════════════════════════════════════════

interface LeaderboardConfigCardProps {
  config: LeaderboardConfig
  onEdit: () => void
  onDelete: () => void
  onToggleEnabled: () => void
  onView: () => void
}

export function LeaderboardConfigCard({
  config,
  onEdit,
  onDelete,
  onToggleEnabled,
  onView,
}: LeaderboardConfigCardProps) {
  const meta = LEADERBOARD_TYPE_META[config.leaderboard_type]

  return (
    <div
      className={`
        rounded-xl border p-4 transition-all
        ${
          config.is_enabled
            ? 'bg-card/40 border-card-border'
            : 'bg-sidebar/40 border-card-border opacity-60'
        }
      `}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
            style={{ backgroundColor: `${meta.color}20` }}
          >
            {meta.icon}
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">{config.name}</h3>
            <div className="text-[10px] text-muted">
              {meta.label}
              {config.hearts_facet && ` (${config.hearts_facet})`}
            </div>
          </div>
        </div>

        {/* Status toggle */}
        <button
          onClick={onToggleEnabled}
          className={`
            px-2 py-1 rounded text-[10px] font-semibold transition-colors
            ${
              config.is_enabled
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-input/50 text-muted'
            }
          `}
        >
          {config.is_enabled ? 'Active' : 'Inactive'}
        </button>
      </div>

      {config.description && (
        <p className="text-xs text-white/70 mb-3 line-clamp-2">
          {config.description}
        </p>
      )}

      {/* Period badges */}
      <div className="flex flex-wrap gap-1 mb-3">
        {config.enable_all_time && (
          <span className="px-2 py-0.5 rounded bg-input text-[9px] text-white/70">
            All Time
          </span>
        )}
        {config.enable_daily && (
          <span className="px-2 py-0.5 rounded bg-input text-[9px] text-white/70">
            Daily
          </span>
        )}
        {config.enable_weekly && (
          <span className="px-2 py-0.5 rounded bg-input text-[9px] text-white/70">
            Weekly
          </span>
        )}
        {config.enable_monthly && (
          <span className="px-2 py-0.5 rounded bg-input text-[9px] text-white/70">
            Monthly
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-card-border">
        <button
          onClick={onView}
          className="flex-1 py-1.5 rounded text-[10px] font-semibold text-accent hover:bg-accent/10 transition-colors"
        >
          👁️ View
        </button>
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
//  Create/Edit Leaderboard Modal
// ═══════════════════════════════════════════════════════════════════

interface LeaderboardFormData {
  name: string
  description: string
  leaderboard_type: LeaderboardType
  hearts_facet: string
  custom_metric_key: string
  is_enabled: boolean
  is_public: boolean
  show_rank: boolean
  show_score: boolean
  sort_ascending: boolean
  enable_all_time: boolean
  enable_daily: boolean
  enable_weekly: boolean
  enable_monthly: boolean
}

interface LeaderboardFormModalProps {
  initialData?: Partial<LeaderboardFormData>
  onSave: (data: LeaderboardFormData) => Promise<void>
  onClose: () => void
  isEdit?: boolean
}

export function LeaderboardFormModal({
  initialData,
  onSave,
  onClose,
  isEdit = false,
}: LeaderboardFormModalProps) {
  const [formData, setFormData] = useState<LeaderboardFormData>({
    name: initialData?.name || '',
    description: initialData?.description || '',
    leaderboard_type: initialData?.leaderboard_type || 'total_score',
    hearts_facet: initialData?.hearts_facet || 'T',
    custom_metric_key: initialData?.custom_metric_key || '',
    is_enabled: initialData?.is_enabled ?? true,
    is_public: initialData?.is_public ?? true,
    show_rank: initialData?.show_rank ?? true,
    show_score: initialData?.show_score ?? true,
    sort_ascending: initialData?.sort_ascending ?? false,
    enable_all_time: initialData?.enable_all_time ?? true,
    enable_daily: initialData?.enable_daily ?? false,
    enable_weekly: initialData?.enable_weekly ?? true,
    enable_monthly: initialData?.enable_monthly ?? true,
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(formData)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const update = (field: keyof LeaderboardFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-sidebar rounded-2xl border border-card-border w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-card-border">
            <h2 className="text-lg font-bold text-white">
              {isEdit ? 'Edit Leaderboard' : 'Create Leaderboard'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-muted hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* Form */}
          <div className="p-4 space-y-4">
            {/* Name */}
            <div>
              <label className="block text-xs text-white/70 mb-1">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => update('name', e.target.value)}
                className="w-full px-3 py-2 bg-card border border-card-border rounded-lg text-sm text-white focus:outline-none focus:border-accent/50"
                placeholder="Top Scores"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs text-white/70 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => update('description', e.target.value)}
                className="w-full px-3 py-2 bg-card border border-card-border rounded-lg text-sm text-white focus:outline-none focus:border-accent/50 resize-none"
                rows={2}
                placeholder="Players with the highest total scores"
              />
            </div>

            {/* Type */}
            <div>
              <label className="block text-xs text-white/70 mb-1">
                Leaderboard Type *
              </label>
              <select
                value={formData.leaderboard_type}
                onChange={(e) =>
                  update('leaderboard_type', e.target.value as LeaderboardType)
                }
                className="w-full px-3 py-2 bg-card border border-card-border rounded-lg text-sm text-white focus:outline-none focus:border-accent/50"
              >
                {Object.entries(LEADERBOARD_TYPE_META).map(([type, meta]) => (
                  <option key={type} value={type}>
                    {meta.icon} {meta.label}
                  </option>
                ))}
              </select>
            </div>

            {/* HEARTS Facet (conditional) */}
            {formData.leaderboard_type === 'hearts_facet' && (
              <div>
                <label className="block text-xs text-white/70 mb-1">
                  HEARTS Facet *
                </label>
                <select
                  value={formData.hearts_facet}
                  onChange={(e) => update('hearts_facet', e.target.value)}
                  className="w-full px-3 py-2 bg-card border border-card-border rounded-lg text-sm text-white focus:outline-none focus:border-accent/50"
                >
                  <option value="H">H - Harmony</option>
                  <option value="E">E - Empowerment</option>
                  <option value="A">A - Awareness</option>
                  <option value="R">R - Resilience</option>
                  <option value="T">T - Tenacity</option>
                  <option value="Si">Si - Self-insight</option>
                  <option value="So">So - Social</option>
                </select>
              </div>
            )}

            {/* Custom Metric Key (conditional) */}
            {formData.leaderboard_type === 'custom' && (
              <div>
                <label className="block text-xs text-white/70 mb-1">
                  Custom Metric Key *
                </label>
                <input
                  type="text"
                  value={formData.custom_metric_key}
                  onChange={(e) => update('custom_metric_key', e.target.value)}
                  className="w-full px-3 py-2 bg-card border border-card-border rounded-lg text-sm text-white focus:outline-none focus:border-accent/50"
                  placeholder="my_custom_score"
                />
              </div>
            )}

            {/* Sort Order */}
            <div>
              <label className="block text-xs text-white/70 mb-1">
                Sort Order
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => update('sort_ascending', false)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    !formData.sort_ascending
                      ? 'bg-accent/20 text-accent border border-accent/30'
                      : 'bg-card text-white/70 border border-card-border'
                  }`}
                >
                  ↓ Higher is Better
                </button>
                <button
                  type="button"
                  onClick={() => update('sort_ascending', true)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    formData.sort_ascending
                      ? 'bg-accent/20 text-accent border border-accent/30'
                      : 'bg-card text-white/70 border border-card-border'
                  }`}
                >
                  ↑ Lower is Better
                </button>
              </div>
            </div>

            {/* Time Periods */}
            <div>
              <label className="block text-xs text-white/70 mb-2">
                Enabled Periods
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'enable_all_time', label: 'All Time' },
                  { key: 'enable_daily', label: 'Daily' },
                  { key: 'enable_weekly', label: 'Weekly' },
                  { key: 'enable_monthly', label: 'Monthly' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      update(
                        key as keyof LeaderboardFormData,
                        !formData[key as keyof LeaderboardFormData]
                      )
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      formData[key as keyof LeaderboardFormData]
                        ? 'bg-accent/20 text-accent border border-accent/30'
                        : 'bg-card text-muted border border-card-border'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Display Options */}
            <div>
              <label className="block text-xs text-white/70 mb-2">
                Display Options
              </label>
              <div className="space-y-2">
                {[
                  { key: 'is_enabled', label: 'Enabled (accepting scores)' },
                  { key: 'is_public', label: 'Public (visible to players)' },
                  { key: 'show_rank', label: 'Show player rank' },
                  { key: 'show_score', label: 'Show player score' },
                ].map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={
                        formData[key as keyof LeaderboardFormData] as boolean
                      }
                      onChange={(e) =>
                        update(
                          key as keyof LeaderboardFormData,
                          e.target.checked
                        )
                      }
                      className="w-4 h-4 rounded border-white/[0.15] bg-card text-accent focus:ring-accent/50"
                    />
                    <span className="text-xs text-white/70">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
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
              disabled={saving || !formData.name}
              className="px-4 py-2 bg-accent hover:bg-accent-dark text-white font-bold rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {saving
                ? 'Saving...'
                : isEdit
                  ? 'Save Changes'
                  : 'Create Leaderboard'}
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

interface EmptyLeaderboardsProps {
  onCreateClick: () => void
  onCreateDefaults: () => void
}

export function EmptyLeaderboards({
  onCreateClick,
  onCreateDefaults,
}: EmptyLeaderboardsProps) {
  return (
    <div className="text-center py-12">
      <div className="text-5xl mb-4">🏆</div>
      <h3 className="text-lg font-bold text-white mb-2">No Leaderboards Yet</h3>
      <p className="text-white/70 text-sm mb-6 max-w-md mx-auto">
        Create leaderboards to track player scores, challenge completions,
        HEARTS progress, and more.
      </p>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={onCreateClick}
          className="px-4 py-2 bg-accent hover:bg-accent-dark text-white font-bold rounded-xl text-sm transition-colors"
        >
          + Create Leaderboard
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
