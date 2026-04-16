// ============================================
// Kinship Studio — Data Fetching Hooks
// ============================================

import { useState, useEffect, useCallback } from 'react'
import { api, backendApi, ApiRequestError } from '@/lib/api'
import type {
  Asset,
  AssetWithMetadata,
  AssetMetadata,
  AssetKnowledge,
  AssetKnowledgePayload,
  AuditLogEntry,
  AssetQueryParams,
  PaginatedResponse,
  Scene,
  SceneManifest,
  SceneManifestResponse,
  Quest,
  QuestQueryParams,
  CreateQuestPayload,
  UpdateQuestPayload,
  Challenge,
  ChallengeQueryParams,
  ChallengeCreate,
  ChallengeUpdate,
  NPC,
  NPCQueryParams,
  NPCCreate,
  NPCUpdate,
  KnowledgeDocument,
  KnowledgeQueryParams,
  KnowledgeCreate,
  KnowledgeUpdate,
  Prompt,
  PromptQueryParams,
  PromptCreate,
  PromptUpdate,
  HeartsFacetData,
  HeartsFacetUpdate,
  HeartsRubricEntry,
  HeartsRubricBulkUpdate,
  HeartsStats,
  Route,
  RouteQueryParams,
  RouteCreate,
  RouteUpdate,
} from '@/lib/types'

// ============================================
// Generic fetch hook
// ============================================

interface UseApiState<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

function useApi<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = []
): UseApiState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(() => {
    setLoading(true)
    setError(null)
    fetcher()
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiRequestError) {
          setError(`${err.status}: ${err.message}`)
        } else {
          setError(err.message || 'Unknown error')
        }
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    refetch()
  }, [refetch])

  return { data, loading, error, refetch }
}

// ============================================
// Asset hooks
// ============================================

export function useAssets(params?: AssetQueryParams) {
  return useApi<PaginatedResponse<Asset>>(
    () => api.listAssets(params),
    [JSON.stringify(params)]
  )
}

export function useAsset(id: string) {
  return useApi<AssetWithMetadata>(() => api.getAsset(id), [id])
}

export function useAssetMetadata(assetId: string) {
  return useApi<AssetMetadata>(() => api.getMetadata(assetId), [assetId])
}

export function useAssetAuditLog(assetId: string) {
  return useApi<AuditLogEntry[]>(() => api.getAuditLog(assetId), [assetId])
}

export function useAssetsByFacet(facet: string) {
  return useApi<Asset[]>(() => api.getAssetsByFacet(facet), [facet])
}

export function useAssetKnowledge(assetId: string) {
  return useApi<AssetKnowledge | null>(
    () => api.getAssetKnowledge(assetId),
    [assetId]
  )
}

export async function saveAssetKnowledge(
  assetId: string,
  payload: AssetKnowledgePayload
) {
  return api.saveAssetKnowledge(assetId, payload)
}

export async function deleteAssetKnowledge(assetId: string) {
  return api.deleteAssetKnowledge(assetId)
}

export async function generateAssetKnowledge(assetId: string) {
  return backendApi.generateAssetKnowledge(assetId)
}

export async function generateAllAssetKnowledge(options?: {
  skip_existing?: boolean
  regenerate_design?: boolean
}) {
  return backendApi.generateAllAssetKnowledge(options)
}

export async function syncAssetKnowledge(options?: {
  force_regenerate?: boolean
  skip_knowledge?: boolean
  skip_design?: boolean
}) {
  return backendApi.syncAssetKnowledge(options)
}

export async function deleteAssetEmbedding(assetId: string) {
  return backendApi.deleteAssetEmbedding(assetId)
}

export function useAssetKnowledgeCoverage() {
  return useApi(() => backendApi.getAssetKnowledgeCoverage(), [])
}

// ============================================
// Scene hooks
// ============================================

export function useScenes(sceneType?: string, gameId?: string) {
  return useApi<Scene[]>(
    () => api.listScenes(sceneType, gameId),
    [sceneType, gameId]
  )
}

export function useScene(id: string) {
  return useApi<Scene>(() => api.getScene(id), [id])
}

export function useSceneManifest(id: string) {
  return useApi<SceneManifestResponse>(() => api.getSceneManifest(id), [id])
}

// ============================================
// Mutation helpers (non-hook, call directly)
// ============================================

export async function createAsset(
  file: File,
  payload: Parameters<typeof api.createAsset>[1]
) {
  return api.createAsset(file, payload)
}

export async function updateAsset(
  id: string,
  payload: Parameters<typeof api.updateAsset>[1]
) {
  return api.updateAsset(id, payload)
}

export async function deleteAsset(id: string) {
  return api.deleteAsset(id)
}

export async function saveMetadata(
  assetId: string,
  payload: Parameters<typeof api.createMetadata>[1],
  isNew: boolean
) {
  return isNew
    ? api.createMetadata(assetId, payload)
    : api.updateMetadata(assetId, payload)
}

export async function createScene(
  payload: Parameters<typeof api.createScene>[0]
) {
  return api.createScene(payload)
}

export async function updateScene(
  id: string,
  payload: Parameters<typeof api.updateScene>[1]
) {
  return api.updateScene(id, payload)
}

export async function deleteScene(id: string) {
  return api.deleteScene(id)
}

export async function addAssetToScene(
  sceneId: string,
  assetId: string,
  position?: { x: number; y: number }
) {
  return api.addAssetToScene(sceneId, assetId, position)
}

export async function removeAssetFromScene(sceneId: string, assetId: string) {
  return api.removeAssetFromScene(sceneId, assetId)
}

// ============================================
// Quest hooks
// ============================================

export function useQuests(params?: QuestQueryParams) {
  return useApi<Quest[]>(
    () => backendApi.listQuests(params),
    [JSON.stringify(params)]
  )
}

export function useQuest(id: string) {
  return useApi<Quest>(() => backendApi.getQuest(id), [id])
}

// ============================================
// Quest mutations
// ============================================

export async function createQuest(payload: CreateQuestPayload) {
  return backendApi.createQuest(payload)
}

export async function updateQuest(id: string, payload: UpdateQuestPayload) {
  return backendApi.updateQuest(id, payload)
}

export async function deleteQuest(id: string) {
  return backendApi.deleteQuest(id)
}

// ============================================
// Scene list for dropdowns (from assets service)
// ============================================

export function useSceneOptions() {
  return useApi<{ id: string; scene_name: string; scene_type: string }[]>(
    () => backendApi.listScenes(),
    []
  )
}

// ============================================
// Challenge hooks
// ============================================

export function useChallenges(params?: ChallengeQueryParams) {
  return useApi<import('@/lib/types').PaginatedChallengeResponse>(
    () => backendApi.listChallenges(params),
    [JSON.stringify(params)]
  )
}

export function useChallenge(id: string) {
  return useApi<Challenge>(() => backendApi.getChallenge(id), [id])
}

// ============================================
// Challenge mutations
// ============================================

export async function createChallenge(payload: ChallengeCreate) {
  return backendApi.createChallenge(payload)
}

export async function updateChallenge(id: string, payload: ChallengeUpdate) {
  return backendApi.updateChallenge(id, payload)
}

export async function deleteChallenge(id: string) {
  return backendApi.deleteChallenge(id)
}

// ============================================
// NPC hooks
// ============================================

export function useNPCs(params?: NPCQueryParams) {
  return useApi<import('@/lib/types').PaginatedNPCResponse>(
    () => backendApi.listNPCs(params),
    [JSON.stringify(params)]
  )
}

export function useNPC(id: string) {
  return useApi<NPC>(() => backendApi.getNPC(id), [id])
}

// ============================================
// NPC mutations
// ============================================

export async function createNPC(payload: NPCCreate) {
  return backendApi.createNPC(payload)
}

export async function updateNPC(id: string, payload: NPCUpdate) {
  return backendApi.updateNPC(id, payload)
}

export async function deleteNPC(id: string) {
  return backendApi.deleteNPC(id)
}

// ============================================
// Knowledge hooks
// ============================================

export function useKnowledgeList(params?: KnowledgeQueryParams) {
  return useApi<KnowledgeDocument[]>(
    () => backendApi.listKnowledge(params),
    [JSON.stringify(params)]
  )
}

export function useKnowledge(id: string) {
  return useApi<KnowledgeDocument>(() => backendApi.getKnowledge(id), [id])
}

// ============================================
// Knowledge mutations
// ============================================

export async function createKnowledge(payload: KnowledgeCreate) {
  return backendApi.createKnowledge(payload)
}

export async function updateKnowledge(id: string, payload: KnowledgeUpdate) {
  return backendApi.updateKnowledge(id, payload)
}

export async function deleteKnowledge(id: string) {
  return backendApi.deleteKnowledge(id)
}

export async function ingestKnowledge(id: string) {
  return backendApi.ingestKnowledge(id)
}

export async function uploadKnowledge(
  file: File,
  options: {
    title?: string
    category?: string
    doc_type?: string
    tags?: string[]
    facets?: string[]
    platform_id?: string
  } = {}
) {
  return backendApi.uploadKnowledge(file, options)
}

// ============================================
// Prompt hooks
// ============================================

export function usePrompts(params?: PromptQueryParams) {
  return useApi<Prompt[]>(
    () => backendApi.listPrompts(params),
    [JSON.stringify(params)]
  )
}

export function usePrompt(id: string) {
  return useApi<Prompt>(() => backendApi.getPrompt(id), [id])
}

// ============================================
// Prompt mutations
// ============================================

export async function createPrompt(payload: PromptCreate) {
  return backendApi.createPrompt(payload)
}

export async function updatePrompt(id: string, payload: PromptUpdate) {
  return backendApi.updatePrompt(id, payload)
}

export async function deletePrompt(id: string) {
  return backendApi.deletePrompt(id)
}

// ============================================
// HEARTS hooks
// ============================================

export function useHeartsFacets() {
  return useApi<HeartsFacetData[]>(() => backendApi.listHeartsFacets(), [])
}

export function useHeartsStats() {
  return useApi<HeartsStats>(() => backendApi.getHeartsStats(), [])
}

export function useHeartsFacet(key: string) {
  return useApi<HeartsFacetData>(() => backendApi.getHeartsFacet(key), [key])
}

export async function updateHeartsFacet(
  key: string,
  payload: HeartsFacetUpdate
) {
  return backendApi.updateHeartsFacet(key, payload)
}

export function useHeartsRubric() {
  return useApi<HeartsRubricEntry[]>(() => backendApi.listHeartsRubric(), [])
}

export async function updateHeartsRubric(payload: HeartsRubricBulkUpdate) {
  return backendApi.updateHeartsRubric(payload)
}

// ============================================
// Route hooks
// ============================================

export function useRoutes(params?: RouteQueryParams) {
  return useApi<Route[]>(
    () => backendApi.listRoutes(params),
    [JSON.stringify(params)]
  )
}

export function useRoute(id: string) {
  return useApi<Route>(() => backendApi.getRoute(id), [id])
}

export async function createRoute(payload: RouteCreate) {
  return backendApi.createRoute(payload)
}

export async function updateRoute(id: string, payload: RouteUpdate) {
  return backendApi.updateRoute(id, payload)
}

export async function deleteRoute(id: string) {
  return backendApi.deleteRoute(id)
}

// ============================================
// Platform Hooks
// ============================================

export function usePlatforms() {
  return useApi<import('@/lib/types').Platform[]>(() => api.listPlatforms(), [])
}

export function usePlatform(id: string | null) {
  return useApi<import('@/lib/types').Platform | null>(
    () => (id ? api.getPlatform(id) : Promise.resolve(null)),
    [id]
  )
}

export async function createPlatform(
  payload: import('@/lib/types').CreatePlatformPayload
) {
  return api.createPlatform(payload)
}

export async function updatePlatform(
  id: string,
  payload: import('@/lib/types').UpdatePlatformPayload
) {
  return api.updatePlatform(id, payload)
}

export async function deletePlatform(id: string) {
  return api.deletePlatform(id)
}

// ============================================
// Game Hooks
// ============================================

export function useGames(
  platformId: string | null,
  params?: { status?: string }
) {
  return useApi<{ data: import('@/lib/types').Game[]; total: number }>(
    () =>
      platformId
        ? api.listGames(platformId, params)
        : Promise.resolve({ data: [], total: 0 }),
    [platformId, params?.status]
  )
}

export function useGame(id: string | null) {
  return useApi<import('@/lib/types').Game | null>(
    () => (id ? api.getGame(id) : Promise.resolve(null)),
    [id]
  )
}

export async function createGame(
  payload: import('@/lib/types').CreateGamePayload
) {
  return api.createGame(payload)
}

export async function updateGame(
  id: string,
  payload: import('@/lib/types').UpdateGamePayload
) {
  return api.updateGame(id, payload)
}

export async function deleteGame(id: string) {
  return api.deleteGame(id)
}