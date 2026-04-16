"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { useAuth } from "@/lib/auth-context";
import { useStudio } from "@/lib/studio-context";

interface KnowledgeBase {
  id: string;
  name: string;
  namespace: string;
  createdAt: string;
  itemCount: number;
}

const AGENT_API_URL = process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:8000";

export default function KnowledgePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentPlatform } = useStudio();
  
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");

  const fetchKBs = useCallback(async () => {
    if (!user?.wallet) return;
    
    setLoading(true);
    try {
      const params = new URLSearchParams({ wallet: user.wallet });
      if (currentPlatform?.id) {
        params.append("platformId", currentPlatform.id);
      }
      
      const res = await fetch(`${AGENT_API_URL}/api/knowledge?${params}`);
      if (res.ok) {
        const data = await res.json();
        setKnowledgeBases(data.knowledgeBases || []);
      }
    } catch (err) {
      console.error("Failed to fetch KBs:", err);
    } finally {
      setLoading(false);
    }
  }, [user?.wallet, currentPlatform?.id]);

  useEffect(() => {
    fetchKBs();
  }, [fetchKBs]);

  const filtered = knowledgeBases.filter((kb) =>
    kb.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Inform</h1>
          <p className="text-muted mt-1">
            {knowledgeBases.length} knowledge base{knowledgeBases.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-accent hover:bg-accent-dark text-white font-semibold px-5 py-2.5 rounded-full transition-colors flex items-center gap-2"
        >
          <Icon icon="lucide:plus" width={18} height={18} />
          Create Knowledge Base
        </button>
      </div>

      {/* Search */}
      {knowledgeBases.length > 0 && (
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
              placeholder="Search knowledge bases..."
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
          <p className="text-muted">Loading knowledge bases...</p>
        </div>
      )}

      {/* KB Grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((kb) => (
            <button
              key={kb.id}
              onClick={() => router.push(`/knowledge/${kb.id}`)}
              className="bg-card border border-card-border rounded-xl p-5 text-left hover:border-accent/50 transition-all hover:bg-white/[0.04] group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-accent/15 flex items-center justify-center">
                  <Icon
                    icon="lucide:brain"
                    width={20}
                    height={20}
                    className="text-accent"
                  />
                </div>
                <Icon
                  icon="lucide:chevron-right"
                  width={18}
                  height={18}
                  className="text-muted group-hover:text-accent transition-colors mt-1"
                />
              </div>
              <h3 className="text-white font-semibold text-lg mb-1 truncate">
                {kb.name}
              </h3>
              <div className="flex items-center gap-4 text-sm text-muted">
                <span className="flex items-center gap-1">
                  <Icon icon="lucide:file-text" width={14} height={14} />
                  {kb.itemCount} item{kb.itemCount !== 1 ? "s" : ""}
                </span>
                <span>
                  {new Date(kb.createdAt).toLocaleDateString()}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && knowledgeBases.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-accent/15 flex items-center justify-center mx-auto mb-4">
            <Icon icon="lucide:brain" width={32} height={32} className="text-accent" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">
            No knowledge bases yet
          </h3>
          <p className="text-muted mb-6 max-w-md mx-auto">
            Create a knowledge base to store documents, files, and AI-generated
            content for your AI interactions.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-accent hover:bg-accent-dark text-white font-semibold px-6 py-3 rounded-full transition-colors"
          >
            + Create Knowledge Base
          </button>
        </div>
      )}

      {/* No search results */}
      {!loading && knowledgeBases.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted">No knowledge bases match &ldquo;{search}&rdquo;</p>
        </div>
      )}

      {/* Create modal - Name only */}
      {showCreate && (
        <CreateKBModal
          onClose={() => setShowCreate(false)}
          wallet={user?.wallet || ""}
          platformId={currentPlatform?.id}
          onCreate={(kb) => {
            setShowCreate(false);
            router.push(`/knowledge/${kb.id}`);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Create Knowledge Base Modal - Name Only
// ─────────────────────────────────────────────────────────────────────────────

interface CreateKBModalProps {
  onClose: () => void;
  onCreate: (kb: { id: string; name: string; namespace: string }) => void;
  wallet: string;
  platformId?: string;
}

function CreateKBModal({ onClose, onCreate, wallet, platformId }: CreateKBModalProps) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Validation constants
  const NAME_MIN_LENGTH = 3;
  const NAME_MAX_LENGTH = 100;

  // Validation helpers
  const nameLength = name.trim().length;
  const isNameTooShort = nameLength > 0 && nameLength < NAME_MIN_LENGTH;
  const isNameTooLong = nameLength > NAME_MAX_LENGTH;
  const isNameValid = nameLength >= NAME_MIN_LENGTH && nameLength <= NAME_MAX_LENGTH;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    // Validation checks
    if (nameLength < NAME_MIN_LENGTH) {
      setError(`Name must be at least ${NAME_MIN_LENGTH} characters`);
      return;
    }
    if (nameLength > NAME_MAX_LENGTH) {
      setError(`Name must be no more than ${NAME_MAX_LENGTH} characters`);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${AGENT_API_URL}/api/knowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name: name.trim(), 
          wallet,
          platformId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || data.detail || "Failed to create");
      }

      const kb = await res.json();
      onCreate(kb);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-card border border-card-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">
            Create Knowledge Base
          </h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-white transition-colors cursor-pointer"
          >
            <Icon icon="lucide:x" width={20} height={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="block text-sm text-muted mb-2">
            📘 Knowledge Base Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={NAME_MAX_LENGTH}
            placeholder="e.g. Product Documentation, Research Papers..."
            className={`w-full bg-input border rounded-xl px-4 py-3 text-foreground placeholder:text-muted focus:outline-none transition-colors ${
              isNameTooShort || isNameTooLong
                ? 'border-red-500/50 focus:border-red-500/70'
                : 'border-card-border focus:border-accent/50'
            }`}
            autoFocus
            disabled={loading}
          />
          
          {/* Validation feedback */}
          <div className="flex justify-between items-center mt-1.5 mb-1">
            <div className="text-xs">
              {isNameTooShort && (
                <span className="text-red-400">
                  ⚠ Min {NAME_MIN_LENGTH} characters required
                </span>
              )}
            </div>
            <span className={`text-xs ${
              isNameTooLong 
                ? 'text-red-400' 
                : isNameTooShort 
                  ? 'text-amber-400' 
                  : 'text-muted'
            }`}>
              {nameLength}/{NAME_MAX_LENGTH}
            </span>
          </div>
          
          <p className="text-xs text-muted mb-5">
            A new Pinecone namespace will be created for this knowledge base.
          </p>

          {error && (
            <p className="text-red-400 text-sm mb-4">{error}</p>
          )}

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-full border border-card-border text-foreground hover:border-accent/50 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isNameValid || loading}
              className="bg-accent hover:bg-accent-dark text-white font-semibold px-6 py-2.5 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading && (
                <Icon
                  icon="lucide:loader-2"
                  width={16}
                  height={16}
                  className="animate-spin"
                />
              )}
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}