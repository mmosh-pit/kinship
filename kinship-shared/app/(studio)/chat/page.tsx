"use client";

/**
 * Chat Page - Kinship Theme
 * Updated to use server-side chat history management.
 * History is now loaded from database - no need to send messageHistory.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Icon } from "@iconify/react";
import { useAuth } from "@/lib/auth-context";
import { VoiceChatButton } from "@/components/VoiceChat";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Presence {
  id: string;
  name: string;
  handle?: string;
  description?: string;
  type: string;
  accessLevel?: string;
  tone?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

// LLM Provider configuration
interface LLMProviderOption {
  id: string;
  name: string;
  icon: string;
}

const LLM_PROVIDERS: LLMProviderOption[] = [
  { id: "openai", name: "ChatGPT", icon: "simple-icons:openai" },
  { id: "anthropic", name: "Claude", icon: "simple-icons:anthropic" },
  { id: "gemini", name: "Gemini", icon: "simple-icons:google" },
];

// ─────────────────────────────────────────────────────────────────────────────
// API URL
// ─────────────────────────────────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:8000";

// ─────────────────────────────────────────────────────────────────────────────
// Parse SSE data - handles double "data:" prefix issue
// ─────────────────────────────────────────────────────────────────────────────

function extractJSON(line: string): string | null {
  // Handle various formats:
  // "data: data: {...}"  - double prefix from sse_starlette + our yield
  // "data: {...}"        - normal SSE format
  // "{...}"              - raw JSON
  
  let str = line.trim();
  
  // Remove all "data:" prefixes
  while (str.startsWith("data:")) {
    str = str.slice(5).trim();
  }
  
  // Should now be JSON starting with {
  if (str.startsWith("{")) {
    return str;
  }
  
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const { user } = useAuth();

  // State
  const [presences, setPresences] = useState<Presence[]>([]);
  const [selectedPresence, setSelectedPresence] = useState<Presence | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [useStreaming, setUseStreaming] = useState(true);
  const [selectedLLM, setSelectedLLM] = useState<string>("openai"); // Default to ChatGPT

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const accumulatedRef = useRef("");

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [input]);

  // Fetch public Presence agents
  const fetchPublicPresences = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/agents/public`);
      if (res.ok) {
        const data = await res.json();
        setPresences(data.agents || []);
      }
    } catch (err) {
      console.error("Error fetching public presences:", err);
    }
  }, []);

  // Fetch conversation history when selecting a presence
  const fetchConversationHistory = useCallback(async (presenceId: string) => {
    if (!user?.wallet) return;
    
    try {
      const res = await fetch(
        `${API_URL}/api/conversations/${presenceId}/${user.wallet}`,
        {
          headers: {
            "Authorization": `Bearer ${window.localStorage.getItem("token")}`,
          },
        }
      );
      
      if (res.ok) {
        const data = await res.json();
        // Convert server messages to local format
        const loadedMessages: ChatMessage[] = (data.messages || []).map((msg: any) => ({
          id: msg.id || `msg_${Date.now()}_${Math.random()}`,
          role: msg.role as "user" | "assistant",
          content: msg.content,
          createdAt: msg.timestamp || new Date().toISOString(),
        }));
        setMessages(loadedMessages);
        console.log(`Loaded ${loadedMessages.length} messages from server`);
      } else if (res.status === 404) {
        // No conversation yet, start fresh
        setMessages([]);
        console.log("No existing conversation found, starting fresh");
      }
    } catch (err) {
      console.error("Error fetching conversation history:", err);
      setMessages([]);
    }
  }, [user?.wallet]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchPublicPresences();
      setLoading(false);
    };
    init();
  }, [fetchPublicPresences]);

  // Load conversation when presence is selected
  useEffect(() => {
    if (selectedPresence && user?.wallet) {
      fetchConversationHistory(selectedPresence.id);
    }
  }, [selectedPresence, user?.wallet, fetchConversationHistory]);

  // Non-streaming send message
  const sendMessageNonStreaming = async () => {
    if (!input.trim() || !selectedPresence || sending) return;

    const content = input.trim();
    setInput("");
    setSending(true);

    // Add user message (optimistic update)
    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      // NOTE: messageHistory is no longer sent - backend loads from database
      const res = await fetch(`${API_URL}/api/chatmessages`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${window.localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          presenceId: selectedPresence.id,
          message: content,
          userId: user?.id || "anonymous",
          userWallet: user?.wallet || "anonymous",
          llmProvider: selectedLLM,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed: ${res.status}`);
      }

      const data = await res.json();
      console.log("Response:", data);

      const assistantMsg: ChatMessage = {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: data.response,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

    } catch (err) {
      console.error("Error:", err);
      const errorMsg: ChatMessage = {
        id: `error_${Date.now()}`,
        role: "assistant",
        content: `Error: ${err instanceof Error ? err.message : 'Unknown'}`,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSending(false);
    }
  };

  // Streaming send message  
  const sendMessageStreaming = async () => {
    if (!input.trim() || !selectedPresence || sending) return;

    const content = input.trim();
    setInput("");
    setSending(true);
    setStreamingContent("");
    accumulatedRef.current = "";

    // Add user message (optimistic update)
    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      // NOTE: messageHistory is no longer sent - backend loads from database
      const res = await fetch(`${API_URL}/api/chatmessages/stream`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${window.localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          presenceId: selectedPresence.id,
          message: content,
          userId: user?.id || "anonymous",
          userWallet: user?.wallet || "anonymous",
          llmProvider: selectedLLM,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed: ${res.status}`);
      }

      // Read as text and parse SSE manually
      const text = await res.text();
      console.log("Raw response text:", text);

      // Parse SSE events from the text
      const lines = text.split("\n");
      let finalResponse = "";

      for (const line of lines) {
        // Skip empty lines
        if (!line.trim()) continue;
        
        // Extract JSON from line (handles double data: prefix)
        const jsonStr = extractJSON(line);
        
        if (jsonStr) {
          try {
            const data = JSON.parse(jsonStr);
            console.log("✅ Parsed event:", data.event, data);
            
            if (data.event === "token" && data.token) {
              accumulatedRef.current += data.token;
              setStreamingContent(accumulatedRef.current);
            } else if (data.event === "done") {
              finalResponse = data.fullResponse || accumulatedRef.current;
              console.log("✅ Got final response:", finalResponse.substring(0, 50) + "...");
            }
          } catch (e) {
            console.warn("Parse error for:", jsonStr, e);
          }
        }
      }

      // Add final message
      if (finalResponse) {
        console.log("✅ Adding assistant message to UI");
        const assistantMsg: ChatMessage = {
          id: `assistant_${Date.now()}`,
          role: "assistant",
          content: finalResponse,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setStreamingContent("");
      } else {
        console.warn("⚠️ No final response found!");
      }

    } catch (err) {
      console.error("Error:", err);
      const errorMsg: ChatMessage = {
        id: `error_${Date.now()}`,
        role: "assistant",
        content: `Error: ${err instanceof Error ? err.message : 'Unknown'}`,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      setStreamingContent("");
    } finally {
      setSending(false);
    }
  };

  const sendMessage = useStreaming ? sendMessageStreaming : sendMessageNonStreaming;

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Clear chat (calls server to clear conversation)
  const clearChat = async () => {
    if (!selectedPresence || !user?.wallet) {
      setMessages([]);
      setStreamingContent("");
      return;
    }

    try {
      // Call server to clear conversation history
      await fetch(
        `${API_URL}/api/conversations/${selectedPresence.id}/${user.wallet}/messages`,
        {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${window.localStorage.getItem("token")}`,
          },
        }
      );
      console.log("Conversation cleared on server");
    } catch (err) {
      console.error("Error clearing conversation:", err);
    }

    // Clear local state
    setMessages([]);
    setStreamingContent("");
  };

  // Get current LLM provider info
  const currentLLM = LLM_PROVIDERS.find(p => p.id === selectedLLM) || LLM_PROVIDERS[0];

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-100px)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-muted">Loading agents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-100px)] p-6">
      {/* Left Sidebar - Presence List */}
      <div className="w-80 flex flex-col gap-4">
        <div className="bg-card border border-card-border rounded-xl p-4">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Icon icon="lucide:crown" width={20} height={20} className="text-accent" />
            Presences
          </h2>

          {presences.length === 0 ? (
            <p className="text-muted text-sm">No public presences found</p>
          ) : (
            <div className="space-y-2">
              {presences.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPresence(p)}
                  className={`w-full text-left p-3 rounded-lg transition-all ${
                    selectedPresence?.id === p.id
                      ? "bg-accent/15 border border-accent/30"
                      : "bg-white/[0.03] border border-transparent hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        selectedPresence?.id === p.id ? "bg-accent/20" : "bg-white/[0.06]"
                      }`}
                    >
                      <Icon
                        icon="lucide:crown"
                        width={18}
                        height={18}
                        className={selectedPresence?.id === p.id ? "text-accent" : "text-muted"}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{p.name}</p>
                      {p.handle && (
                        <p className="text-xs text-muted truncate">@{p.handle}</p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Settings */}
        <div className="bg-card border border-card-border rounded-xl p-4">
          <h3 className="text-sm font-medium text-white mb-3">Settings</h3>

          {/* LLM Provider Dropdown */}
          <div className="mb-3">
            <label className="text-xs text-muted mb-1 block">AI Model</label>
            <div className="relative">
              <select
                value={selectedLLM}
                onChange={(e) => setSelectedLLM(e.target.value)}
                className="w-full bg-input border border-card-border rounded-lg px-3 py-2 text-sm text-foreground appearance-none cursor-pointer focus:outline-none focus:border-accent/50"
              >
                {LLM_PROVIDERS.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                <Icon icon="lucide:chevron-down" width={16} height={16} className="text-muted" />
              </div>
            </div>
          </div>

          {/* Streaming Toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useStreaming}
              onChange={(e) => setUseStreaming(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span className="text-xs text-muted">Enable streaming</span>
          </label>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 bg-card border border-card-border rounded-xl flex flex-col overflow-hidden">
        {!selectedPresence ? (
          /* Empty State */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
                <Icon icon="lucide:message-circle" width={40} height={40} className="text-accent" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                Select a Presence to Chat
              </h3>
              <p className="text-muted">
                Choose from the list on the left to start chatting
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="flex items-center justify-between p-4 border-b border-card-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
                  <Icon icon="lucide:crown" width={20} height={20} className="text-accent" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{selectedPresence.name}</p>
                  {selectedPresence.handle && (
                    <p className="text-xs text-muted">@{selectedPresence.handle}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* Voice Chat Button */}
                <VoiceChatButton
                  presenceId={selectedPresence.id}
                  userId={user?.id}
                  userWallet={user?.wallet}
                  voice="Aoede"
                />

                {/* LLM Badge */}
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.06]">
                  <Icon icon={currentLLM.icon} width={14} height={14} className="text-muted" />
                  <span className="text-xs text-muted">{currentLLM.name}</span>
                </div>
                <span className="text-xs text-muted">
                  {useStreaming ? "Streaming" : "Non-streaming"}
                </span>
                {messages.length > 0 && (
                  <button
                    onClick={clearChat}
                    className="text-muted hover:text-white text-sm flex items-center gap-1 transition-colors"
                  >
                    <Icon icon="lucide:trash-2" width={14} height={14} />
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6">
              {messages.length === 0 && !streamingContent ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
                      <Icon icon="lucide:message-circle" width={28} height={28} className="text-accent" />
                    </div>
                    <p className="text-muted">
                      Send a message to start chatting with {selectedPresence.name}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 max-w-4xl mx-auto">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`flex gap-3 max-w-[80%] ${
                          msg.role === "user" ? "flex-row-reverse" : "flex-row"
                        }`}
                      >
                        {/* Avatar */}
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            msg.role === "user" ? "bg-blue-500/20" : "bg-accent/20"
                          }`}
                        >
                          <Icon
                            icon={msg.role === "user" ? "lucide:user" : "lucide:crown"}
                            width={16}
                            height={16}
                            className={msg.role === "user" ? "text-blue-400" : "text-accent"}
                          />
                        </div>

                        {/* Message Bubble */}
                        <div
                          className={`px-4 py-3 rounded-2xl ${
                            msg.role === "user"
                              ? "bg-accent text-white rounded-br-md"
                              : "bg-white/[0.06] text-white/90 rounded-bl-md"
                          }`}
                        >
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">
                            {msg.content}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Streaming Response */}
                  {streamingContent && (
                    <div className="flex justify-start">
                      <div className="flex gap-3 max-w-[80%]">
                        <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
                          <Icon icon="lucide:crown" width={16} height={16} className="text-accent" />
                        </div>
                        <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-white/[0.06]">
                          <p className="text-sm leading-relaxed whitespace-pre-wrap text-white/90">
                            {streamingContent}
                            <span className="inline-block w-2 h-4 bg-accent/50 animate-pulse ml-0.5" />
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Typing Indicator */}
                  {sending && !streamingContent && (
                    <div className="flex justify-start">
                      <div className="flex gap-3 max-w-[80%]">
                        <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
                          <Icon icon="lucide:crown" width={16} height={16} className="text-accent" />
                        </div>
                        <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-white/[0.06]">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="border-t border-card-border p-4">
              <div className="max-w-4xl mx-auto">
                <div className="relative flex items-end gap-3">
                  <div className="flex-1 relative">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={`Message ${selectedPresence.name}...`}
                      rows={1}
                      disabled={sending}
                      className="w-full bg-input border border-card-border rounded-xl px-4 py-3 pr-12 text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50 resize-none disabled:opacity-50"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!input.trim() || sending}
                      className="absolute right-2 bottom-2.5 w-8 h-8 rounded-lg bg-accent hover:bg-accent-dark disabled:bg-white/[0.06] disabled:text-muted text-white flex items-center justify-center transition-colors"
                    >
                      <Icon icon="lucide:send" width={16} height={16} />
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-muted text-center mt-2">
                  Enter to send · Shift+Enter for new line
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}