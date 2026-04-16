'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import { Card, StatusBadge, FacetBadge } from '@/components/UI'
import { useNPC, deleteNPC } from '@/hooks/useApi'
import { HEARTS_FACETS } from '@/lib/data'

export default function NPCDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { data: npc, loading, error } = useNPC(id)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteNPC(id)
      router.push('/npcs')
    } catch (err) {
      console.error('Failed to delete NPC:', err)
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const facetInfo = npc ? HEARTS_FACETS.find((f) => f.key === npc.facet) : null

  // Loading state
  if (loading) {
    return (
      <>
        <PageHeader
          title="Loading..."
          breadcrumbs={[{ label: 'NPCs', href: '/npcs' }, { label: '...' }]}
        />
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-6">
            <Card className="p-6 animate-pulse">
              <div className="flex items-start gap-4">
                <div className="w-20 h-20 rounded-2xl bg-input" />
                <div className="flex-1 space-y-3">
                  <div className="h-6 bg-input rounded w-1/3" />
                  <div className="h-4 bg-white/[0.1]/30 rounded w-1/4" />
                </div>
              </div>
            </Card>
            <Card className="p-6 animate-pulse">
              <div className="h-5 bg-input rounded w-1/4 mb-4" />
              <div className="space-y-2">
                <div className="h-4 bg-white/[0.1]/30 rounded w-full" />
                <div className="h-4 bg-white/[0.1]/30 rounded w-4/5" />
              </div>
            </Card>
          </div>
          <Card className="p-6 animate-pulse">
            <div className="h-5 bg-input rounded w-1/2 mb-4" />
            <div className="space-y-4">
              <div className="h-10 bg-white/[0.1]/30 rounded" />
              <div className="h-10 bg-white/[0.1]/30 rounded" />
            </div>
          </Card>
        </div>
      </>
    )
  }

  // Error state
  if (error || !npc) {
    return (
      <>
        <PageHeader
          title="NPC Not Found"
          breadcrumbs={[{ label: 'NPCs', href: '/npcs' }, { label: 'Error' }]}
        />
        <Card className="p-8 text-center">
          <div className="text-red-400 mb-4">
            <svg
              className="w-12 h-12 mx-auto mb-3 opacity-60"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p className="font-medium">NPC not found</p>
            <p className="text-sm text-muted mt-1">
              {error || 'The NPC does not exist.'}
            </p>
          </div>
          <Link
            href="/npcs"
            className="btn bg-white/[0.1] hover:bg-white/[0.1] text-white rounded-xl px-5 py-2"
          >
            Back to NPCs
          </Link>
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={npc.name}
        subtitle={npc.role || 'Character'}
        breadcrumbs={[{ label: 'NPCs', href: '/npcs' }, { label: npc.name }]}
        action={
          <Link
            href={`/npcs/${id}/edit`}
            className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold px-5 py-2.5 transition-all hover:scale-105"
          >
            ✏️ Edit NPC
          </Link>
        }
      />

      <div className="grid grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="col-span-2 space-y-6">
          {/* Character Card */}
          <Card className="p-6">
            <div className="flex items-start gap-6">
              <div className="w-24 h-24 rounded-2xl bg-sidebar/80 flex items-center justify-center text-5xl shrink-0">
                🧑
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl text-white font-bold">{npc.name}</h2>
                  <FacetBadge facet={npc.facet} size="md" />
                  <StatusBadge status={npc.status} />
                </div>
                <p className="text-accent text-lg mb-4">
                  {npc.role || 'No role defined'}
                </p>
              </div>
            </div>
          </Card>

          {/* Personality */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              <span className="text-xl">✨</span> Personality
            </h3>
            {npc.personality ? (
              <p className="text-white/70 leading-relaxed">{npc.personality}</p>
            ) : (
              <p className="text-muted italic">No personality defined</p>
            )}
          </Card>

          {/* Background */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              <span className="text-xl">📖</span> Background
            </h3>
            {npc.background ? (
              <p className="text-white/70 leading-relaxed whitespace-pre-wrap">
                {npc.background}
              </p>
            ) : (
              <p className="text-muted italic">
                No background story defined
              </p>
            )}
          </Card>

          {/* Dialogue Style */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              <span className="text-xl">🎭</span> Dialogue Style
            </h3>
            {npc.dialogue_style ? (
              <p className="text-white/70 leading-relaxed bg-sidebar/40 rounded-xl p-4 border border-card-border">
                {npc.dialogue_style}
              </p>
            ) : (
              <p className="text-muted italic">No dialogue style defined</p>
            )}
          </Card>

          {/* Catchphrases */}
          {npc.catchphrases && npc.catchphrases.length > 0 && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <span className="text-xl">💬</span> Catchphrases
              </h3>
              <div className="space-y-3">
                {npc.catchphrases.map((phrase, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-accent text-xl">"</span>
                    <p className="text-white/70 italic text-lg">{phrase}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Timestamps */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              <span className="text-xl">🕐</span> Timeline
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-muted text-sm mb-1">Created</p>
                <p className="text-white text-sm">
                  {new Date(npc.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
              <div>
                <p className="text-muted text-sm mb-1">Last Updated</p>
                <p className="text-white text-sm">
                  {new Date(npc.updated_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Configuration */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">Configuration</h3>
            <div className="space-y-4">
              <div>
                <p className="text-muted text-sm mb-2">Status</p>
                <StatusBadge status={npc.status} />
              </div>

              <div>
                <p className="text-muted text-sm mb-2">HEARTS Facet</p>
                <div className="flex items-center gap-3">
                  <FacetBadge facet={npc.facet} size="lg" />
                  <div>
                    <p className="text-white font-medium">{facetInfo?.name}</p>
                    <p className="text-muted text-xs">
                      {facetInfo?.description}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Scene Reference */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">Scene</h3>
            {npc.scene_id ? (
              <div className="bg-sidebar rounded-xl p-4 border border-card-border">
                <p className="text-white text-sm font-medium">Scene ID</p>
                <p className="text-white/70 text-xs font-mono mt-1 break-all">
                  {npc.scene_id}
                </p>
              </div>
            ) : (
              <p className="text-muted text-sm italic">No scene assigned</p>
            )}
          </Card>

          {/* Sprite Reference */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">Sprite</h3>
            {npc.sprite_asset_id ? (
              <div className="bg-sidebar rounded-xl p-4 border border-card-border">
                <p className="text-white text-sm font-medium">Asset ID</p>
                <p className="text-white/70 text-xs font-mono mt-1 break-all">
                  {npc.sprite_asset_id}
                </p>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="w-16 h-16 mx-auto rounded-xl bg-sidebar flex items-center justify-center text-3xl mb-2 opacity-40">
                  🖼️
                </div>
                <p className="text-muted text-sm">No sprite assigned</p>
              </div>
            )}
          </Card>

          {/* Danger Zone */}
          <Card className="p-6 border-red-500/20">
            <h3 className="text-red-400 font-bold mb-4">Danger Zone</h3>
            {showDeleteConfirm ? (
              <div className="space-y-3">
                <p className="text-white/70 text-sm">
                  Are you sure you want to delete this NPC?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 btn bg-red-500 hover:bg-red-400 text-white rounded-xl py-2 text-sm font-medium disabled:opacity-50"
                  >
                    {deleting ? 'Deleting...' : 'Yes, Delete'}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={deleting}
                    className="flex-1 btn bg-white/[0.1] hover:bg-white/[0.1] text-white rounded-xl py-2 text-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full btn bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 rounded-xl py-2.5 font-medium transition-all"
              >
                🗑️ Delete NPC
              </button>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
