'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useStudio } from '@/lib/studio-context'
import { PLATFORM_NAV, GAME_NAV } from '@/lib/nav'
import { api } from '@/lib/api'
import { Spinner } from './UI'
import {
  Library,
  UploadCloud,
  Package,
  Brain,
  MessageSquareCode,
  Heart,
  Gamepad2,
  Settings,
  LayoutDashboard,
  BarChart3,
  Zap,
  Sparkles,
  Map,
  Users,
  Target,
  Scroll,
  Route,
  Trophy,
  Award,
  BookOpen,
  RefreshCw,
  Globe,
  Rocket,
  Play,
  ArrowLeft,
  Layers,
  UserRound,
  Plug2,
  Workflow,
  Activity,
  Store,
  Coins,
  Compass,
  MessageCircle,
  FolderTree,
  KeyRound,
  type LucideIcon,
} from 'lucide-react'

// Map icon names to Lucide components
const iconMap: Record<string, LucideIcon> = {
  Library,
  UploadCloud,
  Package,
  Brain,
  MessageSquareCode,
  Heart,
  Gamepad2,
  Settings,
  LayoutDashboard,
  BarChart3,
  Zap,
  Sparkles,
  Map,
  Users,
  Target,
  Scroll,
  Route,
  Trophy,
  Award,
  BookOpen,
  RefreshCw,
  Globe,
  Rocket,
  Play,
  Layers,
  UserRound,
  Plug2,
  Workflow,
  Activity,
  Store,
  Coins,
  Compass,
  MessageCircle,
  FolderTree,
  KeyRound
}

interface NavIconProps {
  name: string
  className?: string
  size?: number
}

function NavIcon({ name, className = '', size = 18 }: NavIconProps) {
  const IconComponent = iconMap[name]
  if (!IconComponent) {
    // Fallback for unknown icons
    return <span className={className}>•</span>
  }
  return <IconComponent size={size} className={className} />
}

export default function StudioSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { currentPlatform, currentGame, isInGame, platformsLoading, exitGame } =
    useStudio()
  const [counts, setCounts] = useState<Record<string, number | null>>({})

  // ── Reliable game-exit redirect ──────────────────────
  // Watches isInGame: when it goes true → false, redirect.
  // Uses ref to track previous value so we skip initial mount.
  const wasInGame = useRef(isInGame)
  useEffect(() => {
    if (wasInGame.current && !isInGame) {
      router.push('/assets')
    }
    wasInGame.current = isInGame
  }, [isInGame, router])

  // ── Reliable platform-switch redirect ────────────────
  const prevPlatformId = useRef(currentPlatform?.id)
  useEffect(() => {
    if (
      prevPlatformId.current &&
      currentPlatform?.id &&
      prevPlatformId.current !== currentPlatform.id
    ) {
      router.push('/assets')
    }
    prevPlatformId.current = currentPlatform?.id
  }, [currentPlatform?.id, router])

  // ── Fetch live counts — scoped to platform / game ────
  useEffect(() => {
    async function fetchCounts() {
      const newCounts: Record<string, number | null> = {}
      try {
        const assets = await api.listAssets({
          page: 1,
          limit: 1,
          platform_id: currentPlatform?.id,
        })
        newCounts.assets = assets.pagination.total
      } catch {
        newCounts.assets = null
      }
      try {
        const scenes = await api.listScenes(undefined, currentGame?.id)
        newCounts.scenes = Array.isArray(scenes) ? scenes.length : null
      } catch {
        newCounts.scenes = null
      }
      setCounts(newCounts)
    }
    fetchCounts()
  }, [pathname, currentPlatform?.id, currentGame?.id])

  const navGroups = isInGame ? GAME_NAV : PLATFORM_NAV

  return (
    <aside className="fixed left-0 top-[60px] w-[220px] h-[calc(100vh-60px)] bg-sidebar border-r border-card-border overflow-y-auto py-4 px-3">
      {/* Platform/game indicator */}
      <div className="mb-2">
        {platformsLoading ? (
          <div className="flex items-center gap-2 px-3">
            <Spinner size="sm" />
            <span className="text-[10px] text-muted">Loading...</span>
          </div>
        ) : isInGame && currentGame ? (
          <>
            <div className="text-[10px] font-semibold text-white/40 uppercase tracking-wider px-3 mb-1">
              Game
            </div>
            <div className="px-3 py-1.5 text-accent text-sm flex items-center gap-2">
              <Layers size={16} className="text-accent" />
              {currentGame.name}
            </div>
          </>
        ) : currentPlatform ? (
          <>
            <div className="text-[10px] font-semibold text-white/40 uppercase tracking-wider px-3 mb-1">
              Platform
            </div>
            <Link
              href="/assets"
              className={`px-3 py-1.5 text-sm flex items-center gap-2 rounded-lg transition-colors ${
                pathname === '/assets' || pathname === '/'
                  ? 'text-accent'
                  : 'text-accent hover:bg-white/[0.06]'
              }`}
            >
              <Layers size={16} />
              {currentPlatform.name}
            </Link>
            <Link
              href="/platform-settings"
              className={`px-3 py-1.5 text-sm flex items-center gap-2 rounded-lg transition-colors ${
                pathname === '/platform-settings'
                  ? 'bg-accent/15 text-accent'
                  : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <Settings size={16} />
              Platform Settings
            </Link>
          </>
        ) : (
          <div className="text-[10px] text-muted px-3">
            No platform selected
          </div>
        )}
      </div>

      {/* Back to Platform — shown inside game layout */}
      {isInGame && currentPlatform && (
        <div className="mb-4">
          <button
            onClick={() => exitGame()}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[11px] font-semibold text-white/70 hover:text-white hover:bg-white/[0.06] transition-all group"
          >
            <ArrowLeft
              size={14}
              className="transition-transform group-hover:-translate-x-0.5"
            />
            <span>Back to {currentPlatform.name}</span>
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1">
        {navGroups.map((group, gi) => {
          // Collect all hrefs in this nav to check for more specific matches
          const allHrefs = navGroups.flatMap((g) => g.items.map((i) => i.href))

          return (
            <div key={gi} className="mb-4">
              {group.label && (
                <p className="text-white/40 text-[10px] font-semibold tracking-wider uppercase px-3 mb-1">
                  {group.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  // Check if this item is active:
                  // 1. Exact match
                  // 2. pathname starts with href AND no other more specific href matches
                  const isExactMatch = pathname === item.href
                  const isStartsWithMatch =
                    pathname.startsWith(item.href + '/') ||
                    pathname.startsWith(item.href)
                  const hasMoreSpecificMatch = allHrefs.some(
                    (href) =>
                      href !== item.href &&
                      href.startsWith(item.href) &&
                      (pathname === href ||
                        pathname.startsWith(href + '/') ||
                        pathname.startsWith(href))
                  )
                  const isActive =
                    isExactMatch || (isStartsWithMatch && !hasMoreSpecificMatch)
                  const badge = item.countKey
                    ? counts[item.countKey]
                    : undefined

                  return (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                          isActive
                            ? 'bg-accent/20 text-accent'
                            : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
                        }`}
                      >
                        <NavIcon
                          name={item.icon}
                          size={18}
                          className={isActive ? 'text-accent' : 'text-white'}
                        />
                        <span className="flex-1">{item.label}</span>
                        {item.isNew && (
                          <span className="bg-accent text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                            NEW
                          </span>
                        )}
                        {badge !== undefined && badge !== null && (
                          <span className="bg-accent/20 text-accent text-xs px-2 py-0.5 rounded-full">
                            {badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>
    </aside>
  )
}