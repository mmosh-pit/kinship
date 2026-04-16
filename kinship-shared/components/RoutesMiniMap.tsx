'use client'

import { useMemo } from 'react'
import Link from 'next/link'

// ═══════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════

interface Scene {
  id: string
  scene_name?: string
  name?: string
  scene_type?: string
}

interface Route {
  id: string
  name: string
  from_scene: string
  to_scene: string
  bidirectional?: boolean
  conditions?: any[]
}

interface Props {
  scenes: Scene[]
  routes: Route[]
  startingSceneId?: string | null
  height?: number
  onSceneClick?: (sceneId: string) => void
}

// ═══════════════════════════════════════════════
//  Route Mini-Map Component
// ═══════════════════════════════════════════════

export default function RoutesMiniMap({
  scenes,
  routes,
  startingSceneId,
  height = 180,
  onSceneClick,
}: Props) {
  // Calculate node positions using a simple grid layout
  const { nodes, edges } = useMemo(() => {
    if (scenes.length === 0) return { nodes: [], edges: [] }

    // Build adjacency for BFS
    const adj: Record<string, Set<string>> = {}
    scenes.forEach((s) => {
      adj[s.id] = new Set()
    })
    routes.forEach((r) => {
      if (adj[r.from_scene]) adj[r.from_scene].add(r.to_scene)
      if (r.bidirectional && adj[r.to_scene]) {
        adj[r.to_scene].add(r.from_scene)
      }
    })

    // BFS to assign levels
    const levels: Record<string, number> = {}
    const visited = new Set<string>()
    const queue: { id: string; level: number }[] = []
    const startId = startingSceneId || scenes[0]?.id

    if (startId) {
      queue.push({ id: startId, level: 0 })
      visited.add(startId)
    }

    while (queue.length > 0) {
      const { id, level } = queue.shift()!
      levels[id] = level
      adj[id]?.forEach((neighbor) => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          queue.push({ id: neighbor, level: level + 1 })
        }
      })
    }

    // Add unvisited nodes
    scenes.forEach((s) => {
      if (!visited.has(s.id)) {
        levels[s.id] = Math.max(...Object.values(levels), 0) + 1
      }
    })

    // Group by level
    const levelGroups: Record<number, string[]> = {}
    Object.entries(levels).forEach(([id, level]) => {
      if (!levelGroups[level]) levelGroups[level] = []
      levelGroups[level].push(id)
    })

    const maxLevel = Math.max(...Object.keys(levelGroups).map(Number), 0)
    const padding = 30
    const nodeSize = 24
    const width = 300 // Assume width

    // Position nodes
    const nodesList = scenes.map((scene) => {
      const level = levels[scene.id] ?? 0
      const group = levelGroups[level] || [scene.id]
      const indexInGroup = group.indexOf(scene.id)
      const groupSize = group.length

      const levelWidth =
        maxLevel > 0 ? (width - padding * 2) / (maxLevel + 1) : width / 2
      const x = padding + level * levelWidth + levelWidth / 2

      const verticalSpacing = (height - padding * 2) / (groupSize + 1)
      const y = padding + (indexInGroup + 1) * verticalSpacing

      return {
        id: scene.id,
        label: scene.scene_name || scene.name || '?',
        type: scene.scene_type || 'unknown',
        x,
        y,
        isStart: scene.id === startingSceneId,
        connections: adj[scene.id]?.size || 0,
      }
    })

    // Build edges
    const edgesList = routes.map((r) => ({
      id: r.id,
      from: r.from_scene,
      to: r.to_scene,
      bidirectional: !!r.bidirectional,
      hasConditions: (r.conditions?.length || 0) > 0,
    }))

    return { nodes: nodesList, edges: edgesList }
  }, [scenes, routes, startingSceneId, height])

  // Node lookup
  const nodeMap = useMemo(() => {
    const map: Record<string, (typeof nodes)[0]> = {}
    nodes.forEach((n) => {
      map[n.id] = n
    })
    return map
  }, [nodes])

  // Get color from scene type
  const getColor = (type: string) => {
    let hash = 0
    for (let i = 0; i < type.length; i++) {
      hash = type.charCodeAt(i) + ((hash << 5) - hash)
    }
    return `hsl(${Math.abs(hash) % 360}, 50%, 50%)`
  }

  if (scenes.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-center"
        style={{ height }}
      >
        <div>
          <span className="text-2xl mb-2 block opacity-50">🗺️</span>
          <p className="text-muted text-[10px]">No scenes</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative" style={{ height }}>
      <svg width="100%" height={height} className="overflow-visible">
        {/* Edges */}
        {edges.map((edge) => {
          const from = nodeMap[edge.from]
          const to = nodeMap[edge.to]
          if (!from || !to) return null

          return (
            <g key={edge.id}>
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={edge.hasConditions ? '#6b7280' : '#374151'}
                strokeWidth={1.5}
                strokeDasharray={edge.hasConditions ? '4,4' : undefined}
                markerEnd={edge.bidirectional ? undefined : 'url(#mini-arrow)'}
              />
              {edge.bidirectional && (
                <circle
                  cx={(from.x + to.x) / 2}
                  cy={(from.y + to.y) / 2}
                  r={3}
                  fill="#4b5563"
                />
              )}
            </g>
          )
        })}

        {/* Arrow marker */}
        <defs>
          <marker
            id="mini-arrow"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="#6b7280" />
          </marker>
        </defs>

        {/* Nodes */}
        {nodes.map((node) => {
          const color = getColor(node.type)
          const nodeRadius = 12

          return (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              className="cursor-pointer"
              onClick={() => onSceneClick?.(node.id)}
            >
              {/* Starting indicator */}
              {node.isStart && (
                <circle
                  r={nodeRadius + 4}
                  fill="none"
                  stroke="#2dd4bf"
                  strokeWidth={1.5}
                  strokeDasharray="3,3"
                />
              )}
              {/* Node */}
              <circle
                r={nodeRadius}
                fill={color}
                stroke="#1e293b"
                strokeWidth={2}
              />
              {/* Type initials */}
              <text
                textAnchor="middle"
                dy="0.35em"
                fill="white"
                fontSize="8"
                fontWeight="bold"
              >
                {node.type
                  .split(/[\s_-]+/)
                  .map((w) => w[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2)}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div className="absolute bottom-1 right-1 flex items-center gap-2 text-[8px] text-white/40">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full border border-accent border-dashed" />
          <span>Start</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-white/40" />
          <span>Route</span>
        </div>
      </div>

      {/* Scene count */}
      <div className="absolute top-1 left-1 text-[9px] text-muted">
        {scenes.length} scene{scenes.length !== 1 ? 's' : ''} · {routes.length}{' '}
        route
        {routes.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
//  Routes List Component (Compact)
// ═══════════════════════════════════════════════

interface RoutesListProps {
  routes: Route[]
  scenes: Scene[]
  onDelete?: (id: string) => void
}

export function RoutesList({ routes, scenes, onDelete }: RoutesListProps) {
  const sceneMap = useMemo(() => {
    const map: Record<string, Scene> = {}
    scenes.forEach((s) => {
      map[s.id] = s
    })
    return map
  }, [scenes])

  const getSceneName = (id: string) => {
    const scene = sceneMap[id]
    return scene?.scene_name || scene?.name || 'Unknown'
  }

  if (routes.length === 0) {
    return (
      <div className="text-center py-4">
        <span className="text-muted text-xs">No routes defined</span>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {routes.map((route) => (
        <div
          key={route.id}
          className="group flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-card/40"
        >
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <span className="text-[10px] text-white/70 truncate max-w-[80px]">
              {getSceneName(route.from_scene)}
            </span>
            <span className="text-[10px] text-white/40">
              {route.bidirectional ? '↔' : '→'}
            </span>
            <span className="text-[10px] text-white/70 truncate max-w-[80px]">
              {getSceneName(route.to_scene)}
            </span>
          </div>

          {(route.conditions?.length || 0) > 0 && (
            <span className="text-[8px] px-1.5 py-0.5 rounded bg-purple-400/10 text-purple-400">
              🔒
            </span>
          )}

          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            <Link
              href={`/routes/${route.id}`}
              className="text-white/40 hover:text-accent text-xs"
            >
              ✏️
            </Link>
            {onDelete && (
              <button
                onClick={() => onDelete(route.id)}
                className="text-white/40 hover:text-red-400 text-xs"
              >
                🗑️
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
