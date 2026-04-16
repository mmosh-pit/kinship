"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";

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

interface KBItemsListProps {
  kbId: string;
  items: KBItem[];
  onItemRemoved: () => void;
}

const typeIcons: Record<string, string> = {
  file: "lucide:file-text",
  "ai-generated": "lucide:sparkles",
  "drive-link": "lucide:link",
};

const typeLabels: Record<string, string> = {
  file: "File",
  "ai-generated": "AI Generated",
  "drive-link": "Drive Link",
};

const AGENT_API_URL = process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:8000";

export function KBItemsList({ kbId, items, onItemRemoved }: KBItemsListProps) {
  const [removing, setRemoving] = useState<string | null>(null);
  const [ingesting, setIngesting] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

  async function handleRemove(itemId: string) {
    setRemoving(itemId);
    try {
      const res = await fetch(
        `${AGENT_API_URL}/api/knowledge/${kbId}/items/${itemId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        onItemRemoved();
      }
    } catch (err) {
      console.error("Remove failed:", err);
    } finally {
      setRemoving(null);
    }
  }

  async function handleIngest(itemId: string) {
    setIngesting(itemId);
    setIngestError(null);
    try {
      const res = await fetch(
        `${AGENT_API_URL}/api/knowledge/${kbId}/items/${itemId}/ingest`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        setIngestError(data.detail || data.error || "Ingestion failed");
      }
      onItemRemoved(); // Refresh the items list
    } catch (err) {
      console.error("Ingest failed:", err);
      setIngestError("Network error during ingestion");
    } finally {
      setIngesting(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <Icon
          icon="lucide:inbox"
          width={48}
          height={48}
          className="mx-auto mb-3 text-muted"
        />
        <p className="text-muted">No items yet. Upload files above to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {ingestError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400 flex items-center gap-2">
          <Icon icon="lucide:alert-circle" width={16} height={16} />
          {ingestError}
          <button
            onClick={() => setIngestError(null)}
            className="ml-auto text-red-400 hover:text-red-300"
          >
            <Icon icon="lucide:x" width={14} height={14} />
          </button>
        </div>
      )}

      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-4 bg-white/[0.04] hover:bg-white/[0.06] rounded-xl px-4 py-3 transition-colors group"
        >
          {/* Status indicator */}
          <div className="shrink-0">
            {item.status === "ingested" && (
              <div className="w-2.5 h-2.5 rounded-full bg-green-500" title="Ingested" />
            )}
            {item.status === "failed" && (
              <div className="w-2.5 h-2.5 rounded-full bg-red-500" title="Failed" />
            )}
            {item.status === "processing" && (
              <Icon
                icon="lucide:loader-2"
                width={14}
                height={14}
                className="text-yellow-500 animate-spin"
              />
            )}
            {item.status === "pending" && (
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" title="Pending" />
            )}
          </div>

          {/* Type icon */}
          <Icon
            icon={typeIcons[item.type] || "lucide:file"}
            width={18}
            height={18}
            className="text-muted shrink-0"
          />

          {/* Name */}
          <div className="flex-1 min-w-0">
            <p className="text-foreground truncate text-sm font-medium">
              {item.name}
            </p>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-muted">
                {typeLabels[item.type] || "File"}
              </span>
              {item.chunkCount != null && (
                <span className="text-xs text-muted">
                  {item.chunkCount} chunks
                </span>
              )}
              <span className="text-xs text-muted">
                {new Date(item.createdAt).toLocaleDateString()}
              </span>
            </div>
            {item.error && (
              <p className="text-xs text-red-400 mt-1 truncate">{item.error}</p>
            )}
          </div>

          {/* Ingest button for pending or failed items */}
          {(item.status === "pending" || item.status === "failed") && (
            <button
              onClick={() => handleIngest(item.id)}
              disabled={ingesting === item.id}
              className="bg-accent hover:bg-accent-dark text-white text-xs font-medium px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 flex items-center gap-1.5 shrink-0"
              title="Generate embeddings and store in Pinecone"
            >
              {ingesting === item.id ? (
                <>
                  <Icon
                    icon="lucide:loader-2"
                    width={13}
                    height={13}
                    className="animate-spin"
                  />
                  Ingesting...
                </>
              ) : (
                <>
                  <Icon icon="lucide:zap" width={13} height={13} />
                  Ingest
                </>
              )}
            </button>
          )}

          {/* Processing indicator */}
          {item.status === "processing" && (
            <span className="text-xs text-yellow-500 flex items-center gap-1.5 shrink-0">
              <Icon
                icon="lucide:loader-2"
                width={13}
                height={13}
                className="animate-spin"
              />
              Processing...
            </span>
          )}

          {/* Ingested badge */}
          {item.status === "ingested" && (
            <span className="text-xs text-green-500 flex items-center gap-1 shrink-0">
              <Icon icon="lucide:check" width={12} height={12} />
              Ingested
            </span>
          )}

          {/* URL for drive links */}
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-accent-dark transition-colors shrink-0"
              title="Open link"
            >
              <Icon icon="lucide:external-link" width={16} height={16} />
            </a>
          )}

          {/* Remove button */}
          <button
            onClick={() => handleRemove(item.id)}
            disabled={removing === item.id}
            className="text-muted hover:text-red-400 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
            title="Remove item"
          >
            {removing === item.id ? (
              <Icon
                icon="lucide:loader-2"
                width={16}
                height={16}
                className="animate-spin"
              />
            ) : (
              <Icon icon="lucide:trash-2" width={16} height={16} />
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
