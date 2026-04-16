'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_ITEMS } from '@/lib/data'
import { api } from '@/lib/api'

export default function Sidebar() {
  const pathname = usePathname()
  const [counts, setCounts] = useState<Record<string, number | null>>({})

  // Fetch live counts on mount and when pathname changes (e.g. after creating/deleting)
  useEffect(() => {
    async function fetchCounts() {
      const newCounts: Record<string, number | null> = {}

      try {
        const assets = await api.listAssets({ page: 1, limit: 1 })
        newCounts.assets = assets.pagination.total
      } catch {
        newCounts.assets = null
      }

      try {
        const scenes = await api.listScenes()
        newCounts.scenes = Array.isArray(scenes) ? scenes.length : null
      } catch {
        newCounts.scenes = null
      }

      setCounts(newCounts)
    }

    fetchCounts()
  }, [pathname])

  return (
    <aside className="w-64 min-h-screen bg-sidebar/80 border-r border-card-border flex flex-col">
      {/* Logo */}
      <Link
        href="/assets"
        className="flex items-center gap-3 px-5 py-5 border-b border-card-border"
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-lg shadow-accent/10">
          <img
            src="/assets/kinship_icon.png"
            alt="Kinship icon"
            className="w-full h-full rounded-xl object-contain"
          />
        </div>
        <div>
          <h1 className="text-white font-bold text-sm tracking-wide">
            KINSHIP
          </h1>
          <p className="text-muted text-[10px] tracking-widest uppercase">
            Studio
          </p>
        </div>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {NAV_ITEMS.map((group) => (
          <div key={group.label} className="mb-6">
            <p className="text-white/40 text-[10px] font-bold tracking-widest uppercase px-3 mb-2">
              {group.label}
            </p>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const isActive = pathname.startsWith(item.href)
                const countKey = (item as any).countKey as string | undefined
                const badge = countKey ? counts[countKey] : undefined

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all group ${
                        isActive
                          ? 'bg-accent/20 text-accent'
                          : 'text-white/70 hover:text-white hover:bg-card'
                      }`}
                    >
                      <span className="text-base">{item.icon}</span>
                      <span className="flex-1 font-medium">{item.label}</span>
                      {badge !== undefined && badge !== null && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isActive
                              ? 'bg-accent/20 text-accent'
                              : 'bg-card text-muted group-hover:bg-white/[0.1]'
                          }`}
                        >
                          {badge}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="border-t border-card-border p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-sm font-bold">
            <img
              src="https://storage.googleapis.com/mmosh-assets/home/home9.png"
              alt="David Levine"
              className="w-full h-full rounded-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">
              David Levine
            </p>
            <p className="text-accent text-[10px] font-medium">Creator</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
