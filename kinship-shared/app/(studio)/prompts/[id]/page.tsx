"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { useAuth } from "@/lib/auth-context";

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

interface KnowledgeBase {
  id: string;
  name: string;
}

const AGENT_API_URL = process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:8000";

const TONES = ["", "Professional", "Casual", "Empathetic", "Direct", "Playful", "Authoritative", "Friendly", "Neutral"];
const PERSONAS = ["", "Assistant", "Mentor", "Expert", "Character", "Narrator", "Teacher", "Coach", "Game Master"];
const AUDIENCES = ["", "General", "Technical", "Non-technical", "Children", "Students", "Professionals", "Developers", "Players"];
const FORMATS = ["", "Paragraph", "Bullet points", "Step-by-step", "Dialogue", "Structured", "Free-form"];

export default function PromptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: promptId } = use(params);
  const router = useRouter();
  const { user } = useAuth();

  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const originalContentRef = useRef("");

  // Editor fields
  const [name, setName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [content, setContent] = useState("");
  const [tone, setTone] = useState("");
  const [persona, setPersona] = useState("");
  const [audience, setAudience] = useState("");
  const [format, setFormat] = useState("");
  const [goal, setGoal] = useState("");
  const [connectedKBId, setConnectedKBId] = useState("");
  const [connectedKBName, setConnectedKBName] = useState("");

  // KB list
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);

  // Panel state
  const [activePanel, setActivePanel] = useState<"guidance" | null>(null);

  const fetchPrompt = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_API_URL}/api/prompts/${promptId}`);
      if (res.ok) {
        const data: Prompt = await res.json();
        setPrompt(data);
        setName(data.name);
        const c = data.content || "";
        setContent(c);
        if (!c) setIsEditing(true);
        setTone(data.tone || "");
        setPersona(data.persona || "");
        setAudience(data.audience || "");
        setFormat(data.format || "");
        setGoal(data.goal || "");
        setConnectedKBId(data.connectedKBId || "");
        setConnectedKBName(data.connectedKBName || "");
      } else if (res.status === 404) {
        router.push("/prompts");
      }
    } catch (err) {
      console.error("Failed to fetch prompt:", err);
    } finally {
      setLoading(false);
    }
  }, [promptId, router]);

  const fetchKBs = useCallback(async () => {
    if (!user?.wallet) return;
    try {
      const res = await fetch(`${AGENT_API_URL}/api/knowledge?wallet=${user.wallet}`);
      if (res.ok) {
        const data = await res.json();
        setKbs(data.knowledgeBases || []);
      }
    } catch (err) {
      console.error("Failed to fetch KBs:", err);
    }
  }, [user?.wallet]);

  useEffect(() => {
    fetchPrompt();
    fetchKBs();
  }, [fetchPrompt, fetchKBs]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`${AGENT_API_URL}/api/prompts/${promptId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          tone: tone || null,
          persona: persona || null,
          audience: audience || null,
          format: format || null,
          goal: goal || null,
          connectedKBId: connectedKBId || null,
          connectedKBName: connectedKBName || null,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setPrompt(updated);
        setIsEditing(false);
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2500);
      }
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  }

  function startEditing() {
    originalContentRef.current = content;
    setIsEditing(true);
  }

  function handleCancel() {
    setContent(originalContentRef.current);
    setIsEditing(false);
  }

  async function handleSaveName() {
    if (!name.trim() || name.trim() === prompt?.name) {
      setEditingName(false);
      setName(prompt?.name || "");
      return;
    }
    try {
      const res = await fetch(`${AGENT_API_URL}/api/prompts/${promptId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setPrompt(updated);
        setName(updated.name);
      }
    } catch (err) {
      console.error("Name save failed:", err);
    } finally {
      setEditingName(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this prompt? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`${AGENT_API_URL}/api/prompts/${promptId}`, { method: "DELETE" });
      if (res.ok || res.status === 204) router.push("/prompts");
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeleting(false);
    }
  }

  function handleKBSelect(id: string) {
    setConnectedKBId(id);
    const kb = kbs.find((k) => k.id === id);
    setConnectedKBName(kb?.name || "");
  }

  if (loading) {
    return (
      <div className="text-center py-16">
        <Icon icon="lucide:loader-2" width={40} height={40} className="mx-auto mb-3 text-muted animate-spin" />
        <p className="text-muted">Loading prompt...</p>
      </div>
    );
  }

  if (!prompt) {
    return (
      <div className="text-center py-16">
        <Icon icon="lucide:alert-circle" width={40} height={40} className="mx-auto mb-3 text-red-400" />
        <p className="text-muted mb-4">Prompt not found</p>
        <Link href="/prompts" className="text-accent hover:underline">
          Back to Prompts
        </Link>
      </div>
    );
  }

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  const charCount = content.length;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted mb-4">
        <Link href="/prompts" className="hover:text-accent transition-colors">
          Instruct
        </Link>
        <Icon icon="lucide:chevron-right" width={14} height={14} />
        <span className="text-foreground">{prompt.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1">
          {editingName ? (
            <div className="flex items-center gap-3 mb-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-3xl font-bold text-white bg-transparent border-b-2 border-accent focus:outline-none"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
              />
              <button onClick={handleSaveName} className="p-2 bg-accent hover:bg-accent-dark rounded-lg transition-colors">
                <Icon icon="lucide:check" width={18} height={18} className="text-white" />
              </button>
              <button
                onClick={() => {
                  setEditingName(false);
                  setName(prompt.name);
                }}
                className="p-2 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg transition-colors"
              >
                <Icon icon="lucide:x" width={18} height={18} className="text-muted" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-white">{prompt.name}</h1>
              <button onClick={() => setEditingName(true)} className="p-1.5 text-muted hover:text-accent transition-colors">
                <Icon icon="lucide:pencil" width={16} height={16} />
              </button>
            </div>
          )}
          <p className="text-muted text-sm">
            Created {new Date(prompt.createdAt).toLocaleDateString()} · Updated {new Date(prompt.updatedAt).toLocaleDateString()}
          </p>
        </div>

        <button
          onClick={handleDelete}
          disabled={deleting}
          className="bg-card border border-red-500/30 hover:border-red-500/60 text-red-400 hover:text-red-300 font-medium px-4 py-2.5 rounded-full transition-colors flex items-center gap-2 text-sm"
        >
          {deleting ? (
            <Icon icon="lucide:loader-2" width={16} height={16} className="animate-spin" />
          ) : (
            <Icon icon="lucide:trash-2" width={16} height={16} />
          )}
          Delete
        </button>
      </div>

      {/* Saved Flash */}
      {savedFlash && (
        <div className="fixed top-6 right-6 bg-green-500/90 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-lg z-50 animate-pulse">
          <Icon icon="lucide:check-circle" width={18} height={18} />
          Saved!
        </div>
      )}

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Editor */}
        <div className="lg:col-span-2">
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            {/* Editor Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-card-border">
              <div className="flex items-center gap-3">
                <span className="text-white font-semibold">System Prompt</span>
                {!isEditing && content && (
                  <span className="text-xs text-muted">
                    {wordCount} words · {charCount} chars
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    <button
                      onClick={handleCancel}
                      className="px-3 py-1.5 text-sm text-muted hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="bg-accent hover:bg-accent-dark text-white font-medium px-4 py-1.5 rounded-lg transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
                    >
                      {saving && <Icon icon="lucide:loader-2" width={14} height={14} className="animate-spin" />}
                      Save
                    </button>
                  </>
                ) : (
                  <button
                    onClick={startEditing}
                    className="text-accent hover:text-accent-dark transition-colors text-sm flex items-center gap-1"
                  >
                    <Icon icon="lucide:pencil" width={14} height={14} />
                    Edit
                  </button>
                )}
              </div>
            </div>

            {/* Editor Body */}
            <div className="p-4">
              {isEditing ? (
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write your system prompt here...

Example:
You are a helpful assistant for a fantasy RPG game. Your role is to guide players through quests, provide hints when they're stuck, and maintain an immersive fantasy atmosphere.

Key behaviors:
- Stay in character as a wise guide
- Be encouraging but don't give away solutions too easily
- Reference the game's lore when appropriate"
                  className="w-full bg-transparent text-foreground placeholder:text-muted focus:outline-none resize-none min-h-[400px] font-mono text-sm leading-relaxed"
                  autoFocus
                />
              ) : content ? (
                <pre className="whitespace-pre-wrap text-foreground font-mono text-sm leading-relaxed">
                  {content}
                </pre>
              ) : (
                <div className="text-center py-12">
                  <Icon icon="lucide:file-text" width={40} height={40} className="mx-auto mb-3 text-muted" />
                  <p className="text-muted mb-4">No content yet</p>
                  <button
                    onClick={startEditing}
                    className="bg-accent hover:bg-accent-dark text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm"
                  >
                    Start Writing
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Settings */}
        <div className="space-y-4">
          {/* Guidance Panel */}
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <button
              onClick={() => setActivePanel(activePanel === "guidance" ? null : "guidance")}
              className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
            >
              <span className="text-white font-semibold flex items-center gap-2">
                <Icon icon="lucide:sliders-horizontal" width={18} height={18} className="text-accent" />
                Guidance
              </span>
              <Icon
                icon={activePanel === "guidance" ? "lucide:chevron-up" : "lucide:chevron-down"}
                width={16}
                height={16}
                className="text-muted"
              />
            </button>

            {/* Summary chips when collapsed */}
            {activePanel !== "guidance" && (tone || persona || audience || format || goal) && (
              <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                {tone && <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent/80">{tone}</span>}
                {persona && <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06] text-muted">{persona}</span>}
                {audience && <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06] text-muted">{audience}</span>}
                {format && <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06] text-muted">{format}</span>}
              </div>
            )}

            {activePanel === "guidance" && (
              <div className="px-4 pb-4 space-y-4 border-t border-card-border pt-4">
                <div>
                  <label className="block text-xs text-muted mb-1.5">Tone</label>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    className="w-full bg-input border border-card-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-accent/50"
                  >
                    {TONES.map((t) => (
                      <option key={t} value={t}>{t || "— Select tone —"}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">Persona / Voice</label>
                  <select
                    value={persona}
                    onChange={(e) => setPersona(e.target.value)}
                    className="w-full bg-input border border-card-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-accent/50"
                  >
                    {PERSONAS.map((p) => (
                      <option key={p} value={p}>{p || "— Select persona —"}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">Target Audience</label>
                  <select
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    className="w-full bg-input border border-card-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-accent/50"
                  >
                    {AUDIENCES.map((a) => (
                      <option key={a} value={a}>{a || "— Select audience —"}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">Output Format</label>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    className="w-full bg-input border border-card-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-accent/50"
                  >
                    {FORMATS.map((f) => (
                      <option key={f} value={f}>{f || "— Select format —"}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">Goal</label>
                  <textarea
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="What should this prompt achieve?"
                    rows={3}
                    className="w-full bg-input border border-card-border rounded-lg px-3 py-2 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Knowledge Base */}
          <div className="bg-card border border-card-border rounded-xl p-4">
            <h3 className="text-white font-semibold flex items-center gap-2 mb-3">
              <Icon icon="lucide:brain" width={18} height={18} className="text-accent" />
              Knowledge Base
            </h3>
            <p className="text-xs text-muted mb-3">
              Connect a KB to give context when using this prompt.
            </p>
            <select
              value={connectedKBId}
              onChange={(e) => handleKBSelect(e.target.value)}
              className="w-full bg-input border border-card-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-accent/50"
            >
              <option value="">— No knowledge base —</option>
              {kbs.map((kb) => (
                <option key={kb.id} value={kb.id}>{kb.name}</option>
              ))}
            </select>
            {connectedKBId && (
              <p className="text-xs text-accent mt-2 flex items-center gap-1">
                <Icon icon="lucide:check-circle" width={12} height={12} />
                Connected: {connectedKBName}
              </p>
            )}
          </div>

          {/* Quick Info */}
          <div className="bg-card border border-card-border rounded-xl p-4">
            <h3 className="text-white font-semibold mb-3">Info</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Status</span>
                <span className="text-green-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-400"></span>
                  {prompt.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">ID</span>
                <span className="text-foreground font-mono text-xs">{prompt.id}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
