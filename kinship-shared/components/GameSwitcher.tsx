'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useStudio } from '@/lib/studio-context'
import { api } from '@/lib/api'
import { Spinner } from './UI'

export default function GameSwitcher() {
  const router = useRouter()
  const {
    currentGame,
    games,
    gamesLoading,
    enterGame,
    exitGame,
    handleCreateGame,
    currentPlatform,
  } = useStudio()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        resetCreate()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const resetCreate = () => {
    setCreating(false)
    setNewName('')
    setNewDesc('')
    setImageFile(null)
    setImagePreview(null)
    setError('')
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10MB')
      return
    }
    setImageFile(file)
    setError('')
    const reader = new FileReader()
    reader.onload = (ev) => setImagePreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleCreate = async () => {
    if (!newName.trim() || !currentPlatform) return
    setSaving(true)
    setError('')
    try {
      // Upload image first if provided
      let imageUrl: string | undefined
      if (imageFile) {
        const uploadResult = await api.uploadFile(imageFile, 'games')
        imageUrl = uploadResult.file_url
      }

      await handleCreateGame({
        platform_id: currentPlatform.id,
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        image_url: imageUrl,
        created_by: 'studio-user',
      })
      resetCreate()
      setOpen(false)
      router.push('/game-editor')
    } catch (err) {
      setError((err as Error).message || 'Failed to create game')
    } finally {
      setSaving(false)
    }
  }

  if (!currentGame) return null

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2.5">
        <div className="w-px h-5 bg-white/[0.12]" />
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-full border border-accent/20 hover:border-accent/40 bg-accent/5 hover:bg-accent/10 transition-all min-w-[170px]"
        >
          {currentGame.image_url ? (
            <img
              src={currentGame.image_url}
              alt=""
              className="w-6 h-6 rounded-md object-cover shrink-0"
            />
          ) : (
            <span className="text-sm">{currentGame.icon || '🌿'}</span>
          )}
          <div className="flex-1 text-left">
            <div className="text-sm font-medium text-accent truncate">
              {currentGame.name}
            </div>
            <div className="text-xs text-muted">
              {(currentGame as any).scenes_count ?? 0} scenes ·{' '}
              {currentGame.status}
            </div>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="absolute top-full right-0 mt-1.5 w-[260px] z-[999] bg-card border border-card-border rounded-xl shadow-2xl shadow-black/40 overflow-hidden">
          {/* Back to platform */}
          <button
            onClick={() => {
              exitGame()
              setOpen(false)
            }}
            className="flex items-center gap-2 w-full px-3 py-2.5 text-left text-xs font-medium text-muted hover:text-white hover:bg-input border-b border-card-border transition-colors"
          >
            <span>←</span>
            <span>Back to {currentPlatform?.name || 'Platform'}</span>
          </button>

          <div className="px-3 pt-2.5 pb-1">
            <span className="text-[10px] font-semibold text-white/40 tracking-wider uppercase">
              Games
            </span>
          </div>

          <div className="max-h-[250px] overflow-y-auto">
            {gamesLoading && (
              <div className="flex items-center justify-center py-4">
                <Spinner size="sm" />
              </div>
            )}
            {games.map((g) => {
              const isActive = g.id === currentGame.id
              return (
                <button
                  key={g.id}
                  onClick={() => {
                    enterGame(g)
                    setOpen(false)
                    router.push('/game-editor')
                  }}
                  className={`flex items-center gap-2.5 w-full px-3 py-2.5 text-left transition-colors ${
                    isActive ? 'bg-accent/10' : 'hover:bg-input'
                  }`}
                >
                  {g.image_url ? (
                    <img
                      src={g.image_url}
                      alt=""
                      className="w-8 h-8 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <span className="text-sm">{g.icon || '🌿'}</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-sm font-medium truncate ${isActive ? 'text-accent' : 'text-white'}`}
                    >
                      {g.name}
                    </div>
                    <div className="text-xs text-muted">
                      {(g as any).scenes_count ?? 0} scenes
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      g.status === 'published'
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-accent/15 text-accent'
                    }`}
                  >
                    {g.status}
                  </span>
                </button>
              )
            })}
          </div>

          {/* New Game */}
          <div className="border-t border-card-border p-1.5">
            {creating ? (
              <div className="px-2 py-1.5">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Game name..."
                  className="w-full bg-input border border-card-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50 mb-2"
                />
                <input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate()
                    if (e.key === 'Escape') resetCreate()
                  }}
                  placeholder="Description (optional)..."
                  className="w-full bg-input border border-card-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50 mb-2"
                />
                {/* Image Upload */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />
                {imagePreview ? (
                  <div className="relative mb-2 rounded-lg overflow-hidden">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="w-full h-20 object-cover rounded-lg"
                    />
                    <button
                      onClick={() => {
                        setImageFile(null)
                        setImagePreview(null)
                      }}
                      className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-black/80"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2 mb-2 text-xs font-medium text-muted border border-dashed border-card-border rounded-lg hover:border-white/20 hover:text-white/70 transition-colors"
                  >
                    📷 Add Cover Image
                  </button>
                )}
                {error && (
                  <p className="text-xs text-red-400 mb-2">{error}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={resetCreate}
                    disabled={saving}
                    className="flex-1 py-1.5 text-xs font-medium text-muted rounded-lg hover:bg-input"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={saving || !newName.trim()}
                    className="flex-1 py-1.5 text-xs font-semibold text-accent bg-accent/15 rounded-lg hover:bg-accent/25 disabled:opacity-40 flex items-center justify-center gap-1.5"
                  >
                    {saving ? <Spinner size="sm" /> : 'Create'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg hover:bg-accent/10 transition-colors"
              >
                <span className="w-5 h-5 rounded-md border border-dashed border-accent/40 flex items-center justify-center text-[10px] text-accent">
                  +
                </span>
                <span className="text-sm font-medium text-accent">
                  New Game
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
