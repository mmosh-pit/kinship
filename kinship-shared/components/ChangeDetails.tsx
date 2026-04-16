'use client'

import type { EditChange } from '@/lib/types'

interface ChangeDetailsProps {
  changes: EditChange[]
}

function getChangeIcon(editType: string): string {
  if (editType.startsWith('add_')) return '+'
  if (editType.startsWith('remove_')) return '−'
  if (editType.startsWith('modify_')) return '~'
  return '•'
}

function getChangeColor(editType: string): string {
  if (editType.startsWith('add_')) return 'text-emerald-400'
  if (editType.startsWith('remove_')) return 'text-red-400'
  if (editType.startsWith('modify_')) return 'text-accent'
  return 'text-white/70'
}

export default function ChangeDetails({ changes }: ChangeDetailsProps) {
  if (!changes || changes.length === 0) return null

  return (
    <div className="bg-input rounded-lg p-2.5 mt-2 text-xs">
      <div className="text-white/70 mb-1.5 font-medium">Changes:</div>
      <div className="space-y-1">
        {changes.map((change, idx) => (
          <div
            key={idx}
            className={`flex items-start gap-1.5 ${getChangeColor(change.edit_type)}`}
          >
            <span className="font-mono w-3 text-center flex-shrink-0">
              {getChangeIcon(change.edit_type)}
            </span>
            <span className="text-white/80">{change.description}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
