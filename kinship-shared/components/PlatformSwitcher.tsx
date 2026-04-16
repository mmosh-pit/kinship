'use client'

import { useState, useRef, useEffect } from 'react'

import { useStudio } from '@/lib/studio-context'
import { Spinner } from './UI'

export default function PlatformSwitcher() {
  const {
    platforms,
    platformsLoading,
    currentPlatform,
    setPlatform,
    handleCreatePlatform,
  } = useStudio()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
        setError('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setSaving(true)
    setError('')
    try {
      await handleCreatePlatform({
        name: newName.trim(),
        description: newDesc.trim(),
        created_by: 'studio-user',
      })
      setNewName('')
      setNewDesc('')
      setCreating(false)
      setOpen(false)
      // redirect handled by sidebar useEffect
    } catch (err) {
      setError((err as Error).message || 'Failed to create platform')
    } finally {
      setSaving(false)
    }
  }

  if (platformsLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-card-border bg-input min-w-[180px]">
        <Spinner size="sm" />
        <span className="text-xs text-muted">Loading...</span>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => {
          if (!currentPlatform && platforms.length === 0) {
            setOpen(true)
            setCreating(true)
          } else {
            setOpen(!open)
          }
        }}
        className={`flex items-center gap-3 px-4 py-1.5 rounded-full border transition-all min-w-[180px] ${currentPlatform
            ? 'border-card-border hover:border-accent/50 bg-input hover:bg-white/[0.08]'
            : 'border-dashed border-accent/40 hover:border-accent/60 bg-accent/5 hover:bg-accent/10'
          }`}
      >
        {currentPlatform ? (
          <>
            <span className="text-base">{currentPlatform.icon || '🎮'}</span>
            <div className="flex-1 text-left">
              <div className="text-sm font-medium text-white truncate">
                {currentPlatform.name}
              </div>
              <div className="text-xs text-muted">
                {(currentPlatform as any).games_count ?? 0} experiences ·{' '}
                {(currentPlatform as any).assets_count ?? 0} assets
              </div>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-muted ml-1 transition-transform ${open ? 'rotate-180' : ''}`}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </>
        ) : (
          <>
            <span className="w-5 h-5 rounded-md border border-dashed border-accent/40 flex items-center justify-center text-[10px] text-accent">
              +
            </span>
            <span className="text-xs font-semibold text-accent">
              Create Platform
            </span>
          </>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-[280px] z-[999] bg-card border border-card-border rounded-xl shadow-2xl shadow-black/40 overflow-hidden">
          <div className="px-3 pt-2.5 pb-1">
            <span className="text-[10px] font-semibold text-white/40 tracking-wider uppercase">
              Platforms
            </span>
          </div>

          <div className="max-h-[280px] overflow-y-auto">
            {platforms.map((p) => {
              const isActive = currentPlatform && p.id === currentPlatform.id
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setPlatform(p)
                    setOpen(false)
                  }}
                  className={`flex items-center gap-2.5 w-full px-3 py-2.5 text-left transition-colors ${isActive ? 'bg-accent/10' : 'hover:bg-input'
                    }`}
                >
                  <span className="text-base">{p.icon || '🎮'}</span>
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm font-medium truncate"
                      style={{
                        color: isActive ? '#eb8000' : '#e2e8f0',
                      }}
                    >
                      {p.name}
                    </div>
                    <div className="text-xs text-muted">
                      {(p as any).games_count ?? 0} experiences ·{' '}
                      {(p as any).assets_count ?? 0} assets
                    </div>
                  </div>
                  {isActive && (
                    <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-accent" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
