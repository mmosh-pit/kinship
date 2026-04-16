'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useStudio } from '@/lib/studio-context'
import { api } from '@/lib/api'
import PageHeader from '@/components/PageHeader'
import { Card, StatusBadge, EmptyState, Spinner } from '@/components/UI'

export default function GamesPage() {
  const router = useRouter()
  const {
    currentPlatform,
    games,
    gamesLoading,
    gamesError,
    enterGame,
    exitGame,
    handleCreateGame,
    refetchGames,
  } = useStudio()

  // Create modal state
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newIcon, setNewIcon] = useState('🌿')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetCreate = () => {
    setShowCreate(false)
    setNewName('')
    setNewDesc('')
    setNewIcon('🌿')
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
        description: newDesc.trim(),
        icon: newIcon,
        image_url: imageUrl,
        created_by: 'studio-user',
      })
      // Exit the game context to stay on games list page
      exitGame()
      resetCreate()
    } catch (err) {
      setError((err as Error).message || 'Failed to create game')
    } finally {
      setSaving(false)
    }
  }

  const handleEnterGame = (game: (typeof games)[0]) => {
    enterGame(game)
    router.push('/game-editor')
  }

  if (!currentPlatform) {
    return (
      <EmptyState
        icon="🎮"
        title="No platform selected"
        description="Select a platform to view its games."
      />
    )
  }

  return (
    <>
      <PageHeader
        title="Games"
        subtitle={`${games.length} game${games.length !== 1 ? 's' : ''} in ${currentPlatform.name}`}
        action={
          <button
            onClick={() => setShowCreate(true)}
            className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold"
          >
            + New Game
          </button>
        }
      />

      {gamesLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : gamesError ? (
        <EmptyState
          icon="⚠️"
          title="Failed to load games"
          description={gamesError}
          action={
            <button
              onClick={refetchGames}
              className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold"
            >
              Retry
            </button>
          }
        />
      ) : games.length === 0 ? (
        <EmptyState
          icon="🎮"
          title="No games yet"
          description={`Create your first game in ${currentPlatform.name} to get started.`}
          action={
            <button
              onClick={() => setShowCreate(true)}
              className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold"
            >
              + Create Game
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {games.map((game) => (
            <Card key={game.id} hover onClick={() => handleEnterGame(game)}>
              {game.image_url && (
                <div className="h-32 overflow-hidden rounded-t-2xl">
                  <img
                    src={game.image_url}
                    alt={game.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">{game.icon || '🌿'}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-bold text-sm truncate">
                      {game.name}
                    </h3>
                    <StatusBadge status={game.status} />
                  </div>
                </div>

                {game.description && (
                  <p className="text-muted text-xs mb-3 line-clamp-2">
                    {game.description}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-sidebar rounded-xl p-3 text-center">
                    <div className="text-lg font-bold text-accent">
                      {(game as any).scenes_count ?? 0}
                    </div>
                    <div className="text-[10px] text-muted font-medium">
                      Scenes
                    </div>
                  </div>
                  <div className="bg-sidebar rounded-xl p-3 text-center">
                    <div className="text-lg font-bold text-blue-400">
                      {(game as any).quests_count ?? 0}
                    </div>
                    <div className="text-[10px] text-muted font-medium">
                      Quests
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-[10px] text-white/40">
                    Click to enter game →
                  </span>
                </div>
              </div>
            </Card>
          ))}

          {/* Create new card */}
          <div
            onClick={() => setShowCreate(true)}
            className="border border-dashed border-card-border rounded-2xl flex flex-col items-center justify-center p-8 text-center hover:border-accent/40 hover:bg-accent/10 cursor-pointer transition-all"
          >
            <span className="text-3xl mb-2">+</span>
            <span className="text-sm font-semibold text-muted">
              New Game
            </span>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={resetCreate}
          />
          <div className="relative bg-card border border-card-border rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-white font-bold text-lg mb-4">
              Create New Game
            </h3>

            <div className="space-y-3 mb-6">
              <div>
                <label className="text-xs text-white/70 font-semibold block mb-1">
                  Game Name
                </label>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. The Journey"
                  className="w-full bg-input border border-card-border rounded-xl px-4 py-2.5 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50"
                />
              </div>
              <div>
                <label className="text-xs text-white/70 font-semibold block mb-1">
                  Description
                </label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="What is this game about?"
                  rows={2}
                  className="w-full bg-input border border-card-border rounded-xl px-4 py-2.5 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 resize-none"
                />
              </div>
              <div>
                <label className="text-xs text-white/70 font-semibold block mb-1">
                  Icon
                </label>
                <div className="flex gap-2">
                  {['🌿', '🌅', '⛰️', '🌳', '🏝️', '📚', '🎯', '🧘'].map(
                    (emoji) => (
                      <button
                        key={emoji}
                        onClick={() => setNewIcon(emoji)}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all ${
                          newIcon === emoji
                            ? 'bg-accent/20 border border-accent/40 scale-110'
                            : 'bg-white/[0.1] hover:bg-white/[0.1]'
                        }`}
                      >
                        {emoji}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Cover Image Upload */}
              <div>
                <label className="text-xs text-white/70 font-semibold block mb-1">
                  Cover Image
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />
                {imagePreview ? (
                  <div className="relative rounded-xl overflow-hidden">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="w-full h-36 object-cover rounded-xl"
                    />
                    <button
                      onClick={() => {
                        setImageFile(null)
                        setImagePreview(null)
                      }}
                      className="absolute top-2 right-2 w-7 h-7 bg-black/60 text-white rounded-full text-xs flex items-center justify-center hover:bg-black/80 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-6 border border-dashed border-card-border rounded-xl hover:border-accent/40 hover:bg-accent/10 transition-colors flex flex-col items-center gap-1.5"
                  >
                    <span className="text-xl">📷</span>
                    <span className="text-xs text-muted">
                      Click to upload cover image
                    </span>
                    <span className="text-[10px] text-white/40">
                      PNG, JPG up to 10MB
                    </span>
                  </button>
                )}
              </div>
            </div>

            {error && <p className="text-xs text-red-400 mb-4">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={resetCreate}
                disabled={saving}
                className="flex-1 btn bg-white/[0.1] hover:bg-white/[0.1] text-white rounded-xl py-2.5 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !newName.trim()}
                className="flex-1 btn bg-accent hover:bg-accent-dark text-white rounded-xl py-2.5 font-bold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <Spinner size="sm" /> Uploading...
                  </>
                ) : (
                  'Create Game'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
