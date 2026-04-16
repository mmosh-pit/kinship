'use client'

import { useState, useEffect, use, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { Card, SceneIcon } from '@/components/UI'
import {
  useRoute,
  useScenes,
  useQuests,
  useChallenges,
  useNPCs,
  updateRoute,
  deleteRoute,
} from '@/hooks/useApi'
import { HEARTS_FACETS } from '@/lib/data'
import type { RouteCondition } from '@/lib/types'

type RouteType =
  | 'scene_to_scene'
  | 'challenge_within_scene'
  | 'challenge_between_scenes'

const TRIGGER_TYPES = [
  { value: 'challenge_complete', icon: '⚡', label: 'Challenge Complete' },
  { value: 'quest_complete', icon: '⚔️', label: 'Quest Complete' },
  { value: 'npc_dialogue', icon: '💬', label: 'NPC Dialogue' },
  { value: 'exit_zone', icon: '🚪', label: 'Exit Zone' },
  { value: 'hearts_threshold', icon: '💚', label: 'HEARTS Threshold' },
  { value: 'manual', icon: '🎮', label: 'Player Choice' },
]

const ROUTE_TYPE_INFO: Record<
  RouteType,
  { label: string; icon: string; description: string; color: string }
> = {
  scene_to_scene: {
    label: 'Scene → Scene',
    icon: '🏞️',
    description: 'Navigate between different scenes',
    color: 'border-accent bg-accent/10 text-accent',
  },
  challenge_within_scene: {
    label: 'Challenge → Challenge',
    icon: '⚡',
    description: 'Chain challenges within the same scene',
    color: 'border-amber-500 bg-accent/15 text-accent',
  },
  challenge_between_scenes: {
    label: 'Challenge → Scene/Challenge',
    icon: '🔀',
    description: 'Complete challenge to unlock another scene or challenge',
    color: 'border-purple-500 bg-purple-500/10 text-purple-400',
  },
}

const selectClass =
  'w-full bg-card border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50'

export default function RouteEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { data: route, loading, error } = useRoute(id)
  const { data: scenes } = useScenes()
  const { data: quests } = useQuests()
  const { data: challengesResponse } = useChallenges()
  const { data: npcsResponse } = useNPCs()
  const challenges = challengesResponse?.data || []
  const npcs = npcsResponse?.data || []

  // Form state
  const [routeType, setRouteType] = useState<RouteType>('scene_to_scene')
  const [name, setName] = useState('')
  const [fromScene, setFromScene] = useState('')
  const [toScene, setToScene] = useState('')
  const [fromChallenge, setFromChallenge] = useState('')
  const [toChallenge, setToChallenge] = useState('')
  const [description, setDescription] = useState('')
  const [triggerType, setTriggerType] = useState('')
  const [triggerValue, setTriggerValue] = useState('')
  const [status, setStatus] = useState('draft')
  const [bidirectional, setBidirectional] = useState(false)
  const [showInMap, setShowInMap] = useState(true)
  const [hiddenUntilTriggered, setHiddenUntilTriggered] = useState(false)
  const [conditions, setConditions] = useState<RouteCondition[]>([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Determine route type from loaded data
  const detectRouteType = (r: any): RouteType => {
    if (r.from_challenge && r.to_challenge) {
      if (r.from_scene === r.to_scene) return 'challenge_within_scene'
      return 'challenge_between_scenes'
    }
    if (r.from_challenge || r.to_challenge) return 'challenge_between_scenes'
    return 'scene_to_scene'
  }

  // Initialize form when route loads
  useEffect(() => {
    if (route) {
      setRouteType(detectRouteType(route))
      setName(route.name)
      setFromScene(route.from_scene || '')
      setToScene(route.to_scene || '')
      setFromChallenge(route.from_challenge || '')
      setToChallenge(route.to_challenge || '')
      setDescription(route.description || '')
      setTriggerType(route.trigger_type || '')
      setTriggerValue(route.trigger_value || '')
      setStatus(route.status)
      setBidirectional(route.bidirectional)
      setShowInMap(route.show_in_map)
      setHiddenUntilTriggered(route.hidden_until_triggered)
      setConditions(route.conditions || [])
    }
  }, [route])

  // Helper functions
  const getSceneName = (sceneId: string) => {
    if (sceneId === '*') return '* (Any Scene)'
    const scene = scenes?.find((s) => s.id === sceneId)
    return scene?.scene_name || scene?.name || 'Unknown'
  }

  // Get challenges only for a specific scene
  const getChallengesForScene = (sceneId: string) => {
    if (!challenges || !sceneId) return []
    return challenges.filter((c) => c.scene_id === sceneId)
  }

  const fromSceneChallenges = useMemo(
    () => getChallengesForScene(fromScene),
    [challenges, fromScene]
  )
  const toSceneChallenges = useMemo(() => {
    const sceneId = routeType === 'challenge_within_scene' ? fromScene : toScene
    return getChallengesForScene(sceneId).filter((c) => c.id !== fromChallenge)
  }, [challenges, fromScene, toScene, routeType, fromChallenge])

  const handleRouteTypeChange = (type: RouteType) => {
    setRouteType(type)
    if (type === 'scene_to_scene') {
      setFromChallenge('')
      setToChallenge('')
    } else if (type === 'challenge_within_scene') {
      setToScene(fromScene) // Same scene
    }
  }

  const handleFromSceneChange = (sceneId: string) => {
    setFromScene(sceneId)
    setFromChallenge('')
    if (routeType === 'challenge_within_scene') {
      setToScene(sceneId)
      setToChallenge('')
    }
  }

  const handleToSceneChange = (sceneId: string) => {
    setToScene(sceneId)
    setToChallenge('')
  }

  const handleSave = async () => {
    if (!name.trim()) {
      setFormError('Route name is required')
      return
    }

    setSaving(true)
    setFormError('')

    try {
      const data: any = {
        name,
        description: description || null,
        trigger_type: triggerType || null,
        trigger_value: triggerValue || null,
        conditions,
        bidirectional,
        show_in_map: showInMap,
        hidden_until_triggered: hiddenUntilTriggered,
        status,
      }

      if (routeType === 'scene_to_scene') {
        data.from_scene = fromScene === '*' ? '*' : fromScene || null
        data.to_scene = toScene || null
        data.from_challenge = null
        data.to_challenge = null
      } else if (routeType === 'challenge_within_scene') {
        data.from_scene = fromScene || null
        data.to_scene = fromScene || null
        data.from_challenge = fromChallenge || null
        data.to_challenge = toChallenge || null
      } else {
        data.from_scene = fromScene || null
        data.to_scene = toScene || null
        data.from_challenge = fromChallenge || null
        data.to_challenge = toChallenge || null
      }

      await updateRoute(id, data)
      router.push(`/routes/${id}`)
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to update route'
      )
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this route? This cannot be undone.')) return
    try {
      await deleteRoute(id)
      router.push('/routes')
    } catch (err) {
      console.error('Failed to delete route:', err)
    }
  }

  const addCondition = () => {
    setConditions([
      ...conditions,
      { type: 'hearts_above', facet: 'H', value: '50' },
    ])
  }

  const updateCondition = (index: number, updates: Partial<RouteCondition>) => {
    const updated = [...conditions]
    updated[index] = { ...updated[index], ...updates }
    setConditions(updated)
  }

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index))
  }

  if (loading) {
    return (
      <>
        <PageHeader
          title="Loading..."
          breadcrumbs={[{ label: 'Routes', href: '/routes' }]}
        />
        <Card className="p-6 animate-pulse bg-input h-48">
          <></>
        </Card>
      </>
    )
  }

  if (error || !route) {
    return (
      <>
        <PageHeader
          title="Route Not Found"
          breadcrumbs={[{ label: 'Routes', href: '/routes' }]}
        />
        <Card className="p-8 text-center">
          <p className="text-red-400">{error || 'Route not found'}</p>
        </Card>
      </>
    )
  }

  const routeTypeInfo = ROUTE_TYPE_INFO[routeType]

  return (
    <>
      <PageHeader
        title={`Edit: ${route.name}`}
        breadcrumbs={[
          { label: 'Routes', href: '/routes' },
          { label: route.name, href: `/routes/${id}` },
          { label: 'Edit' },
        ]}
        action={
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold disabled:opacity-50"
          >
            {saving ? 'Saving...' : '💾 Save Changes'}
          </button>
        }
      />

      {formError && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
          <p className="text-red-400 text-sm">{formError}</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          {/* Route Type (Read-only info, change via delete/recreate) */}
          <Card className={`p-4 border ${routeTypeInfo.color}`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{routeTypeInfo.icon}</span>
              <div>
                <p className="font-bold">{routeTypeInfo.label}</p>
                <p className="text-white/70 text-sm">
                  {routeTypeInfo.description}
                </p>
              </div>
            </div>
          </Card>

          {/* Route Type Selection */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-2">Route Type</h3>
            <p className="text-muted text-sm mb-4">
              Changing type will reset connection fields
            </p>
            <div className="grid grid-cols-3 gap-3">
              {(
                Object.entries(ROUTE_TYPE_INFO) as [
                  RouteType,
                  typeof routeTypeInfo,
                ][]
              ).map(([type, info]) => (
                <button
                  key={type}
                  onClick={() => handleRouteTypeChange(type)}
                  className={`p-3 rounded-xl border-2 text-left transition-colors ${routeType === type ? info.color : 'border-card-border hover:border-card-border'}`}
                >
                  <span className="text-xl mr-2">{info.icon}</span>
                  <span className="text-white text-sm font-medium">
                    {info.label}
                  </span>
                </button>
              ))}
            </div>
          </Card>

          {/* Connection */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">Connection</h3>

            {routeType === 'scene_to_scene' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    From Scene
                  </label>
                  <select
                    value={fromScene}
                    onChange={(e) => setFromScene(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">-- Select source --</option>
                    <option value="*">* (Any Scene)</option>
                    {scenes?.map((s) => (
                      <option key={s.id} value={s.id}>
                        🏞️ {s.scene_name || s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    To Scene
                  </label>
                  <select
                    value={toScene}
                    onChange={(e) => setToScene(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">-- Select destination --</option>
                    {scenes?.map((s) => (
                      <option key={s.id} value={s.id}>
                        🏞️ {s.scene_name || s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {routeType === 'challenge_within_scene' && (
              <div className="space-y-4">
                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Scene
                  </label>
                  <select
                    value={fromScene}
                    onChange={(e) => handleFromSceneChange(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">-- Select scene --</option>
                    {scenes?.map((s) => (
                      <option key={s.id} value={s.id}>
                        🏞️ {s.scene_name || s.name}
                      </option>
                    ))}
                  </select>
                </div>
                {fromScene && (
                  <>
                    {fromSceneChallenges.length === 0 ? (
                      <div className="p-4 bg-accent/15 border border-amber-500/30 rounded-xl">
                        <p className="text-accent text-sm">
                          ⚠️ No challenges assigned to this scene
                        </p>
                        <p className="text-muted text-xs mt-1">
                          Assign challenges to "{getSceneName(fromScene)}"
                          first.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-white/70 text-sm block mb-2">
                            From Challenge ({fromSceneChallenges.length})
                          </label>
                          <select
                            value={fromChallenge}
                            onChange={(e) => setFromChallenge(e.target.value)}
                            className={selectClass}
                          >
                            <option value="">-- Select --</option>
                            {fromSceneChallenges.map((c) => (
                              <option key={c.id} value={c.id}>
                                ⚡ {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-white/70 text-sm block mb-2">
                            To Challenge ({toSceneChallenges.length})
                          </label>
                          <select
                            value={toChallenge}
                            onChange={(e) => setToChallenge(e.target.value)}
                            className={selectClass}
                            disabled={!fromChallenge}
                          >
                            <option value="">-- Select --</option>
                            {toSceneChallenges.map((c) => (
                              <option key={c.id} value={c.id}>
                                ⚡ {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {routeType === 'challenge_between_scenes' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-white/70 text-sm block mb-2">
                      From Scene
                    </label>
                    <select
                      value={fromScene}
                      onChange={(e) => handleFromSceneChange(e.target.value)}
                      className={selectClass}
                    >
                      <option value="">-- Select --</option>
                      {scenes?.map((s) => (
                        <option key={s.id} value={s.id}>
                          🏞️ {s.scene_name || s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-white/70 text-sm block mb-2">
                      To Scene
                    </label>
                    <select
                      value={toScene}
                      onChange={(e) => handleToSceneChange(e.target.value)}
                      className={selectClass}
                    >
                      <option value="">-- Select --</option>
                      {scenes
                        ?.filter((s) => s.id !== fromScene)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            🏞️ {s.scene_name || s.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                {fromScene && (
                  <div>
                    <label className="text-white/70 text-sm block mb-2">
                      From Challenge (in {getSceneName(fromScene)})
                    </label>
                    {fromSceneChallenges.length === 0 ? (
                      <p className="text-accent text-sm">
                        No challenges in source scene
                      </p>
                    ) : (
                      <select
                        value={fromChallenge}
                        onChange={(e) => setFromChallenge(e.target.value)}
                        className={selectClass}
                      >
                        <option value="">-- Select --</option>
                        {fromSceneChallenges.map((c) => (
                          <option key={c.id} value={c.id}>
                            ⚡ {c.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                {toScene && (
                  <div>
                    <label className="text-white/70 text-sm block mb-2">
                      To Challenge (optional, in {getSceneName(toScene)})
                    </label>
                    <select
                      value={toChallenge}
                      onChange={(e) => setToChallenge(e.target.value)}
                      className={selectClass}
                    >
                      <option value="">-- Scene only --</option>
                      {getChallengesForScene(toScene).map((c) => (
                        <option key={c.id} value={c.id}>
                          ⚡ {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Route Name */}
            <div className="mt-6">
              <label className="text-white/70 text-sm block mb-2">
                Route Name *
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={selectClass}
              />
            </div>
            <div className="mt-4">
              <label className="text-white/70 text-sm block mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className={`${selectClass} resize-none`}
              />
            </div>
          </Card>

          {/* Trigger */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">Trigger</h3>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {TRIGGER_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => {
                    setTriggerType(t.value)
                    setTriggerValue('')
                  }}
                  className={`p-3 rounded-xl border text-left ${triggerType === t.value ? 'border-accent bg-accent/10' : 'border-card-border hover:border-card-border'}`}
                >
                  <span className="text-lg mr-2">{t.icon}</span>
                  <span className="text-white text-sm">{t.label}</span>
                </button>
              ))}
            </div>
            {['quest_complete', 'challenge_complete', 'npc_dialogue'].includes(
              triggerType
            ) && (
              <div>
                <label className="text-white/70 text-sm block mb-2">
                  Trigger Value
                </label>
                <select
                  value={triggerValue}
                  onChange={(e) => setTriggerValue(e.target.value)}
                  className={selectClass}
                >
                  <option value="">-- Select --</option>
                  {triggerType === 'quest_complete' &&
                    quests?.map((q) => (
                      <option key={q.id} value={q.id}>
                        ⚔️ {q.name}
                      </option>
                    ))}
                  {triggerType === 'challenge_complete' &&
                    challenges?.map((c) => (
                      <option key={c.id} value={c.id}>
                        ⚡ {c.name}
                      </option>
                    ))}
                  {triggerType === 'npc_dialogue' &&
                    npcs?.map((n) => (
                      <option key={n.id} value={n.id}>
                        🧑 {n.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </Card>

          {/* Conditions */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold">Conditions</h3>
              <button
                onClick={addCondition}
                className="text-accent text-sm hover:underline"
              >
                + Add
              </button>
            </div>
            {conditions.length === 0 ? (
              <p className="text-white/40 text-sm">No conditions</p>
            ) : (
              <div className="space-y-3">
                {conditions.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 bg-sidebar rounded-xl px-4 py-3"
                  >
                    <select
                      value={c.type}
                      onChange={(e) =>
                        updateCondition(i, { type: e.target.value })
                      }
                      className="bg-card border border-card-border rounded-lg px-3 py-2 text-white text-sm"
                    >
                      <option value="hearts_above">HEARTS Above</option>
                      <option value="hearts_below">HEARTS Below</option>
                    </select>
                    <select
                      value={c.facet || 'H'}
                      onChange={(e) =>
                        updateCondition(i, { facet: e.target.value })
                      }
                      className="bg-card border border-card-border rounded-lg px-3 py-2 text-white text-sm"
                    >
                      {HEARTS_FACETS.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.key}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={c.value || 50}
                      onChange={(e) =>
                        updateCondition(i, { value: e.target.value })
                      }
                      className="w-20 bg-card border border-card-border rounded-lg px-3 py-2 text-white text-sm"
                    />
                    <button
                      onClick={() => removeCondition(i)}
                      className="text-red-400 hover:text-red-300 ml-auto"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="text-white/70 text-sm block mb-2">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className={selectClass}
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                </select>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bidirectional}
                  onChange={(e) => setBidirectional(e.target.checked)}
                  className="checkbox checkbox-sm checkbox-accent"
                />
                <span className="text-white/70 text-sm">Bidirectional</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showInMap}
                  onChange={(e) => setShowInMap(e.target.checked)}
                  className="checkbox checkbox-sm checkbox-accent"
                />
                <span className="text-white/70 text-sm">Show in map</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hiddenUntilTriggered}
                  onChange={(e) => setHiddenUntilTriggered(e.target.checked)}
                  className="checkbox checkbox-sm checkbox-accent"
                />
                <span className="text-white/70 text-sm">
                  Hidden until triggered
                </span>
              </label>
            </div>
          </Card>

          {/* Scene Challenges */}
          {fromScene && routeType !== 'scene_to_scene' && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-3">Scene Challenges</h3>
              <p className="text-muted text-xs mb-3">
                {getSceneName(fromScene)}
              </p>
              {fromSceneChallenges.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {fromSceneChallenges.map((c) => (
                    <div
                      key={c.id}
                      className={`flex items-center gap-2 text-sm p-2 rounded-lg ${fromChallenge === c.id || toChallenge === c.id ? 'bg-accent/10 border border-accent/30' : 'bg-sidebar/40'}`}
                    >
                      <span className="text-accent">⚡</span>
                      <span className="text-white/70 truncate flex-1">
                        {c.name}
                      </span>
                      {fromChallenge === c.id && (
                        <span className="text-accent text-[10px]">FROM</span>
                      )}
                      {toChallenge === c.id && (
                        <span className="text-accent text-[10px]">TO</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-white/40 text-sm">No challenges assigned</p>
              )}
            </Card>
          )}

          <button
            onClick={handleDelete}
            className="w-full btn bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20 rounded-xl"
          >
            🗑️ Delete Route
          </button>
        </div>
      </div>
    </>
  )
}
