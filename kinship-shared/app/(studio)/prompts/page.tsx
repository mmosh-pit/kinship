"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { useAuth } from "@/lib/auth-context";
import { useStudio } from "@/lib/studio-context";

interface Prompt {
  id: string;
  name: string;
  content: string;
  tone?: string;
  persona?: string;
  audience?: string;
  format?: string;
  goal?: string;
  connectedKBId?: string;
  connectedKBName?: string;
  category?: string;
  tier: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const AGENT_API_URL = process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:8000";

export default function PromptsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentPlatform } = useStudio();
  
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");

  const fetchPrompts = useCallback(async () => {
    if (!user?.wallet) return;
    
    setLoading(true);
    try {
      const params = new URLSearchParams({ wallet: user.wallet });
      if (currentPlatform?.id) {
        params.append("platformId", currentPlatform.id);
      }
      
      const res = await fetch(`${AGENT_API_URL}/api/prompts?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPrompts(data.prompts || []);
      }
    } catch (err) {
      console.error("Failed to fetch prompts:", err);
    } finally {
      setLoading(false);
    }
  }, [user?.wallet, currentPlatform?.id]);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  const filtered = prompts.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.goal && p.goal.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Instruct</h1>
          <p className="text-muted mt-1">
            {prompts.length} prompt{prompts.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-accent hover:bg-accent-dark text-white font-semibold px-5 py-2.5 rounded-full transition-colors flex items-center gap-2"
        >
          <Icon icon="lucide:plus" width={18} height={18} />
          Create Prompt
        </button>
      </div>

      {/* Search */}
      {prompts.length > 0 && (
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
              placeholder="Search prompts..."
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
          <p className="text-muted">Loading prompts...</p>
        </div>
      )}

      {/* Prompt Grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((prompt) => (
            <button
              key={prompt.id}
              onClick={() => router.push(`/prompts/${prompt.id}`)}
              className="bg-card border border-card-border rounded-xl p-5 text-left hover:border-accent/50 transition-all hover:bg-white/[0.04] group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-accent/15 flex items-center justify-center">
                  <Icon icon="lucide:file-text" width={20} height={20} className="text-accent" />
                </div>
                <Icon
                  icon="lucide:chevron-right"
                  width={18}
                  height={18}
                  className="text-muted group-hover:text-accent transition-colors mt-1"
                />
              </div>
              <h3 className="text-white font-semibold text-lg mb-1 truncate">{prompt.name}</h3>

              {/* Preview of content */}
              {prompt.content ? (
                <p className="text-sm text-muted line-clamp-2 mb-3">{prompt.content}</p>
              ) : (
                <p className="text-sm text-muted/50 italic mb-3">No content yet</p>
              )}

              {/* Tags */}
              <div className="flex flex-wrap items-center gap-1.5">
                {prompt.tone && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent/80">
                    {prompt.tone}
                  </span>
                )}
                {prompt.persona && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06] text-muted">
                    {prompt.persona}
                  </span>
                )}
                {prompt.connectedKBName && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06] text-muted flex items-center gap-1">
                    <Icon icon="lucide:brain" width={10} height={10} />
                    {prompt.connectedKBName}
                  </span>
                )}
              </div>

              <p className="text-xs text-muted mt-3">
                Updated {new Date(prompt.updatedAt).toLocaleDateString()}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && prompts.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-accent/15 flex items-center justify-center mx-auto mb-4">
            <Icon icon="lucide:file-text" width={32} height={32} className="text-accent" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No prompts yet</h3>
          <p className="text-muted mb-6 max-w-md mx-auto">
            Create prompts to guide AI behavior. Define tone, persona, and goals for your agents.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-accent hover:bg-accent-dark text-white font-semibold px-6 py-3 rounded-full transition-colors"
          >
            + Create Prompt
          </button>
        </div>
      )}

      {/* No search results */}
      {!loading && prompts.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted">No prompts match &ldquo;{search}&rdquo;</p>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreatePromptModal
          onClose={() => setShowCreate(false)}
          wallet={user?.wallet || ""}
          platformId={currentPlatform?.id}
          onCreate={(p) => {
            setShowCreate(false);
            router.push(`/prompts/${p.id}`);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Create Prompt Modal
// ─────────────────────────────────────────────────────────────────────────────

interface CreatePromptModalProps {
  onClose: () => void;
  onCreate: (prompt: { id: string; name: string }) => void;
  wallet: string;
  platformId?: string;
}

function CreatePromptModal({ onClose, onCreate, wallet, platformId }: CreatePromptModalProps) {
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
      const res = await fetch(`${AGENT_API_URL}/api/prompts`, {
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

      const prompt = await res.json();
      onCreate(prompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer" onClick={onClose} />
      <div className="relative bg-card border border-card-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Create Prompt</h2>
          <button onClick={onClose} className="text-muted hover:text-white transition-colors cursor-pointer">
            <Icon icon="lucide:x" width={20} height={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="block text-sm text-muted mb-2">🧠 System Prompt Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={NAME_MAX_LENGTH}
            placeholder="e.g. Game Master, Onboarding Guide, Combat Narrator..."
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
            Give this prompt a descriptive name — you can edit and refine it after creating.
          </p>

          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

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
                <Icon icon="lucide:loader-2" width={16} height={16} className="animate-spin" />
              )}
              Create Prompt
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}