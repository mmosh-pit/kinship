"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAtom } from "jotai";
import { isAiEditorOpen } from "@/app/(main)/store";
import client from "@/app/(main)/lib/internalHttpClient";

type EditorState =
  | "idle"
  | "generating"
  | "previewing"
  | "committing"
  | "deployed"
  | "merging"
  | "error";

type TextChange = { find: string; replace: string };

const AiPageEditor = () => {
  const [isOpen, setIsOpen] = useAtom(isAiEditorOpen);
  const [state, setState] = useState<EditorState>("idle");
  const [prompt, setPrompt] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [modifiedContent, setModifiedContent] = useState("");
  const [changes, setChanges] = useState<TextChange[]>([]);
  const [originalSha, setOriginalSha] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [errorText, setErrorText] = useState("");
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Check for pending preview on mount
  useEffect(() => {
    if (isOpen) {
      checkStatus();
    }
  }, [isOpen]);

  const checkStatus = async () => {
    try {
      const res = await client.get("/api/landing-page-editor/status");
      if (res.data?.hasPendingPreview) {
        setGithubUrl(res.data.githubUrl || "");
        setState("deployed");
      }
    } catch {
      // No pending preview, stay idle
    }
  };

  /**
   * Apply text changes to the iframe's DOM.
   * This gives a pixel-perfect preview because we're modifying the REAL page.
   */
  const applyChangesToIframe = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !changes.length) return;

    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc || !doc.body) return;

      // Hide the editor UI inside the iframe (prevent inception)
      const editorOverlay = doc.querySelector(
        '[class*="fixed inset-0 z-[100]"]',
      );
      if (editorOverlay) editorOverlay.remove();

      // Apply each text/class replacement to the DOM
      let html = doc.body.innerHTML;
      for (const change of changes) {
        if (!change.find) continue;
        // Use a global replacement
        html = html.split(change.find).join(change.replace);
      }
      doc.body.innerHTML = html;

      // Add a subtle preview banner at the top
      const banner = doc.createElement("div");
      banner.style.cssText =
        "position:fixed;top:0;left:0;right:0;z-index:9999;background:#EB8000;color:white;text-align:center;padding:6px;font-size:12px;font-family:sans-serif;";
      banner.textContent =
        "👁️ PREVIEW — This is how the page will look after your changes";
      doc.body.prepend(banner);
    } catch (err) {
      console.warn("Could not apply changes to iframe:", err);
    }
  }, [changes]);

  // Apply changes whenever the iframe loads or changes update
  useEffect(() => {
    if (iframeLoaded && state === "previewing" && changes.length > 0) {
      // Small delay to ensure React has finished rendering inside the iframe
      const timer = setTimeout(applyChangesToIframe, 1500);
      return () => clearTimeout(timer);
    }
  }, [iframeLoaded, state, changes, applyChangesToIframe]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setState("generating");
    setErrorText("");
    setIframeLoaded(false);

    try {
      const res = await client.post("/api/landing-page-editor/generate", {
        prompt: prompt.trim(),
      });
      setModifiedContent(res.data.modifiedContent);
      setChanges(res.data.changes || []);
      setOriginalSha(res.data.originalSha);
      setCommitMessage(`AI edit: ${prompt.trim().slice(0, 80)}`);
      setState("previewing");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to generate";
      setErrorText(message);
      setState("error");
    }
  };

  const handleCommit = async () => {
    setState("committing");
    setErrorText("");

    try {
      const res = await client.post("/api/landing-page-editor/commit", {
        content: modifiedContent,
        message: commitMessage || "AI-edited landing page",
      });
      setGithubUrl(res.data.githubUrl || "");
      setState("deployed");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to commit";
      setErrorText(message);
      setState("error");
    }
  };

  const handleMerge = async () => {
    setState("merging");
    setErrorText("");

    try {
      await client.post("/api/landing-page-editor/merge", {});
      setState("idle");
      setPrompt("");
      setModifiedContent("");
      setChanges([]);
      setGithubUrl("");
      alert("✅ Changes merged to production! Vercel will deploy shortly.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to merge";
      setErrorText(message);
      setState("error");
    }
  };

  const handleDiscard = async () => {
    try {
      await client.post("/api/landing-page-editor/merge", {
        discard: true,
      });
    } catch {
      // Ignore
    }
    setState("idle");
    setPrompt("");
    setModifiedContent("");
    setChanges([]);
    setGithubUrl("");
    setErrorText("");
    setIsPreviewFullscreen(false);
    setIframeLoaded(false);
  };

  const handleBackToPrompt = () => {
    setState("idle");
    setChanges([]);
    setIframeLoaded(false);
    // Keep prompt so the wizard can refine it
  };

  const handleIframeLoad = () => {
    setIframeLoaded(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    setIsPreviewFullscreen(false);
  };

  if (!isOpen) return null;

  // The URL for the preview iframe — loads the actual landing page
  // The _wizard_preview param tells the page to hide editor UI
  const previewUrl = "/?_wizard_preview=1";

  // ─── Fullscreen preview mode ──────────────────────────────────
  if (isPreviewFullscreen && state === "previewing") {
    return (
      <div className="fixed inset-0 z-[200] bg-[#050824] flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#0a0d2e] border-b border-[#FFFFFF1A]">
          <div className="flex items-center gap-3">
            <span className="text-sm text-white/60 font-avenir">
              🔍 Full Preview
            </span>
            {changes.length > 0 && (
              <span className="text-xs text-[#EB8000] font-avenir">
                {changes.length} change{changes.length !== 1 ? "s" : ""} applied
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPreviewFullscreen(false)}
              className="px-3 py-1.5 text-xs rounded-lg bg-[#FFFFFF0A] border border-[#FFFFFF1A] text-white/70 hover:text-white hover:bg-[#FFFFFF15] transition-all font-avenir"
            >
              ← Back to Editor
            </button>
          </div>
        </div>
        {/* Iframe — loads the REAL page */}
        <iframe
          ref={iframeRef}
          src={previewUrl}
          className="flex-1 w-full"
          onLoad={handleIframeLoad}
          title="Landing page preview"
        />
      </div>
    );
  }

  // ─── Normal drawer ────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Drawer */}
      <div className="relative w-full max-w-[480px] h-full bg-[#0a0d2e] border-l border-[#FFFFFF1A] shadow-2xl overflow-y-auto animate-slide-in-right flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-[#0a0d2e] border-b border-[#FFFFFF1A] px-6 py-4 flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xl">✏️</span>
            <h2 className="text-white font-bold text-lg font-poppinsNew">
              AI Page Editor
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="text-white/60 hover:text-white transition-colors p-1"
          >
            <svg
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 flex-1 overflow-y-auto">
          {/* Status badge */}
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${state === "idle"
                  ? "bg-green-400"
                  : state === "generating" ||
                    state === "committing" ||
                    state === "merging"
                    ? "bg-yellow-400 animate-pulse"
                    : state === "previewing"
                      ? "bg-purple-400"
                      : state === "deployed"
                        ? "bg-blue-400"
                        : state === "error"
                          ? "bg-red-400"
                          : "bg-orange-400"
                }`}
            />
            <span className="text-white/60 text-sm font-avenir">
              {state === "idle" && "Ready"}
              {state === "generating" && "Generating with AI…"}
              {state === "previewing" && "Preview ready — review below"}
              {state === "committing" && "Committing to GitHub…"}
              {state === "deployed" && "Preview branch deployed"}
              {state === "merging" && "Merging to production…"}
              {state === "error" && "Error"}
            </span>
          </div>

          {/* Error display */}
          {errorText && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
              <p className="text-red-400 text-sm font-avenir">{errorText}</p>
              <button
                onClick={() => {
                  setErrorText("");
                  setState("idle");
                }}
                className="mt-2 text-xs text-red-300 underline hover:text-red-200"
              >
                Try again
              </button>
            </div>
          )}

          {/* ─── IDLE: Prompt input ────────────────────── */}
          {(state === "idle" || state === "generating") && (
            <div className="space-y-4">
              <div>
                <label className="text-white/80 text-sm font-semibold font-avenir block mb-2">
                  Describe what you want to change
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder='e.g. "Change the hero heading to Welcome to Kinship" or "Remove the origin story section"'
                  className="w-full h-40 bg-[#FFFFFF0A] border border-[#FFFFFF1A] rounded-xl px-4 py-3 text-white text-sm font-avenir placeholder:text-white/30 resize-none focus:outline-none focus:border-[#EB8000] transition-colors"
                  disabled={state === "generating"}
                />
              </div>
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || state === "generating"}
                className="w-full py-3 rounded-xl font-bold text-white text-sm font-avenir transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-[#EB8000] hover:bg-[#d47200] active:scale-[0.98]"
              >
                {state === "generating" ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    AI is editing the page…
                  </span>
                ) : (
                  "🪄 Generate Changes"
                )}
              </button>
            </div>
          )}

          {/* ─── PREVIEWING: Live preview via real page iframe ── */}
          {state === "previewing" && (
            <div className="space-y-4">
              {/* Changes summary */}
              {changes.length > 0 && (
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-3">
                  <p className="text-purple-300 text-xs font-avenir font-semibold mb-2">
                    {changes.length} change{changes.length !== 1 ? "s" : ""}{" "}
                    detected:
                  </p>
                  <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                    {changes.map((c, i) => (
                      <div
                        key={i}
                        className="text-xs font-avenir flex gap-2 items-start"
                      >
                        <span className="text-red-400 line-through shrink-0 max-w-[45%] truncate">
                          {c.find}
                        </span>
                        <span className="text-white/30">→</span>
                        <span className="text-green-400 shrink-0 max-w-[45%] truncate">
                          {c.replace || "(removed)"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview iframe — loads the REAL page */}
              <div className="rounded-xl overflow-hidden border border-[#FFFFFF1A] bg-[#050824]">
                <div className="flex items-center justify-between px-3 py-2 bg-[#FFFFFF08] border-b border-[#FFFFFF0A]">
                  <span className="text-white/40 text-xs font-avenir">
                    {iframeLoaded ? "✅ Live Preview" : "⏳ Loading page…"}
                  </span>
                  <button
                    onClick={() => setIsPreviewFullscreen(true)}
                    className="text-white/40 hover:text-white/70 text-xs font-avenir transition-colors"
                  >
                    ⛶ Fullscreen
                  </button>
                </div>
                <iframe
                  ref={iframeRef}
                  src={previewUrl}
                  className="w-full h-[350px] bg-[#050824]"
                  onLoad={handleIframeLoad}
                  title="Landing page preview"
                />
              </div>

              {/* Action buttons */}
              <div className="bg-[#FFFFFF08] border border-[#FFFFFF1A] rounded-xl p-4 space-y-3">
                <p className="text-white/60 text-xs font-avenir">
                  Happy with the preview? Deploy to GitHub, or refine your
                  prompt and try again.
                </p>
                <div>
                  <label className="text-white/60 text-xs font-avenir block mb-1">
                    Commit message
                  </label>
                  <input
                    type="text"
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    className="w-full bg-[#FFFFFF0A] border border-[#FFFFFF0A] rounded-lg px-3 py-2 text-white text-xs font-avenir focus:outline-none focus:border-[#EB8000] transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={handleBackToPrompt}
                  className="py-2.5 rounded-xl font-bold text-white/70 text-xs font-avenir border border-[#FFFFFF1A] hover:bg-[#FFFFFF0A] transition-all"
                >
                  ← Refine
                </button>
                <button
                  onClick={handleDiscard}
                  className="py-2.5 rounded-xl font-bold text-red-400/70 text-xs font-avenir border border-red-500/20 hover:bg-red-500/10 transition-all"
                >
                  Discard
                </button>
                <button
                  onClick={handleCommit}
                  className="py-2.5 rounded-xl font-bold text-white text-xs font-avenir bg-[#EB8000] hover:bg-[#d47200] transition-all"
                >
                  🚀 Deploy
                </button>
              </div>
            </div>
          )}

          {/* ─── COMMITTING ──────────────────────────────── */}
          {state === "committing" && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <svg
                className="animate-spin h-8 w-8 text-[#EB8000]"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <p className="text-white/60 text-sm font-avenir">
                Committing to GitHub…
              </p>
            </div>
          )}

          {/* ─── DEPLOYED: Preview link + merge ────────── */}
          {(state === "deployed" || state === "merging") && (
            <div className="space-y-4">
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                <p className="text-blue-400 text-sm font-avenir font-semibold mb-2">
                  🌐 Preview branch is live
                </p>
                <p className="text-white/60 text-xs font-avenir mb-3">
                  Vercel will automatically deploy this branch. Check your
                  Vercel dashboard for the preview URL, or view the changes on
                  GitHub:
                </p>
                {githubUrl && (
                  <a
                    href={githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#EB8000] text-sm font-avenir underline hover:text-[#ff9920] transition-colors"
                  >
                    View on GitHub ↗
                  </a>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleDiscard}
                  disabled={state === "merging"}
                  className="flex-1 py-3 rounded-xl font-bold text-white/70 text-sm font-avenir border border-[#FFFFFF1A] hover:bg-[#FFFFFF0A] transition-all disabled:opacity-40"
                >
                  Discard
                </button>
                <button
                  onClick={handleMerge}
                  disabled={state === "merging"}
                  className="flex-1 py-3 rounded-xl font-bold text-white text-sm font-avenir bg-green-600 hover:bg-green-700 transition-all disabled:opacity-40"
                >
                  {state === "merging" ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Merging…
                    </span>
                  ) : (
                    "✅ Merge to Production"
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Info footer */}
          <div className="pt-4 border-t border-[#FFFFFF0A]">
            <p className="text-white/30 text-xs font-avenir leading-relaxed">
              Preview loads the real page and applies your changes to the DOM.
              Deploy to GitHub for a full Vercel build preview.
            </p>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default AiPageEditor;
