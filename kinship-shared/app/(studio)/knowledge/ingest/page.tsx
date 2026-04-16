'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { Card } from '@/components/UI'
import { useKnowledgeList, ingestKnowledge } from '@/hooks/useApi'
import type { IngestStatus, KnowledgeDocument } from '@/lib/types'

export default function KnowledgeIngestPage() {
  const { data: documents, loading, error, refetch } = useKnowledgeList()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [ingesting, setIngesting] = useState(false)
  const [ingestingId, setIngestingId] = useState<string | null>(null)
  const [logs, setLogs] = useState<
    { time: string; message: string; success: boolean }[]
  >([])

  // Filter documents that can be ingested
  const pendingDocs = useMemo(() => {
    if (!documents) return []
    return documents.filter(
      (doc) =>
        doc.ingest_status === 'pending' ||
        doc.ingest_status === 'draft' ||
        doc.ingest_status === 'failed'
    )
  }, [documents])

  // Initialize selection with pending docs
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const selectAll = () => {
    if (selectedIds.size === pendingDocs.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pendingDocs.map((d) => d.id)))
    }
  }

  const addLog = (message: string, success: boolean) => {
    const time = new Date().toLocaleTimeString()
    setLogs((prev) => [{ time, message, success }, ...prev.slice(0, 49)])
  }

  const handleIngestSingle = async (doc: KnowledgeDocument) => {
    setIngestingId(doc.id)
    try {
      await ingestKnowledge(doc.id)
      addLog(`✓ Ingested: ${doc.title}`, true)
      refetch()
    } catch (err) {
      addLog(
        `✗ Failed: ${doc.title} - ${err instanceof Error ? err.message : 'Unknown error'}`,
        false
      )
    } finally {
      setIngestingId(null)
    }
  }

  const handleIngestSelected = async () => {
    if (selectedIds.size === 0) return
    setIngesting(true)

    const docsToIngest = pendingDocs.filter((d) => selectedIds.has(d.id))

    for (const doc of docsToIngest) {
      setIngestingId(doc.id)
      try {
        await ingestKnowledge(doc.id)
        addLog(`✓ Ingested: ${doc.title}`, true)
      } catch (err) {
        addLog(
          `✗ Failed: ${doc.title} - ${err instanceof Error ? err.message : 'Unknown error'}`,
          false
        )
      }
    }

    setIngestingId(null)
    setIngesting(false)
    setSelectedIds(new Set())
    refetch()
  }

  // Status badge
  const IngestBadge = ({ status }: { status: IngestStatus }) => {
    const styles: Record<IngestStatus, string> = {
      pending: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
      ingested: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
      failed: 'bg-red-500/15 text-red-400 border-red-500/20',
      draft: 'bg-accent/15 text-accent border-accent/20',
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
          title="Ingest to Pinecone"
          subtitle="Loading..."
          breadcrumbs={[
            { label: 'Knowledge', href: '/knowledge' },
            { label: 'Ingest' },
          ]}
        />
        <Card className="p-6 animate-pulse">
          <div className="h-8 bg-input rounded w-1/3 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-white/[0.1]/30 rounded" />
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
          title="Ingest to Pinecone"
          subtitle="Error"
          breadcrumbs={[
            { label: 'Knowledge', href: '/knowledge' },
            { label: 'Ingest' },
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

  const ingestedCount =
    documents?.filter((d) => d.ingest_status === 'ingested').length || 0
  const totalCount = documents?.length || 0

  return (
    <>
      <PageHeader
        title="Ingest to Pinecone"
        subtitle="Push knowledge documents to vector database"
        breadcrumbs={[
          { label: 'Knowledge', href: '/knowledge' },
          { label: 'Ingest' },
        ]}
        action={
          <Link
            href="/knowledge"
            className="btn bg-white/[0.1] hover:bg-white/[0.1] text-white border-0 rounded-xl px-4 py-2.5"
          >
            ← Back to Knowledge
          </Link>
        }
      />

      <div className="grid grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="col-span-2 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-4 text-center">
              <p className="text-3xl font-bold text-white">{totalCount}</p>
              <p className="text-muted text-sm">Total Documents</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-3xl font-bold text-emerald-400">
                {ingestedCount}
              </p>
              <p className="text-muted text-sm">Ingested</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-3xl font-bold text-accent">
                {pendingDocs.length}
              </p>
              <p className="text-muted text-sm">Pending</p>
            </Card>
          </div>

          {/* Documents to Ingest */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-white font-bold">
                  Documents Ready for Ingest
                </h3>
                <p className="text-muted text-sm">
                  {selectedIds.size} selected
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="px-3 py-2 text-sm bg-card hover:bg-white/[0.1] text-white rounded-xl"
                >
                  {selectedIds.size === pendingDocs.length
                    ? 'Deselect All'
                    : 'Select All'}
                </button>
                <button
                  onClick={handleIngestSelected}
                  disabled={selectedIds.size === 0 || ingesting}
                  className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {ingesting ? (
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
                      Ingesting...
                    </span>
                  ) : (
                    `🚀 Ingest Selected (${selectedIds.size})`
                  )}
                </button>
              </div>
            </div>

            {pendingDocs.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted">All documents are ingested! 🎉</p>
                <Link
                  href="/knowledge/create"
                  className="text-accent hover:underline text-sm mt-2 inline-block"
                >
                  Create new document →
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className={`flex items-center justify-between bg-sidebar rounded-xl px-5 py-3 transition-all ${
                      ingestingId === doc.id ? 'ring-2 ring-accent/50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(doc.id)}
                        onChange={() => toggleSelection(doc.id)}
                        disabled={ingesting}
                        className="w-4 h-4 rounded border-white/[0.15] bg-sidebar text-accent focus:ring-accent"
                      />
                      <div>
                        <p className="text-white text-sm">{doc.title}</p>
                        <p className="text-white/40 text-xs">
                          {doc.category} · {doc.doc_type}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <IngestBadge status={doc.ingest_status} />
                      <button
                        onClick={() => handleIngestSingle(doc)}
                        disabled={ingesting || ingestingId === doc.id}
                        className="px-3 py-1.5 text-xs bg-accent/20 text-accent hover:bg-accent/30 rounded-lg disabled:opacity-50"
                      >
                        {ingestingId === doc.id ? '...' : 'Ingest'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Already Ingested */}
          {ingestedCount > 0 && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4">Already Ingested</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {documents
                  ?.filter((d) => d.ingest_status === 'ingested')
                  .map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between bg-sidebar/40 rounded-xl px-5 py-3 opacity-60"
                    >
                      <div>
                        <p className="text-white text-sm">{doc.title}</p>
                        <p className="text-white/40 text-xs">
                          {doc.category} · {doc.doc_type}
                        </p>
                      </div>
                      <IngestBadge status={doc.ingest_status} />
                    </div>
                  ))}
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar - Logs */}
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">Ingest Log</h3>
            <div className="bg-sidebar rounded-xl p-4 font-mono text-xs space-y-1 max-h-96 overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-white/40">No activity yet...</p>
              ) : (
                logs.map((log, i) => (
                  <p
                    key={i}
                    className={
                      log.success ? 'text-emerald-400' : 'text-red-400'
                    }
                  >
                    [{log.time}] {log.message}
                  </p>
                ))
              )}
            </div>
          </Card>

          <Card className="p-6 bg-card/30">
            <h3 className="text-white font-bold mb-3">💡 About Ingestion</h3>
            <ul className="text-white/70 text-sm space-y-2">
              <li>• Documents are converted to embeddings</li>
              <li>• Stored in Pinecone vector database</li>
              <li>• Enables semantic search for AI context</li>
              <li>• Re-ingest to update embeddings</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  )
}
