'use client'

const PIPELINE_LAYERS = [
  { key: 'guardrail', emoji: '🛡️', label: 'Guardrail', description: 'Normalize & classify' },
  { key: 'state', emoji: '📦', label: 'State', description: 'Load game state' },
  { key: 'intent', emoji: '🎯', label: 'Intent', description: 'Parse instruction' },
  { key: 'patch', emoji: '🔧', label: 'Patch', description: 'Build changes' },
  { key: 'merge', emoji: '🔀', label: 'Merge', description: 'Apply to manifest' },
  { key: 'impact', emoji: '💥', label: 'Impact', description: 'Run agents' },
  { key: 'validation', emoji: '✓', label: 'Validation', description: 'Validate result' },
  { key: 'output', emoji: '📤', label: 'Output', description: 'Persist & sync' },
]

interface Props {
  completedLayers: string[]
  activeLayer: string | null
  visible: boolean
  errors?: string[]
}

export default function EditPipelineVisualizer({
  completedLayers,
  activeLayer,
  visible,
  errors = [],
}: Props) {
  if (!visible) return null

  const activeIndex = activeLayer
    ? PIPELINE_LAYERS.findIndex((l) => l.key === activeLayer)
    : -1
  const progress =
    activeIndex >= 0
      ? Math.round(((activeIndex + 0.5) / PIPELINE_LAYERS.length) * 100)
      : completedLayers.length === PIPELINE_LAYERS.length
        ? 100
        : 0

  return (
    <div className="bg-card rounded-xl p-4 border border-card-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm">🔧</span>
          <span className="text-xs font-medium text-white">Edit Pipeline</span>
        </div>
        <span className="text-[10px] text-muted">{progress}% complete</span>
      </div>

      {/* Progress Bar */}
      <div className="h-1 w-full bg-white/[0.1] rounded-full overflow-hidden mb-3">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${Math.max(2, progress)}%` }}
        />
      </div>

      {/* Pipeline Layers */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {PIPELINE_LAYERS.map((layer, idx) => {
          const isCompleted = completedLayers.includes(layer.key)
          const isActive = activeLayer === layer.key
          const isPending = !isCompleted && !isActive
          const hasError = errors.some((e) =>
            e.toLowerCase().includes(layer.key)
          )

          return (
            <div
              key={layer.key}
              className={`flex-shrink-0 min-w-[72px] px-2 py-2 rounded-lg text-center transition-all duration-200 ${
                hasError
                  ? 'bg-red-500/15 border border-red-500/30'
                  : isCompleted
                    ? 'bg-emerald-500/15 border border-emerald-500/30'
                    : isActive
                      ? 'bg-amber-500/15 border border-amber-500/30 scale-105'
                      : 'bg-white/[0.03] border border-white/[0.08] opacity-40'
              }`}
              title={layer.description}
            >
              {/* Status Icon */}
              <div className="text-sm mb-0.5">
                {hasError ? (
                  <span className="text-red-400">✕</span>
                ) : isCompleted ? (
                  <span className="text-emerald-400">✓</span>
                ) : isActive ? (
                  <span className="inline-block animate-spin">⏳</span>
                ) : (
                  <span className="text-white/30">○</span>
                )}
              </div>

              {/* Label */}
              <p
                className={`text-[9px] font-medium leading-tight ${
                  hasError
                    ? 'text-red-400'
                    : isCompleted
                      ? 'text-emerald-400'
                      : isActive
                        ? 'text-amber-400'
                        : 'text-white/40'
                }`}
              >
                {layer.label}
              </p>
            </div>
          )
        })}
      </div>

      {/* Active Layer Description */}
      {activeLayer && (
        <div className="mt-2 pt-2 border-t border-white/[0.08]">
          <p className="text-[10px] text-amber-400/80">
            {PIPELINE_LAYERS.find((l) => l.key === activeLayer)?.description ||
              'Processing...'}
          </p>
        </div>
      )}

      {/* Error Display */}
      {errors.length > 0 && (
        <div className="mt-2 pt-2 border-t border-red-500/20">
          {errors.slice(0, 2).map((error, idx) => (
            <p key={idx} className="text-[10px] text-red-400 mb-1">
              ✕ {error}
            </p>
          ))}
          {errors.length > 2 && (
            <p className="text-[10px] text-red-400/60">
              +{errors.length - 2} more errors
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// Helper function to map API response layers_run to our format
export function parseLayersRun(layersRun: string[]): {
  completed: string[]
  active: string | null
} {
  const allLayers = PIPELINE_LAYERS.map((l) => l.key)
  const completed = layersRun.filter((l) => allLayers.includes(l))

  // If all layers are in layersRun, pipeline is complete
  if (completed.length === allLayers.length) {
    return { completed, active: null }
  }

  // Otherwise, the next layer after the last completed one is active
  const lastCompletedIdx = allLayers.findIndex(
    (l) => !completed.includes(l)
  )
  const active = lastCompletedIdx >= 0 ? allLayers[lastCompletedIdx] : null

  return { completed, active }
}
