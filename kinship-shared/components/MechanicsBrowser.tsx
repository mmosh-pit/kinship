'use client'

import { useState, useEffect } from 'react'
import { knowledgeApi } from '@/lib/api'
import type { MechanicSummary } from '@/lib/types'

interface MechanicDetailData {
  id: string
  name: string
  description: string
  category: string
  base_difficulty: number
  supported_npc_roles: string[]
  hearts_facets: string[]
  object_slots: Record<string, unknown>
  template: {
    difficulty_range: [number, number]
    estimated_time_seconds: number
    base_score: number
    base_hearts: number
  } | null
}

interface Props {
  onSelectMechanic?: (mechanicId: string) => void
  compact?: boolean
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  interaction: { bg: 'bg-purple-500/15', text: 'text-purple-400' },
  movement: { bg: 'bg-blue-500/15', text: 'text-blue-400' },
  puzzle: { bg: 'bg-amber-500/15', text: 'text-amber-400' },
  social: { bg: 'bg-pink-500/15', text: 'text-pink-400' },
  exploration: { bg: 'bg-teal-500/15', text: 'text-teal-400' },
  default: { bg: 'bg-white/[0.1]', text: 'text-white/70' },
}

export default function MechanicsBrowser({
  onSelectMechanic,
  compact = false,
}: Props) {
  const [mechanics, setMechanics] = useState<MechanicSummary[]>([])
  const [selectedMechanic, setSelectedMechanic] =
    useState<MechanicDetailData | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    loadMechanics()
  }, [])

  const loadMechanics = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await knowledgeApi.getMechanics()
      setMechanics(data.mechanics)
    } catch (err) {
      console.error('Failed to load mechanics:', err)
      setError('Failed to load mechanics')
    } finally {
      setLoading(false)
    }
  }

  const selectMechanic = async (id: string) => {
    if (selectedMechanic?.id === id) {
      setSelectedMechanic(null)
      return
    }

    setLoading(true)
    try {
      const detail = await knowledgeApi.getMechanic(id)
      setSelectedMechanic(detail as MechanicDetailData)
      onSelectMechanic?.(id)
    } catch (err) {
      console.error('Failed to load mechanic detail:', err)
    } finally {
      setLoading(false)
    }
  }

  // Get unique categories
  const categories = ['all', ...new Set(mechanics.map((m) => m.category))]

  // Filter mechanics
  const filteredMechanics =
    filter === 'all'
      ? mechanics
      : mechanics.filter((m) => m.category === filter)

  const getCategoryStyle = (category: string) =>
    CATEGORY_COLORS[category] || CATEGORY_COLORS.default

  if (compact) {
    return (
      <div className="bg-card rounded-xl p-3 border border-card-border">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">🎯</span>
            <span className="text-xs font-medium text-white">Mechanics</span>
          </div>
          <span className="text-[10px] text-muted">
            {mechanics.length} available {isExpanded ? '▾' : '▸'}
          </span>
        </button>

        {isExpanded && (
          <div className="mt-3">
            {loading && !mechanics.length ? (
              <p className="text-[10px] text-muted">Loading...</p>
            ) : error ? (
              <p className="text-[10px] text-red-400">{error}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {filteredMechanics.slice(0, 8).map((m) => {
                  const style = getCategoryStyle(m.category)
                  return (
                    <button
                      key={m.id}
                      onClick={() => selectMechanic(m.id)}
                      className={`text-[10px] px-2 py-1 rounded-md transition-colors ${
                        selectedMechanic?.id === m.id
                          ? 'bg-purple-500/30 text-purple-300 ring-1 ring-purple-500/50'
                          : `${style.bg} ${style.text} hover:opacity-80`
                      }`}
                    >
                      {m.name}
                    </button>
                  )
                })}
                {filteredMechanics.length > 8 && (
                  <span className="text-[10px] px-2 py-1 text-muted">
                    +{filteredMechanics.length - 8} more
                  </span>
                )}
              </div>
            )}

            {/* Selected Mechanic Detail */}
            {selectedMechanic && (
              <div className="mt-2 p-2 bg-white/[0.05] rounded-lg border border-white/[0.08]">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-white">
                      {selectedMechanic.name}
                    </p>
                    <p className="text-[10px] text-muted mt-0.5">
                      {selectedMechanic.description}
                    </p>
                  </div>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded ${getCategoryStyle(selectedMechanic.category).bg} ${getCategoryStyle(selectedMechanic.category).text}`}
                  >
                    {selectedMechanic.category}
                  </span>
                </div>

                {/* NPC Roles */}
                {selectedMechanic.supported_npc_roles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="text-[9px] text-muted mr-1">
                      NPC roles:
                    </span>
                    {selectedMechanic.supported_npc_roles.map((role) => (
                      <span
                        key={role}
                        className="text-[9px] px-1.5 py-0.5 bg-blue-500/15 text-blue-400 rounded"
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                )}

                {/* Template Info */}
                {selectedMechanic.template && (
                  <div className="mt-2 pt-2 border-t border-white/[0.08] grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[9px] text-muted">Difficulty</p>
                      <p className="text-[10px] text-white">
                        {selectedMechanic.template.difficulty_range[0]}-
                        {selectedMechanic.template.difficulty_range[1]}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] text-muted">Est. time</p>
                      <p className="text-[10px] text-white">
                        {selectedMechanic.template.estimated_time_seconds}s
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] text-muted">Base score</p>
                      <p className="text-[10px] text-white">
                        {selectedMechanic.template.base_score}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] text-muted">Hearts</p>
                      <p className="text-[10px] text-white">
                        +{selectedMechanic.template.base_hearts}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Full view (non-compact)
  return (
    <div className="bg-card rounded-xl p-4 border border-card-border">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm">🎯</span>
          <span className="text-sm font-medium text-white">
            Game Mechanics
          </span>
          <span className="text-xs text-muted">({mechanics.length})</span>
        </div>
        <button
          onClick={loadMechanics}
          disabled={loading}
          className="text-[10px] text-muted hover:text-white transition-colors"
        >
          {loading ? '...' : '↻ Refresh'}
        </button>
      </div>

      {/* Category Filter */}
      <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`text-[10px] px-2 py-1 rounded-md capitalize transition-colors ${
              filter === cat
                ? 'bg-white/[0.15] text-white'
                : 'bg-white/[0.05] text-muted hover:text-white'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Mechanics Grid */}
      {error ? (
        <p className="text-xs text-red-400">{error}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
          {filteredMechanics.map((m) => {
            const style = getCategoryStyle(m.category)
            const isSelected = selectedMechanic?.id === m.id

            return (
              <button
                key={m.id}
                onClick={() => selectMechanic(m.id)}
                className={`text-left p-2 rounded-lg transition-all ${
                  isSelected
                    ? 'bg-purple-500/20 ring-1 ring-purple-500/50'
                    : 'bg-white/[0.03] hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <p className="text-xs font-medium text-white truncate">
                    {m.name}
                  </p>
                  <span
                    className={`text-[8px] px-1 py-0.5 rounded ${style.bg} ${style.text} flex-shrink-0`}
                  >
                    {m.category}
                  </span>
                </div>
                <p className="text-[10px] text-muted mt-1 line-clamp-2">
                  {m.description}
                </p>
              </button>
            )
          })}
        </div>
      )}

      {/* Selected Detail Panel */}
      {selectedMechanic && (
        <div className="mt-3 p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-white">
                {selectedMechanic.name}
              </p>
              <p className="text-xs text-muted mt-1">
                {selectedMechanic.description}
              </p>
            </div>
            <button
              onClick={() => setSelectedMechanic(null)}
              className="text-white/40 hover:text-white text-sm"
            >
              ✕
            </button>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] text-muted">Difficulty</p>
              <p className="text-xs text-white">
                {selectedMechanic.base_difficulty}/5
              </p>
            </div>
            {selectedMechanic.template && (
              <>
                <div>
                  <p className="text-[10px] text-muted">Est. time</p>
                  <p className="text-xs text-white">
                    {Math.round(
                      selectedMechanic.template.estimated_time_seconds / 60
                    )}
                    m
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted">Base score</p>
                  <p className="text-xs text-white">
                    {selectedMechanic.template.base_score}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* NPC Roles */}
          {selectedMechanic.supported_npc_roles.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] text-muted mb-1">
                Compatible NPC roles
              </p>
              <div className="flex flex-wrap gap-1">
                {selectedMechanic.supported_npc_roles.map((role) => (
                  <span
                    key={role}
                    className="text-[10px] px-2 py-0.5 bg-blue-500/15 text-blue-400 rounded-md"
                  >
                    {role}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Hearts Facets */}
          {selectedMechanic.hearts_facets.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] text-muted mb-1">Hearts facets</p>
              <div className="flex flex-wrap gap-1">
                {selectedMechanic.hearts_facets.map((facet) => (
                  <span
                    key={facet}
                    className="text-[10px] px-2 py-0.5 bg-pink-500/15 text-pink-400 rounded-md"
                  >
                    {facet}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
