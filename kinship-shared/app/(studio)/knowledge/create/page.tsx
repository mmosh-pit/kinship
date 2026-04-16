'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { Card, FacetBadge } from '@/components/UI'
import { createKnowledge } from '@/hooks/useApi'
import { useStudio } from '@/lib/studio-context'
import { HEARTS_FACETS } from '@/lib/data'
import type {
  KnowledgeCategory,
  KnowledgeType,
  IngestStatus,
  HeartsFacet,
  KnowledgeCreate,
} from '@/lib/types'

const CATEGORIES: { value: KnowledgeCategory; label: string }[] = [
  { value: 'HEARTS', label: 'HEARTS Framework' },
  { value: 'Scene', label: 'Scene Rules' },
  { value: 'NPC', label: 'NPC Personas' },
  { value: 'Sages', label: 'Sages Knowledge' },
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

export default function KnowledgeCreatePage() {
  const router = useRouter()
  const { currentPlatform } = useStudio()

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
  const [error, setError] = useState<string | null>(null)

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
      const payload: KnowledgeCreate = {
        title: title.trim(),
        content: content.trim(),
        category,
        doc_type: docType,
        facets,
        tags,
        source_url: sourceUrl.trim() || null,
        ingest_status: status,
        platform_id: currentPlatform?.id || null,
      }

      const doc = await createKnowledge(payload)
      router.push(`/knowledge/${doc.id}`)
    } catch (err) {
      console.error('Failed to create document:', err)
      setError(err instanceof Error ? err.message : 'Failed to create document')
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="New Document"
        subtitle="Add knowledge for AI context"
        breadcrumbs={[
          { label: 'Knowledge', href: '/knowledge' },
          { label: 'Create' },
        ]}
        action={
          <div className="flex gap-3">
            <Link
              href="/knowledge"
              className="btn bg-white/[0.1] hover:bg-white/[0.1] text-white border-0 rounded-xl px-5 py-2.5"
            >
              Cancel
            </Link>
            <button
              onClick={handleSubmit}
              disabled={saving || !title.trim() || !content.trim()}
              className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold px-5 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Saving...
                </span>
              ) : (
                '💾 Save Document'
              )}
            </button>
          </div>
        }
      />

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
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
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
                    placeholder="Document title..."
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 transition-colors"
                    autoFocus
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
                    placeholder="Document content... (Markdown supported)"
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 resize-none transition-colors font-mono"
                  />
                </div>

                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Source URL (optional)
                  </label>
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 transition-colors"
                  />
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <span className="text-xl">💚</span> Related Facets
              </h3>
              <p className="text-muted text-sm mb-4">
                Select which HEARTS facets this document relates to
              </p>
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
                  className="flex-1 bg-input border border-card-border rounded-xl px-4 py-2 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 transition-colors"
                />
                <button
                  type="button"
                  onClick={addTag}
                  className="px-4 py-2 bg-card hover:bg-white/[0.1] text-white rounded-xl text-sm transition-colors"
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
                {tags.length === 0 && (
                  <p className="text-white/40 text-sm">No tags added</p>
                )}
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
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50 transition-colors"
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
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50 transition-colors"
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
                  <div className="flex gap-2">
                    {(['draft', 'pending'] as IngestStatus[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatus(s)}
                        className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all capitalize ${
                          status === s
                            ? s === 'pending'
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

            <Card className="p-6 bg-card/30">
              <h3 className="text-white font-bold mb-3">💡 Tips</h3>
              <ul className="text-white/70 text-sm space-y-2">
                <li>• Use Markdown for formatting</li>
                <li>• Keep content focused and relevant</li>
                <li>• Add tags for better searchability</li>
                <li>• Link related facets for context</li>
                <li>• Set to "pending" to queue for ingestion</li>
              </ul>
            </Card>
          </div>
        </div>
      </form>
    </>
  )
}
