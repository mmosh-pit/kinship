'use client'

import Link from 'next/link'
import { useStudio } from '@/lib/studio-context'
import PageHeader from '@/components/PageHeader'
import { Card, StatusBadge, EmptyState } from '@/components/UI'
import { MOCK_SCENES, MOCK_ROUTES } from '@/lib/data'

export default function WorldMapPage() {
  const { currentGame, isInGame } = useStudio()

  if (!isInGame) {
    return (
      <EmptyState
        icon="🗺️"
        title="Select a game first"
        description="The world map is game-specific."
        action={
          <Link
            href="/games"
            className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold"
          >
            View Games
          </Link>
        }
      />
    )
  }

  return (
    <>
      <PageHeader
        title="World Map"
        subtitle="Visual overview of all scenes and their route connections"
        breadcrumbs={[
          { label: currentGame!.name, href: '/dashboard' },
          { label: 'World Map' },
        ]}
        action={
          <Link
            href="/scenes/create"
            className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold"
          >
            + New Scene
          </Link>
        }
      />

      {/* Map Canvas */}
      <Card>
        <div
          className="relative w-full"
          style={{
            height: 500,
            background:
              'radial-gradient(circle at 50% 50%, rgba(76,173,168,0.03), transparent 70%)',
          }}
        >
          {/* Grid dots background */}
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage:
                'radial-gradient(circle, #475569 0.5px, transparent 0.5px)',
              backgroundSize: '20px 20px',
            }}
          />

          {/* Scene nodes */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative" style={{ width: 600, height: 400 }}>
              {/* Simple visual representation */}
              {MOCK_SCENES.map((scene, i) => {
                const positions = [
                  { x: 240, y: 20 },
                  { x: 60, y: 180 },
                  { x: 420, y: 180 },
                ]
                const pos = positions[i] || { x: 240, y: 320 }

                return (
                  <Link
                    key={scene.id}
                    href={`/scenes/${scene.id}`}
                    className="absolute w-[140px] rounded-xl border p-3 hover:scale-105 transition-all cursor-pointer"
                    style={{
                      left: pos.x,
                      top: pos.y,
                      background:
                        scene.status === 'published'
                          ? 'rgba(76,173,168,0.08)'
                          : 'rgba(201,162,39,0.06)',
                      borderColor:
                        scene.status === 'published'
                          ? 'rgba(76,173,168,0.25)'
                          : 'rgba(201,162,39,0.2)',
                    }}
                  >
                    <div className="text-xs font-bold text-white mb-1">
                      {scene.name}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={scene.status} />
                      <span className="text-[9px] text-muted">
                        {scene.assets} assets
                      </span>
                    </div>
                  </Link>
                )
              })}

              {/* Connection hint */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ opacity: 0.3 }}
              >
                <line
                  x1="310"
                  y1="70"
                  x2="130"
                  y2="180"
                  stroke="#4CADA8"
                  strokeWidth="1.5"
                />
                <line
                  x1="310"
                  y1="70"
                  x2="490"
                  y2="180"
                  stroke="#E07B4C"
                  strokeWidth="1.5"
                  strokeDasharray="5,4"
                />
                <line
                  x1="130"
                  y1="230"
                  x2="310"
                  y2="340"
                  stroke="#E07B4C"
                  strokeWidth="1.5"
                  strokeDasharray="5,4"
                />
                <line
                  x1="490"
                  y1="230"
                  x2="310"
                  y2="340"
                  stroke="#4CADA8"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
          </div>

          {/* Legend */}
          <div className="absolute bottom-4 right-4 bg-sidebar/90 border border-card-border rounded-xl px-4 py-2.5 flex gap-5">
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-accent rounded" />
              <span className="text-[9px] text-muted">Quest trigger</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-0.5 bg-orange-400 rounded"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(90deg, #E07B4C 0, #E07B4C 3px, transparent 3px, transparent 6px)',
                }}
              />
              <span className="text-[9px] text-muted">Conditional</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Routes list */}
      <div className="mt-6">
        <h3 className="text-[10px] font-bold text-white/40 tracking-widest uppercase mb-3">
          Routes ({MOCK_ROUTES.length})
        </h3>
        <div className="space-y-2">
          {MOCK_ROUTES.map((route) => (
            <Card key={route.id} hover>
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="text-sm">🔀</span>
                <div className="flex-1">
                  <div className="text-xs font-semibold text-white">
                    {route.name}
                  </div>
                  <div className="text-[10px] text-muted">
                    {route.trigger_type} · {route.description}
                  </div>
                </div>
                <StatusBadge status={route.status} />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </>
  )
}
