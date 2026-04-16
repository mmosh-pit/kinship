'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
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
  from_scene: string | null
  to_scene: string | null
  bidirectional?: boolean
  conditions?: any[]
}

interface GraphNode {
  id: string
  label: string
  type: string
  x: number
  y: number
  isStart: boolean
  connections: number
}

interface GraphEdge {
  id: string
  from: string
  to: string
  bidirectional: boolean
  hasConditions: boolean
}

interface Props {
  scenes: Scene[]
  routes: Route[]
  startingSceneId?: string | null
  height?: number
}

// ═══════════════════════════════════════════════
//  Layout Algorithm (Force-Directed Simplified)
// ═══════════════════════════════════════════════

function layoutNodes(
  scenes: Scene[],
  routes: Route[],
  startingSceneId: string | null,
  width: number,
  height: number
): GraphNode[] {
  if (scenes.length === 0) return []

  // Build adjacency map
  const connections: Record<string, Set<string>> = {}
  scenes.forEach((s) => {
    connections[s.id] = new Set()
  })

  routes.forEach((r) => {
    if (r.from_scene && r.to_scene) {
      if (connections[r.from_scene]) connections[r.from_scene].add(r.to_scene)
      if (r.bidirectional && connections[r.to_scene]) {
        connections[r.to_scene].add(r.from_scene)
      }
    }
  })

  // Find starting node (use provided or first scene)
  const startId = startingSceneId || scenes[0]?.id

  // BFS to determine levels
  const levels: Record<string, number> = {}
  const visited = new Set<string>()
  const queue: { id: string; level: number }[] = []

  if (startId && connections[startId]) {
    queue.push({ id: startId, level: 0 })
    visited.add(startId)
  }

  while (queue.length > 0) {
    const { id, level } = queue.shift()!
    levels[id] = level

    connections[id]?.forEach((neighbor) => {
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
  const padding = 60
  const nodeRadius = 40

  // Position nodes
  const nodes: GraphNode[] = scenes.map((scene) => {
    const level = levels[scene.id] ?? 0
    const group = levelGroups[level] || [scene.id]
    const indexInGroup = group.indexOf(scene.id)
    const groupSize = group.length

    // Horizontal: spread across width based on level
    const levelWidth =
      maxLevel > 0 ? (width - padding * 2) / (maxLevel + 1) : width / 2
    const x = padding + level * levelWidth + levelWidth / 2

    // Vertical: spread nodes within same level
    const verticalSpacing = (height - padding * 2) / (groupSize + 1)
    const y = padding + (indexInGroup + 1) * verticalSpacing

    return {
      id: scene.id,
      label: scene.scene_name || scene.name || 'Untitled',
      type: scene.scene_type || 'Unknown',
      x,
      y,
      isStart: scene.id === startingSceneId,
      connections: connections[scene.id]?.size || 0,
    }
  })

  return nodes
}

// ═══════════════════════════════════════════════
//  Color Generator (consistent per scene type)
// ═══════════════════════════════════════════════

function getTypeColor(type: string): string {
  let hash = 0
  for (let i = 0; i < type.length; i++) {
    hash = type.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 50%, 50%)`
}

// ═══════════════════════════════════════════════
//  Graph Component
// ═══════════════════════════════════════════════

export default function GameFlowGraph({
  scenes,
  routes,
  startingSceneId,
  height = 300,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 600, height })
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)

  // Measure container
  useEffect(() => {
    if (containerRef.current) {
      const { width } = containerRef.current.getBoundingClientRect()
      setDimensions({ width, height })
    }
  }, [height])

  // Layout nodes
  const nodes = useMemo(
    () =>
      layoutNodes(
        scenes,
        routes,
        startingSceneId || null,
        dimensions.width,
        dimensions.height
      ),
    [scenes, routes, startingSceneId, dimensions]
  )

  // Build edges
  const edges: GraphEdge[] = useMemo(() => {
    return routes
      .filter((r) => r.from_scene && r.to_scene)
      .map((r) => ({
        id: r.id,
        from: r.from_scene as string,
        to: r.to_scene as string,
        bidirectional: !!r.bidirectional,
        hasConditions: (r.conditions?.length || 0) > 0,
      }))
  }, [routes])

  // Node map for quick lookup
  const nodeMap = useMemo(() => {
    const map: Record<string, GraphNode> = {}
    nodes.forEach((n) => {
      map[n.id] = n
    })
    return map
  }, [nodes])

  // Draw path between two nodes
  const getEdgePath = useCallback((from: GraphNode, to: GraphNode): string => {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const dr = Math.sqrt(dx * dx + dy * dy)

    // Curved path
    const midX = (from.x + to.x) / 2
    const midY = (from.y + to.y) / 2
    const offset = dr * 0.2 // Curve amount

    // Perpendicular offset for curve
    const perpX = (-dy / dr) * offset
    const perpY = (dx / dr) * offset

    const ctrlX = midX + perpX
    const ctrlY = midY + perpY

    return `M ${from.x} ${from.y} Q ${ctrlX} ${ctrlY} ${to.x} ${to.y}`
  }, [])

  // Get arrow marker position
  const getArrowPosition = useCallback((from: GraphNode, to: GraphNode) => {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const nodeRadius = 24

    // Position arrow just before the target node
    const ratio = (dist - nodeRadius) / dist
    return {
      x: from.x + dx * ratio,
      y: from.y + dy * ratio,
      angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    }
  }, [])

  if (scenes.length === 0) {
    return (
      <div
        ref={containerRef}
        className="w-full flex items-center justify-center"
        style={{ height }}
      >
        <div className="text-center">
          <span className="text-4xl mb-2 block opacity-50">🗺️</span>
          <p className="text-muted text-sm">No scenes to display</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="w-full relative" style={{ height }}>
      <svg
        width={dimensions.width}
        height={dimensions.height}
        className="overflow-visible"
      >
        {/* Definitions */}
        <defs>
          {/* Arrow marker */}
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
          </marker>
          <marker
            id="arrowhead-highlight"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#2dd4bf" />
          </marker>

          {/* Glow filter */}
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Edges */}
        {edges.map((edge) => {
          const from = nodeMap[edge.from]
          const to = nodeMap[edge.to]
          if (!from || !to) return null

          const isHighlighted =
            hoveredNode === edge.from || hoveredNode === edge.to
          const path = getEdgePath(from, to)

          return (
            <g key={edge.id}>
              {/* Edge path */}
              <path
                d={path}
                fill="none"
                stroke={isHighlighted ? '#2dd4bf' : '#374151'}
                strokeWidth={isHighlighted ? 2 : 1.5}
                strokeDasharray={edge.hasConditions ? '5,5' : undefined}
                markerEnd={
                  edge.bidirectional
                    ? undefined
                    : `url(#arrowhead${isHighlighted ? '-highlight' : ''})`
                }
                className="transition-all duration-200"
              />

              {/* Bidirectional indicator */}
              {edge.bidirectional && (
                <circle
                  cx={(from.x + to.x) / 2}
                  cy={(from.y + to.y) / 2}
                  r={4}
                  fill={isHighlighted ? '#2dd4bf' : '#4b5563'}
                />
              )}
            </g>
          )
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const isHovered = hoveredNode === node.id
          const isSelected = selectedNode === node.id
          const color = getTypeColor(node.type)
          const nodeRadius = 24

          return (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
              onClick={() =>
                setSelectedNode(node.id === selectedNode ? null : node.id)
              }
              className="cursor-pointer"
            >
              {/* Starting scene ring */}
              {node.isStart && (
                <circle
                  r={nodeRadius + 6}
                  fill="none"
                  stroke="#2dd4bf"
                  strokeWidth={2}
                  strokeDasharray="4,4"
                  className="animate-spin-slow"
                  style={{ animationDuration: '10s' }}
                />
              )}

              {/* Node background */}
              <circle
                r={nodeRadius}
                fill={color}
                stroke={isHovered || isSelected ? '#2dd4bf' : '#1e293b'}
                strokeWidth={isHovered || isSelected ? 3 : 2}
                filter={isHovered ? 'url(#glow)' : undefined}
                className="transition-all duration-200"
              />

              {/* Scene type initials */}
              <text
                textAnchor="middle"
                dy="0.35em"
                fill="white"
                fontSize="11"
                fontWeight="bold"
              >
                {node.type
                  .split(/[\s_-]+/)
                  .map((w) => w[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2)}
              </text>

              {/* Node label (on hover) */}
              {(isHovered || isSelected) && (
                <g transform={`translate(0, ${nodeRadius + 12})`}>
                  <rect
                    x={-60}
                    y={-10}
                    width={120}
                    height={20}
                    rx={4}
                    fill="rgba(15, 23, 42, 0.9)"
                    stroke="#374151"
                  />
                  <text
                    textAnchor="middle"
                    dy="0.35em"
                    fill="white"
                    fontSize="10"
                    fontWeight="500"
                  >
                    {node.label.length > 18
                      ? node.label.slice(0, 16) + '...'
                      : node.label}
                  </text>
                </g>
              )}

              {/* Connection count badge */}
              {node.connections > 0 && !isHovered && (
                <g
                  transform={`translate(${nodeRadius - 6}, ${-nodeRadius + 6})`}
                >
                  <circle r={8} fill="#1e293b" stroke="#374151" />
                  <text
                    textAnchor="middle"
                    dy="0.35em"
                    fill="#9ca3af"
                    fontSize="9"
                    fontWeight="bold"
                  >
                    {node.connections}
                  </text>
                </g>
              )}
            </g>
          )
        })}
      </svg>

      {/* Selected node details */}
      {selectedNode && (
        <div className="absolute bottom-2 left-2 right-2 bg-sidebar/95 border border-card-border rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-white text-sm font-semibold">
                {nodeMap[selectedNode]?.label}
              </h4>
              <p className="text-white/70 text-[10px]">
                {nodeMap[selectedNode]?.type} ·{' '}
                {nodeMap[selectedNode]?.connections} connection
                {nodeMap[selectedNode]?.connections !== 1 ? 's' : ''}
                {nodeMap[selectedNode]?.isStart && ' · Starting Scene'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/scenes/${selectedNode}`}
                className="text-[10px] px-2 py-1 rounded bg-accent/15 text-accent hover:bg-accent/25 font-semibold"
              >
                View Scene
              </Link>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-muted hover:text-white text-sm"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute top-2 right-2 flex items-center gap-3 text-[9px] text-muted">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full border-2 border-accent border-dashed" />
          <span>Start</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-0.5 bg-white/40" />
          <span>Route</span>
        </div>
        <div className="flex items-center gap-1">
          <div
            className="w-4 h-0.5 bg-white/40"
            style={{
              backgroundImage:
                'repeating-linear-gradient(90deg, #6b7280 0, #6b7280 3px, transparent 3px, transparent 6px)',
            }}
          />
          <span>Conditional</span>
        </div>
      </div>
    </div>
  )
}
