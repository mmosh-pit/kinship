'use client'

import { useState, useEffect, useMemo, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { Card, StatusBadge, FacetBadge } from '@/components/UI'
import { HEARTS_FACETS, getExistingSceneTypes } from '@/lib/data'
import {
  useScene,
  useSceneManifest,
  useNPCs,
  useQuests,
  useChallenges,
  useAssets,
  updateScene,
  deleteScene,
  addAssetToScene,
  removeAssetFromScene,
  updateNPC,
  updateQuest,
  updateChallenge,
} from '@/hooks/useApi'

type TabType = 'basics' | 'npcs' | 'quests' | 'challenges' | 'assets' | 'prompt'
type Lighting = 'day' | 'night' | 'dawn' | 'dusk'
type Weather = 'clear' | 'rain' | 'fog' | 'snow'

export default function SceneEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { data: scene, loading, error } = useScene(id)
  const { data: manifestData } = useSceneManifest(id)
  const [activeTab, setActiveTab] = useState<TabType>('basics')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Form state
  const [name, setName] = useState('')
  const [sceneType, setSceneType] = useState('')
  const [description, setDescription] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [lighting, setLighting] = useState<Lighting>('day')
  const [weather, setWeather] = useState<Weather>('clear')
  const [isActive, setIsActive] = useState(true)

  // Selected entities
  const [selectedNpcs, setSelectedNpcs] = useState<string[]>([])
  const [selectedQuests, setSelectedQuests] = useState<string[]>([])
  const [selectedChallenges, setSelectedChallenges] = useState<string[]>([])
  const [selectedAssets, setSelectedAssets] = useState<string[]>([])

  // Initial values for comparison
  const [initialNpcs, setInitialNpcs] = useState<string[]>([])
  const [initialQuests, setInitialQuests] = useState<string[]>([])
  const [initialChallenges, setInitialChallenges] = useState<string[]>([])
  const [initialAssets, setInitialAssets] = useState<string[]>([])

  // Search states
  const [npcSearch, setNpcSearch] = useState('')
  const [questSearch, setQuestSearch] = useState('')
  const [challengeSearch, setChallengeSearch] = useState('')
  const [assetSearch, setAssetSearch] = useState('')

  // Pagination states
  const [npcPage, setNpcPage] = useState(1)
  const [questPage, setQuestPage] = useState(1)
  const [challengePage, setChallengePage] = useState(1)
  const [assetPage, setAssetPage] = useState(1)
  const itemsPerPage = 10

  // Preview mode
  const [previewMode, setPreviewMode] = useState<'portrait' | 'landscape'>(
    'portrait'
  )

  // Autocomplete
  const [showSuggestions, setShowSuggestions] = useState(false)
  const existingTypes = getExistingSceneTypes()
  const filteredSuggestions = existingTypes.filter(
    (t) => t.toLowerCase().includes(sceneType.toLowerCase()) && t !== sceneType
  )

  // Fetch entities
  const { data: allNpcsResponse } = useNPCs()
  const { data: allQuests } = useQuests()
  const { data: allChallengesResponse } = useChallenges()
  const { data: allAssets } = useAssets({ limit: 100 })
  const allNpcs = allNpcsResponse?.data || []
  const allChallenges = allChallengesResponse?.data || []

  // Initialize form
  useEffect(() => {
    if (scene) {
      setName(scene.scene_name || scene.name || '')
      setSceneType(scene.scene_type || '')
      setDescription(scene.description || '')
      setSystemPrompt(scene.system_prompt || '')
      setLighting(scene.ambient?.lighting || 'day')
      setWeather(normalizeWeather(scene.ambient?.weather))
      setIsActive(scene.is_active !== false)
    }
  }, [scene])

  // Initialize selected NPCs
  useEffect(() => {
    if (allNpcs) {
      const ids = allNpcs.filter((n) => n.scene_id === id).map((n) => n.id)
      setSelectedNpcs(ids)
      setInitialNpcs(ids)
    }
  }, [allNpcs, id])

  // Initialize selected Quests
  useEffect(() => {
    if (allQuests) {
      const ids = allQuests.filter((q) => q.scene_id === id).map((q) => q.id)
      setSelectedQuests(ids)
      setInitialQuests(ids)
    }
  }, [allQuests, id])

  // Initialize selected Challenges
  useEffect(() => {
    if (allChallenges) {
      const ids = allChallenges
        .filter((c) => c.scene_id === id)
        .map((c) => c.id)
      setSelectedChallenges(ids)
      setInitialChallenges(ids)
    }
  }, [allChallenges, id])

  // Initialize selected Assets
  useEffect(() => {
    if (manifestData?.assets) {
      const ids = manifestData.assets.map((a) => a.id)
      setSelectedAssets(ids)
      setInitialAssets(ids)
    }
  }, [manifestData])

  // Filter and paginate NPCs
  const filteredNpcs = useMemo(() => {
    if (!allNpcs) return []
    if (!npcSearch.trim()) return allNpcs
    const search = npcSearch.toLowerCase()
    return allNpcs.filter(
      (n) =>
        n.name?.toLowerCase().includes(search) ||
        n.role?.toLowerCase().includes(search)
    )
  }, [allNpcs, npcSearch])

  const paginatedNpcs = useMemo(
    () =>
      filteredNpcs.slice((npcPage - 1) * itemsPerPage, npcPage * itemsPerPage),
    [filteredNpcs, npcPage]
  )
  const totalNpcPages = Math.ceil(filteredNpcs.length / itemsPerPage)

  // Filter and paginate Quests
  const filteredQuests = useMemo(() => {
    if (!allQuests) return []
    if (!questSearch.trim()) return allQuests
    const search = questSearch.toLowerCase()
    return allQuests.filter(
      (q) =>
        q.name?.toLowerCase().includes(search) ||
        q.description?.toLowerCase().includes(search)
    )
  }, [allQuests, questSearch])

  const paginatedQuests = useMemo(
    () =>
      filteredQuests.slice(
        (questPage - 1) * itemsPerPage,
        questPage * itemsPerPage
      ),
    [filteredQuests, questPage]
  )
  const totalQuestPages = Math.ceil(filteredQuests.length / itemsPerPage)

  // Filter and paginate Challenges
  const filteredChallenges = useMemo(() => {
    if (!allChallenges) return []
    if (!challengeSearch.trim()) return allChallenges
    const search = challengeSearch.toLowerCase()
    return allChallenges.filter(
      (c) =>
        c.name?.toLowerCase().includes(search) ||
        c.description?.toLowerCase().includes(search)
    )
  }, [allChallenges, challengeSearch])

  const paginatedChallenges = useMemo(
    () =>
      filteredChallenges.slice(
        (challengePage - 1) * itemsPerPage,
        challengePage * itemsPerPage
      ),
    [filteredChallenges, challengePage]
  )
  const totalChallengePages = Math.ceil(
    filteredChallenges.length / itemsPerPage
  )

  // Filter and paginate Assets
  const filteredAssets = useMemo(() => {
    if (!allAssets?.data) return []
    if (!assetSearch.trim()) return allAssets.data
    const search = assetSearch.toLowerCase()
    return allAssets.data.filter(
      (a) =>
        a.name?.toLowerCase().includes(search) ||
        a.display_name?.toLowerCase().includes(search)
    )
  }, [allAssets, assetSearch])

  const paginatedAssets = useMemo(
    () => filteredAssets.slice((assetPage - 1) * 20, assetPage * 20),
    [filteredAssets, assetPage]
  )
  const totalAssetPages = Math.ceil(filteredAssets.length / 20)

  const toggleNpc = (npcId: string) =>
    setSelectedNpcs((prev) =>
      prev.includes(npcId) ? prev.filter((n) => n !== npcId) : [...prev, npcId]
    )
  const toggleQuest = (questId: string) =>
    setSelectedQuests((prev) =>
      prev.includes(questId)
        ? prev.filter((q) => q !== questId)
        : [...prev, questId]
    )
  const toggleChallenge = (challengeId: string) =>
    setSelectedChallenges((prev) =>
      prev.includes(challengeId)
        ? prev.filter((c) => c !== challengeId)
        : [...prev, challengeId]
    )
  const toggleAsset = (assetId: string) =>
    setSelectedAssets((prev) =>
      prev.includes(assetId)
        ? prev.filter((a) => a !== assetId)
        : [...prev, assetId]
    )

  const getAssetImageUrl = (asset: any) =>
    asset.thumbnail_url || asset.file_url || null

  const normalizeWeather = (w?: string): Weather => {
    if (w === 'rain' || w === 'fog' || w === 'snow' || w === 'clear') {
      return w
    }
    return 'clear'
  }

  const handleSave = async () => {
    if (!name.trim()) {
      setFormError('Scene name is required')
      return
    }

    setSaving(true)
    setFormError('')

    try {
      await updateScene(id, {
        scene_name: name,
        scene_type: sceneType || undefined,
        ambient: { lighting, weather },
        system_prompt: systemPrompt || null,
        is_active: isActive,
      })

      // Update Assets
      const assetsToAdd = selectedAssets.filter(
        (a) => !initialAssets.includes(a)
      )
      const assetsToRemove = initialAssets.filter(
        (a) => !selectedAssets.includes(a)
      )
      for (const assetId of assetsToAdd) {
        try {
          await addAssetToScene(id, assetId)
        } catch (e) {
          console.error(e)
        }
      }
      for (const assetId of assetsToRemove) {
        try {
          await removeAssetFromScene(id, assetId)
        } catch (e) {
          console.error(e)
        }
      }

      // Update NPCs
      const npcsToAdd = selectedNpcs.filter((n) => !initialNpcs.includes(n))
      const npcsToRemove = initialNpcs.filter((n) => !selectedNpcs.includes(n))
      for (const npcId of npcsToAdd) {
        try {
          await updateNPC(npcId, { scene_id: id })
        } catch (e) {
          console.error(e)
        }
      }
      for (const npcId of npcsToRemove) {
        try {
          await updateNPC(npcId, { scene_id: null })
        } catch (e) {
          console.error(e)
        }
      }

      // Update Quests
      const questsToAdd = selectedQuests.filter(
        (q) => !initialQuests.includes(q)
      )
      const questsToRemove = initialQuests.filter(
        (q) => !selectedQuests.includes(q)
      )
      for (const questId of questsToAdd) {
        try {
          await updateQuest(questId, { scene_id: id })
        } catch (e) {
          console.error(e)
        }
      }
      for (const questId of questsToRemove) {
        try {
          await updateQuest(questId, { scene_id: null })
        } catch (e) {
          console.error(e)
        }
      }

      // Update Challenges
      const challengesToAdd = selectedChallenges.filter(
        (c) => !initialChallenges.includes(c)
      )
      const challengesToRemove = initialChallenges.filter(
        (c) => !selectedChallenges.includes(c)
      )
      for (const challengeId of challengesToAdd) {
        try {
          await updateChallenge(challengeId, { scene_id: id })
        } catch (e) {
          console.error(e)
        }
      }
      for (const challengeId of challengesToRemove) {
        try {
          await updateChallenge(challengeId, { scene_id: null })
        } catch (e) {
          console.error(e)
        }
      }

      router.push(`/scenes/${id}`)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this scene?')) return
    try {
      await deleteScene(id)
      router.push('/scenes')
    } catch (err) {
      console.error(err)
    }
  }

  const normalizeLighting = (l?: string): Lighting => {
    if (l === 'day' || l === 'night' || l === 'dawn' || l === 'dusk') {
      return l
    }
    return 'day'
  }

  const tabs: { key: TabType; label: string; icon: string; count?: number }[] =
    [
      { key: 'basics', label: 'Basics', icon: '⚙️' },
      { key: 'npcs', label: 'NPCs', icon: '🧑', count: selectedNpcs.length },
      {
        key: 'quests',
        label: 'Quests',
        icon: '⚔️',
        count: selectedQuests.length,
      },
      {
        key: 'challenges',
        label: 'Challenges',
        icon: '⚡',
        count: selectedChallenges.length,
      },
      {
        key: 'assets',
        label: 'Assets',
        icon: '📦',
        count: selectedAssets.length,
      },
      { key: 'prompt', label: 'Prompt', icon: '💬' },
    ]

  const Pagination = ({
    page,
    totalPages,
    setPage,
  }: {
    page: number
    totalPages: number
    setPage: (p: number) => void
  }) =>
    totalPages > 1 ? (
      <div className="flex items-center justify-center gap-2 pt-3 border-t border-card-border">
        <button
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page === 1}
          className="px-3 py-1 rounded-lg bg-card text-white/70 text-sm disabled:opacity-30 hover:bg-white/[0.1]"
        >
          ←
        </button>
        <span className="text-muted text-sm">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => setPage(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="px-3 py-1 rounded-lg bg-card text-white/70 text-sm disabled:opacity-30 hover:bg-white/[0.1]"
        >
          →
        </button>
      </div>
    ) : null

  if (loading)
    return (
      <>
        <PageHeader
          title="Loading..."
          breadcrumbs={[{ label: 'Scenes', href: '/scenes' }]}
        />
        <Card className="p-6 animate-pulse bg-input h-48">
          <></>
        </Card>
      </>
    )
  if (error || !scene)
    return (
      <>
        <PageHeader
          title="Not Found"
          breadcrumbs={[{ label: 'Scenes', href: '/scenes' }]}
        />
        <Card className="p-8 text-center">
          <p className="text-red-400">{error || 'Scene not found'}</p>
        </Card>
      </>
    )

  return (
    <>
      <PageHeader
        title={`Edit: ${scene.scene_name || scene.name}`}
        breadcrumbs={[
          { label: 'Scenes', href: '/scenes' },
          {
            label: scene.scene_name || scene.name || 'Scene',
            href: `/scenes/${id}`,
          },
          { label: 'Edit' },
        ]}
        action={
          <div className="flex gap-2">
            <Link
              href={`/builder?scene=${id}`}
              className="btn bg-purple-600 hover:bg-purple-500 text-white border-0 rounded-xl font-bold"
            >
              🎨 Visual Edit
            </Link>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold disabled:opacity-50"
            >
              {saving ? 'Saving...' : '💾 Save'}
            </button>
          </div>
        }
      />

      {formError && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
          <p className="text-red-400 text-sm">{formError}</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 bg-input p-1 rounded-xl flex-wrap">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-accent text-white' : 'text-white/70 hover:text-white hover:bg-input'}`}
              >
                <span>{tab.icon}</span>
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? 'bg-sidebar/30' : 'bg-accent/20 text-accent'}`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Basics */}
          {activeTab === 'basics' && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4">Scene Properties</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Scene Name *
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50"
                  />
                </div>
                <div className="relative">
                  <label className="text-white/70 text-sm block mb-2">
                    Scene Type
                  </label>
                  <input
                    type="text"
                    value={sceneType}
                    onChange={(e) => {
                      setSceneType(e.target.value)
                      setShowSuggestions(true)
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() =>
                      setTimeout(() => setShowSuggestions(false), 200)
                    }
                    placeholder="gym, garden, farm..."
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50"
                  />
                  {showSuggestions && filteredSuggestions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-card border border-card-border rounded-xl overflow-hidden shadow-xl max-h-48 overflow-y-auto">
                      {filteredSuggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onMouseDown={() => {
                            setSceneType(s)
                            setShowSuggestions(false)
                          }}
                          className="w-full text-left px-4 py-2.5 text-white text-sm hover:bg-white/[0.1]"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-white/70 text-sm block mb-2">
                      Lighting
                    </label>
                    <select
                      value={lighting}
                      onChange={(e) =>
                        setLighting(normalizeLighting(e.target.value))
                      }
                      className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm"
                    >
                      <option value="day">Day</option>
                      <option value="night">Night</option>
                      <option value="dawn">Dawn</option>
                      <option value="dusk">Dusk</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-white/70 text-sm block mb-2">
                      Weather
                    </label>
                    <select
                      value={weather}
                      onChange={(e) =>
                        setWeather(normalizeWeather(e.target.value))
                      }
                      className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm"
                    >
                      <option value="clear">Clear</option>
                      <option value="rain">Rain</option>
                      <option value="fog">Fog</option>
                      <option value="snow">Snow</option>
                    </select>
                  </div>
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="checkbox checkbox-sm checkbox-accent"
                  />
                  <span className="text-white/70 text-sm">Scene is active</span>
                </label>
              </div>
            </Card>
          )}

          {/* NPCs */}
          {activeTab === 'npcs' && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-bold">
                  🧑 NPCs ({filteredNpcs.length})
                </h3>
                <Link
                  href="/npcs/create"
                  className="text-accent text-sm hover:underline"
                >
                  + Create
                </Link>
              </div>
              <input
                type="text"
                value={npcSearch}
                onChange={(e) => {
                  setNpcSearch(e.target.value)
                  setNpcPage(1)
                }}
                placeholder="Search NPCs..."
                className="w-full bg-input border border-card-border rounded-xl px-4 py-2 text-white text-sm mb-4 placeholder:text-muted focus:outline-none focus:border-accent/50"
              />
              {selectedNpcs.length > 0 && (
                <p className="text-accent text-sm mb-3">
                  ✓ {selectedNpcs.length} selected
                </p>
              )}
              {paginatedNpcs.length > 0 ? (
                <div className="space-y-2 max-h-[350px] overflow-y-auto">
                  {paginatedNpcs.map((npc) => (
                    <label
                      key={npc.id}
                      className={`flex items-center gap-4 rounded-xl px-4 py-3 cursor-pointer transition-colors ${selectedNpcs.includes(npc.id) ? 'bg-accent/15 border border-accent/30' : 'bg-sidebar hover:bg-sidebar/80'}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedNpcs.includes(npc.id)}
                        onChange={() => toggleNpc(npc.id)}
                        className="checkbox checkbox-sm checkbox-accent"
                      />
                      <div className="w-10 h-10 rounded-full bg-card flex items-center justify-center text-lg">
                        🧑
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">
                          {npc.name}
                        </p>
                        <p className="text-muted text-xs truncate">
                          {npc.role}
                        </p>
                      </div>
                      {npc.facet && <FacetBadge facet={npc.facet} />}
                      <StatusBadge status={npc.status || 'draft'} />
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-white/40 text-sm py-4 text-center">
                  {npcSearch ? 'No match' : 'No NPCs'}
                </p>
              )}
              <Pagination
                page={npcPage}
                totalPages={totalNpcPages}
                setPage={setNpcPage}
              />
            </Card>
          )}

          {/* Quests */}
          {activeTab === 'quests' && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-bold">
                  ⚔️ Quests ({filteredQuests.length})
                </h3>
                <Link
                  href="/quests/create"
                  className="text-accent text-sm hover:underline"
                >
                  + Create
                </Link>
              </div>
              <input
                type="text"
                value={questSearch}
                onChange={(e) => {
                  setQuestSearch(e.target.value)
                  setQuestPage(1)
                }}
                placeholder="Search Quests..."
                className="w-full bg-input border border-card-border rounded-xl px-4 py-2 text-white text-sm mb-4 placeholder:text-muted focus:outline-none focus:border-accent/50"
              />
              {selectedQuests.length > 0 && (
                <p className="text-accent text-sm mb-3">
                  ✓ {selectedQuests.length} selected
                </p>
              )}
              {paginatedQuests.length > 0 ? (
                <div className="space-y-2 max-h-[350px] overflow-y-auto">
                  {paginatedQuests.map((quest) => (
                    <label
                      key={quest.id}
                      className={`flex items-center gap-4 rounded-xl px-4 py-3 cursor-pointer transition-colors ${selectedQuests.includes(quest.id) ? 'bg-accent/15 border border-accent/30' : 'bg-sidebar hover:bg-sidebar/80'}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedQuests.includes(quest.id)}
                        onChange={() => toggleQuest(quest.id)}
                        className="checkbox checkbox-sm checkbox-accent"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">
                          {quest.name}
                        </p>
                        <p className="text-muted text-xs truncate">
                          {quest.description}
                        </p>
                      </div>
                      {quest.facet && <FacetBadge facet={quest.facet} />}
                      <StatusBadge status={quest.status || 'draft'} />
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-white/40 text-sm py-4 text-center">
                  {questSearch ? 'No match' : 'No quests'}
                </p>
              )}
              <Pagination
                page={questPage}
                totalPages={totalQuestPages}
                setPage={setQuestPage}
              />
            </Card>
          )}

          {/* Challenges */}
          {activeTab === 'challenges' && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-bold">
                  ⚡ Challenges ({filteredChallenges.length})
                </h3>
                <Link
                  href="/challenges/create"
                  className="text-accent text-sm hover:underline"
                >
                  + Create
                </Link>
              </div>
              <input
                type="text"
                value={challengeSearch}
                onChange={(e) => {
                  setChallengeSearch(e.target.value)
                  setChallengePage(1)
                }}
                placeholder="Search Challenges..."
                className="w-full bg-input border border-card-border rounded-xl px-4 py-2 text-white text-sm mb-4 placeholder:text-muted focus:outline-none focus:border-accent/50"
              />
              {selectedChallenges.length > 0 && (
                <p className="text-accent text-sm mb-3">
                  ✓ {selectedChallenges.length} selected
                </p>
              )}
              {paginatedChallenges.length > 0 ? (
                <div className="space-y-2 max-h-[350px] overflow-y-auto">
                  {paginatedChallenges.map((ch) => (
                    <label
                      key={ch.id}
                      className={`flex items-center gap-4 rounded-xl px-4 py-3 cursor-pointer transition-colors ${selectedChallenges.includes(ch.id) ? 'bg-accent/15 border border-accent/30' : 'bg-sidebar hover:bg-sidebar/80'}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedChallenges.includes(ch.id)}
                        onChange={() => toggleChallenge(ch.id)}
                        className="checkbox checkbox-sm checkbox-accent"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">
                          {ch.name}
                        </p>
                        <p className="text-muted text-xs truncate">
                          {ch.description}
                        </p>
                      </div>
                      {ch.difficulty && (
                        <span className="text-white/40 text-xs bg-card px-2 py-0.5 rounded-full">
                          {ch.difficulty}
                        </span>
                      )}
                      {ch.facets?.map((f) => (
                        <FacetBadge key={f} facet={f} />
                      ))}
                      <StatusBadge status={ch.status || 'draft'} />
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-white/40 text-sm py-4 text-center">
                  {challengeSearch ? 'No match' : 'No challenges'}
                </p>
              )}
              <Pagination
                page={challengePage}
                totalPages={totalChallengePages}
                setPage={setChallengePage}
              />
            </Card>
          )}

          {/* Assets */}
          {activeTab === 'assets' && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-bold">
                  📦 Assets ({filteredAssets.length})
                </h3>
                <Link
                  href="/assets/upload"
                  className="text-accent text-sm hover:underline"
                >
                  + Upload
                </Link>
              </div>
              <input
                type="text"
                value={assetSearch}
                onChange={(e) => {
                  setAssetSearch(e.target.value)
                  setAssetPage(1)
                }}
                placeholder="Search assets..."
                className="w-full bg-input border border-card-border rounded-xl px-4 py-2 text-white text-sm mb-4 placeholder:text-muted focus:outline-none focus:border-accent/50"
              />
              {selectedAssets.length > 0 && (
                <p className="text-accent text-sm mb-3">
                  ✓ {selectedAssets.length} selected
                </p>
              )}
              {paginatedAssets.length > 0 ? (
                <>
                  <div className="grid grid-cols-5 gap-3 mb-4">
                    {paginatedAssets.map((asset) => {
                      const imageUrl = getAssetImageUrl(asset)
                      return (
                        <label
                          key={asset.id}
                          className={`rounded-xl p-2 cursor-pointer transition-all ${selectedAssets.includes(asset.id) ? 'bg-accent/20 border-2 border-accent ring-2 ring-accent/30' : 'bg-sidebar hover:bg-card border-2 border-transparent'}`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedAssets.includes(asset.id)}
                            onChange={() => toggleAsset(asset.id)}
                            className="hidden"
                          />
                          <div className="w-full aspect-square rounded-lg bg-card flex items-center justify-center mb-2 overflow-hidden relative">
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={asset.display_name || asset.name}
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <span className="text-2xl opacity-40">📦</span>
                            )}
                            {selectedAssets.includes(asset.id) && (
                              <div className="absolute top-1 right-1 w-5 h-5 bg-accent rounded-full flex items-center justify-center">
                                <span className="text-white text-xs">✓</span>
                              </div>
                            )}
                          </div>
                          <p className="text-white/70 text-[10px] truncate text-center">
                            {asset.display_name || asset.name}
                          </p>
                        </label>
                      )
                    })}
                  </div>
                  <Pagination
                    page={assetPage}
                    totalPages={totalAssetPages}
                    setPage={setAssetPage}
                  />
                </>
              ) : (
                <p className="text-white/40 text-sm py-4 text-center">
                  {assetSearch ? 'No match' : 'No assets'}
                </p>
              )}
            </Card>
          )}

          {/* System Prompt */}
          {activeTab === 'prompt' && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4">💬 System Prompt</h3>
              <p className="text-muted text-sm mb-4">
                Guides AI during gameplay for this scene.
              </p>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={14}
                placeholder="Describe atmosphere, NPC behaviors, interactions, target facets..."
                className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 resize-none leading-relaxed"
              />
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Mobile Preview */}
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
              <h3 className="text-white font-bold text-sm">📱 Preview</h3>
              <div className="flex gap-1">
                <button
                  onClick={() => setPreviewMode('portrait')}
                  className={`px-2 py-1 rounded text-xs ${previewMode === 'portrait' ? 'bg-accent text-white' : 'bg-card text-white/70'}`}
                >
                  P
                </button>
                <button
                  onClick={() => setPreviewMode('landscape')}
                  className={`px-2 py-1 rounded text-xs ${previewMode === 'landscape' ? 'bg-accent text-white' : 'bg-card text-white/70'}`}
                >
                  L
                </button>
              </div>
            </div>
            <div className="p-3 bg-sidebar/40 flex justify-center">
              <div
                className={`bg-background rounded-2xl border-4 border-card-border overflow-hidden ${previewMode === 'portrait' ? 'w-[140px] h-[250px]' : 'w-[250px] h-[140px]'}`}
              >
                <div
                  className={`bg-background flex justify-center ${previewMode === 'portrait' ? 'h-5' : 'h-3'}`}
                >
                  <div className="w-12 h-3 bg-card rounded-b-lg" />
                </div>
                <div
                  className={`relative ${previewMode === 'portrait' ? 'h-[225px]' : 'h-[125px]'} bg-gradient-to-br ${lighting === 'night' ? 'from-indigo-950 to-[#050824]' : lighting === 'dawn' ? 'from-orange-900/50 to-[#050824]' : lighting === 'dusk' ? 'from-purple-900/50 to-[#050824]' : 'from-sky-800/30 to-[#050824]'}`}
                >
                  {weather === 'rain' && (
                    <div
                      className="absolute inset-0 opacity-20"
                      style={{
                        background:
                          'repeating-linear-gradient(180deg, transparent, transparent 3px, rgba(100,149,237,0.5) 3px, rgba(100,149,237,0.5) 4px)',
                      }}
                    />
                  )}
                  {weather === 'fog' && (
                    <div className="absolute inset-0 bg-white/[0.15]" />
                  )}
                  {selectedAssets.length > 0 ? (
                    <div
                      className={`absolute inset-1 grid gap-0.5 ${previewMode === 'portrait' ? 'grid-cols-3 grid-rows-4' : 'grid-cols-5 grid-rows-2'}`}
                    >
                      {selectedAssets
                        .slice(0, previewMode === 'portrait' ? 12 : 10)
                        .map((assetId) => {
                          const asset = allAssets?.data?.find(
                            (a) => a.id === assetId
                          )
                          const url = asset ? getAssetImageUrl(asset) : null
                          return (
                            <div
                              key={assetId}
                              className="bg-card/30 rounded flex items-center justify-center overflow-hidden"
                            >
                              {url ? (
                                <img
                                  src={url}
                                  alt=""
                                  className="w-full h-full object-contain"
                                />
                              ) : (
                                <span className="text-[6px] opacity-40">
                                  📦
                                </span>
                              )}
                            </div>
                          )
                        })}
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl opacity-30">🎮</span>
                    </div>
                  )}
                  <div className="absolute bottom-1 left-1 right-1 bg-sidebar/80 rounded p-1">
                    <p className="text-white text-[7px] truncate">
                      {name || 'Scene'}
                    </p>
                    <p className="text-white/70 text-[5px]">
                      {selectedAssets.length} assets
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Summary */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">Summary</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Name</span>
                <span className="text-white truncate max-w-[100px]">
                  {name || '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Type</span>
                <span className="text-white">{sceneType || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Status</span>
                <StatusBadge status={isActive ? 'active' : 'draft'} />
              </div>
            </div>
          </Card>

          {/* Content */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">Content</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted text-sm">🧑 NPCs</span>
                <span
                  className={`text-sm font-medium ${selectedNpcs.length > 0 ? 'text-accent' : 'text-white/40'}`}
                >
                  {selectedNpcs.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted text-sm">⚔️ Quests</span>
                <span
                  className={`text-sm font-medium ${selectedQuests.length > 0 ? 'text-accent' : 'text-white/40'}`}
                >
                  {selectedQuests.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted text-sm">⚡ Challenges</span>
                <span
                  className={`text-sm font-medium ${selectedChallenges.length > 0 ? 'text-accent' : 'text-white/40'}`}
                >
                  {selectedChallenges.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted text-sm">📦 Assets</span>
                <span
                  className={`text-sm font-medium ${selectedAssets.length > 0 ? 'text-accent' : 'text-white/40'}`}
                >
                  {selectedAssets.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted text-sm">💬 Prompt</span>
                <span
                  className={`text-sm font-medium ${systemPrompt ? 'text-accent' : 'text-white/40'}`}
                >
                  {systemPrompt ? '✓' : '—'}
                </span>
              </div>
            </div>
          </Card>

          {/* Danger */}
          <Card className="p-6 border border-red-500/20">
            <h3 className="text-red-400 font-bold mb-4">Danger Zone</h3>
            <button
              onClick={handleDelete}
              className="w-full btn bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20 rounded-xl"
            >
              🗑️ Delete Scene
            </button>
          </Card>
        </div>
      </div>
    </>
  )
}
