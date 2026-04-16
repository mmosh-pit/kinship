'use client'

import { useState, useEffect, useRef } from 'react'
import { RealtimeEvent, getEventMeta } from '../hooks/useRealtimeEvents'

// ═══════════════════════════════════════════════════════════════════
//  Live Event Feed
// ═══════════════════════════════════════════════════════════════════

interface LiveEventFeedProps {
  events: RealtimeEvent[]
  maxVisible?: number
  autoScroll?: boolean
  showTimestamp?: boolean
  filter?: string[]
  onEventClick?: (event: RealtimeEvent) => void
}

export default function LiveEventFeed({
  events,
  maxVisible = 50,
  autoScroll = true,
  showTimestamp = true,
  filter,
  onEventClick,
}: LiveEventFeedProps) {
  const [isPaused, setIsPaused] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevEventsLengthRef = useRef(0)

  // Filter events
  const filteredEvents = filter
    ? events.filter((e) => filter.includes(e.event_type))
    : events

  // Limit visible events
  const visibleEvents = filteredEvents.slice(-maxVisible)

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (autoScroll && !isPaused && scrollRef.current) {
      if (events.length > prevEventsLengthRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    }
    prevEventsLengthRef.current = events.length
  }, [events.length, autoScroll, isPaused])

  // Format timestamp
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  // Format relative time
  const formatRelative = (timestamp: string) => {
    const seconds = Math.floor(
      (Date.now() - new Date(timestamp).getTime()) / 1000
    )
    if (seconds < 5) return 'now'
    if (seconds < 60) return `${seconds}s ago`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    return formatTime(timestamp)
  }

  if (visibleEvents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-3xl mb-2 opacity-50">📡</div>
        <div className="text-muted text-sm">Waiting for events...</div>
        <div className="text-white/40 text-xs mt-1">
          Events will appear here in real-time
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Pause indicator */}
      {isPaused && (
        <div className="absolute top-2 right-2 z-10 px-2 py-1 bg-amber-500/20 border border-amber-500/30 rounded text-[10px] text-accent font-semibold">
          ⏸️ Paused
        </div>
      )}

      {/* Event list */}
      <div
        ref={scrollRef}
        className="max-h-[400px] overflow-y-auto space-y-1 pr-1"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {visibleEvents.map((event, index) => (
          <EventRow
            key={`${event.timestamp}-${index}`}
            event={event}
            showTimestamp={showTimestamp}
            formatTime={formatRelative}
            onClick={onEventClick}
            isNew={index === visibleEvents.length - 1}
          />
        ))}
      </div>

      {/* Event count */}
      <div className="mt-2 text-[10px] text-white/40 text-right">
        {visibleEvents.length} events
        {filter && ` (filtered)`}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Event Row
// ═══════════════════════════════════════════════════════════════════

interface EventRowProps {
  event: RealtimeEvent
  showTimestamp: boolean
  formatTime: (ts: string) => string
  onClick?: (event: RealtimeEvent) => void
  isNew?: boolean
}

function EventRow({
  event,
  showTimestamp,
  formatTime,
  onClick,
  isNew,
}: EventRowProps) {
  const meta = getEventMeta(event.event_type)

  // Get event description
  const getDescription = () => {
    switch (event.event_type) {
      case 'player_joined':
        return `joined the game`
      case 'player_left':
        return `left the game`
      case 'scene_enter':
        return `entered ${event.scene_id || 'scene'}`
      case 'scene_exit':
        return `left ${event.scene_id || 'scene'}`
      case 'challenge_start':
        return `started challenge`
      case 'challenge_complete':
        return `completed challenge ${event.data?.attempts ? `(${event.data.attempts} tries)` : ''}`
      case 'challenge_fail':
        return `failed challenge attempt #${event.data?.attempt_number || '?'}`
      case 'challenge_skip':
        return `skipped challenge`
      case 'quest_start':
        return `started quest`
      case 'quest_complete':
        return `completed quest`
      case 'hearts_change':
        const delta = event.data?.delta || 0
        const facet = event.data?.facet || '?'
        return `${facet} ${delta >= 0 ? '+' : ''}${delta}`
      case 'npc_interact':
        return `talked to NPC`
      case 'collectible_pickup':
        return `picked up collectible`
      case 'achievement_unlock':
        return `unlocked achievement`
      default:
        return event.event_type
    }
  }

  return (
    <div
      className={`
        group flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all
        ${isNew ? 'bg-accent/10 animate-pulse-once' : 'hover:bg-card/40'}
        ${onClick ? 'cursor-pointer' : ''}
      `}
      onClick={() => onClick?.(event)}
    >
      {/* Icon */}
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0"
        style={{ backgroundColor: `${meta.color}20` }}
      >
        {meta.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {/* Player name */}
          {event.player_id && (
            <span className="text-xs text-white font-medium truncate max-w-[100px]">
              {event.data?.player_name || event.player_id.slice(0, 8)}
            </span>
          )}

          {/* Description */}
          <span className="text-xs text-white/70 truncate">
            {getDescription()}
          </span>
        </div>
      </div>

      {/* Timestamp */}
      {showTimestamp && (
        <span className="text-[10px] text-white/40 flex-shrink-0">
          {formatTime(event.timestamp)}
        </span>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Event Filter Pills
// ═══════════════════════════════════════════════════════════════════

interface EventFilterProps {
  selected: string[]
  onChange: (selected: string[]) => void
}

export function EventFilter({ selected, onChange }: EventFilterProps) {
  const categories = [
    {
      id: 'players',
      label: 'Players',
      types: ['player_joined', 'player_left'],
    },
    { id: 'scenes', label: 'Scenes', types: ['scene_enter', 'scene_exit'] },
    {
      id: 'challenges',
      label: 'Challenges',
      types: [
        'challenge_start',
        'challenge_complete',
        'challenge_fail',
        'challenge_skip',
      ],
    },
    { id: 'quests', label: 'Quests', types: ['quest_start', 'quest_complete'] },
    { id: 'hearts', label: 'HEARTS', types: ['hearts_change'] },
    {
      id: 'other',
      label: 'Other',
      types: ['npc_interact', 'collectible_pickup', 'achievement_unlock'],
    },
  ]

  const isSelected = (types: string[]) =>
    types.some((t) => selected.includes(t))

  const toggle = (types: string[]) => {
    if (isSelected(types)) {
      onChange(selected.filter((t) => !types.includes(t)))
    } else {
      onChange([...selected, ...types])
    }
  }

  const selectAll = () => {
    onChange(categories.flatMap((c) => c.types))
  }

  const selectNone = () => {
    onChange([])
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <button
        onClick={selectAll}
        className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
          selected.length === categories.flatMap((c) => c.types).length
            ? 'bg-accent/20 text-accent'
            : 'text-muted hover:text-white/70'
        }`}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => toggle(cat.types)}
          className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
            isSelected(cat.types)
              ? 'bg-white/[0.1] text-white'
              : 'text-muted hover:text-white/70'
          }`}
        >
          {cat.label}
        </button>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  CSS Animation (add to globals.css)
// ═══════════════════════════════════════════════════════════════════

/*
@keyframes pulse-once {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}

.animate-pulse-once {
  animation: pulse-once 0.5s ease-in-out;
}
*/
