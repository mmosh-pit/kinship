'use client'

import UndoRedoControls from './UndoRedoControls'
import VersionBadge from './VersionBadge'

interface Props {
  version: number
  status: 'ready' | 'generating' | 'editing' | 'planning' | 'error' | 'empty'
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onPreview: () => void
  onValidate: () => void
  isLoading?: boolean
  validationStatus?: 'valid' | 'warnings' | 'errors' | null
  warningCount?: number
  errorCount?: number
}

const STATUS_CONFIG: Record<
  string,
  { bg: string; text: string; label: string; pulse?: boolean }
> = {
  ready: { bg: 'bg-emerald-500', text: 'text-emerald-400', label: 'Ready' },
  generating: {
    bg: 'bg-amber-500',
    text: 'text-amber-400',
    label: 'Generating',
    pulse: true,
  },
  planning: {
    bg: 'bg-blue-500',
    text: 'text-blue-400',
    label: 'Planning',
    pulse: true,
  },
  editing: {
    bg: 'bg-purple-500',
    text: 'text-purple-400',
    label: 'Editing',
    pulse: true,
  },
  error: { bg: 'bg-red-500', text: 'text-red-400', label: 'Error' },
  empty: { bg: 'bg-white/30', text: 'text-white/50', label: 'No game' },
}

export default function StateManagementBar({
  version,
  status,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onPreview,
  onValidate,
  isLoading = false,
  validationStatus = null,
  warningCount = 0,
  errorCount = 0,
}: Props) {
  const statusStyle = STATUS_CONFIG[status] || STATUS_CONFIG.ready

  return (
    <div className="bg-card rounded-xl px-4 py-3 flex items-center justify-between border border-card-border">
      {/* Left side: Version, Status, Undo/Redo */}
      <div className="flex items-center gap-4">
        {/* Version Badge */}
        <VersionBadge version={version} />

        {/* Status Indicator */}
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${statusStyle.bg} ${statusStyle.pulse ? 'animate-pulse' : ''}`}
          />
          <span className={`text-xs font-medium ${statusStyle.text}`}>
            {statusStyle.label}
          </span>
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-white/10" />

        {/* Undo/Redo Controls */}
        <UndoRedoControls
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={onUndo}
          onRedo={onRedo}
          isLoading={isLoading}
        />
      </div>

      {/* Right side: Validation Status, Validate, Preview */}
      <div className="flex items-center gap-3">
        {/* Validation Status Badge */}
        {validationStatus && (
          <div className="flex items-center gap-1.5">
            {validationStatus === 'valid' && (
              <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-400">
                <span className="text-[10px]">✓</span> Valid
              </span>
            )}
            {validationStatus === 'warnings' && (
              <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-amber-500/15 text-amber-400">
                <span className="text-[10px]">⚠</span> {warningCount} warning
                {warningCount !== 1 ? 's' : ''}
              </span>
            )}
            {validationStatus === 'errors' && (
              <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-red-500/15 text-red-400">
                <span className="text-[10px]">✕</span> {errorCount} error
                {errorCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {/* Validate Button */}
        <button
          onClick={onValidate}
          disabled={isLoading || status === 'empty'}
          className={`px-3 py-1.5 text-xs rounded-lg flex items-center gap-1.5 transition-all ${
            isLoading || status === 'empty'
              ? 'bg-white/[0.05] text-white/30 cursor-not-allowed'
              : 'bg-white/[0.1] hover:bg-white/[0.15] text-white'
          }`}
        >
          <span className="text-[10px]">✓</span>
          Validate
        </button>

        {/* Preview Button */}
        <button
          onClick={onPreview}
          disabled={isLoading || status === 'empty'}
          className={`px-4 py-1.5 text-xs rounded-lg font-medium flex items-center gap-1.5 transition-all ${
            isLoading || status === 'empty'
              ? 'bg-emerald-500/30 text-emerald-300/50 cursor-not-allowed'
              : 'bg-emerald-500 hover:bg-emerald-600 text-white'
          }`}
        >
          <span className="text-[10px]">▶</span>
          Preview
        </button>
      </div>
    </div>
  )
}
