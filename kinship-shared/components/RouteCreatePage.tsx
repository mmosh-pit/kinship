'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { Card, SceneIcon, StatusBadge, FacetBadge } from '@/components/UI'
import {
  useScenes,
  useQuests,
  useChallenges,
  useNPCs,
  createRoute,
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
    description: 'Player navigates from one scene to another',
    color: 'border-accent bg-accent/10',
  },
  challenge_within_scene: {
    label: 'Challenge → Challenge',
    icon: '⚡',
    description:
      'Chain challenges within the same scene. Only challenges assigned to that scene will be available.',
    color: 'border-amber-500 bg-accent/15',
  },
  challenge_between_scenes: {
    label: 'Challenge → Scene/Challenge',
    icon: '🔀',
    description:
      'Complete a challenge in one scene to unlock another scene or challenge. Challenges must be assigned to the scene.',
    color: 'border-purple-500 bg-purple-500/10',
  },
}

// Select styling
const selectClass =
  'w-full bg-card border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50 appearance-none cursor-pointer'
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  backgroundSize: '20px',
}

export default function RouteCreatePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialFrom = searchParams.get('from') || ''

  const { data: scenes } = useScenes()
  const { data: quests } = useQuests()
  const { data: challengesResponse } = useChallenges()
  const { data: npcsResponse } = useNPCs()
  const challenges = challengesResponse?.data || []
  const npcs = npcsResponse?.data || []

  // Route type
  const [routeType, setRouteType] = useState<RouteType>('scene_to_scene')

  // Form state
  const [name, setName] = useState('')
  const [fromScene, setFromScene] = useState(initialFrom)
  const [toScene, setToScene] = useState('')
  const [fromChallenge, setFromChallenge] = useState('')
  const [toChallenge, setToChallenge] = useState('')
  const [description, setDescription] = useState('')
  const [triggerType, setTriggerType] = useState('challenge_complete')
  const [triggerValue, setTriggerValue] = useState('')
  const [status, setStatus] = useState('draft')
  const [bidirectional, setBidirectional] = useState(false)
  const [showInMap, setShowInMap] = useState(true)
  const [hiddenUntilTriggered, setHiddenUntilTriggered] = useState(false)
  const [conditions, setConditions] = useState<RouteCondition[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Helper functions
  const getSceneName = (sceneId: string) => {
    if (sceneId === '*') return '* (Any Scene)'
    const scene = scenes?.find((s) => s.id === sceneId)
    return scene?.scene_name || scene?.name || 'Unknown'
  }

  // Get challenges ONLY for a specific scene (must have scene_id matching)
  const getChallengesForScene = (sceneId: string) => {
    if (!challenges || !sceneId) return []
    return challenges.filter((c) => c.scene_id === sceneId)
  }

  // Filtered challenges for from scene
  const fromSceneChallenges = useMemo(() => {
    return getChallengesForScene(fromScene)
  }, [challenges, fromScene])

  // Filtered challenges for to scene (or same scene for within-scene routes)
  const toSceneChallenges = useMemo(() => {
    const sceneId = routeType === 'challenge_within_scene' ? fromScene : toScene
    return getChallengesForScene(sceneId).filter((c) => c.id !== fromChallenge)
  }, [challenges, fromScene, toScene, routeType, fromChallenge])

  const handleRouteTypeChange = (type: RouteType) => {
    setRouteType(type)
    // Reset challenge selections when changing type
    setFromChallenge('')
    setToChallenge('')
    if (type === 'challenge_within_scene') {
      setToScene('') // Same scene for within-scene routes
    }
  }

  const handleFromSceneChange = (sceneId: string) => {
    setFromScene(sceneId)
    setFromChallenge('') // Reset challenge when scene changes
    if (routeType === 'challenge_within_scene') {
      setToChallenge('') // Reset to challenge too
    }
  }

  const handleToSceneChange = (sceneId: string) => {
    setToScene(sceneId)
    setToChallenge('') // Reset challenge when scene changes
  }

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Route name is required')
      return
    }

    // Validation based on route type
    if (routeType === 'scene_to_scene') {
      if (!fromScene || !toScene) {
        setError('Please select both source and destination scenes')
        return
      }
    } else if (routeType === 'challenge_within_scene') {
      if (!fromScene) {
        setError('Please select a scene')
        return
      }
      if (!fromChallenge || !toChallenge) {
        setError('Please select both from and to challenges')
        return
      }
    } else if (routeType === 'challenge_between_scenes') {
      if (!fromScene || !toScene) {
        setError('Please select both scenes')
        return
      }
      if (!fromChallenge) {
        setError('Please select the source challenge')
        return
      }
    }

    setSaving(true)
    setError('')

    try {
      const routeData: any = {
        name,
        description: description || null,
        trigger_type: triggerType || null,
        trigger_value: triggerValue || fromChallenge || null,
        conditions,
        bidirectional,
        show_in_map: showInMap,
        hidden_until_triggered: hiddenUntilTriggered,
        status,
      }

      if (routeType === 'scene_to_scene') {
        routeData.from_scene = fromScene === '*' ? '*' : fromScene
        routeData.to_scene = toScene
      } else if (routeType === 'challenge_within_scene') {
        routeData.from_scene = fromScene
        routeData.to_scene = fromScene // Same scene
        routeData.from_challenge = fromChallenge
        routeData.to_challenge = toChallenge
      } else if (routeType === 'challenge_between_scenes') {
        routeData.from_scene = fromScene
        routeData.to_scene = toScene
        routeData.from_challenge = fromChallenge
        routeData.to_challenge = toChallenge || null
      }

      await createRoute(routeData)
      router.push('/routes')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create route')
    } finally {
      setSaving(false)
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

  const routeTypeInfo = ROUTE_TYPE_INFO[routeType]

  return (
    <>
      <PageHeader
        title="Create Route"
        subtitle="Define navigation paths between scenes and challenges"
        breadcrumbs={[
          { label: 'Routes', href: '/routes' },
          { label: 'Create' },
        ]}
        action={
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold disabled:opacity-50"
          >
            {saving ? 'Saving...' : '💾 Save Route'}
          </button>
        }
      />

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          {/* Step 1: Route Type Selection */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-2">
              Step 1: Select Route Type
            </h3>
            <p className="text-muted text-sm mb-4">
              What kind of navigation are you creating?
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
                  className={`p-4 rounded-xl border-2 text-left transition-colors ${routeType === type ? info.color : 'border-card-border hover:border-card-border'}`}
                >
                  <span className="text-2xl mb-2 block">{info.icon}</span>
                  <p className="text-white text-sm font-medium">{info.label}</p>
                  <p className="text-muted text-[10px] mt-1 line-clamp-2">
                    {info.description}
                  </p>
                </button>
              ))}
            </div>
          </Card>

          {/* Step 2: Connection Setup */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-2">
              Step 2: Define Connection
            </h3>
            <p className="text-muted text-sm mb-4">
              {routeType === 'scene_to_scene' &&
                'Select source and destination scenes'}
              {routeType === 'challenge_within_scene' &&
                'Select scene, then choose challenges within that scene'}
              {routeType === 'challenge_between_scenes' &&
                'Select scenes, then choose challenges from each scene'}
            </p>

            {/* Scene to Scene */}
            {routeType === 'scene_to_scene' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-white/70 text-sm block mb-2">
                      From Scene *
                    </label>
                    <select
                      value={fromScene}
                      onChange={(e) => setFromScene(e.target.value)}
                      className={selectClass}
                      style={selectStyle}
                    >
                      <option value="">-- Select source scene --</option>
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
                      To Scene *
                    </label>
                    <select
                      value={toScene}
                      onChange={(e) => setToScene(e.target.value)}
                      className={selectClass}
                      style={selectStyle}
                    >
                      <option value="">-- Select destination scene --</option>
                      {scenes?.map((s) => (
                        <option key={s.id} value={s.id}>
                          🏞️ {s.scene_name || s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Challenge within Scene */}
            {routeType === 'challenge_within_scene' && (
              <div className="space-y-4">
                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Scene *
                  </label>
                  <select
                    value={fromScene}
                    onChange={(e) => handleFromSceneChange(e.target.value)}
                    className={selectClass}
                    style={selectStyle}
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
                          ⚠️ No challenges assigned to "
                          {getSceneName(fromScene)}"
                        </p>
                        <p className="text-muted text-xs mt-1">
                          Go to{' '}
                          <Link
                            href={`/scenes/${fromScene}/edit`}
                            className="text-accent hover:underline"
                          >
                            Scene Edit
                          </Link>{' '}
                          and assign challenges, or{' '}
                          <Link
                            href="/challenges/create"
                            className="text-accent hover:underline"
                          >
                            create new challenges
                          </Link>{' '}
                          with this scene.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-white/70 text-sm block mb-2">
                            From Challenge * ({fromSceneChallenges.length}{' '}
                            available)
                          </label>
                          <select
                            value={fromChallenge}
                            onChange={(e) => setFromChallenge(e.target.value)}
                            className={selectClass}
                            style={selectStyle}
                          >
                            <option value="">-- Select challenge --</option>
                            {fromSceneChallenges.map((c) => (
                              <option key={c.id} value={c.id}>
                                ⚡ {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-white/70 text-sm block mb-2">
                            To Challenge * ({toSceneChallenges.length}{' '}
                            available)
                          </label>
                          <select
                            value={toChallenge}
                            onChange={(e) => setToChallenge(e.target.value)}
                            className={selectClass}
                            style={selectStyle}
                            disabled={!fromChallenge}
                          >
                            <option value="">-- Select challenge --</option>
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

            {/* Challenge between Scenes */}
            {routeType === 'challenge_between_scenes' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-white/70 text-sm block mb-2">
                      From Scene *
                    </label>
                    <select
                      value={fromScene}
                      onChange={(e) => handleFromSceneChange(e.target.value)}
                      className={selectClass}
                      style={selectStyle}
                    >
                      <option value="">-- Select scene --</option>
                      {scenes?.map((s) => (
                        <option key={s.id} value={s.id}>
                          🏞️ {s.scene_name || s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-white/70 text-sm block mb-2">
                      To Scene *
                    </label>
                    <select
                      value={toScene}
                      onChange={(e) => handleToSceneChange(e.target.value)}
                      className={selectClass}
                      style={selectStyle}
                    >
                      <option value="">-- Select scene --</option>
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
                      From Challenge * (in {getSceneName(fromScene)})
                    </label>
                    {fromSceneChallenges.length === 0 ? (
                      <div className="p-3 bg-accent/15 border border-amber-500/30 rounded-xl">
                        <p className="text-accent text-sm">
                          ⚠️ No challenges in this scene
                        </p>
                      </div>
                    ) : (
                      <select
                        value={fromChallenge}
                        onChange={(e) => setFromChallenge(e.target.value)}
                        className={selectClass}
                        style={selectStyle}
                      >
                        <option value="">-- Select challenge --</option>
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
                    {getChallengesForScene(toScene).length === 0 ? (
                      <p className="text-muted text-sm">
                        No challenges in destination scene
                      </p>
                    ) : (
                      <select
                        value={toChallenge}
                        onChange={(e) => setToChallenge(e.target.value)}
                        className={selectClass}
                        style={selectStyle}
                      >
                        <option value="">
                          -- Scene only (no specific challenge) --
                        </option>
                        {getChallengesForScene(toScene).map((c) => (
                          <option key={c.id} value={c.id}>
                            ⚡ {c.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Visual Preview */}
            {((routeType === 'scene_to_scene' && fromScene && toScene) ||
              (routeType === 'challenge_within_scene' &&
                fromChallenge &&
                toChallenge) ||
              (routeType === 'challenge_between_scenes' &&
                fromScene &&
                toScene &&
                fromChallenge)) && (
              <div className="mt-6 p-4 bg-sidebar/40 rounded-xl">
                <p className="text-muted text-xs uppercase tracking-wider mb-3">
                  Preview
                </p>
                <div className="flex items-center justify-center gap-4">
                  <div className="text-center">
                    {routeType !== 'scene_to_scene' && fromChallenge ? (
                      <>
                        <span className="text-2xl">⚡</span>
                        <p className="text-white text-xs mt-1">
                          {
                            challenges?.find((c) => c.id === fromChallenge)
                              ?.name
                          }
                        </p>
                        <p className="text-muted text-[9px]">
                          in {getSceneName(fromScene)}
                        </p>
                      </>
                    ) : (
                      <>
                        <SceneIcon
                          type={
                            scenes?.find((s) => s.id === fromScene)
                              ?.scene_type || 'Unknown'
                          }
                          size="sm"
                        />
                        <p className="text-white text-xs mt-1">
                          {getSceneName(fromScene)}
                        </p>
                      </>
                    )}
                  </div>
                  <span className="text-accent text-2xl">→</span>
                  <div className="text-center">
                    {routeType !== 'scene_to_scene' && toChallenge ? (
                      <>
                        <span className="text-2xl">⚡</span>
                        <p className="text-white text-xs mt-1">
                          {challenges?.find((c) => c.id === toChallenge)?.name}
                        </p>
                        <p className="text-muted text-[9px]">
                          in{' '}
                          {getSceneName(
                            routeType === 'challenge_within_scene'
                              ? fromScene
                              : toScene
                          )}
                        </p>
                      </>
                    ) : (
                      <>
                        <SceneIcon
                          type={
                            scenes?.find(
                              (s) =>
                                s.id ===
                                (routeType === 'challenge_within_scene'
                                  ? fromScene
                                  : toScene)
                            )?.scene_type || 'Unknown'
                          }
                          size="sm"
                        />
                        <p className="text-white text-xs mt-1">
                          {getSceneName(
                            routeType === 'challenge_within_scene'
                              ? fromScene
                              : toScene
                          )}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Step 3: Basic Info */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-2">Step 3: Route Info</h3>
            <div className="space-y-4">
              <div>
                <label className="text-white/70 text-sm block mb-2">
                  Route Name *
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Gym Warmup to Main Workout"
                  className="w-full bg-card border border-card-border rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50"
                />
              </div>
              <div>
                <label className="text-white/70 text-sm block mb-2">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Optional description..."
                  className="w-full bg-card border border-card-border rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 resize-none"
                />
              </div>
            </div>
          </Card>

          {/* Step 4: Trigger */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-2">Step 4: Trigger</h3>
            <p className="text-muted text-sm mb-4">
              What action activates this route?
            </p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {TRIGGER_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => {
                    setTriggerType(t.value)
                    setTriggerValue('')
                  }}
                  className={`p-3 rounded-xl border text-left transition-colors ${triggerType === t.value ? 'border-accent bg-accent/10' : 'border-card-border hover:border-card-border'}`}
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
                  {triggerType === 'quest_complete'
                    ? 'Quest'
                    : triggerType === 'challenge_complete'
                      ? 'Challenge'
                      : 'NPC'}
                </label>
                <select
                  value={triggerValue}
                  onChange={(e) => setTriggerValue(e.target.value)}
                  className={selectClass}
                  style={selectStyle}
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
              <div>
                <h3 className="text-white font-bold">Conditions (Optional)</h3>
                <p className="text-muted text-sm">
                  Requirements that must be met for this route
                </p>
              </div>
              <button
                onClick={addCondition}
                className="text-accent text-sm hover:underline"
              >
                + Add
              </button>
            </div>

            {conditions.length === 0 ? (
              <p className="text-white/40 text-sm">
                No conditions - route always available when triggered
              </p>
            ) : (
              <div className="space-y-3">
                {conditions.map((condition, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 bg-sidebar rounded-xl px-4 py-3"
                  >
                    <select
                      value={condition.type}
                      onChange={(e) =>
                        updateCondition(index, { type: e.target.value })
                      }
                      className="bg-card border border-card-border rounded-lg px-3 py-2 text-white text-sm"
                    >
                      <option value="hearts_above">HEARTS Above</option>
                      <option value="hearts_below">HEARTS Below</option>
                    </select>
                    <select
                      value={condition.facet || 'H'}
                      onChange={(e) =>
                        updateCondition(index, { facet: e.target.value })
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
                      value={condition.value || 50}
                      onChange={(e) =>
                        updateCondition(index, { value: e.target.value })
                      }
                      className="w-20 bg-card border border-card-border rounded-lg px-3 py-2 text-white text-sm"
                    />
                    <button
                      onClick={() => removeCondition(index)}
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
          {/* Route Type Info */}
          <Card className={`p-4 border-2 ${routeTypeInfo.color}`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{routeTypeInfo.icon}</span>
              <div>
                <p className="text-white font-bold text-sm">
                  {routeTypeInfo.label}
                </p>
                <p className="text-white/70 text-xs">
                  {routeTypeInfo.description}
                </p>
              </div>
            </div>
          </Card>

          {/* Settings */}
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
                  style={selectStyle}
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
                <span className="text-white/70 text-sm">
                  Bidirectional (both ways)
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showInMap}
                  onChange={(e) => setShowInMap(e.target.checked)}
                  className="checkbox checkbox-sm checkbox-accent"
                />
                <span className="text-white/70 text-sm">
                  Show in player map
                </span>
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

          {/* Scene Challenges Quick View */}
          {fromScene && routeType !== 'scene_to_scene' && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-3">Challenges in Scene</h3>
              <p className="text-muted text-xs mb-3">
                {getSceneName(fromScene)}
              </p>
              {fromSceneChallenges.length > 0 ? (
                <div className="space-y-2">
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
        </div>
      </div>
    </>
  )
}
