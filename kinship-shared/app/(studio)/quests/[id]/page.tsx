'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import { Card, StatusBadge, FacetBadge } from '@/components/UI'
import { useQuest, deleteQuest } from '@/hooks/useApi'
import { HEARTS_FACETS } from '@/lib/data'

export default function QuestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { data: quest, loading, error } = useQuest(id)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteQuest(id)
      router.push('/quests')
    } catch (err) {
      console.error('Failed to delete quest:', err)
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const facetInfo = quest
    ? HEARTS_FACETS.find((f) => f.key === quest.facet)
    : null

  if (loading) {
    return (
      <>
        <PageHeader
          title="Loading..."
          breadcrumbs={[{ label: 'Quests', href: '/quests' }, { label: '...' }]}
        />
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-6">
            <Card className="p-6 animate-pulse">
              <div className="h-6 bg-input rounded w-1/3 mb-4" />
              <div className="space-y-3">
                <div className="h-4 bg-white/[0.1]/30 rounded w-full" />
                <div className="h-4 bg-white/[0.1]/30 rounded w-4/5" />
              </div>
            </Card>
          </div>
          <Card className="p-6 animate-pulse">
            <div className="h-5 bg-input rounded w-1/2 mb-4" />
            <div className="space-y-4">
              <div className="h-10 bg-white/[0.1]/30 rounded" />
            </div>
          </Card>
        </div>
      </>
    )
  }

  if (error || !quest) {
    return (
      <>
        <PageHeader
          title="Quest Not Found"
          breadcrumbs={[
            { label: 'Quests', href: '/quests' },
            { label: 'Error' },
          ]}
        />
        <Card className="p-8 text-center">
          <div className="text-red-400 mb-4">
            <p className="font-medium">Quest not found</p>
            <p className="text-sm text-muted mt-1">
              {error || 'The quest does not exist.'}
            </p>
          </div>
          <Link
            href="/quests"
            className="btn bg-white/[0.1] hover:bg-white/[0.1] text-white rounded-xl px-5 py-2"
          >
            Back to Quests
          </Link>
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={quest.name}
        subtitle={`${quest.beat_type} Beat`}
        breadcrumbs={[
          { label: 'Quests', href: '/quests' },
          { label: quest.name },
        ]}
        action={
          <Link
            href={`/quests/${id}/edit`}
            className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold px-5 py-2.5"
          >
            ✏️ Edit Quest
          </Link>
        }
      />

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">📝 Description</h3>
            <p className="text-white/70 leading-relaxed">
              {quest.description || (
                <span className="text-muted italic">No description</span>
              )}
            </p>
          </Card>
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">📖 Narrative Content</h3>
            {quest.narrative_content ? (
              <div className="text-white/70 whitespace-pre-wrap bg-sidebar/40 rounded-xl p-4 border border-card-border">
                {quest.narrative_content}
              </div>
            ) : (
              <p className="text-muted italic">No narrative content</p>
            )}
          </Card>
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">🕐 Timeline</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-muted text-sm mb-1">Created</p>
                <p className="text-white text-sm">
                  {new Date(quest.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
              <div>
                <p className="text-muted text-sm mb-1">Last Updated</p>
                <p className="text-white text-sm">
                  {new Date(quest.updated_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">Configuration</h3>
            <div className="space-y-4">
              <div>
                <p className="text-muted text-sm mb-2">Status</p>
                <StatusBadge status={quest.status} />
              </div>
              <div>
                <p className="text-muted text-sm mb-2">Target Facet</p>
                <div className="flex items-center gap-3">
                  <FacetBadge facet={quest.facet} size="lg" />
                  <div>
                    <p className="text-white font-medium">{facetInfo?.name}</p>
                    <p className="text-muted text-xs">
                      {facetInfo?.description}
                    </p>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-muted text-sm mb-2">Beat Type</p>
                <span className="inline-block bg-sidebar text-white px-3 py-1.5 rounded-lg text-sm">
                  {quest.beat_type}
                </span>
              </div>
              <div>
                <p className="text-muted text-sm mb-2">Sequence Order</p>
                <span className="inline-flex items-center justify-center w-10 h-10 bg-sidebar rounded-xl text-white font-bold">
                  {quest.sequence_order}
                </span>
              </div>
            </div>
          </Card>
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">Scene</h3>
            {quest.scene_id ? (
              <div className="bg-sidebar rounded-xl p-4 border border-card-border">
                <p className="text-white text-sm font-medium">Scene ID</p>
                <p className="text-white/70 text-xs font-mono mt-1 break-all">
                  {quest.scene_id}
                </p>
              </div>
            ) : (
              <p className="text-muted text-sm italic">No scene assigned</p>
            )}
          </Card>
          <Card className="p-6 border-red-500/20">
            <h3 className="text-red-400 font-bold mb-4">Danger Zone</h3>
            {showDeleteConfirm ? (
              <div className="space-y-3">
                <p className="text-white/70 text-sm">Delete this quest?</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 btn bg-red-500 hover:bg-red-400 text-white rounded-xl py-2 text-sm disabled:opacity-50"
                  >
                    {deleting ? 'Deleting...' : 'Yes, Delete'}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={deleting}
                    className="flex-1 btn bg-white/[0.1] hover:bg-white/[0.1] text-white rounded-xl py-2 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full btn bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 rounded-xl py-2.5"
              >
                🗑️ Delete Quest
              </button>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
