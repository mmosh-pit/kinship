"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { FileDropzone } from "@/components/FileDropzone";
import { KBItemsList } from "@/components/KBItemsList";

interface KBItem {
  id: string;
  name: string;
  type: "file" | "ai-generated" | "drive-link";
  status: "pending" | "processing" | "ingested" | "failed";
  createdAt: string;
  url?: string;
  chunkCount?: number;
  error?: string;
}

interface KBDetail {
  id: string;
  name: string;
  namespace: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  items: KBItem[];
}

const AGENT_API_URL = process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:8000";

export default function KnowledgeBaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: kbId } = use(params);
  const router = useRouter();

  const [kb, setKB] = useState<KBDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [activeSection, setActiveSection] = useState<"upload" | null>(null);
  
  // Edit name state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchKB = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_API_URL}/api/knowledge/${kbId}`);
      if (res.ok) {
        const data = await res.json();
        setKB(data);
        setEditName(data.name);
      } else if (res.status === 404) {
        router.push("/knowledge");
      }
    } catch (err) {
      console.error("Failed to fetch KB:", err);
    } finally {
      setLoading(false);
    }
  }, [kbId, router]);

  useEffect(() => {
    fetchKB();
  }, [fetchKB]);

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this knowledge base? This will remove all documents and vectors permanently.")) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`${AGENT_API_URL}/api/knowledge/${kbId}`, {
        method: "DELETE",
      });
      if (res.ok || res.status === 204) {
        router.push("/knowledge");
      }
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeleting(false);
    }
  }

  async function handleSaveName() {
    if (!editName.trim() || editName === kb?.name) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${AGENT_API_URL}/api/knowledge/${kbId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setKB((prev) => prev ? { ...prev, name: data.name } : null);
        setEditing(false);
      }
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-16">
        <Icon
          icon="lucide:loader-2"
          width={40}
          height={40}
          className="mx-auto mb-3 text-muted animate-spin"
        />
        <p className="text-muted">Loading knowledge base...</p>
      </div>
    );
  }

  if (!kb) {
    return (
      <div className="text-center py-16">
        <Icon
          icon="lucide:alert-circle"
          width={40}
          height={40}
          className="mx-auto mb-3 text-red-400"
        />
        <p className="text-muted mb-4">Knowledge base not found</p>
        <Link
          href="/knowledge"
          className="inline-flex items-center gap-2 bg-accent hover:bg-accent-dark text-white font-semibold px-5 py-2.5 rounded-full transition-colors"
        >
          <Icon icon="lucide:arrow-left" width={16} height={16} />
          Back to Knowledge Bases
        </Link>
      </div>
    );
  }

  // Count items by status
  const ingestedCount = kb.items.filter(i => i.status === "ingested").length;
  const pendingCount = kb.items.filter(i => i.status === "pending" || i.status === "processing").length;
  const failedCount = kb.items.filter(i => i.status === "failed").length;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted mb-4">
        <Link
          href="/knowledge"
          className="hover:text-accent transition-colors"
        >
          Inform
        </Link>
        <Icon icon="lucide:chevron-right" width={14} height={14} />
        <span className="text-foreground">{kb.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex-1">
          {editing ? (
            <div className="flex items-center gap-3 mb-2">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-3xl font-bold text-white bg-transparent border-b-2 border-accent focus:outline-none"
                autoFocus
              />
              <button
                onClick={handleSaveName}
                disabled={saving}
                className="p-2 bg-accent hover:bg-accent-dark rounded-lg transition-colors"
              >
                {saving ? (
                  <Icon icon="lucide:loader-2" width={18} height={18} className="text-white animate-spin" />
                ) : (
                  <Icon icon="lucide:check" width={18} height={18} className="text-white" />
                )}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setEditName(kb.name);
                }}
                className="p-2 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg transition-colors"
              >
                <Icon icon="lucide:x" width={18} height={18} className="text-muted" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-white">{kb.name}</h1>
              <button
                onClick={() => setEditing(true)}
                className="p-1.5 text-muted hover:text-accent transition-colors"
              >
                <Icon icon="lucide:pencil" width={16} height={16} />
              </button>
            </div>
          )}
          <div className="flex items-center gap-4 text-muted">
            <span className="flex items-center gap-1">
              <Icon icon="lucide:files" width={14} height={14} />
              {kb.items.length} item{kb.items.length !== 1 ? "s" : ""}
            </span>
            {ingestedCount > 0 && (
              <span className="flex items-center gap-1 text-green-500">
                <Icon icon="lucide:check-circle" width={14} height={14} />
                {ingestedCount} ingested
              </span>
            )}
            {pendingCount > 0 && (
              <span className="flex items-center gap-1 text-yellow-500">
                <Icon icon="lucide:clock" width={14} height={14} />
                {pendingCount} pending
              </span>
            )}
            {failedCount > 0 && (
              <span className="flex items-center gap-1 text-red-500">
                <Icon icon="lucide:x-circle" width={14} height={14} />
                {failedCount} failed
              </span>
            )}
            <span>Created {new Date(kb.createdAt).toLocaleDateString()}</span>
          </div>
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

      {/* Action Button */}
      <div className="mb-6">
        <button
          onClick={() => setActiveSection(activeSection === "upload" ? null : "upload")}
          className={`p-4 rounded-xl border text-left transition-all flex items-center gap-3 w-full md:w-auto ${
            activeSection === "upload"
              ? "bg-accent/10 border-accent/50"
              : "bg-card border-card-border hover:border-accent/30"
          }`}
        >
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              activeSection === "upload" ? "bg-accent/20" : "bg-white/[0.06]"
            }`}
          >
            <Icon
              icon="lucide:upload-cloud"
              width={20}
              height={20}
              className={activeSection === "upload" ? "text-accent" : "text-muted"}
            />
          </div>
          <div>
            <p className="text-foreground font-medium text-sm">Upload Files</p>
            <p className="text-xs text-muted">TXT, DOCX</p>
          </div>
          <Icon
            icon={activeSection === "upload" ? "lucide:chevron-up" : "lucide:chevron-down"}
            width={18}
            height={18}
            className="text-muted ml-auto"
          />
        </button>
      </div>

      {/* Active Section Panel */}
      {activeSection === "upload" && (
        <div className="bg-card border border-card-border rounded-xl p-5 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Upload Files</h3>
            <button
              onClick={() => setActiveSection(null)}
              className="text-muted hover:text-white transition-colors"
            >
              <Icon icon="lucide:x" width={18} height={18} />
            </button>
          </div>
          <FileDropzone kbId={kbId} onUploadComplete={fetchKB} />
        </div>
      )}

      {/* Vector Storage Info */}
      <div className="bg-card border border-card-border rounded-xl p-5 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500/15 flex items-center justify-center">
            <Icon icon="lucide:database" width={20} height={20} className="text-purple-400" />
          </div>
          <div className="flex-1">
            <p className="text-white font-medium text-sm">Pinecone Namespace</p>
            <p className="text-xs text-muted font-mono">{kb.namespace || kb.id}</p>
          </div>
          <div className="text-right">
            <p className="text-white font-medium text-sm">{ingestedCount} vectors</p>
            <p className="text-xs text-muted">stored in Pinecone</p>
          </div>
        </div>
      </div>

      {/* Items List */}
      <div>
        <h3 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
          <Icon icon="lucide:files" width={20} height={20} className="text-muted" />
          Items
          {kb.items.length > 0 && (
            <span className="text-sm font-normal text-muted">
              ({kb.items.length})
            </span>
          )}
        </h3>
        <KBItemsList
          kbId={kbId}
          items={kb.items}
          onItemRemoved={fetchKB}
        />
      </div>
    </div>
  );
}
