'use client'

import type { EditChange } from '@/lib/types'
import ChangeDetails from './ChangeDetails'

interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
  changes?: EditChange[]
  isError?: boolean
}

/**
 * Parse message content to extract structured parts
 */
function parseMessageContent(content: string): {
  mainText: string
  stats?: { scenes?: number; npcs?: number; challenges?: number; routes?: number }
  version?: number
  canUndo?: boolean
  warnings?: string[]
  tip?: string
  isError: boolean
  errorMessage?: string
} {
  // Check if it's an error message
  if (content.startsWith('Could not complete:') || content.startsWith('Error:')) {
    const errorMessage = content
      .replace(/^Could not complete:\s*/, '')
      .replace(/^Error:\s*/, '')
    return {
      mainText: '',
      isError: true,
      errorMessage: errorMessage,
    }
  }

  // Parse success messages
  const result: ReturnType<typeof parseMessageContent> = {
    mainText: '',
    isError: false,
  }

  // Extract stats: "Modified: 3 scenes, 5 NPCs, 2 routes" or "3 scenes, 5 NPCs"
  const statsMatch = content.match(
    /(?:Created|Modified|Done!)?\s*:?\s*(\d+)\s*scenes?,\s*(\d+)\s*NPCs?,\s*(?:(\d+)\s*challenges?,\s*)?(\d+)\s*routes?/i
  )
  if (statsMatch) {
    result.stats = {
      scenes: parseInt(statsMatch[1]) || 0,
      npcs: parseInt(statsMatch[2]) || 0,
      challenges: statsMatch[3] ? parseInt(statsMatch[3]) : undefined,
      routes: parseInt(statsMatch[4]) || 0,
    }
  }

  // Extract version info
  const versionMatch = content.match(/Version\s+(\d+)/i)
  if (versionMatch) {
    result.version = parseInt(versionMatch[1])
  }

  // Check for undo availability
  result.canUndo = content.includes('undo available')

  // Extract warnings
  const warningsMatch = content.match(/Warnings?:\s*(.+?)(?:\n|$)/i)
  if (warningsMatch) {
    result.warnings = warningsMatch[1].split(/[;,]/).map((w) => w.trim()).filter(Boolean)
  }

  // Extract tip
  const tipMatch = content.match(/You can now modify.*?(?:\.|$)/i)
  if (tipMatch) {
    result.tip = tipMatch[0]
  }

  // Get the main action text (Created, Modified, Done, etc.)
  if (content.startsWith('Done!')) {
    result.mainText = 'Done!'
  } else if (content.startsWith('Created')) {
    result.mainText = 'Created'
  } else if (content.startsWith('Modified')) {
    result.mainText = 'Modified'
  } else if (content.startsWith('Game generated')) {
    result.mainText = 'Game generated'
  } else if (content.startsWith('Undone:')) {
    result.mainText = content.split('\n')[0]
  } else if (content.startsWith('Redone:')) {
    result.mainText = content.split('\n')[0]
  } else {
    // Fallback: use first line or full content
    result.mainText = content.split('\n')[0] || content
  }

  return result
}

function StatBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-white/[0.05] rounded">
      <span className="text-white/90 font-medium">{value}</span>
      <span className="text-white/50 text-xs">{label}</span>
    </div>
  )
}

export default function ChatMessage({
  role,
  content,
  changes,
  isError: forceError,
}: ChatMessageProps) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl px-4 py-2.5 bg-accent text-white">
          <p className="text-sm">{content}</p>
        </div>
      </div>
    )
  }

  const parsed = parseMessageContent(content)
  const showAsError = forceError || parsed.isError

  // Error message styling
  if (showAsError) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] rounded-2xl px-4 py-3 bg-red-500/10 border border-red-500/20">
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-red-400 text-xs">!</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-300 mb-1">Could not complete</p>
              <p className="text-sm text-white/80 leading-relaxed">
                {parsed.errorMessage || content}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Success/info message styling
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] rounded-2xl px-4 py-3 bg-card border border-card-border">
        {/* Main status text */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-emerald-400 text-xs">✓</span>
          </div>
          <p className="text-sm font-medium text-white">{parsed.mainText}</p>
          {parsed.version && (
            <span className="text-xs text-white/40 ml-auto">v{parsed.version}</span>
          )}
        </div>

        {/* Stats row */}
        {parsed.stats && (
          <div className="flex flex-wrap gap-2 mb-2">
            {parsed.stats.scenes !== undefined && parsed.stats.scenes > 0 && (
              <StatBadge label="scenes" value={parsed.stats.scenes} />
            )}
            {parsed.stats.npcs !== undefined && parsed.stats.npcs > 0 && (
              <StatBadge label="NPCs" value={parsed.stats.npcs} />
            )}
            {parsed.stats.challenges !== undefined && parsed.stats.challenges > 0 && (
              <StatBadge label="challenges" value={parsed.stats.challenges} />
            )}
            {parsed.stats.routes !== undefined && parsed.stats.routes > 0 && (
              <StatBadge label="routes" value={parsed.stats.routes} />
            )}
          </div>
        )}

        {/* Changes list */}
        {changes && changes.length > 0 && <ChangeDetails changes={changes} />}

        {/* Warnings */}
        {parsed.warnings && parsed.warnings.length > 0 && (
          <div className="mt-2 px-2 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-300">
            {parsed.warnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        )}

        {/* Tip */}
        {parsed.tip && (
          <p className="mt-2 text-xs text-white/40">{parsed.tip}</p>
        )}

        {/* Undo hint */}
        {parsed.canUndo && (
          <p className="mt-1 text-xs text-white/30">Undo available</p>
        )}
      </div>
    </div>
  )
}
