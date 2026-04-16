"use client";

/**
 * Chat Components
 *
 * Reusable chat UI components for agent conversations.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Icon } from "@iconify/react";
import type { ChatMessage, MessageAction } from "@/lib/chat-api";

// ─────────────────────────────────────────────────────────────────────────────
// Message Bubble
// ─────────────────────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: ChatMessage;
  isLast?: boolean;
}

export function MessageBubble({ message, isLast }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center my-4">
        <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-4 py-2 text-xs text-muted max-w-md text-center">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[80%] ${
          isUser
            ? "bg-accent text-white rounded-2xl rounded-br-md"
            : "bg-white/[0.06] text-foreground rounded-2xl rounded-bl-md"
        } px-4 py-3`}
      >
        {/* Message content */}
        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>

        {/* Action indicator */}
        {message.action && <ActionIndicator action={message.action} />}

        {/* Timestamp */}
        <p
          className={`text-[10px] mt-2 ${
            isUser ? "text-white/60" : "text-muted"
          }`}
        >
          {new Date(message.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Indicator
// ─────────────────────────────────────────────────────────────────────────────

interface ActionIndicatorProps {
  action: MessageAction;
}

function ActionIndicator({ action }: ActionIndicatorProps) {
  const statusConfig = {
    pending: {
      icon: "lucide:loader-2",
      color: "text-yellow-400",
      bg: "bg-yellow-400/10",
      label: "Processing...",
      spin: true,
    },
    executed: {
      icon: "lucide:check-circle",
      color: "text-green-400",
      bg: "bg-green-400/10",
      label: "Completed",
      spin: false,
    },
    failed: {
      icon: "lucide:x-circle",
      color: "text-red-400",
      bg: "bg-red-400/10",
      label: "Failed",
      spin: false,
    },
    requires_approval: {
      icon: "lucide:shield-alert",
      color: "text-amber-400",
      bg: "bg-amber-400/10",
      label: "Awaiting Approval",
      spin: false,
    },
  };

  const config = statusConfig[action.status] || statusConfig.pending;

  return (
    <div className={`mt-3 ${config.bg} rounded-lg p-2`}>
      <div className="flex items-center gap-2">
        <Icon
          icon={config.icon}
          width={14}
          height={14}
          className={`${config.color} ${config.spin ? "animate-spin" : ""}`}
        />
        <span className={`text-xs font-medium ${config.color}`}>
          {config.label}
        </span>
      </div>
      {action.workerName && (
        <p className="text-[10px] text-muted mt-1">
          Worker: {action.workerName}
        </p>
      )}
      {action.type && (
        <p className="text-[10px] text-muted">Action: {action.type}</p>
      )}
      {action.error && (
        <p className="text-[10px] text-red-400 mt-1">{action.error}</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat Input
// ─────────────────────────────────────────────────────────────────────────────

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = "Type a message...",
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, [input]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-card-border bg-card p-4">
      <div className="flex items-end gap-3">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="w-full bg-input border border-card-border rounded-xl px-4 py-3 pr-12 text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={disabled || !input.trim()}
            className="absolute right-2 bottom-2 w-8 h-8 rounded-lg bg-accent hover:bg-accent-dark disabled:bg-white/[0.06] disabled:cursor-not-allowed flex items-center justify-center transition-colors"
          >
            <Icon
              icon="lucide:send"
              width={16}
              height={16}
              className="text-white"
            />
          </button>
        </div>
      </div>
      <p className="text-[10px] text-muted mt-2 text-center">
        Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Typing Indicator
// ─────────────────────────────────────────────────────────────────────────────

export function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4">
      <div className="bg-white/[0.06] rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex items-center gap-1">
          <span
            className="w-2 h-2 bg-muted rounded-full animate-bounce"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="w-2 h-2 bg-muted rounded-full animate-bounce"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="w-2 h-2 bg-muted rounded-full animate-bounce"
            style={{ animationDelay: "300ms" }}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Message List
// ─────────────────────────────────────────────────────────────────────────────

interface MessageListProps {
  messages: ChatMessage[];
  isLoading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

export function MessageList({
  messages,
  isLoading = false,
  onLoadMore,
  hasMore = false,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-4 scroll-smooth"
    >
      {/* Load more button */}
      {hasMore && onLoadMore && (
        <div className="flex justify-center mb-4">
          <button
            onClick={onLoadMore}
            disabled={isLoading}
            className="text-xs text-accent hover:underline disabled:opacity-50"
          >
            {isLoading ? "Loading..." : "Load earlier messages"}
          </button>
        </div>
      )}

      {/* Empty state */}
      {messages.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent/15 flex items-center justify-center mb-4">
            <Icon
              icon="lucide:message-circle"
              width={32}
              height={32}
              className="text-accent"
            />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">
            Start a conversation
          </h3>
          <p className="text-sm text-muted max-w-xs">
            Send a message to begin chatting with your agent
          </p>
        </div>
      )}

      {/* Messages */}
      {messages.map((message, index) => (
        <MessageBubble
          key={message.id}
          message={message}
          isLast={index === messages.length - 1}
        />
      ))}

      {/* Typing indicator */}
      {isLoading && <TypingIndicator />}

      {/* Scroll anchor */}
      <div ref={bottomRef} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat Header
// ─────────────────────────────────────────────────────────────────────────────

interface ChatHeaderProps {
  title: string;
  subtitle?: string;
  avatar?: React.ReactNode;
  onBack?: () => void;
  onSettings?: () => void;
}

export function ChatHeader({
  title,
  subtitle,
  avatar,
  onBack,
  onSettings,
}: ChatHeaderProps) {
  return (
    <div className="border-b border-card-border bg-card px-4 py-3 flex items-center gap-3">
      {onBack && (
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-lg hover:bg-white/[0.06] flex items-center justify-center transition-colors"
        >
          <Icon icon="lucide:arrow-left" width={18} height={18} className="text-muted" />
        </button>
      )}

      {avatar || (
        <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
          <Icon icon="lucide:bot" width={20} height={20} className="text-accent" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <h2 className="font-semibold text-white truncate">{title}</h2>
        {subtitle && <p className="text-xs text-muted truncate">{subtitle}</p>}
      </div>

      {onSettings && (
        <button
          onClick={onSettings}
          className="w-8 h-8 rounded-lg hover:bg-white/[0.06] flex items-center justify-center transition-colors"
        >
          <Icon icon="lucide:settings" width={18} height={18} className="text-muted" />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Session List Item
// ─────────────────────────────────────────────────────────────────────────────

interface SessionListItemProps {
  session: {
    id: string;
    title?: string;
    lastMessageAt: string;
    messageCount: number;
  };
  isActive?: boolean;
  onClick: () => void;
  onArchive?: () => void;
}

export function SessionListItem({
  session,
  isActive,
  onClick,
  onArchive,
}: SessionListItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-card-border hover:bg-white/[0.04] transition-colors ${
        isActive ? "bg-accent/10 border-l-2 border-l-accent" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-white text-sm truncate flex-1">
          {session.title || "Untitled Chat"}
        </h4>
        {onArchive && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onArchive();
            }}
            className="w-6 h-6 rounded hover:bg-white/[0.1] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Icon icon="lucide:archive" width={14} height={14} className="text-muted" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-[10px] text-muted">
          {new Date(session.lastMessageAt).toLocaleDateString()}
        </span>
        <span className="text-[10px] text-muted">•</span>
        <span className="text-[10px] text-muted">
          {session.messageCount} message{session.messageCount !== 1 ? "s" : ""}
        </span>
      </div>
    </button>
  );
}
