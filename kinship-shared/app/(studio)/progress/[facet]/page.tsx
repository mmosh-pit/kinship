'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { Card } from '@/components/UI'
import { useHeartsFacet, updateHeartsFacet } from '@/hooks/useApi'
import { HEARTS_FACETS } from '@/lib/data'

export default function FacetDetailPage({
  params,
}: {
  params: Promise<{ facet: string }>
}) {
  const { facet: facetKey } = use(params)
  const router = useRouter()
  const { data: facet, loading, error, refetch } = useHeartsFacet(facetKey)

  // Get static data for fallback
  const staticFacet = HEARTS_FACETS.find((f) => f.key === facetKey)

  // Form state
  const [definition, setDefinition] = useState('')
  const [underPattern, setUnderPattern] = useState('')
  const [overPattern, setOverPattern] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  // Initialize form when data loads
  useEffect(() => {
    if (facet) {
      setDefinition(facet.definition || '')
      setUnderPattern(facet.under_pattern || '')
      setOverPattern(facet.over_pattern || '')
    }
  }, [facet])

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateHeartsFacet(facetKey, {
        definition,
        under_pattern: underPattern,
        over_pattern: overPattern,
      })
      setSuccess(true)
      refetch()
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error('Failed to save:', err)
    } finally {
      setSaving(false)
    }
  }

  const displayFacet = facet || staticFacet
  const color = facet?.color || staticFacet?.color || '#6366f1'

  if (loading) {
    return (
      <>
        <PageHeader
          title="Loading..."
          breadcrumbs={[
            { label: 'HEARTS', href: '/progress' },
            { label: '...' },
          ]}
        />
        <div className="animate-pulse grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-6">
            <Card className="p-6 h-48 bg-input">
              <></>
            </Card>
            <Card className="p-6 h-48 bg-input">
              <></>
            </Card>
          </div>
          <div className="space-y-6">
            <Card className="p-6 h-40 bg-input">
              <></>
            </Card>
          </div>
        </div>
      </>
    )
  }

  if (!displayFacet) {
    return (
      <>
        <PageHeader
          title="Facet Not Found"
          breadcrumbs={[
            { label: 'HEARTS', href: '/progress' },
            { label: 'Error' },
          ]}
        />
        <Card className="p-8 text-center">
          <p className="text-red-400 mb-4">Facet "{facetKey}" not found</p>
          <Link
            href="/progress"
            className="btn bg-accent hover:bg-accent-dark text-white rounded-xl px-4 py-2"
          >
            Back to HEARTS
          </Link>
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={displayFacet.name}
        subtitle={displayFacet.description || ''}
        breadcrumbs={[
          { label: 'HEARTS', href: '/progress' },
          { label: displayFacet.name },
        ]}
      />

      {/* Success Banner */}
      {success && (
        <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
          <p className="text-emerald-400 text-sm">
            ✓ Changes saved successfully
          </p>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-accent/15 border border-amber-500/30 rounded-xl">
          <p className="text-accent text-sm">⚠️ {error}</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">Definition</h3>
            <textarea
              rows={6}
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
              placeholder={`Define what ${displayFacet.name} represents and how it measures personal growth...`}
              className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50 resize-none"
            />
          </Card>

          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">Pattern Indicators</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-accent font-medium text-sm mb-3">
                  Under-pattern (score &lt; 30)
                </h4>
                <textarea
                  rows={5}
                  value={underPattern}
                  onChange={(e) => setUnderPattern(e.target.value)}
                  placeholder="Describe behaviors when this facet score is low..."
                  className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50 resize-none"
                />
              </div>
              <div>
                <h4 className="text-red-400 font-medium text-sm mb-3">
                  Over-pattern (score &gt; 90)
                </h4>
                <textarea
                  rows={5}
                  value={overPattern}
                  onChange={(e) => setOverPattern(e.target.value)}
                  placeholder="Describe behaviors when this facet score is too high..."
                  className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50 resize-none"
                />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">Linked Knowledge</h3>
            <p className="text-muted text-sm">
              Knowledge documents tagged with this facet will appear here.
            </p>
            <Link
              href={`/knowledge?facet=${facetKey}`}
              className="inline-block mt-3 text-accent text-sm hover:underline"
            >
              View related documents →
            </Link>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6 text-center">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center text-white text-3xl font-bold mx-auto mb-3"
              style={{ backgroundColor: color }}
            >
              {displayFacet.key}
            </div>
            <h3 className="text-white font-bold">{displayFacet.name}</h3>
            <p className="text-muted text-sm mt-1">Range: 0–100</p>
          </Card>

          <Card className="p-6">
            <h3 className="text-white font-bold mb-3">Metadata</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Key</span>
                <span className="text-white font-mono">{displayFacet.key}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Color</span>
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-white font-mono text-xs">{color}</span>
                </div>
              </div>
              {facet?.updated_at && (
                <div className="flex justify-between">
                  <span className="text-muted">Updated</span>
                  <span className="text-white/70 text-xs">
                    {new Date(facet.updated_at).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </Card>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold disabled:opacity-50"
          >
            {saving ? 'Saving...' : '💾 Save Changes'}
          </button>
        </div>
      </div>
    </>
  )
}
