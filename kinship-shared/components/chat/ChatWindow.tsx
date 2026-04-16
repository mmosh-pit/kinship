"use client";

/**
 * ChatWindow Component
 *
 * Full chat interface for agent conversations.
 * Connects to Python FastAPI backend.
 */

import { useState, useEffect, useCallback } from "react";
import { Icon } from "@iconify/react";
import {
  ChatHeader,
  ChatInput,
  MessageList,
} from "./ChatComponents";
import {
  createChatSession,
  getChatMessages,
  sendChatMessage,
  type ChatSession,
  type ChatMessage,
} from "@/lib/chat-api";

interface ChatWindowProps {
  presenceId: string;
  presenceName: string;
  presenceHandle?: string;
  userId: string;
  userWallet: string;
  userRole: "creator" | "member" | "guest";
  platformId?: string;
  onClose?: () => void;
  className?: string;
}

export function ChatWindow({
  presenceId,
  presenceName,
  presenceHandle,
  userId,
  userWallet,
  userRole,
  platformId,
  onClose,
  className = "",
}: ChatWindowProps) {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize or get session
  useEffect(() => {
    const initSession = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Create a new session
        const newSession = await createChatSession({
          presenceId,
          userId,
          userWallet,
          userRole,
          platformId,
          title: `Chat with ${presenceName}`,
        });

        setSession(newSession);

        // Load existing messages if any
        const existingMessages = await getChatMessages({
          sessionId: newSession.id,
          limit: 50,
        });

        setMessages(existingMessages);
      } catch (err) {
        console.error("Failed to init chat:", err);
        setError(err instanceof Error ? err.message : "Failed to start chat");
      } finally {
        setIsLoading(false);
      }
    };

    initSession();
  }, [presenceId, userId, userWallet, userRole, platformId, presenceName]);

  // Send message
  const handleSend = useCallback(
    async (content: string) => {
      if (!session || isSending) return;

      setIsSending(true);
      setError(null);

      // Optimistic update - add user message immediately
      const tempUserMessage: ChatMessage = {
        id: `temp_${Date.now()}`,
        sessionId: session.id,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, tempUserMessage]);

      try {
        const response = await sendChatMessage({
          sessionId: session.id,
          content,
          userId,
          userRole,
        });

        // Replace temp message with real ones
        setMessages((prev) =>
          prev
            .filter((m) => m.id !== tempUserMessage.id)
            .concat([response.userMessage, response.assistantMessage])
        );

        // Show approval notification if needed
        if (response.orchestration.pendingApproval) {
          // Could trigger a toast or notification here
          console.log(
            "Action requires approval:",
            response.orchestration.pendingApproval
          );
        }
      } catch (err) {
        console.error("Failed to send message:", err);
        setError(err instanceof Error ? err.message : "Failed to send");

        // Remove optimistic message on error
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMessage.id));
      } finally {
        setIsSending(false);
      }
    },
    [session, userId, userRole, isSending]
  );

  // Error state
  if (error && !session) {
    return (
      <div
        className={`flex flex-col bg-card border border-card-border rounded-xl overflow-hidden ${className}`}
      >
        <ChatHeader
          title={presenceName}
          subtitle={presenceHandle ? `@${presenceHandle}` : undefined}
          onBack={onClose}
        />
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center mb-4">
            <Icon icon="lucide:alert-circle" width={24} height={24} className="text-red-400" />
          </div>
          <h3 className="text-white font-medium mb-2">Connection Error</h3>
          <p className="text-sm text-muted mb-4 max-w-xs">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-accent hover:underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col bg-card border border-card-border rounded-xl overflow-hidden ${className}`}
    >
      {/* Header */}
      <ChatHeader
        title={presenceName}
        subtitle={presenceHandle ? `@${presenceHandle}` : "Online"}
        onBack={onClose}
      />

      {/* Messages */}
      <MessageList messages={messages} isLoading={isSending} />

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20">
          <p className="text-xs text-red-400 flex items-center gap-2">
            <Icon icon="lucide:alert-circle" width={12} height={12} />
            {error}
          </p>
        </div>
      )}

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        disabled={isLoading || isSending || !session}
        placeholder={
          isLoading
            ? "Connecting..."
            : isSending
            ? "Sending..."
            : `Message ${presenceName}...`
        }
      />
    </div>
  );
}

export default ChatWindow;
