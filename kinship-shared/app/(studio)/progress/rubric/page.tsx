'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { Card } from '@/components/UI'
import { useHeartsRubric, updateHeartsRubric } from '@/hooks/useApi'
import { HEARTS_FACETS } from '@/lib/data'

const DEFAULT_MOVES = [
  'Physical activity',
  'Helping others',
  'Self-reflection',
  'Creative expression',
  'Problem solving',
  'Social interaction',
  'Meditation',
  'Goal setting',
  'Exploration',
  'Rest & recovery',
]

export default function RubricPage() {
  const { data: rubric, loading, error, refetch } = useHeartsRubric()
  const [moves, setMoves] = useState<string[]>(DEFAULT_MOVES)
  const [rubricData, setRubricData] = useState<
    Record<string, Record<string, number>>
  >({})
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [newMove, setNewMove] = useState('')

  // Initialize rubric data from API
  useEffect(() => {
    if (rubric) {
      const data: Record<string, Record<string, number>> = {}
      const moveSet = new Set<string>(DEFAULT_MOVES)

      rubric.forEach((entry) => {
        moveSet.add(entry.move_type)
        if (!data[entry.move_type]) {
          data[entry.move_type] = {}
        }
        data[entry.move_type][entry.facet_key] = entry.delta
      })

      setMoves(Array.from(moveSet))
      setRubricData(data)
    }
  }, [rubric])

  const getValue = (move: string, facetKey: string): number => {
    return rubricData[move]?.[facetKey] ?? 0
  }

  const setValue = (move: string, facetKey: string, value: number) => {
    setRubricData((prev) => ({
      ...prev,
      [move]: {
        ...prev[move],
        [facetKey]: value,
      },
    }))
  }

  const addMove = () => {
    const trimmed = newMove.trim()
    if (trimmed && !moves.includes(trimmed)) {
      setMoves([...moves, trimmed])
      setNewMove('')
    }
  }

  const removeMove = (move: string) => {
    setMoves(moves.filter((m) => m !== move))
    setRubricData((prev) => {
      const copy = { ...prev }
      delete copy[move]
      return copy
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Build entries array
      const entries: { move_type: string; facet_key: string; delta: number }[] =
        []

      moves.forEach((move) => {
        HEARTS_FACETS.forEach((facet) => {
          const delta = getValue(move, facet.key)
          if (delta !== 0) {
            entries.push({
              move_type: move,
              facet_key: facet.key,
              delta,
            })
          }
        })
      })

      await updateHeartsRubric({ entries })
      setSuccess(true)
      refetch()
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error('Failed to save rubric:', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader
          title="Move-to-Facet Rubric"
          subtitle="Loading..."
          breadcrumbs={[
            { label: 'HEARTS', href: '/progress' },
            { label: 'Rubric' },
          ]}
        />
        <Card className="p-6 animate-pulse">
          <div className="h-64 bg-input rounded-xl" />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Move-to-Facet Rubric"
        subtitle="Define how player moves map to HEARTS facets"
        breadcrumbs={[
          { label: 'HEARTS', href: '/progress' },
          { label: 'Rubric' },
        ]}
        action={
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold disabled:opacity-50"
          >
            {saving ? 'Saving...' : '💾 Save Rubric'}
          </button>
        }
      />

      {/* Success Banner */}
      {success && (
        <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
          <p className="text-emerald-400 text-sm">
            ✓ Rubric saved successfully
          </p>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-accent/15 border border-amber-500/30 rounded-xl">
          <p className="text-accent text-sm">⚠️ {error}</p>
        </div>
      )}

      {/* Add Move */}
      <Card className="p-4 mb-6">
        <div className="flex gap-3">
          <input
            type="text"
            value={newMove}
            onChange={(e) => setNewMove(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addMove()}
            placeholder="Add new move type..."
            className="flex-1 bg-input border border-card-border rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-accent/50"
          />
          <button
            onClick={addMove}
            className="px-4 py-2 bg-white/[0.1] hover:bg-white/[0.1] text-white rounded-xl text-sm"
          >
            + Add Move
          </button>
        </div>
      </Card>

      {/* Rubric Table */}
      <Card className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-card-border">
              <th className="text-left text-muted text-xs font-medium uppercase tracking-wider px-5 py-3 sticky left-0 bg-card/95 backdrop-blur">
                Move Type
              </th>
              {HEARTS_FACETS.map((f) => (
                <th key={f.key} className="text-center px-3 py-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold mx-auto"
                    style={{ backgroundColor: f.color }}
                  >
                    {f.key}
                  </div>
                  <p className="text-muted text-[10px] mt-1">{f.name}</p>
                </th>
              ))}
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {moves.map((move) => (
              <tr
                key={move}
                className="border-b border-card-border/30 hover:bg-card/30"
              >
                <td className="px-5 py-3 text-white text-sm font-medium sticky left-0 bg-card/95 backdrop-blur">
                  {move}
                </td>
                {HEARTS_FACETS.map((f) => (
                  <td key={f.key} className="px-3 py-3 text-center">
                    <input
                      type="number"
                      step={0.5}
                      value={getValue(move, f.key)}
                      onChange={(e) =>
                        setValue(move, f.key, parseFloat(e.target.value) || 0)
                      }
                      min={-10}
                      max={10}
                      className="w-14 bg-input border border-card-border rounded-lg px-2 py-1.5 text-white text-sm text-center focus:outline-none focus:border-accent/50"
                    />
                  </td>
                ))}
                <td className="px-2 py-3">
                  {!DEFAULT_MOVES.includes(move) && (
                    <button
                      onClick={() => removeMove(move)}
                      className="text-white/40 hover:text-red-400 text-lg"
                      title="Remove move"
                    >
                      ×
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Help Text */}
      <p className="text-white/40 text-xs mt-4 text-center">
        Positive values increase the facet score, negative values decrease it.
        Range: -10 to +10
      </p>
    </>
  )
}
