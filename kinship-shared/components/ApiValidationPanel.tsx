'use client'

import { useState, useMemo } from 'react'
import type { ValidatorResult, ValidationError } from '@/lib/types'

interface Props {
  validationResult: {
    valid: boolean
    total_errors: number
    total_warnings: number
    duration_ms: number
    validators: ValidatorResult[]
    summary: string
  } | null
  isValidating: boolean
  onValidate: () => void
  maxHeight?: number
}

const VALIDATOR_ICONS: Record<string, string> = {
  schema: '📋',
  reference: '🔗',
  gameplay: '🎮',
  spatial: '📍',
  challenge: '⚡',
  route: '🔀',
  npc: '🧑',
  dialogue: '💬',
  mechanic: '🔧',
  engine: '⚙️',
  manifest: '📦',
  scene_content: '🏞️',
}

const SEVERITY_STYLES = {
  error: {
    icon: '✕',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    text: 'text-red-400',
    badge: 'bg-red-500/20 text-red-400',
  },
  warning: {
    icon: '⚠',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    text: 'text-amber-400',
    badge: 'bg-amber-500/20 text-amber-400',
  },
  info: {
    icon: '○',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    text: 'text-blue-400',
    badge: 'bg-blue-500/20 text-blue-400',
  },
}

export default function ApiValidationPanel({
  validationResult,
  isValidating,
  onValidate,
  maxHeight = 400,
}: Props) {
  const [filter, setFilter] = useState<'all' | 'errors' | 'warnings'>('all')
  const [expandedValidators, setExpandedValidators] = useState<Set<string>>(
    new Set()
  )

  // Flatten all issues for filtering
  const allIssues = useMemo(() => {
    if (!validationResult) return []

    const issues: Array<{
      validator: string
      severity: 'error' | 'warning'
      code: string
      message: string
      location: string
    }> = []

    validationResult.validators.forEach((v) => {
      v.errors.forEach((e) =>
        issues.push({ validator: v.name, severity: 'error', ...e })
      )
      v.warnings.forEach((w) =>
        issues.push({ validator: v.name, severity: 'warning', ...w })
      )
    })

    return issues
  }, [validationResult])

  // Filter issues
  const filteredIssues = useMemo(() => {
    if (filter === 'all') return allIssues
    return allIssues.filter((i) =>
      filter === 'errors' ? i.severity === 'error' : i.severity === 'warning'
    )
  }, [allIssues, filter])

  // Group by validator
  const groupedIssues = useMemo(() => {
    const groups: Record<
      string,
      Array<{
        severity: 'error' | 'warning'
        code: string
        message: string
        location: string
      }>
    > = {}
    filteredIssues.forEach((issue) => {
      if (!groups[issue.validator]) groups[issue.validator] = []
      groups[issue.validator].push(issue)
    })
    return groups
  }, [filteredIssues])

  const toggleValidator = (name: string) => {
    const newExpanded = new Set(expandedValidators)
    if (newExpanded.has(name)) {
      newExpanded.delete(name)
    } else {
      newExpanded.add(name)
    }
    setExpandedValidators(newExpanded)
  }

  // No validation run yet
  if (!validationResult && !isValidating) {
    return (
      <div className="bg-card rounded-xl p-4 border border-card-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm">✓</span>
            <span className="text-xs font-medium text-white">Validation</span>
          </div>
          <button
            onClick={onValidate}
            className="text-[10px] px-2 py-1 rounded-md bg-white/[0.1] text-white hover:bg-white/[0.15] transition-colors"
          >
            Run validation
          </button>
        </div>
        <p className="text-xs text-muted text-center py-4">
          Click &quot;Run validation&quot; to check your game manifest
        </p>
      </div>
    )
  }

  // Validating
  if (isValidating) {
    return (
      <div className="bg-card rounded-xl p-4 border border-card-border">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm animate-spin">⏳</span>
          <span className="text-xs font-medium text-white">Validating...</span>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-8 bg-white/[0.05] rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    )
  }

  // Validation complete
  const { valid, total_errors, total_warnings, duration_ms, validators } =
    validationResult!

  return (
    <div className="bg-card rounded-xl border border-card-border overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-sm ${valid ? 'text-emerald-400' : 'text-red-400'}`}>
            {valid ? '✓' : '✕'}
          </span>
          <span className="text-xs font-medium text-white">Validation</span>
          <span className="text-[10px] text-muted">({duration_ms}ms)</span>
        </div>
        <button
          onClick={onValidate}
          disabled={isValidating}
          className="text-[10px] px-2 py-1 rounded-md bg-white/[0.1] text-white hover:bg-white/[0.15] transition-colors"
        >
          Re-run
        </button>
      </div>

      {/* Summary Badges */}
      <div className="px-4 py-2 bg-white/[0.02] border-b border-white/[0.08] flex items-center gap-2">
        {valid ? (
          <span className="text-[10px] px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-400">
            ✓ All checks passed
          </span>
        ) : (
          <>
            {total_errors > 0 && (
              <span className="text-[10px] px-2 py-1 rounded-md bg-red-500/15 text-red-400">
                ✕ {total_errors} error{total_errors !== 1 ? 's' : ''}
              </span>
            )}
            {total_warnings > 0 && (
              <span className="text-[10px] px-2 py-1 rounded-md bg-amber-500/15 text-amber-400">
                ⚠ {total_warnings} warning{total_warnings !== 1 ? 's' : ''}
              </span>
            )}
          </>
        )}
      </div>

      {/* Filter Tabs */}
      {!valid && (
        <div className="px-4 py-2 flex gap-1">
          <button
            onClick={() => setFilter('all')}
            className={`text-[10px] px-2 py-1 rounded-md transition-colors ${
              filter === 'all'
                ? 'bg-white/[0.15] text-white'
                : 'text-muted hover:text-white'
            }`}
          >
            All ({allIssues.length})
          </button>
          <button
            onClick={() => setFilter('errors')}
            className={`text-[10px] px-2 py-1 rounded-md transition-colors ${
              filter === 'errors'
                ? 'bg-red-500/20 text-red-400'
                : 'text-muted hover:text-white'
            }`}
          >
            Errors ({total_errors})
          </button>
          <button
            onClick={() => setFilter('warnings')}
            className={`text-[10px] px-2 py-1 rounded-md transition-colors ${
              filter === 'warnings'
                ? 'bg-amber-500/20 text-amber-400'
                : 'text-muted hover:text-white'
            }`}
          >
            Warnings ({total_warnings})
          </button>
        </div>
      )}

      {/* Issues List */}
      <div
        className="px-4 py-2 overflow-y-auto"
        style={{ maxHeight: maxHeight - 120 }}
      >
        {valid ? (
          <div className="flex flex-col items-center justify-center py-6">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center mb-3">
              <span className="text-xl text-emerald-400">✓</span>
            </div>
            <p className="text-emerald-400 font-medium text-sm">All Clear!</p>
            <p className="text-muted text-xs mt-1">
              {validators.length} validators passed
            </p>
          </div>
        ) : filteredIssues.length === 0 ? (
          <p className="text-muted text-xs text-center py-4">
            No {filter === 'all' ? 'issues' : filter} found
          </p>
        ) : (
          <div className="space-y-2">
            {Object.entries(groupedIssues).map(([validator, issues]) => (
              <div key={validator} className="rounded-lg overflow-hidden">
                {/* Validator Header */}
                <button
                  onClick={() => toggleValidator(validator)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-white/[0.03] hover:bg-white/[0.05] transition-colors"
                >
                  <span className="text-sm">
                    {VALIDATOR_ICONS[validator] || '📋'}
                  </span>
                  <span className="text-xs text-white font-medium capitalize flex-1 text-left">
                    {validator.replace('_', ' ')}
                  </span>
                  <span className="text-[10px] text-muted">
                    {issues.length} issue{issues.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-xs text-muted">
                    {expandedValidators.has(validator) ? '▾' : '▸'}
                  </span>
                </button>

                {/* Issues */}
                {expandedValidators.has(validator) && (
                  <div className="px-2 py-1 space-y-1">
                    {issues.map((issue, idx) => {
                      const style = SEVERITY_STYLES[issue.severity]
                      return (
                        <div
                          key={idx}
                          className={`flex items-start gap-2 px-2 py-1.5 rounded-md ${style.bg} border ${style.border}`}
                        >
                          <span className={`text-xs ${style.text}`}>
                            {style.icon}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-[10px] ${style.text}`}>
                              {issue.message}
                            </p>
                            {issue.location && (
                              <p className="text-[9px] text-muted mt-0.5 font-mono">
                                {issue.location}
                              </p>
                            )}
                          </div>
                          {issue.code && (
                            <span className="text-[8px] text-muted font-mono">
                              {issue.code}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Validators Summary */}
      <div className="px-4 py-2 border-t border-white/[0.08] bg-white/[0.02]">
        <div className="flex flex-wrap gap-1">
          {validators.map((v) => (
            <span
              key={v.name}
              className={`text-[9px] px-1.5 py-0.5 rounded ${
                v.passed
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : v.errors.length > 0
                    ? 'bg-red-500/15 text-red-400'
                    : 'bg-amber-500/15 text-amber-400'
              }`}
              title={`${v.name}: ${v.errors.length} errors, ${v.warnings.length} warnings (${v.duration_ms}ms)`}
            >
              {v.passed ? '✓' : '✕'} {v.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
