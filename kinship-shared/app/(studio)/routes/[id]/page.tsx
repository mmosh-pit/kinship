'use client'

import { use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import { Card, StatusBadge, SceneIcon } from '@/components/UI'
import {
  useRoute,
  useScenes,
  useQuests,
  useChallenges,
  useNPCs,
  deleteRoute,
} from '@/hooks/useApi'

const TRIGGER_LABELS: Record<string, string> = {
  quest_complete: 'Quest Complete',
  challenge_complete: 'Challenge Complete',
  npc_dialogue: 'NPC Dialogue',
  exit_zone: 'Exit Zone',
  hearts_threshold: 'HEARTS Threshold',
  manual: 'Player Choice',
}

const TRIGGER_ICONS: Record<string, string> = {
  quest_complete: '⚔️',
  challenge_complete: '⚡',
  npc_dialogue: '💬',
  exit_zone: '🚪',
  hearts_threshold: '💚',
  manual: '🎮',
}

const ROUTE_TYPE_INFO: Record<
  string,
  { label: string; icon: string; description: string; color: string }
> = {
  scene_to_scene: {
    label: 'Scene to Scene',
    icon: '🏞️',
    description: 'Navigate between different scenes',
    color: 'bg-accent/10 border-accent/30 text-accent',
  },
  challenge_within_scene: {
    label: 'Challenge to Challenge',
    icon: '⚡',
    description: 'Chain challenges within the same scene',
    color: 'bg-accent/15 border-amber-500/30 text-accent',
  },
  challenge_between_scenes: {
    label: 'Challenge to Scene',
    icon: '🔀',
    description: 'Complete challenge to unlock another scene or challenge',
    color: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
  },
}

export default function RouteDetailPage({
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

  const getSceneName = (sceneId: string | null) => {
    if (!sceneId) return 'Unknown'
    if (sceneId === '*') return 'Any Scene'
    const scene = scenes?.find((s) => s.id === sceneId)
    return scene?.scene_name || scene?.name || 'Unknown'
  }

  const getSceneType = (sceneId: string | null) => {
    if (!sceneId || sceneId === '*') return 'Any'
    const scene = scenes?.find((s) => s.id === sceneId)
    return scene?.scene_type || 'Unknown'
  }

  const getChallengeName = (challengeId: string | null) => {
    if (!challengeId) return null
    const challenge = challenges?.find((c) => c.id === challengeId)
    return challenge?.name || null
  }

  const getQuestName = (questId: string | null) => {
    if (!questId) return null
    const quest = quests?.find((q) => q.id === questId)
    return quest?.name || null
  }

  const getNpcName = (npcId: string | null) => {
    if (!npcId) return null
    const npc = npcs?.find((n) => n.id === npcId)
    return npc?.name || null
  }

  // Determine route type
  const getRouteType = () => {
    if (!route) return 'scene_to_scene'
    if (route.from_challenge && route.to_challenge) {
      if (route.from_scene === route.to_scene) {
        return 'challenge_within_scene'
      }
      return 'challenge_between_scenes'
    }
    if (route.from_challenge || route.to_challenge) {
      return 'challenge_between_scenes'
    }
    return 'scene_to_scene'
  }

  // Resolve trigger value to a name
  const getTriggerValueDisplay = () => {
    if (!route?.trigger_value) return null

    switch (route.trigger_type) {
      case 'quest_complete':
        return getQuestName(route.trigger_value) || route.trigger_value
      case 'challenge_complete':
        return getChallengeName(route.trigger_value) || route.trigger_value
      case 'npc_dialogue':
        return getNpcName(route.trigger_value) || route.trigger_value
      case 'hearts_threshold':
        return route.trigger_value
      default:
        return route.trigger_value
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

  if (loading) {
    return (
      <>
        <PageHeader
          title="Loading..."
          breadcrumbs={[{ label: 'Routes', href: '/routes' }]}
        />
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2">
            <Card className="p-6 animate-pulse bg-input h-48">
              <></>
            </Card>
          </div>
          <Card className="p-6 animate-pulse bg-input h-48">
            <></>
          </Card>
        </div>
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
          <p className="text-red-400 mb-4">{error || 'Route not found'}</p>
          <Link
            href="/routes"
            className="btn bg-accent text-white rounded-xl px-4 py-2"
          >
            Back to Routes
          </Link>
        </Card>
      </>
    )
  }

  const routeType = getRouteType()
  const routeTypeInfo = ROUTE_TYPE_INFO[routeType]
  const fromChallengeName = getChallengeName(route.from_challenge)
  const toChallengeName = getChallengeName(route.to_challenge)

  return (
    <>
      <PageHeader
        title={route.name}
        breadcrumbs={[
          { label: 'Routes', href: '/routes' },
          { label: route.name },
        ]}
        action={
          <div className="flex gap-2">
            <Link
              href={`/routes/${id}/edit`}
              className="btn bg-white/[0.1] border-white/[0.15] text-white hover:bg-white/[0.1] rounded-xl"
            >
              ✏️ Edit
            </Link>
            <button
              onClick={handleDelete}
              className="btn bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20 rounded-xl"
            >
              🗑️ Delete
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          {/* Route Type Badge */}
          <Card className={`p-4 border ${routeTypeInfo.color}`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{routeTypeInfo.icon}</span>
              <div>
                <p className="text-white font-bold">{routeTypeInfo.label}</p>
                <p className="text-white/70 text-sm">
                  {routeTypeInfo.description}
                </p>
              </div>
            </div>
          </Card>

          {/* Visual connection */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">Route Flow</h3>
            <div className="flex items-center justify-center gap-8 py-6">
              {/* From */}
              <div className="flex flex-col items-center">
                <div className="w-28 h-28 rounded-2xl bg-sidebar border-2 border-card-border/60 flex flex-col items-center justify-center p-2">
                  {fromChallengeName ? (
                    <>
                      <span className="text-4xl">⚡</span>
                      <span className="text-white text-xs font-medium mt-1 text-center truncate max-w-[100px]">
                        {fromChallengeName}
                      </span>
                    </>
                  ) : (
                    <>
                      <SceneIcon
                        type={getSceneType(route.from_scene)}
                        size="md"
                      />
                      <span className="text-white text-xs font-medium mt-2 text-center truncate max-w-[100px]">
                        {getSceneName(route.from_scene)}
                      </span>
                    </>
                  )}
                </div>
                <span className="text-white/40 text-[10px] mt-2">Source</span>
                {fromChallengeName && (
                  <span className="text-muted text-[9px]">
                    in {getSceneName(route.from_scene)}
                  </span>
                )}
              </div>

              {/* Arrow with trigger */}
              <div className="flex flex-col items-center gap-2">
                <div className="w-32 h-px bg-gradient-to-r from-white/20 via-[#eb8000] to-white/20" />
                <div className="bg-accent/20 border border-accent/30 rounded-full px-4 py-2 flex items-center gap-2">
                  <span>{TRIGGER_ICONS[route.trigger_type || ''] || '🔀'}</span>
                  <span className="text-accent text-sm">
                    {TRIGGER_LABELS[route.trigger_type || ''] || 'Manual'}
                  </span>
                </div>
                {route.conditions && route.conditions.length > 0 && (
                  <div className="flex gap-1 flex-wrap justify-center max-w-[150px]">
                    {route.conditions.map((c, i) => (
                      <span
                        key={i}
                        className="text-[9px] bg-amber-400/10 text-accent px-2 py-0.5 rounded-full"
                      >
                        {c.type}: {c.facet || ''} {c.value || ''}
                      </span>
                    ))}
                  </div>
                )}
                <div className="w-32 h-px bg-gradient-to-r from-white/20 via-[#eb8000] to-white/20" />
              </div>

              {/* To */}
              <div className="flex flex-col items-center">
                <div className="w-28 h-28 rounded-2xl bg-sidebar border-2 border-accent/40 flex flex-col items-center justify-center p-2">
                  {toChallengeName ? (
                    <>
                      <span className="text-4xl">⚡</span>
                      <span className="text-white text-xs font-medium mt-1 text-center truncate max-w-[100px]">
                        {toChallengeName}
                      </span>
                    </>
                  ) : (
                    <>
                      <SceneIcon
                        type={getSceneType(route.to_scene)}
                        size="md"
                      />
                      <span className="text-white text-xs font-medium mt-2 text-center truncate max-w-[100px]">
                        {getSceneName(route.to_scene)}
                      </span>
                    </>
                  )}
                </div>
                <span className="text-white/40 text-[10px] mt-2">
                  Destination
                </span>
                {toChallengeName && (
                  <span className="text-muted text-[9px]">
                    in {getSceneName(route.to_scene)}
                  </span>
                )}
              </div>
            </div>
          </Card>

          {/* Description */}
          {route.description && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-3">Description</h3>
              <p className="text-white/70 text-sm leading-relaxed">
                {route.description}
              </p>
            </Card>
          )}

          {/* Trigger details */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">Trigger Configuration</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-sidebar rounded-xl px-4 py-3">
                <span className="text-muted text-sm">Trigger Type</span>
                <div className="flex items-center gap-2">
                  <span>{TRIGGER_ICONS[route.trigger_type || ''] || '🔀'}</span>
                  <span className="text-white text-sm">
                    {TRIGGER_LABELS[route.trigger_type || ''] || 'None'}
                  </span>
                </div>
              </div>
              {route.trigger_value && (
                <div className="flex items-center justify-between bg-sidebar rounded-xl px-4 py-3">
                  <span className="text-muted text-sm">
                    {route.trigger_type === 'quest_complete'
                      ? 'Quest'
                      : route.trigger_type === 'challenge_complete'
                        ? 'Challenge'
                        : route.trigger_type === 'npc_dialogue'
                          ? 'NPC'
                          : 'Value'}
                  </span>
                  <span className="text-accent text-sm font-medium">
                    {getTriggerValueDisplay()}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {/* Conditions */}
          {route.conditions && route.conditions.length > 0 && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4">
                Conditions ({route.conditions.length})
              </h3>
              <div className="space-y-2">
                {route.conditions.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-sidebar rounded-xl px-4 py-3"
                  >
                    <span className="text-white/70 text-sm">{c.type}</span>
                    <div className="flex items-center gap-2">
                      {c.facet && (
                        <span className="text-accent text-sm font-medium">
                          {c.facet}
                        </span>
                      )}
                      {c.value && (
                        <span className="text-white text-sm">{c.value}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Route Type Card */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">Route Type</h3>
            <div className={`p-4 rounded-xl border ${routeTypeInfo.color}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{routeTypeInfo.icon}</span>
                <span className="font-medium">{routeTypeInfo.label}</span>
              </div>
              <p className="text-white/70 text-xs">
                {routeTypeInfo.description}
              </p>
            </div>
          </Card>

          {/* Details */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">Route Details</h3>
            <div className="space-y-4">
              <div>
                <p className="text-muted text-xs uppercase tracking-wider mb-1">
                  Status
                </p>
                <StatusBadge status={route.status} />
              </div>
              <div>
                <p className="text-muted text-xs uppercase tracking-wider mb-1">
                  From Scene
                </p>
                <p className="text-white text-sm">
                  {getSceneName(route.from_scene)}
                </p>
              </div>
              {fromChallengeName && (
                <div>
                  <p className="text-muted text-xs uppercase tracking-wider mb-1">
                    From Challenge
                  </p>
                  <p className="text-accent text-sm">
                    ⚡ {fromChallengeName}
                  </p>
                </div>
              )}
              <div>
                <p className="text-muted text-xs uppercase tracking-wider mb-1">
                  To Scene
                </p>
                <p className="text-white text-sm">
                  {getSceneName(route.to_scene)}
                </p>
              </div>
              {toChallengeName && (
                <div>
                  <p className="text-muted text-xs uppercase tracking-wider mb-1">
                    To Challenge
                  </p>
                  <p className="text-accent text-sm">⚡ {toChallengeName}</p>
                </div>
              )}
            </div>
          </Card>

          {/* Settings */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">Settings</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-muted text-sm">Bidirectional</span>
                <span className="text-white text-sm">
                  {route.bidirectional ? '↔️ Yes' : '→ No'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted text-sm">Show in Map</span>
                <span className="text-white text-sm">
                  {route.show_in_map ? '✓ Yes' : '✗ No'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted text-sm">
                  Hidden Until Triggered
                </span>
                <span className="text-white text-sm">
                  {route.hidden_until_triggered ? '✓ Yes' : '✗ No'}
                </span>
              </div>
            </div>
          </Card>

          {/* Timestamps */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-3">Timestamps</h3>
            <div className="space-y-2 text-sm">
              {route.created_at && (
                <div className="flex justify-between">
                  <span className="text-muted">Created</span>
                  <span className="text-white/70">
                    {new Date(route.created_at).toLocaleDateString()}
                  </span>
                </div>
              )}
              {route.updated_at && (
                <div className="flex justify-between">
                  <span className="text-muted">Updated</span>
                  <span className="text-white/70">
                    {new Date(route.updated_at).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
