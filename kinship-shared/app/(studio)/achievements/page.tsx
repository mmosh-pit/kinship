'use client'

import { useState, useMemo } from 'react'
import { useStudio } from '@/lib/studio-context'
import PageHeader from '@/components/PageHeader'
import { Card, EmptyState, Spinner } from '@/components/UI'

import {
  useAchievements,
  Achievement,
  AchievementTier,
  TIER_META,
} from '@/hooks/useAchievements'

import {
  AchievementCard,
  AchievementFormModal,
  EmptyAchievements,
  TierFilter,
} from '@/components/AchievementComponents'

export default function AchievementsPage() {
  const { currentGame, isInGame } = useStudio()
  const gameId = currentGame?.id || null

  // State
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingAchievement, setEditingAchievement] =
    useState<Achievement | null>(null)
  const [tierFilter, setTierFilter] = useState<AchievementTier | 'all'>('all')

  // Data
  const {
    achievements,
    loading,
    error,
    refetch,
    createAchievement,
    updateAchievement,
    deleteAchievement,
    createDefaults,
  } = useAchievements(gameId, true)

  // Filtered achievements
  const filteredAchievements = useMemo(() => {
    if (tierFilter === 'all') return achievements
    return achievements.filter((a) => a.tier === tierFilter)
  }, [achievements, tierFilter])

  // Group by tier for stats
  const stats = useMemo(() => {
    const byTier: Record<string, number> = {}
    for (const tier of Object.keys(TIER_META)) {
      byTier[tier] = achievements.filter((a) => a.tier === tier).length
    }
    return {
      total: achievements.length,
      enabled: achievements.filter((a) => a.is_enabled).length,
      secret: achievements.filter((a) => a.is_secret).length,
      byTier,
    }
  }, [achievements])

  // Handlers
  const handleCreate = async (data: any) => {
    await createAchievement(data)
  }

  const handleUpdate = async (data: any) => {
    if (!editingAchievement) return
    await updateAchievement(editingAchievement.id, data)
    setEditingAchievement(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this achievement?')) return
    await deleteAchievement(id)
  }

  const handleToggleEnabled = async (achievement: Achievement) => {
    await updateAchievement(achievement.id, {
      is_enabled: !achievement.is_enabled,
    })
  }

  const handleCreateDefaults = async () => {
    await createDefaults()
  }

  // No game selected
  if (!isInGame || !currentGame) {
    return (
      <EmptyState
        icon="🏅"
        title="Select a game first"
        description="Achievements are game-specific. Select a game from the Games page."
        action={
          <a
            href="/games"
            className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold"
          >
            View Games
          </a>
        }
      />
    )
  }

  return (
    <>
      <PageHeader
        title="Achievements"
        subtitle={`${currentGame.icon || '🏅'} ${currentGame.name}`}
        breadcrumbs={[
          { label: currentGame.name, href: '/dashboard' },
          { label: 'Achievements' },
        ]}
        action={
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3 py-2 bg-accent hover:bg-accent-dark text-white font-bold rounded-xl text-xs"
          >
            + Create
          </button>
        }
      />

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        <Card>
          <div className="p-3 text-center">
            <div className="text-2xl font-bold text-white">{stats.total}</div>
            <div className="text-[10px] text-muted">Total</div>
          </div>
        </Card>
        <Card>
          <div className="p-3 text-center">
            <div className="text-2xl font-bold text-emerald-400">
              {stats.enabled}
            </div>
            <div className="text-[10px] text-muted">Enabled</div>
          </div>
        </Card>
        {Object.entries(TIER_META)
          .slice(0, 4)
          .map(([tier, meta]) => (
            <Card key={tier}>
              <div className="p-3 text-center">
                <div
                  className="text-2xl font-bold"
                  style={{ color: meta.color }}
                >
                  {stats.byTier[tier] || 0}
                </div>
                <div className="text-[10px] text-muted">
                  {meta.icon} {meta.label}
                </div>
              </div>
            </Card>
          ))}
      </div>

      {/* Filter */}
      <div className="flex items-center justify-between mb-6">
        <TierFilter selected={tierFilter} onChange={setTierFilter} />
        <div className="text-xs text-muted">
          {filteredAchievements.length} achievement
          {filteredAchievements.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <Card>
            <div className="p-8 text-center">
              <span className="text-4xl mb-4 block">⚠️</span>
              <h3 className="text-white font-bold mb-2">
                Failed to load achievements
              </h3>
              <p className="text-muted text-sm">{error}</p>
            </div>
          </Card>
        ) : achievements.length === 0 ? (
          <Card>
            <EmptyAchievements
              onCreateClick={() => setShowCreateModal(true)}
              onCreateDefaults={handleCreateDefaults}
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAchievements.map((achievement) => (
              <AchievementCard
                key={achievement.id}
                achievement={achievement}
                onEdit={() => setEditingAchievement(achievement)}
                onDelete={() => handleDelete(achievement.id)}
                onToggleEnabled={() => handleToggleEnabled(achievement)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <AchievementFormModal
          onSave={handleCreate}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {/* Edit Modal */}
      {editingAchievement && (
        <AchievementFormModal
          initialData={{
            ...editingAchievement,
            hint: editingAchievement.hint ?? undefined,
            category: editingAchievement.category ?? undefined,
            progress_unit: editingAchievement.progress_unit ?? undefined,
          }}
          onSave={handleUpdate}
          onClose={() => setEditingAchievement(null)}
          isEdit
        />
      )}
    </>
  )
}
