'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { Card } from '@/components/UI'
import { createPrompt, useSceneOptions, useNPCs } from '@/hooks/useApi'
import { useStudio } from '@/lib/studio-context'
import type { PromptTier, PromptStatus, PromptCreate } from '@/lib/types'

const TIER_OPTIONS: {
  value: PromptTier
  label: string
  description: string
}[] = [
  {
    value: 1,
    label: 'Tier 1 — Global',
    description: 'Applied to all conversations',
  },
  {
    value: 2,
    label: 'Tier 2 — Scene',
    description: 'Applied within specific scenes',
  },
  {
    value: 3,
    label: 'Tier 3 — NPC',
    description: 'Applied to specific NPC conversations',
  },
]

const CATEGORIES = [
  'constitution',
  'behavior',
  'safety',
  'persona',
  'context',
  'instructions',
]

export default function PromptCreatePage() {
  const router = useRouter()
  const { currentPlatform } = useStudio()
  const { data: scenes } = useSceneOptions()
  const { data: npcsResponse } = useNPCs()
  const npcs = npcsResponse?.data || []

  // Form state
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [tier, setTier] = useState<PromptTier>(1)
  const [category, setCategory] = useState('instructions')
  const [sceneType, setSceneType] = useState<string>('')
  const [npcId, setNpcId] = useState<string>('')
  const [priority, setPriority] = useState(100)
  const [isGuardian, setIsGuardian] = useState(false)
  const [status, setStatus] = useState<PromptStatus>('draft')

  // UI state
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Prompt name is required')
      return
    }

    if (!content.trim()) {
      setError('Prompt content is required')
      return
    }

    setSaving(true)
    try {
      const payload: PromptCreate = {
        name: name.trim(),
        content: content.trim(),
        tier,
        category,
        scene_type: tier >= 2 && sceneType ? sceneType : null,
        npc_id: tier === 3 && npcId ? npcId : null,
        priority,
        is_guardian: isGuardian,
        status,
        platform_id: currentPlatform?.id || null,
      }

      const prompt = await createPrompt(payload)
      router.push(`/prompts/${prompt.id}`)
    } catch (err) {
      console.error('Failed to create prompt:', err)
      setError(err instanceof Error ? err.message : 'Failed to create prompt')
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="New Prompt"
        subtitle="Create AI prompt template"
        breadcrumbs={[
          { label: 'Prompts', href: '/prompts' },
          { label: 'Create' },
        ]}
        action={
          <div className="flex gap-3">
            <Link
              href="/prompts"
              className="btn bg-white/[0.1] hover:bg-white/[0.1] text-white border-0 rounded-xl px-5 py-2.5"
            >
              Cancel
            </Link>
            <button
              onClick={handleSubmit}
              disabled={saving || !name.trim() || !content.trim()}
              className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold px-5 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : '💾 Save Prompt'}
            </button>
          </div>
        }
      />

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
          <svg
            className="w-5 h-5 text-red-400 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-300"
          >
            ×
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="col-span-2 space-y-6">
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <span className="text-xl">📝</span> Prompt Details
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Global Safety Rules"
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Content <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={15}
                    placeholder="You are an AI assistant for a wellness application..."
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 resize-none font-mono"
                  />
                  <p className="text-white/40 text-xs mt-2">
                    Supports variables: {'{{user_name}}'}, {'{{scene_name}}'},{' '}
                    {'{{npc_name}}'}, {'{{hearts_score}}'}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <span className="text-xl">🎯</span> Tier Selection
              </h3>
              <div className="grid grid-cols-3 gap-4">
                {TIER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTier(opt.value)}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      tier === opt.value
                        ? 'border-accent/50 bg-accent/10'
                        : 'border-card-border bg-sidebar/40 hover:border-card-border'
                    }`}
                  >
                    <p className="text-white font-medium text-sm">
                      {opt.label}
                    </p>
                    <p className="text-muted text-xs mt-1">
                      {opt.description}
                    </p>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4">Configuration</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                {tier >= 2 && (
                  <div>
                    <label className="text-white/70 text-sm block mb-2">
                      Scene Type
                    </label>
                    <select
                      value={sceneType}
                      onChange={(e) => setSceneType(e.target.value)}
                      className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50"
                    >
                      <option value="">All scenes</option>
                      {scenes?.map((scene) => (
                        <option key={scene.id} value={scene.scene_type}>
                          {scene.scene_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {tier === 3 && (
                  <div>
                    <label className="text-white/70 text-sm block mb-2">
                      NPC
                    </label>
                    <select
                      value={npcId}
                      onChange={(e) => setNpcId(e.target.value)}
                      className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50"
                    >
                      <option value="">Select NPC</option>
                      {npcs?.map((npc) => (
                        <option key={npc.id} value={npc.id}>
                          {npc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Priority
                  </label>
                  <input
                    type="number"
                    value={priority}
                    onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
                    min={0}
                    max={1000}
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50"
                  />
                  <p className="text-white/40 text-xs mt-1">
                    Higher = runs first
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="isGuardian"
                    checked={isGuardian}
                    onChange={(e) => setIsGuardian(e.target.checked)}
                    className="w-4 h-4 rounded border-white/[0.15] bg-sidebar text-accent focus:ring-accent"
                  />
                  <label htmlFor="isGuardian" className="text-white/70 text-sm">
                    🛡️ Guardian Prompt
                  </label>
                </div>

                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Status
                  </label>
                  <div className="flex gap-2">
                    {(['draft', 'active'] as PromptStatus[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatus(s)}
                        className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all capitalize ${
                          status === s
                            ? s === 'active'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-accent/15 text-accent border border-amber-500/30'
                            : 'bg-sidebar text-white/70 border border-card-border'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-card/30">
              <h3 className="text-white font-bold mb-3">💡 Tips</h3>
              <ul className="text-white/70 text-sm space-y-2">
                <li>• Tier 1 prompts apply globally</li>
                <li>• Tier 2 prompts apply to specific scenes</li>
                <li>• Tier 3 prompts apply to specific NPCs</li>
                <li>• Higher priority runs first</li>
                <li>• Guardian prompts enforce safety rules</li>
              </ul>
            </Card>
          </div>
        </div>
      </form>
    </>
  )
}
