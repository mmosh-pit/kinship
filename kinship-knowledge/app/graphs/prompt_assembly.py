"""Graph 3: Prompt Assembly — composes the full system prompt from 3 tiers + context.

Subgraph: Called by Graph 4 (NPC Dialogue) before each Claude call.
Flow: load_tier1 → load_tier2 → load_tier3 → inject_player_ctx → inject_scene_ctx → retrieve_knowledge → compose
"""

import logging
from typing import TypedDict

from langgraph.graph import StateGraph, END
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Prompt, PlayerProfile, ScenePresence, ConversationHistory
from app.services.embedding_client import embed_query
from app.services.pinecone_client import query_vectors

logger = logging.getLogger(__name__)

SLIDING_WINDOW = 20  # Last N conversation turns to include


class PromptAssemblyState(TypedDict):
    player_id: str
    scene_id: str
    npc_id: str
    recent_messages: list[dict]
    db_session: object
    # Built during assembly
    tier1_prompt: str
    tier2_prompt: str
    tier3_prompt: str
    player_context: str
    scene_context: str
    knowledge_snippets: str
    system_prompt: str
    conversation_history: list[dict]
    total_tokens: int


# ── Nodes ──

async def load_tier1(state: PromptAssemblyState) -> dict:
    """Load global constitution prompt (Tier 1)."""
    db: AsyncSession = state["db_session"]
    result = await db.execute(
        select(Prompt).where(Prompt.tier == 1, Prompt.is_active == True)
    )
    prompts = result.scalars().all()
    content = "\n\n".join(p.content or "" for p in prompts)
    return {"tier1_prompt": content or "You are a caring and supportive NPC in the Kinship wellbeing game for children."}


async def load_tier2(state: PromptAssemblyState) -> dict:
    """Load scene-specific prompt (Tier 2)."""
    db: AsyncSession = state["db_session"]
    result = await db.execute(
        select(Prompt).where(
            Prompt.tier == 2,
            Prompt.scene_id == state["scene_id"],
            Prompt.is_active == True,
        )
    )
    prompt = result.scalars().first()
    return {"tier2_prompt": prompt.content if prompt else ""}


async def load_tier3(state: PromptAssemblyState) -> dict:
    """Load NPC/guardian-specific prompt (Tier 3)."""
    db: AsyncSession = state["db_session"]
    result = await db.execute(
        select(Prompt).where(
            Prompt.tier == 3,
            Prompt.npc_id == state["npc_id"],
            Prompt.is_active == True,
        )
    )
    prompt = result.scalars().first()
    return {"tier3_prompt": prompt.content if prompt else ""}


async def inject_player_ctx(state: PromptAssemblyState) -> dict:
    """Inject player's HEARTS scores, progress, and completed items."""
    db: AsyncSession = state["db_session"]
    player = await db.get(PlayerProfile, state["player_id"])

    if not player:
        return {"player_context": "New player. Be welcoming and introductory."}

    scores = player.hearts_scores or {}
    ctx_parts = [
        f"Player: {player.display_name or 'Unknown'}",
        f"HEARTS Scores: {', '.join(f'{k}={v}' for k, v in scores.items())}",
    ]

    # Highlight concerning patterns
    for facet, score in scores.items():
        if score < 30:
            ctx_parts.append(f"⚠️ LOW {facet} ({score}) — provide extra support in this area")
        elif score > 90:
            ctx_parts.append(f"⚡ HIGH {facet} ({score}) — encourage branching out to other areas")

    if player.completed_quests:
        ctx_parts.append(f"Completed quests: {len(player.completed_quests)}")
    if player.met_npcs:
        ctx_parts.append(f"NPCs met: {len(player.met_npcs)}")

    return {"player_context": "\n".join(ctx_parts)}


async def inject_scene_ctx(state: PromptAssemblyState) -> dict:
    """Inject other players currently in the scene for multi-player awareness."""
    db: AsyncSession = state["db_session"]
    result = await db.execute(
        select(ScenePresence).where(
            ScenePresence.scene_id == state["scene_id"],
            ScenePresence.player_id != state["player_id"],
        )
    )
    others = result.scalars().all()

    if not others:
        return {"scene_context": "The player is alone in this scene."}

    ctx = f"Other players in this scene: {len(others)}. "
    ctx += "Be aware that this is a shared space — reference other players naturally if appropriate."
    return {"scene_context": ctx}


async def retrieve_knowledge(state: PromptAssemblyState) -> dict:
    """Query Pinecone for relevant knowledge based on recent dialogue."""
    recent = state.get("recent_messages", [])
    if not recent:
        return {"knowledge_snippets": ""}

    # Use last 3 messages as context for retrieval
    context = " ".join(m.get("content", "") for m in recent[-3:])

    try:
        query_embedding = await embed_query(context)
        results = await query_vectors(query_embedding, top_k=3)
        snippets = []
        for r in results:
            meta = r.get("metadata", {})
            text = meta.get("text", meta.get("summary", ""))
            if text:
                snippets.append(f"[{meta.get('category', 'Knowledge')}] {text[:300]}")

        return {"knowledge_snippets": "\n".join(snippets)}
    except Exception as e:
        logger.warning(f"Knowledge retrieval failed: {e}")
        return {"knowledge_snippets": ""}


async def load_conversation_history(state: PromptAssemblyState) -> dict:
    """Load last N conversation turns from database."""
    db: AsyncSession = state["db_session"]
    result = await db.execute(
        select(ConversationHistory)
        .where(
            ConversationHistory.player_id == state["player_id"],
            ConversationHistory.npc_id == state["npc_id"],
        )
        .order_by(ConversationHistory.created_at.desc())
        .limit(SLIDING_WINDOW)
    )
    rows = result.scalars().all()

    history = [
        {"role": r.role, "content": r.content}
        for r in reversed(rows)
    ]
    return {"conversation_history": history}


async def compose(state: PromptAssemblyState) -> dict:
    """Merge all prompt layers into the final system prompt."""
    parts = []

    # Tier 1: Global constitution
    if state.get("tier1_prompt"):
        parts.append(f"=== CORE GUIDELINES ===\n{state['tier1_prompt']}")

    # Tier 2: Scene context
    if state.get("tier2_prompt"):
        parts.append(f"=== SCENE CONTEXT ===\n{state['tier2_prompt']}")

    # Tier 3: NPC personality
    if state.get("tier3_prompt"):
        parts.append(f"=== YOUR CHARACTER ===\n{state['tier3_prompt']}")

    # Player context
    if state.get("player_context"):
        parts.append(f"=== ABOUT THIS PLAYER ===\n{state['player_context']}")

    # Scene multi-player context
    if state.get("scene_context"):
        parts.append(f"=== SCENE STATE ===\n{state['scene_context']}")

    # Retrieved knowledge
    if state.get("knowledge_snippets"):
        parts.append(f"=== RELEVANT KNOWLEDGE ===\n{state['knowledge_snippets']}")

    # Response format instruction
    parts.append("""=== RESPONSE FORMAT ===
Respond as your character naturally. After your dialogue, output a JSON block on a new line:
```json
{"detected_moves": ["move_type1", "move_type2"], "intent": "player's intent", "emotions": ["emotion1"]}
```
Keep dialogue warm, supportive, and age-appropriate. Maximum 3 sentences.""")

    system_prompt = "\n\n".join(parts)

    # Rough token estimate
    total_tokens = len(system_prompt) // 4

    return {
        "system_prompt": system_prompt,
        "total_tokens": total_tokens,
    }


# ── Graph Assembly ──

def build_prompt_assembly_graph():
    workflow = StateGraph(PromptAssemblyState)

    workflow.add_node("load_tier1", load_tier1)
    workflow.add_node("load_tier2", load_tier2)
    workflow.add_node("load_tier3", load_tier3)
    workflow.add_node("inject_player_ctx", inject_player_ctx)
    workflow.add_node("inject_scene_ctx", inject_scene_ctx)
    workflow.add_node("retrieve_knowledge", retrieve_knowledge)
    workflow.add_node("load_history", load_conversation_history)
    workflow.add_node("compose", compose)

    workflow.set_entry_point("load_tier1")
    workflow.add_edge("load_tier1", "load_tier2")
    workflow.add_edge("load_tier2", "load_tier3")
    workflow.add_edge("load_tier3", "inject_player_ctx")
    workflow.add_edge("inject_player_ctx", "inject_scene_ctx")
    workflow.add_edge("inject_scene_ctx", "retrieve_knowledge")
    workflow.add_edge("retrieve_knowledge", "load_history")
    workflow.add_edge("load_history", "compose")
    workflow.add_edge("compose", END)

    return workflow.compile()


prompt_assembly_graph = build_prompt_assembly_graph()
