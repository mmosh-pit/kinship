'use client'

import type { EditHistoryItem } from '@/lib/types'

interface EditHistoryPanelProps {
  history: EditHistoryItem[]
  currentVersion: number
  maxItems?: number
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function EditHistoryPanel({
  history,
  currentVersion,
  maxItems = 5,
}: EditHistoryPanelProps) {
  if (history.length === 0) return null

  // Show most recent items first
  const displayItems = history.slice(-maxItems).reverse()

  return (
    <div className="bg-card/30 rounded-xl p-3 mb-4">
      <div className="text-xs font-medium text-muted mb-2 flex items-center justify-between">
        <span>Recent changes</span>
        <span className="text-white/40">{history.length} total</span>
      </div>
      <div className="space-y-1.5">
        {displayItems.map((item, idx) => {
          const isCurrent = item.version === currentVersion
          return (
            <div
              key={`${item.version}-${idx}`}
              className="flex items-center gap-2 text-xs"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  isCurrent ? 'bg-emerald-400' : 'bg-input'
                }`}
              />
              <span
                className={`flex-1 truncate ${
                  isCurrent ? 'text-white' : 'text-muted'
                }`}
                title={item.change.description}
              >
                {item.change.description}
              </span>
              <span className="text-white/40 flex-shrink-0">
                v{item.version} • {formatTimeAgo(item.timestamp)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
