'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

// ═══════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════

interface ValidationIssue {
  id: string
  severity: 'error' | 'warning' | 'info'
  type: string
  message: string
  entity: string
  entityId?: string
  link?: string
}

interface Props {
  issues: ValidationIssue[]
  maxHeight?: number
  showFilters?: boolean
}

// ═══════════════════════════════════════════════
//  Severity Styles
// ═══════════════════════════════════════════════

const SEVERITY_STYLES = {
  error: {
    icon: '❌',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    text: 'text-red-400',
    badge: 'bg-red-500/20 text-red-400',
  },
  warning: {
    icon: '⚠️',
    bg: 'bg-accent/15',
    border: 'border-accent/20',
    text: 'text-accent',
    badge: 'bg-amber-500/20 text-accent',
  },
  info: {
    icon: '💡',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    text: 'text-blue-400',
    badge: 'bg-blue-500/20 text-blue-400',
  },
}

const TYPE_ICONS: Record<string, string> = {
  game: '🎮',
  scene: '🏞️',
  actor: '🎭',
  challenge: '⚡',
  quest: '📖',
  route: '🔀',
}

// ═══════════════════════════════════════════════
//  ValidationPanel Component
// ═══════════════════════════════════════════════

export default function ValidationPanel({
  issues,
  maxHeight = 400,
  showFilters = true,
}: Props) {
  const [filter, setFilter] = useState<'all' | 'error' | 'warning' | 'info'>(
    'all'
  )
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(
    new Set(['error', 'warning'])
  )

  // Filter issues
  const filteredIssues = useMemo(() => {
    if (filter === 'all') return issues
    return issues.filter((i) => i.severity === filter)
  }, [issues, filter])

  // Group by type
  const groupedByType = useMemo(() => {
    const groups: Record<string, ValidationIssue[]> = {}
    filteredIssues.forEach((issue) => {
      if (!groups[issue.type]) groups[issue.type] = []
      groups[issue.type].push(issue)
    })
    return groups
  }, [filteredIssues])

  // Counts
  const errorCount = issues.filter((i) => i.severity === 'error').length
  const warningCount = issues.filter((i) => i.severity === 'warning').length
  const infoCount = issues.filter((i) => i.severity === 'info').length

  // Toggle type expansion
  const toggleType = (type: string) => {
    const newExpanded = new Set(expandedTypes)
    if (newExpanded.has(type)) {
      newExpanded.delete(type)
    } else {
      newExpanded.add(type)
    }
    setExpandedTypes(newExpanded)
  }

  // All clear state
  if (issues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center mb-3">
          <span className="text-xl">✓</span>
        </div>
        <h4 className="text-emerald-400 font-semibold text-sm mb-1">
          All Clear!
        </h4>
        <p className="text-muted text-xs">No validation issues found</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Filter Tabs */}
      {showFilters && (
        <div className="flex items-center gap-1 p-1 bg-input rounded-lg">
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 px-2 py-1.5 rounded-md text-[10px] font-semibold transition-colors ${
              filter === 'all'
                ? 'bg-white/[0.1] text-white'
                : 'text-muted hover:text-white/70'
            }`}
          >
            All ({issues.length})
          </button>
          <button
            onClick={() => setFilter('error')}
            className={`flex-1 px-2 py-1.5 rounded-md text-[10px] font-semibold transition-colors ${
              filter === 'error'
                ? 'bg-red-500/20 text-red-400'
                : 'text-muted hover:text-white/70'
            }`}
          >
            Errors ({errorCount})
          </button>
          <button
            onClick={() => setFilter('warning')}
            className={`flex-1 px-2 py-1.5 rounded-md text-[10px] font-semibold transition-colors ${
              filter === 'warning'
                ? 'bg-amber-500/20 text-accent'
                : 'text-muted hover:text-white/70'
            }`}
          >
            Warnings ({warningCount})
          </button>
          <button
            onClick={() => setFilter('info')}
            className={`flex-1 px-2 py-1.5 rounded-md text-[10px] font-semibold transition-colors ${
              filter === 'info'
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-muted hover:text-white/70'
            }`}
          >
            Info ({infoCount})
          </button>
        </div>
      )}

      {/* Issues List */}
      <div
        className="overflow-y-auto space-y-2 pr-1"
        style={{ maxHeight: maxHeight - (showFilters ? 50 : 0) }}
      >
        {filteredIssues.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-muted text-xs">No {filter} issues</p>
          </div>
        ) : (
          // Render grouped or flat list
          Object.entries(groupedByType).map(([type, typeIssues]) => (
            <div key={type} className="space-y-1">
              {/* Type header (if multiple types) */}
              {Object.keys(groupedByType).length > 1 && (
                <button
                  onClick={() => toggleType(type)}
                  className="flex items-center gap-2 w-full px-2 py-1 text-left hover:bg-card/40 rounded-lg transition-colors"
                >
                  <span className="text-xs">
                    {expandedTypes.has(type) ? '▾' : '▸'}
                  </span>
                  <span className="text-sm">{TYPE_ICONS[type] || '📋'}</span>
                  <span className="text-xs text-white/70 font-semibold capitalize">
                    {type}
                  </span>
                  <span className="text-[10px] text-white/40">
                    ({typeIssues.length})
                  </span>
                </button>
              )}

              {/* Issues */}
              {(Object.keys(groupedByType).length === 1 ||
                expandedTypes.has(type)) && (
                <div className="space-y-1 pl-0">
                  {typeIssues.map((issue) => (
                    <IssueItem key={issue.id} issue={issue} />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
//  Individual Issue Item
// ═══════════════════════════════════════════════

function IssueItem({ issue }: { issue: ValidationIssue }) {
  const styles = SEVERITY_STYLES[issue.severity]
  const typeIcon = TYPE_ICONS[issue.type] || '📋'

  const content = (
    <div
      className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${styles.bg} ${styles.border} transition-all hover:scale-[1.01]`}
    >
      {/* Severity icon */}
      <span className="text-sm mt-0.5 flex-shrink-0">{styles.icon}</span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-sm">{typeIcon}</span>
          <span className="text-xs text-white font-semibold truncate">
            {issue.entity}
          </span>
        </div>
        <p className={`text-[10px] ${styles.text}`}>{issue.message}</p>
      </div>

      {/* Link arrow */}
      {issue.link && (
        <span className="text-white/40 text-xs flex-shrink-0">→</span>
      )}
    </div>
  )

  if (issue.link) {
    return (
      <Link href={issue.link} className="block">
        {content}
      </Link>
    )
  }

  return content
}

// ═══════════════════════════════════════════════
//  Compact Validation Summary (for sidebar use)
// ═══════════════════════════════════════════════

export function ValidationSummary({ issues }: { issues: ValidationIssue[] }) {
  const errorCount = issues.filter((i) => i.severity === 'error').length
  const warningCount = issues.filter((i) => i.severity === 'warning').length
  const infoCount = issues.filter((i) => i.severity === 'info').length

  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
        <span className="text-emerald-400 text-sm">✓</span>
        <span className="text-emerald-400 text-xs font-semibold">
          All checks passed
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {errorCount > 0 && (
        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/15">
          <span className="text-xs">❌</span>
          <span className="text-[10px] text-red-400 font-semibold">
            {errorCount}
          </span>
        </div>
      )}
      {warningCount > 0 && (
        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-accent/15">
          <span className="text-xs">⚠️</span>
          <span className="text-[10px] text-accent font-semibold">
            {warningCount}
          </span>
        </div>
      )}
      {infoCount > 0 && (
        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-500/15">
          <span className="text-xs">💡</span>
          <span className="text-[10px] text-blue-400 font-semibold">
            {infoCount}
          </span>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════
//  Inline Validation Badge (for cards)
// ═══════════════════════════════════════════════

export function ValidationBadge({ issues }: { issues: ValidationIssue[] }) {
  const errorCount = issues.filter((i) => i.severity === 'error').length
  const warningCount = issues.filter((i) => i.severity === 'warning').length

  if (errorCount === 0 && warningCount === 0) return null

  if (errorCount > 0) {
    return (
      <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-semibold">
        {errorCount} error{errorCount > 1 ? 's' : ''}
      </span>
    )
  }

  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-accent font-semibold">
      {warningCount} warning{warningCount > 1 ? 's' : ''}
    </span>
  )
}
