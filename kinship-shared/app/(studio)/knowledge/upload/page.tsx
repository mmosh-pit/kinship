'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { Card } from '@/components/UI'
import { uploadKnowledge } from '@/hooks/useApi'
import { useStudio } from '@/lib/studio-context'
import { HEARTS_FACETS } from '@/lib/data'
import type { KnowledgeCategory, KnowledgeType, HeartsFacet } from '@/lib/types'

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

export default function KnowledgeUploadPage() {
  const router = useRouter()
  const { currentPlatform } = useStudio()

  // Form state
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<KnowledgeCategory>('General')
  const [docType, setDocType] = useState<KnowledgeType>('reference')
  const [facets, setFacets] = useState<HeartsFacet[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')

  // UI state
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)

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

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragActive(false)

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        const droppedFile = e.dataTransfer.files[0]
        if (droppedFile.type === 'application/pdf') {
          setFile(droppedFile)
          if (!title) {
            setTitle(droppedFile.name.replace('.pdf', ''))
          }
          setError(null)
        } else {
          setError('Only PDF files are allowed')
        }
      }
    },
    [title]
  )

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0]
      if (selectedFile.type === 'application/pdf') {
        setFile(selectedFile)
        if (!title) {
          setTitle(selectedFile.name.replace('.pdf', ''))
        }
        setError(null)
      } else {
        setError('Only PDF files are allowed')
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!file) {
      setError('Please select a PDF file to upload')
      return
    }

    setUploading(true)
    try {
      const doc = await uploadKnowledge(file, {
        title: title.trim() || undefined,
        category,
        doc_type: docType,
        tags: tags.length > 0 ? tags : undefined,
        facets: facets.length > 0 ? facets : undefined,
        platform_id: currentPlatform?.id || undefined,
      })
      router.push(`/knowledge/${doc.id}`)
    } catch (err) {
      console.error('Upload failed:', err)
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <>
      <PageHeader
        title="Upload PDF"
        subtitle="Upload a PDF document to the knowledge base"
        breadcrumbs={[
          { label: 'Knowledge', href: '/knowledge' },
          { label: 'Upload' },
        ]}
        action={
          <Link
            href="/knowledge"
            className="btn bg-white/[0.1] hover:bg-white/[0.1] text-white border-0 rounded-xl px-5 py-2.5"
          >
            ← Back
          </Link>
        }
      />

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
          <p className="text-red-400 text-sm">❌ {error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-3 gap-6">
          {/* Main Upload Area */}
          <div className="col-span-2 space-y-6">
            {/* Drop Zone */}
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <span className="text-xl">📄</span> PDF File
              </h3>
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-10 text-center transition-all ${
                  dragActive
                    ? 'border-accent bg-accent/10'
                    : file
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-card-border hover:border-white/[0.15]'
                }`}
              >
                {file ? (
                  <div className="space-y-3">
                    <div className="w-16 h-16 mx-auto bg-emerald-500/20 rounded-xl flex items-center justify-center">
                      <span className="text-3xl">📑</span>
                    </div>
                    <div>
                      <p className="text-white font-medium">{file.name}</p>
                      <p className="text-muted text-sm">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Remove file
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="w-16 h-16 mx-auto bg-card rounded-xl flex items-center justify-center">
                      <span className="text-3xl">📤</span>
                    </div>
                    <div>
                      <p className="text-white font-medium">
                        Drag and drop your PDF here
                      </p>
                      <p className="text-muted text-sm">
                        or click to browse
                      </p>
                    </div>
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="file-upload"
                    />
                    <label
                      htmlFor="file-upload"
                      className="inline-block px-4 py-2 bg-card hover:bg-white/[0.1] text-white rounded-xl text-sm cursor-pointer"
                    >
                      Select PDF
                    </label>
                  </div>
                )}
              </div>
              <p className="text-muted text-xs mt-3">
                Maximum file size: 50MB. Text will be extracted automatically.
              </p>
            </Card>

            {/* Document Details */}
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <span className="text-xl">✏️</span> Document Details
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Auto-generated from filename if empty"
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
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
                </div>
              </div>
            </Card>

            {/* Facets */}
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

            {/* Tags */}
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
              {tags.length > 0 && (
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
              )}
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Upload Button */}
            <Card className="p-6">
              <button
                type="submit"
                disabled={uploading || !file}
                className="w-full btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold px-5 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Uploading...
                  </span>
                ) : (
                  '📤 Upload PDF'
                )}
              </button>
              <p className="text-muted text-xs mt-3 text-center">
                PDF will be uploaded to storage and text extracted
              </p>
            </Card>

            {/* Info */}
            <Card className="p-6">
              <h3 className="text-white font-bold mb-3">How it works</h3>
              <ul className="space-y-2 text-sm text-white/70">
                <li className="flex items-start gap-2">
                  <span className="text-accent">1.</span>
                  Upload your PDF document
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent">2.</span>
                  Text is automatically extracted
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent">3.</span>
                  Document is stored in the knowledge base
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent">4.</span>
                  Ingest to enable AI search
                </li>
              </ul>
            </Card>

            {/* Supported Formats */}
            <Card className="p-6">
              <h3 className="text-white font-bold mb-3">Supported</h3>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                  <span className="text-lg">📕</span>
                </div>
                <div>
                  <p className="text-white font-medium">PDF</p>
                  <p className="text-muted text-xs">Up to 50MB</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </form>
    </>
  )
}
