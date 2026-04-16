'use client'

interface UndoRedoControlsProps {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  isLoading?: boolean
}

export default function UndoRedoControls({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  isLoading = false,
}: UndoRedoControlsProps) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={onUndo}
        disabled={!canUndo || isLoading}
        title={canUndo ? 'Undo last edit' : 'Nothing to undo'}
        className={`px-3 py-1.5 text-sm rounded-lg flex items-center gap-1.5 transition-all
          ${
            canUndo && !isLoading
              ? 'bg-white/[0.1] hover:bg-white/[0.1] text-white'
              : 'bg-input text-muted cursor-not-allowed'
          }`}
      >
        <span className="text-xs">↶</span>
        Undo
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo || isLoading}
        title={canRedo ? 'Redo undone edit' : 'Nothing to redo'}
        className={`px-3 py-1.5 text-sm rounded-lg flex items-center gap-1.5 transition-all
          ${
            canRedo && !isLoading
              ? 'bg-white/[0.1] hover:bg-white/[0.1] text-white'
              : 'bg-input text-muted cursor-not-allowed'
          }`}
      >
        <span className="text-xs">↷</span>
        Redo
      </button>
    </div>
  )
}
