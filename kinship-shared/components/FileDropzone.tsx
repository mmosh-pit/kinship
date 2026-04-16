"use client";

import { useState, useRef, useCallback } from "react";
import { Icon } from "@iconify/react";

interface FileDropzoneProps {
  kbId: string;
  onUploadComplete: () => void;
}

interface UploadingFile {
  name: string;
  status: "uploading" | "done" | "error";
  error?: string;
}

const ACCEPTED_TYPES = ".pdf,.txt,.md,.docx,.csv";
const ACCEPTED_MIMES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const AGENT_API_URL = process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:8000";

export function FileDropzone({ kbId, onUploadComplete }: FileDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<UploadingFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const validFiles = Array.from(fileList).filter(
        (f) =>
          ACCEPTED_MIMES.includes(f.type) ||
          /\.(pdf|txt|md|docx|csv)$/i.test(f.name)
      );

      if (validFiles.length === 0) return;

      setUploading(true);
      setFiles(validFiles.map((f) => ({ name: f.name, status: "uploading" })));

      const formData = new FormData();
      validFiles.forEach((f) => formData.append("files", f));

      try {
        const res = await fetch(`${AGENT_API_URL}/api/knowledge/${kbId}/upload`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) throw new Error("Upload failed");

        const data = await res.json();
        setFiles(
          data.files.map((f: { name: string; status: string; error?: string }) => ({
            name: f.name,
            status: f.status === "ingested" || f.status === "pending" ? "done" : "error",
            error: f.error,
          }))
        );

        onUploadComplete();
      } catch (err) {
        console.error("Upload error:", err);
        setFiles((prev) =>
          prev.map((f) => ({ ...f, status: "error" as const }))
        );
      } finally {
        setUploading(false);
      }
    },
    [kbId, onUploadComplete]
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }

  function clearFiles() {
    setFiles([]);
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
          ${
            dragging
              ? "border-accent bg-accent/10"
              : "border-card-border hover:border-accent/50 bg-white/[0.02]"
          }
          ${uploading ? "pointer-events-none opacity-60" : ""}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
          }}
        />

        <Icon
          icon="lucide:upload-cloud"
          width={40}
          height={40}
          className="mx-auto mb-3 text-muted"
        />
        <p className="text-foreground font-medium mb-1">
          {uploading ? "Uploading..." : "Drag & drop files here"}
        </p>
        <p className="text-sm text-muted">
          or click to browse. Supports TXT, DOCX
        </p>
      </div>

      {/* Upload progress */}
      {files.length > 0 && (
        <div className="mt-3 space-y-2">
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-3 bg-white/[0.04] rounded-lg px-4 py-2 text-sm"
            >
              {f.status === "uploading" && (
                <Icon
                  icon="lucide:loader-2"
                  width={16}
                  height={16}
                  className="text-accent animate-spin shrink-0"
                />
              )}
              {f.status === "done" && (
                <Icon
                  icon="lucide:check-circle"
                  width={16}
                  height={16}
                  className="text-green-500 shrink-0"
                />
              )}
              {f.status === "error" && (
                <Icon
                  icon="lucide:x-circle"
                  width={16}
                  height={16}
                  className="text-red-500 shrink-0"
                />
              )}
              <span className="text-foreground truncate flex-1">{f.name}</span>
              {f.error && (
                <span className="text-red-400 text-xs truncate">{f.error}</span>
              )}
            </div>
          ))}
          
          {!uploading && (
            <button
              onClick={clearFiles}
              className="text-xs text-muted hover:text-white transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
