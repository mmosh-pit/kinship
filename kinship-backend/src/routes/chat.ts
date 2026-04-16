import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import { z } from "zod";
import { db } from "../db/client.js";
import { chats, messages } from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { SocketMessage } from "../types/index.js";

// In-memory WebSocket pool: userId -> socket
// For multi-instance deployments replace with Redis pub/sub
const pool = new Map<string, WebSocket>();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

export async function chatRoutes(fastify: FastifyInstance) {
  // ─── GET /chat — WebSocket endpoint ───────────────────────────────────────
  // Auth: Bearer token passed as ?token= query param (mirrors Go WS handler)
  fastify.get("/chat", { websocket: true }, async (socket, request) => {
    const token = (request.query as Record<string, string>).token;
    if (!token) { socket.close(1008, "Missing token"); return; }

    let userId: string;
    try {
      const payload = fastify.jwt.verify<{ userId: string }>(token);
      userId = payload.userId;
    } catch {
      socket.close(1008, "Invalid token");
      return;
    }

    pool.set(userId, socket);

    socket.on("message", async (raw: Buffer) => {
      try {
        const outer = JSON.parse(raw.toString()) as { event: string; data: unknown };
        if (outer.event === "message") {
          const msg = outer.data as SocketMessage & { userId?: string };
          msg.userId = userId;
          await handleSocketMessage(userId, msg, socket);
        }
      } catch (err) {
        console.error("[ws] message error", err);
      }
    });

    // Ping every 5 s to keep connection alive (mirrors Go ws_client.go)
    const ping = setInterval(() => {
      if (socket.readyState === socket.OPEN) socket.ping();
    }, 5000);

    socket.on("close", () => {
      clearInterval(ping);
      pool.delete(userId);
    });
  });

  // ─── GET /chats/active — list active chats for current user ───────────────
  fastify.get(
    "/chats/active",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const rows = await db
        .select()
        .from(chats)
        .where(eq(chats.owner, request.user.userId));
      return reply.send({ chats: rows });
    }
  );

  // ─── POST /api/chat — Claude browser-automation endpoint ──────────────────
  // Mirrors Go: pkg/chat/app/claude_service.go + pkg/chat/http/claude_handler.go
  fastify.post(
    "/api/chat",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = z
        .object({
          message: z.string(),
          conversation_id: z.string().optional(),
          page_context: z.object({
            url: z.string(),
            title: z.string().optional(),
            pageText: z.string().optional(),
            interactiveElements: z.array(z.object({
              type: z.string(),
              selector: z.string(),
              text: z.string().optional(),
              placeholder: z.string().optional(),
              value: z.string().optional(),
              href: z.string().optional(),
              name: z.string().optional(),
              ariaLabel: z.string().optional(),
              id: z.string().optional(),
            })).optional(),
          }).optional(),
          history: z.array(z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string(),
          })).optional(),
        })
        .parse(request.body);

      const systemPrompt = buildBrowserSystemPrompt(body.page_context);

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: [{ type: "text", text: systemPrompt }],
        messages: [
          ...(body.history ?? []).filter(h => h.content).map((h) => ({
            role: h.role,
            content: h.content,
          })),
          { role: "user" as const, content: body.message },
        ],
        tools: browserTools(),
      });

      const result = parseClaudeResponse(response, body.conversation_id ?? "");
      return reply.send(result);
    }
  );
}

// ─── Streaming WebSocket handler ──────────────────────────────────────────────

async function handleSocketMessage(
  userId: string,
  msg: SocketMessage & { userId?: string },
  socket: WebSocket
) {
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, msg.chatId));

  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: msg.systemPrompt,
    messages: [
      ...history.map((m) => ({
        role: m.sender === userId ? ("user" as const) : ("assistant" as const),
        content: m.content ?? "",
      })),
      { role: "user" as const, content: msg.content },
    ],
  });

  let full = "";

  stream.on("text", (text) => {
    full += text;
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify({ type: "delta", content: text }));
    }
  });

  await stream.finalMessage();

  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify({ type: "done" }));
  }

  await db.insert(messages).values([
    {
      id: crypto.randomUUID(),
      chatId: msg.chatId,
      content: msg.content,
      sender: userId,
      type: "text",
    },
    {
      id: crypto.randomUUID(),
      chatId: msg.chatId,
      content: full,
      sender: msg.agentId,
      agentId: msg.agentId,
      type: "text",
    },
  ]);
}

// ─── Claude browser-automation helpers ───────────────────────────────────────

function buildBrowserSystemPrompt(ctx?: {
  url?: string;
  title?: string;
  pageText?: string;
  interactiveElements?: Array<{ type: string; selector: string; text?: string; ariaLabel?: string; placeholder?: string; value?: string; href?: string }>;
}): string {
  let prompt = "You are Kinship, an AI browser assistant that can interact with any website on behalf of the user. "
    + "You can read the current page and perform actions like clicking buttons, filling forms, navigating, scrolling, and more.\n\n";

  if (ctx?.url) {
    prompt += `Current page URL: ${ctx.url}\n`;
    if (ctx.title) prompt += `Page title: ${ctx.title}\n`;

    if (ctx.interactiveElements?.length) {
      prompt += `\nInteractive elements on page (${ctx.interactiveElements.length} total):\n`;
      ctx.interactiveElements.forEach((el, i) => {
        let line = `  [${i + 1}] type=${el.type} selector="${el.selector}"`;
        if (el.text) line += ` text="${el.text}"`;
        if (el.ariaLabel) line += ` aria-label="${el.ariaLabel}"`;
        if (el.placeholder) line += ` placeholder="${el.placeholder}"`;
        if (el.value) line += ` value="${el.value}"`;
        if (el.href) line += ` href="${el.href}"`;
        prompt += line + "\n";
      });
    } else {
      prompt += "\nNo interactive elements detected on this page.\n";
    }

    if (ctx.pageText) {
      const truncated = ctx.pageText.length > 1500 ? ctx.pageText.slice(0, 1500) + "…" : ctx.pageText;
      prompt += `\nVisible page text (truncated):\n${truncated}\n`;
    }
  }

  prompt += "\nGuidelines:\n"
    + "- Always use the exact selector strings from the element list above when targeting elements.\n"
    + "- For multi-step tasks, use the execute_steps tool to batch all actions.\n"
    + "- Always include a short, friendly text explanation of what you are doing.\n"
    + "- If you cannot complete a task because the required element is not visible, explain why.\n"
    + "- If no action is needed, just reply conversationally.";

  return prompt;
}

function browserTools(): Anthropic.Tool[] {
  return [
    { name: "click", description: "Click an element on the page.", input_schema: { type: "object", properties: { selector: { type: "string" }, text: { type: "string" } } } },
    { name: "type_text", description: "Type text into an input element.", input_schema: { type: "object", properties: { selector: { type: "string" }, text: { type: "string" } }, required: ["selector", "text"] } },
    { name: "clear_field", description: "Clear an input field.", input_schema: { type: "object", properties: { selector: { type: "string" } }, required: ["selector"] } },
    { name: "select_option", description: "Select an option from a dropdown.", input_schema: { type: "object", properties: { selector: { type: "string" }, value: { type: "string" } }, required: ["selector", "value"] } },
    { name: "scroll_to", description: "Scroll to an element or Y position.", input_schema: { type: "object", properties: { selector: { type: "string" }, y: { type: "number" } } } },
    { name: "press_key", description: "Press a keyboard key.", input_schema: { type: "object", properties: { key: { type: "string" }, selector: { type: "string" } }, required: ["key"] } },
    { name: "hover_element", description: "Hover over an element.", input_schema: { type: "object", properties: { selector: { type: "string" }, text: { type: "string" } } } },
    { name: "navigate_to", description: "Navigate to a URL.", input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } },
    {
      name: "execute_steps",
      description: "Execute multiple browser actions in sequence.",
      input_schema: {
        type: "object",
        properties: {
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                action: { type: "string" }, selector: { type: "string" }, text: { type: "string" },
                value: { type: "string" }, url: { type: "string" }, key: { type: "string" }, y: { type: "number" },
              },
              required: ["action"],
            },
          },
        },
        required: ["steps"],
      },
    },
  ] as Anthropic.Tool[];
}

const TOOL_TYPE_MAP: Record<string, string> = {
  click: "click", type_text: "type", clear_field: "clear",
  select_option: "select_option", scroll_to: "scroll", press_key: "press_key",
  hover_element: "hover", navigate_to: "navigate", execute_steps: "steps",
};

function parseClaudeResponse(resp: Anthropic.Message, conversationId: string) {
  const textParts: string[] = [];
  let action: Record<string, unknown> | null = null;

  for (const block of resp.content) {
    if (block.type === "text") {
      textParts.push(block.text);
    } else if (block.type === "tool_use" && !action) {
      const type = TOOL_TYPE_MAP[block.name];
      if (type) {
        action = { type, params: block.input };
      }
    }
  }

  const message = textParts.join(" ").trim() || (action ? `Executing: ${action.type}.` : "");
  return { message, action, conversation_id: conversationId };
}
