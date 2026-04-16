'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { Card, FacetBadge } from '@/components/UI'
import { useKnowledge, updateKnowledge, deleteKnowledge } from '@/hooks/useApi'
import { HEARTS_FACETS } from '@/lib/data'
import type {
  KnowledgeCategory,
  KnowledgeType,
  IngestStatus,
  HeartsFacet,
  KnowledgeUpdate,
} from '@/lib/types'

const CATEGORIES: { value: KnowledgeCategory; label: string }[] = [
  { value: 'HEARTS', label: 'HEARTS Framework' },
  { value: 'Scene', label: 'Scene Rules' },
  { value: 'NPC', label: 'NPC Personas' },
  { value: 'Challenge', label: 'Challenge Guidelines' },
  { value: 'General', label: 'General Knowledge' },
]

const DOC_TYPES: { value: KnowledgeType; label: string }[] = [
  { value: 'facet_definition', label: 'Facet Definition' },
  { value: 'scene_rules', label: 'Scene Rules' },
  { value: 'persona', label: 'Persona Document' },
  { value: 'pattern', label: 'Pattern Description' },
  { value: 'guideline', label: 'Guideline' },
  { value: 'reference', label: 'Reference Material' },
]

export default function KnowledgeEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { data: doc, loading: docLoading, error: docError } = useKnowledge(id)

  // Form state
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState<KnowledgeCategory>('General')
  const [docType, setDocType] = useState<KnowledgeType>('reference')
  const [facets, setFacets] = useState<HeartsFacet[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [status, setStatus] = useState<IngestStatus>('draft')

  // UI state
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Initialize form when doc loads
  useEffect(() => {
    if (doc) {
      setTitle(doc.title)
      setContent(doc.content)
      setCategory(doc.category)
      setDocType(doc.doc_type)
      setFacets(doc.facets || [])
      setTags(doc.tags || [])
      setSourceUrl(doc.source_url || '')
      setStatus(doc.ingest_status)
    }
  }, [doc])

  // Track changes
  useEffect(() => {
    if (doc) {
      const changed =
        title !== doc.title ||
        content !== doc.content ||
        category !== doc.category ||
        docType !== doc.doc_type ||
        JSON.stringify(facets) !== JSON.stringify(doc.facets || []) ||
        JSON.stringify(tags) !== JSON.stringify(doc.tags || []) ||
        sourceUrl !== (doc.source_url || '') ||
        status !== doc.ingest_status
      setHasChanges(changed)
    }
  }, [doc, title, content, category, docType, facets, tags, sourceUrl, status])

  const toggleFacet = (facet: HeartsFacet) => {
    setFacets((prev) =>
      prev.includes(facet) ? prev.filter((f) => f !== facet) : [...prev, facet]
    )
  }

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase()
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag])
      setTagInput('')
    }
  }

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!title.trim()) {
      setError('Document title is required')
      return
    }

    if (!content.trim()) {
      setError('Document content is required')
      return
    }

    setSaving(true)
    try {
      const payload: KnowledgeUpdate = {
        title: title.trim(),
        content: content.trim(),
        category,
        doc_type: docType,
        facets,
        tags,
        source_url: sourceUrl.trim() || null,
        ingest_status: status,
      }

      await updateKnowledge(id, payload)
      setSuccess(true)
      setHasChanges(false)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error('Failed to update document:', err)
      setError(err instanceof Error ? err.message : 'Failed to update document')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteKnowledge(id)
      router.push('/knowledge')
    } catch (err) {
      console.error('Failed to delete document:', err)
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  // Loading state
  if (docLoading) {
    return (
      <>
        <PageHeader
          title="Loading..."
          breadcrumbs={[
            { label: 'Knowledge', href: '/knowledge' },
            { label: '...' },
          ]}
        />
        <Card className="p-6 animate-pulse">
          <div className="space-y-4">
            <div className="h-10 bg-input rounded w-full" />
            <div className="h-40 bg-white/[0.1]/30 rounded w-full" />
          </div>
        </Card>
      </>
    )
  }

  // Error state
  if (docError || !doc) {
    return (
      <>
        <PageHeader
          title="Document Not Found"
          breadcrumbs={[
            { label: 'Knowledge', href: '/knowledge' },
            { label: 'Error' },
          ]}
        />
        <Card className="p-8 text-center">
          <p className="text-red-400 mb-4">
            {docError || 'Document not found'}
          </p>
          <Link
            href="/knowledge"
            className="btn bg-accent hover:bg-accent-dark text-white rounded-xl px-4 py-2"
          >
            Back to Knowledge
          </Link>
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={`Edit: ${doc.title}`}
        subtitle={hasChanges ? '• Unsaved changes' : undefined}
        breadcrumbs={[
          { label: 'Knowledge', href: '/knowledge' },
          { label: doc.title, href: `/knowledge/${id}` },
          { label: 'Edit' },
        ]}
        action={
          <div className="flex gap-3">
            <Link
              href={`/knowledge/${id}`}
              className="btn bg-white/[0.1] hover:bg-white/[0.1] text-white border-0 rounded-xl px-5 py-2.5"
            >
              Cancel
            </Link>
            <button
              onClick={handleSubmit}
              disabled={
                saving || !hasChanges || !title.trim() || !content.trim()
              }
              className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold px-5 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : '💾 Save Changes'}
            </button>
          </div>
        }
      />

      {/* Success Banner */}
      {success && (
        <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3">
          <svg
            className="w-5 h-5 text-emerald-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          <p className="text-emerald-400 text-sm">
            Document updated successfully!
          </p>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
          <svg
            className="w-5 h-5 text-red-400 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-300"
          >
            ×
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="col-span-2 space-y-6">
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <span className="text-xl">📄</span> Document Details
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Title <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50"
                  />
                </div>

                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Content <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={12}
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50 resize-none font-mono"
                  />
                </div>

                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Source URL
                  </label>
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50"
                  />
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <span className="text-xl">💚</span> Related Facets
              </h3>
              <div className="grid grid-cols-4 gap-3">
                {HEARTS_FACETS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => toggleFacet(f.key as HeartsFacet)}
                    className={`p-3 rounded-xl border transition-all ${
                      facets.includes(f.key as HeartsFacet)
                        ? 'border-white/30 bg-card'
                        : 'border-card-border bg-sidebar/40 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-xs mx-auto mb-1"
                      style={{ backgroundColor: f.color }}
                    >
                      {f.key}
                    </div>
                    <p className="text-white text-xs text-center">{f.name}</p>
                  </button>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <span className="text-xl">🏷️</span> Tags
              </h3>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === 'Enter' && (e.preventDefault(), addTag())
                  }
                  placeholder="Add a tag..."
                  className="flex-1 bg-input border border-card-border rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-accent/50"
                />
                <button
                  type="button"
                  onClick={addTag}
                  className="px-4 py-2 bg-card hover:bg-white/[0.1] text-white rounded-xl text-sm"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-card text-white/70 rounded-lg text-sm"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="text-muted hover:text-red-400"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4">Classification</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) =>
                      setCategory(e.target.value as KnowledgeCategory)
                    }
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Document Type
                  </label>
                  <select
                    value={docType}
                    onChange={(e) =>
                      setDocType(e.target.value as KnowledgeType)
                    }
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50"
                  >
                    {DOC_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Status
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        'draft',
                        'pending',
                        'ingested',
                        'failed',
                      ] as IngestStatus[]
                    ).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatus(s)}
                        className={`px-3 py-2 rounded-xl text-xs font-medium transition-all capitalize ${
                          status === s
                            ? s === 'ingested'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : s === 'failed'
                                ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                                : s === 'pending'
                                  ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                  : 'bg-accent/15 text-accent border border-amber-500/30'
                            : 'bg-sidebar text-white/70 border border-card-border'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* Danger Zone */}
            <Card className="p-6 border-red-500/20">
              <h3 className="text-red-400 font-bold mb-4">Danger Zone</h3>
              {showDeleteConfirm ? (
                <div className="space-y-3">
                  <p className="text-white/70 text-sm">
                    Are you sure? This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex-1 px-3 py-2 bg-red-500 hover:bg-red-400 text-white rounded-xl text-sm font-medium disabled:opacity-50"
                    >
                      {deleting ? 'Deleting...' : 'Yes, Delete'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 px-3 py-2 bg-white/[0.1] hover:bg-white/[0.1] text-white rounded-xl text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full px-4 py-2 border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-xl text-sm"
                >
                  🗑️ Delete Document
                </button>
              )}
            </Card>
          </div>
        </div>
      </form>
    </>
  )
}
