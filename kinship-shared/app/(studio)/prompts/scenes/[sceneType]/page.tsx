'use client'

import { use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import { Card, EmptyState } from '@/components/UI'
import { usePrompts, useSceneOptions } from '@/hooks/useApi'
import type { PromptStatus } from '@/lib/types'

export default function ScenePromptsPage({
  params,
}: {
  params: Promise<{ sceneType: string }>
}) {
  const { sceneType } = use(params)
  const router = useRouter()
  const {
    data: prompts,
    loading,
    error,
    refetch,
  } = usePrompts({ tier: '2', scene_type: sceneType } as any)
  const { data: scenes } = useSceneOptions()

  const currentScene = scenes?.find((s) => s.scene_type === sceneType)

  // Status badge
  const StatusBadge = ({ status }: { status: PromptStatus }) => {
    const styles: Record<PromptStatus, string> = {
      draft: 'bg-accent/15 text-accent border-accent/20',
      active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
      archived: 'bg-white/[0.1] text-white/70 border-card-border',
    }
    return (
      <span
        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${styles[status]}`}
      >
        {status}
      </span>
    )
  }

  // Loading state
  if (loading) {
    return (
      <>
        <PageHeader
          title="Scene Prompts"
          subtitle="Loading..."
          breadcrumbs={[
            { label: 'Prompts', href: '/prompts' },
            { label: 'Scenes' },
          ]}
        />
        <Card className="p-6 animate-pulse">
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-white/[0.1]/30 rounded" />
            ))}
          </div>
        </Card>
      </>
    )
  }

  // Error state
  if (error) {
    return (
      <>
        <PageHeader
          title="Scene Prompts"
          subtitle="Error"
          breadcrumbs={[
            { label: 'Prompts', href: '/prompts' },
            { label: 'Scenes' },
          ]}
        />
        <Card className="p-8 text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={refetch}
            className="btn bg-accent hover:bg-accent-dark text-white rounded-xl px-4 py-2"
          >
            Retry
          </button>
        </Card>
      </>
    )
  }

  const scenePrompts = prompts || []

  return (
    <>
      <PageHeader
        title={`🗺️ Scene: ${currentScene?.scene_name || sceneType}`}
        subtitle={`${scenePrompts.length} Tier 2 prompt${scenePrompts.length !== 1 ? 's' : ''}`}
        breadcrumbs={[
          { label: 'Prompts', href: '/prompts' },
          { label: 'Scenes' },
          { label: currentScene?.scene_name || sceneType },
        ]}
        action={
          <Link
            href="/prompts/create"
            className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold px-5 py-2.5"
          >
            + New Scene Prompt
          </Link>
        }
      />

      {/* Scene Tabs */}
      {scenes && scenes.length > 0 && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {scenes.map((s) => (
            <Link
              key={s.id}
              href={`/prompts/scenes/${s.scene_type}`}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                s.scene_type === sceneType
                  ? 'bg-accent/20 text-accent border border-accent/40'
                  : 'bg-card text-muted hover:text-white border border-card-border'
              }`}
            >
              {s.scene_name}
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          {scenePrompts.length === 0 ? (
            <EmptyState
              icon="🗺️"
              title={`No prompts for ${currentScene?.scene_name || sceneType}`}
              description="Create Tier 2 prompts to define AI behavior within this scene."
              action={
                <Link
                  href="/prompts/create"
                  className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold px-5 py-2.5"
                >
                  + Create Prompt
                </Link>
              }
            />
          ) : (
            <div className="space-y-4">
              {scenePrompts.map((prompt) => (
                <Card
                  key={prompt.id}
                  hover
                  className="p-6 cursor-pointer"
                  onClick={() => router.push(`/prompts/${prompt.id}`)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {prompt.is_guardian && <span title="Guardian">🛡️</span>}
                      <h3 className="text-white font-bold">{prompt.name}</h3>
                    </div>
                    <StatusBadge status={prompt.status} />
                  </div>
                  <p className="text-white/70 text-sm line-clamp-2 mb-3">
                    {prompt.content.substring(0, 200)}...
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted">
                    <span>Priority: {prompt.priority}</span>
                    <span>•</span>
                    <span>v{prompt.version}</span>
                    <span>•</span>
                    <span>
                      Updated {new Date(prompt.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">Scene Info</h3>
            <div className="space-y-3">
              <div>
                <p className="text-muted text-xs uppercase tracking-wider mb-1">
                  Scene Type
                </p>
                <p className="text-white text-sm">{sceneType}</p>
              </div>
              <div>
                <p className="text-muted text-xs uppercase tracking-wider mb-1">
                  Tier
                </p>
                <p className="text-blue-400 text-sm font-medium">
                  Tier 2 — Scene
                </p>
              </div>
              <div>
                <p className="text-muted text-xs uppercase tracking-wider mb-1">
                  Scope
                </p>
                <p className="text-white/70 text-sm">
                  Active when player is in this scene
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-blue-500/5 border-blue-500/20">
            <p className="text-blue-400 text-sm font-medium mb-1">
              🗺️ Scene Prompts
            </p>
            <p className="text-muted text-xs leading-relaxed">
              Tier 2 prompts define scene-specific AI behavior, environment
              descriptions, NPC interactions, and available challenges within
              this scene.
            </p>
          </Card>
        </div>
      </div>
    </>
  )
}
