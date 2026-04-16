'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { useStudio } from '@/lib/studio-context'
import { useAuth } from '@/lib/auth-context'
import {
  CreateAgentChoiceModal,
  CreatePresenceModal,
  CreateWorkerAgentModal,
} from '@/components/AgentModals'
import type { Presence } from '@/lib/agent-types'
import { listAgents, deleteAgent as deleteAgentApi } from '@/lib/agents-api'

export default function AgentsPage() {
  const router = useRouter()
  const { currentPlatform } = useStudio()
  const { user } = useAuth()
  const [agents, setAgents] = useState<Presence[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modal states
  const [showChoiceModal, setShowChoiceModal] = useState(false)
  const [showCreatePresence, setShowCreatePresence] = useState(false)
  const [showCreateAgent, setShowCreateAgent] = useState(false)

  // Delete state
  const [agentToDelete, setAgentToDelete] = useState<Presence | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchAgents = useCallback(async () => {
    if (!user?.wallet) return

    setLoading(true)
    try {
      const result = await listAgents({
        wallet: user.wallet,
        platformId: currentPlatform?.id,
        includeWorkers: true,
      })
      setAgents(result.agents || [])
    } catch (error) {
      console.error('Error fetching agents:', error)
    } finally {
      setLoading(false)
    }
  }, [currentPlatform?.id, user?.wallet])

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  // Delete agent handler
  async function handleDeleteAgent() {
    if (!agentToDelete) return

    setDeleting(true)
    try {
      await deleteAgentApi(agentToDelete.id)
      setAgents((prev) => prev.filter((a) => a.id !== agentToDelete.id))
      setAgentToDelete(null)
    } catch (error) {
      console.error('Error deleting agent:', error)
    } finally {
      setDeleting(false)
    }
  }

  // Filter agents by search
  const filtered = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      (a.briefDescription &&
        a.briefDescription.toLowerCase().includes(search.toLowerCase())) ||
      (a.description &&
        a.description.toLowerCase().includes(search.toLowerCase())) ||
      (a.handle && a.handle.toLowerCase().includes(search.toLowerCase()))
  )

  // Get presences only (for Worker creation requirement)
  const presences = agents.filter((a) => a.type === 'PRESENCE')

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Agents</h1>
          <p className="text-muted mt-1">
            {agents.length} agent{agents.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowChoiceModal(true)}
          className="bg-accent hover:bg-accent-dark text-white font-semibold px-5 py-2.5 rounded-full transition-colors flex items-center gap-2"
        >
          <Icon icon="lucide:plus" width={18} height={18} />
          Create New Agent
        </button>
      </div>

      {/* Search */}
      {agents.length > 0 && (
        <div className="mb-6">
          <div className="relative">
            <Icon
              icon="lucide:search"
              width={16}
              height={16}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agents…"
              className="w-full bg-input border border-card-border rounded-xl pl-10 pr-4 py-3 text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50"
            />
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-16">
          <Icon
            icon="lucide:loader-2"
            width={40}
            height={40}
            className="mx-auto mb-3 text-muted animate-spin"
          />
          <p className="text-muted">Loading agents…</p>
        </div>
      )}

      {/* Grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((agent) => (
            <div
              key={agent.id}
              className="bg-card border border-card-border rounded-xl p-5 text-left hover:border-accent/50 transition-all hover:bg-white/[0.04] group relative"
            >
              {/* Clickable area for navigation */}
              <button
                onClick={() => router.push(`/agent/${agent.id}`)}
                className="w-full text-left"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
                    {agent.type?.toLowerCase() === 'presence' ? (
                      <Icon
                        icon="lucide:crown"
                        width={20}
                        height={20}
                        className="text-accent"
                      />
                    ) : (
                      <Icon
                        icon="lucide:bot"
                        width={20}
                        height={20}
                        className="text-accent"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                        agent.type?.toLowerCase() === 'presence'
                          ? 'bg-accent/20 text-accent'
                          : 'bg-white/[0.08] text-white/60'
                      }`}
                    >
                      {agent.type?.toLowerCase() === 'presence'
                        ? 'Supervisor'
                        : 'Worker'}
                    </span>
                    <Icon
                      icon="lucide:chevron-right"
                      width={18}
                      height={18}
                      className="text-muted group-hover:text-accent transition-colors"
                    />
                  </div>
                </div>

                <h3 className="text-white font-semibold text-lg mb-1 truncate">
                  {agent.name}
                </h3>

                {agent.handle && (
                  <p className="text-xs text-muted/70 mb-1">@{agent.handle}</p>
                )}

                {agent.briefDescription ? (
                  <p className="text-sm text-muted/70 italic line-clamp-1 mb-1">
                    &ldquo;{agent.briefDescription}&rdquo;
                  </p>
                ) : null}

                {agent.description ? (
                  <p className="text-sm text-muted line-clamp-2 mb-3">
                    {agent.description}
                  </p>
                ) : (
                  <p className="text-sm text-muted/50 italic mb-3">
                    No description yet
                  </p>
                )}

                {/* Chips */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {agent.knowledgeBaseIds &&
                    agent.knowledgeBaseIds.length > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06] text-muted flex items-center gap-1">
                        <Icon icon="lucide:brain" width={10} height={10} />
                        {agent.knowledgeBaseIds.length} KB
                      </span>
                    )}
                  {agent.promptId && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06] text-muted flex items-center gap-1">
                      <Icon
                        icon="lucide:message-square-code"
                        width={10}
                        height={10}
                      />
                      Prompt
                    </span>
                  )}
                  {agent.signals && agent.signals.length > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06] text-muted flex items-center gap-1">
                      <Icon icon="lucide:activity" width={10} height={10} />
                      {agent.signals.length} signal
                      {agent.signals.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {agent.role && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06] text-muted">
                      {agent.role}
                    </span>
                  )}
                  {agent.accessLevel &&
                    agent.type?.toLowerCase() === 'worker' && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${
                          agent.accessLevel?.toLowerCase() === 'public'
                            ? 'bg-green-500/10 text-green-400'
                            : agent.accessLevel?.toLowerCase() === 'private'
                              ? 'bg-white/[0.06] text-muted'
                              : agent.accessLevel?.toLowerCase() === 'admin'
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-accent/10 text-accent'
                        }`}
                      >
                        <Icon
                          icon={
                            agent.accessLevel?.toLowerCase() === 'public'
                              ? 'lucide:globe'
                              : agent.accessLevel?.toLowerCase() === 'private'
                                ? 'lucide:lock'
                                : agent.accessLevel?.toLowerCase() === 'admin'
                                  ? 'lucide:shield'
                                  : 'lucide:user'
                          }
                          width={10}
                          height={10}
                        />
                        {agent.accessLevel.charAt(0).toUpperCase() +
                          agent.accessLevel.slice(1).toLowerCase()}
                      </span>
                    )}
                </div>

                <p className="text-xs text-muted mt-3">
                  Updated {new Date(agent.updatedAt).toLocaleDateString()}
                </p>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && agents.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-accent/15 flex items-center justify-center mx-auto mb-4">
            <Icon
              icon="lucide:user-round"
              width={32}
              height={32}
              className="text-accent"
            />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">
            No agents yet
          </h3>
          <p className="text-muted mb-6 max-w-md mx-auto">
            Create a Presence (supervisor) to orchestrate your AI agents, or a
            worker Agent to handle specific tasks.
          </p>
          <button
            onClick={() => setShowChoiceModal(true)}
            className="bg-accent hover:bg-accent-dark text-white font-semibold px-6 py-3 rounded-full transition-colors"
          >
            + Create New Agent
          </button>
        </div>
      )}

      {/* No search results */}
      {!loading && agents.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted">No agents match &ldquo;{search}&rdquo;</p>
        </div>
      )}

      {/* Choice modal */}
      {showChoiceModal && (
        <CreateAgentChoiceModal
          onClose={() => setShowChoiceModal(false)}
          onChoosePresence={() => {
            setShowChoiceModal(false)
            setShowCreatePresence(true)
          }}
          onChooseAgent={() => {
            setShowChoiceModal(false)
            setShowCreateAgent(true)
          }}
          presences={presences}
        />
      )}

      {/* Create Presence (supervisor) modal - pass wallet */}
      {showCreatePresence && user?.wallet && (
        <CreatePresenceModal
          onClose={() => setShowCreatePresence(false)}
          platformId={currentPlatform?.id}
          wallet={user.wallet}
          onCreate={() => {
            setShowCreatePresence(false)
            fetchAgents()
          }}
        />
      )}

      {/* Create worker Agent modal - pass wallet */}
      {showCreateAgent && user?.wallet && (
        <CreateWorkerAgentModal
          onClose={() => setShowCreateAgent(false)}
          platformId={currentPlatform?.id}
          wallet={user.wallet}
          onCreated={() => {
            setShowCreateAgent(false)
            fetchAgents()
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {agentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !deleting && setAgentToDelete(null)}
          />
          <div className="relative bg-card border border-card-border rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-red-500/15 flex items-center justify-center">
                <Icon
                  icon="lucide:alert-triangle"
                  width={24}
                  height={24}
                  className="text-red-400"
                />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Delete Agent
                </h3>
                <p className="text-sm text-muted">
                  This action cannot be undone
                </p>
              </div>
            </div>

            <p className="text-foreground mb-6">
              Are you sure you want to delete{' '}
              <span className="font-semibold text-white">
                {agentToDelete.name}
              </span>
              {agentToDelete.handle && (
                <span className="text-muted"> (@{agentToDelete.handle})</span>
              )}
              ?
              {agentToDelete.type?.toLowerCase() === 'presence' && (
                <span className="block mt-2 text-sm text-amber-400">
                  ⚠️ Deleting your Presence will also remove all associated
                  workers.
                </span>
              )}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setAgentToDelete(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl border border-card-border text-foreground hover:bg-white/[0.04] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAgent}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <>
                    <Icon
                      icon="lucide:loader-2"
                      width={16}
                      height={16}
                      className="animate-spin"
                    />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Icon icon="lucide:trash-2" width={16} height={16} />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}