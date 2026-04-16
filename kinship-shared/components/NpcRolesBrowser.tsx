'use client'

import { useState, useEffect } from 'react'
import { knowledgeApi } from '@/lib/api'
import type { NpcRole } from '@/lib/types'

interface Props {
  onSelectRole?: (role: string) => void
  compact?: boolean
}

const ROLE_ICONS: Record<string, string> = {
  guide: '🧭',
  quest_giver: '📜',
  merchant: '🛒',
  helper: '🤝',
  guardian: '🛡️',
  villager: '🏠',
}

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  guide: { bg: 'bg-blue-500/15', text: 'text-blue-400' },
  quest_giver: { bg: 'bg-amber-500/15', text: 'text-amber-400' },
  merchant: { bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  helper: { bg: 'bg-pink-500/15', text: 'text-pink-400' },
  guardian: { bg: 'bg-purple-500/15', text: 'text-purple-400' },
  villager: { bg: 'bg-teal-500/15', text: 'text-teal-400' },
}

export default function NpcRolesBrowser({ onSelectRole, compact = true }: Props) {
  const [roles, setRoles] = useState<NpcRole[]>([])
  const [mechanicToRole, setMechanicToRole] = useState<Record<string, string[]>>({})
  const [selectedRole, setSelectedRole] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadRoles()
  }, [])

  const loadRoles = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await knowledgeApi.getNpcRoles()
      setRoles(data.roles)
      setMechanicToRole(data.mechanic_to_role)
    } catch (err) {
      console.error('Failed to load NPC roles:', err)
      setError('Failed to load roles')
    } finally {
      setLoading(false)
    }
  }

  const selectRole = (role: string) => {
    if (selectedRole === role) {
      setSelectedRole(null)
    } else {
      setSelectedRole(role)
      onSelectRole?.(role)
    }
  }

  const getRoleStyle = (role: string) =>
    ROLE_COLORS[role] || { bg: 'bg-white/[0.1]', text: 'text-white/70' }

  const getRoleIcon = (role: string) => ROLE_ICONS[role] || '👤'

  const selectedRoleData = roles.find((r) => r.role === selectedRole)

  if (compact) {
    return (
      <div className="bg-card rounded-xl p-3 border border-card-border">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">🧑</span>
            <span className="text-xs font-medium text-white">NPC Roles</span>
          </div>
          <span className="text-[10px] text-muted">
            {roles.length} roles {isExpanded ? '▾' : '▸'}
          </span>
        </button>

        {isExpanded && (
          <div className="mt-3">
            {loading && !roles.length ? (
              <p className="text-[10px] text-muted">Loading...</p>
            ) : error ? (
              <p className="text-[10px] text-red-400">{error}</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {roles.map((r) => {
                    const style = getRoleStyle(r.role)
                    return (
                      <button
                        key={r.role}
                        onClick={() => selectRole(r.role)}
                        className={`text-[10px] px-2 py-1 rounded-md transition-colors flex items-center gap-1 ${
                          selectedRole === r.role
                            ? `${style.bg} ${style.text} ring-1 ring-current`
                            : `${style.bg} ${style.text} hover:opacity-80`
                        }`}
                      >
                        <span className="text-[9px]">{getRoleIcon(r.role)}</span>
                        {r.role.replace('_', ' ')}
                      </button>
                    )
                  })}
                </div>

                {/* Selected Role Detail */}
                {selectedRoleData && (
                  <div className="mt-2 p-2 bg-white/[0.05] rounded-lg border border-white/[0.08]">
                    <div className="flex items-center gap-2 mb-1">
                      <span>{getRoleIcon(selectedRoleData.role)}</span>
                      <p className="text-xs font-medium text-white capitalize">
                        {selectedRoleData.role.replace('_', ' ')}
                      </p>
                    </div>
                    <p className="text-[10px] text-muted mb-2">
                      {selectedRoleData.description}
                    </p>

                    {/* Supported Mechanics */}
                    {selectedRoleData.supported_mechanics.length > 0 && (
                      <div>
                        <p className="text-[9px] text-muted mb-1">
                          Supported mechanics:
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {selectedRoleData.supported_mechanics.map((m) => (
                            <span
                              key={m}
                              className="text-[9px] px-1.5 py-0.5 bg-purple-500/15 text-purple-400 rounded"
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  // Full view
  return (
    <div className="bg-card rounded-xl p-4 border border-card-border">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm">🧑</span>
          <span className="text-sm font-medium text-white">NPC Roles</span>
          <span className="text-xs text-muted">({roles.length})</span>
        </div>
        <button
          onClick={loadRoles}
          disabled={loading}
          className="text-[10px] text-muted hover:text-white transition-colors"
        >
          {loading ? '...' : '↻ Refresh'}
        </button>
      </div>

      {error ? (
        <p className="text-xs text-red-400">{error}</p>
      ) : (
        <div className="space-y-2">
          {roles.map((r) => {
            const style = getRoleStyle(r.role)
            const isSelected = selectedRole === r.role

            return (
              <button
                key={r.role}
                onClick={() => selectRole(r.role)}
                className={`w-full text-left p-3 rounded-lg transition-all ${
                  isSelected
                    ? `${style.bg} ring-1 ring-current ${style.text}`
                    : 'bg-white/[0.03] hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{getRoleIcon(r.role)}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white capitalize">
                      {r.role.replace('_', ' ')}
                    </p>
                    <p className="text-xs text-muted mt-0.5">{r.description}</p>
                  </div>
                  <span className="text-xs text-muted">
                    {r.supported_mechanics.length} mechanics
                  </span>
                </div>

                {/* Expanded detail */}
                {isSelected && (
                  <div className="mt-3 pt-3 border-t border-white/[0.1]">
                    <p className="text-[10px] text-muted mb-1.5">
                      Supported mechanics:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {r.supported_mechanics.map((m) => (
                        <span
                          key={m}
                          className="text-[10px] px-2 py-0.5 bg-purple-500/15 text-purple-400 rounded-md"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Mechanic to Role Mapping */}
      {Object.keys(mechanicToRole).length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/[0.1]">
          <p className="text-xs text-muted mb-2">Mechanic → Role Mapping</p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {Object.entries(mechanicToRole)
              .slice(0, 6)
              .map(([mechanic, rolesList]) => (
                <div
                  key={mechanic}
                  className="flex items-center justify-between text-[10px]"
                >
                  <span className="text-white">{mechanic}</span>
                  <div className="flex gap-1">
                    {rolesList.map((role) => (
                      <span
                        key={role}
                        className={`px-1.5 py-0.5 rounded ${getRoleStyle(role).bg} ${getRoleStyle(role).text}`}
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
