"""Graph 4: NPC Dialogue — main runtime orchestrator.

Trigger: Player sends message (WS or REST)
Calls Graphs 3 (Prompt Assembly), 5 (HEARTS Scoring), 6 (Route Resolution) as subgraphs.
Flow: receive → assemble_prompt → call_claude → parse → score_hearts → check_triggers → persist → emit
"""

import json
import logging
from typing import TypedDict
from uuid import UUID

from langgraph.graph import StateGraph, END
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import NPC, PlayerProfile, ConversationHistory
from app.graphs.prompt_assembly import prompt_assembly_graph
from app.graphs.hearts_scoring import hearts_scoring_graph
from app.graphs.route_resolution import route_resolution_graph
from app.services.claude_client import invoke_claude, safe_parse_json
from app.schemas.runtime import DialogueResponse, HeartsDeltas, TriggerEvent

logger = logging.getLogger(__name__)


class DialogueState(TypedDict):
    # Input
    player_id: str
    scene_id: str
    npc_id: str
    player_input: str
    db_session: object
    # Loaded
    npc_name: str
    player_profile: dict
    conversation_history: list[dict]
    # From Graph 3
    system_prompt: str
    # From Claude
    ai_dialogue: str
    detected_moves: list[str]
    intent: str
    # From Graph 5
    hearts_deltas: dict
    new_scores: dict
    pattern_alerts: list[dict]
    # From Graph 6
    triggered_routes: list[dict]
    auto_transition: dict | None
    # Output
    response_payload: dict


# ── Nodes ──


async def receive_input(state: DialogueState) -> dict:
    """Load NPC info, player profile, and recent conversation."""
    db: AsyncSession = state["db_session"]

    # Load NPC
    npc = await db.get(NPC, state["npc_id"])
    npc_name = npc.name if npc else "Unknown NPC"

    # Load player profile
    player = await db.get(PlayerProfile, state["player_id"])
    if not player:
        profile = {
            "hearts_scores": {
                "H": 50,
                "E": 50,
                "A": 50,
                "R": 50,
                "T": 50,
                "Si": 50,
                "So": 50,
            },
            "completed_quests": [],
            "completed_challenges": [],
            "met_npcs": [],
        }
    else:
        profile = {
            "hearts_scores": player.hearts_scores or {},
            "completed_quests": player.completed_quests or [],
            "completed_challenges": player.completed_challenges or [],
            "met_npcs": player.met_npcs or [],
        }

    return {
        "npc_name": npc_name,
        "player_profile": profile,
    }


async def assemble_prompt(state: DialogueState) -> dict:
    """Run Graph 3: Prompt Assembly as subgraph."""
    result = await prompt_assembly_graph.ainvoke(
        {
            "player_id": state["player_id"],
            "scene_id": state["scene_id"],
            "npc_id": state["npc_id"],
            "recent_messages": [{"content": state["player_input"]}],
            "db_session": state["db_session"],
            "tier1_prompt": "",
            "tier2_prompt": "",
            "tier3_prompt": "",
            "player_context": "",
            "scene_context": "",
            "knowledge_snippets": "",
            "system_prompt": "",
            "conversation_history": [],
            "total_tokens": 0,
        }
    )

    return {
        "system_prompt": result["system_prompt"],
        "conversation_history": result.get("conversation_history", []),
    }


async def call_claude(state: DialogueState) -> dict:
    """Invoke Claude with the assembled prompt and conversation history."""
    response = await invoke_claude(
        system_prompt=state["system_prompt"],
        user_message=state["player_input"],
        history=state.get("conversation_history", []),
        model="haiku",
    )

    return {"ai_dialogue": response}


async def parse_response(state: DialogueState) -> dict:
    """Extract structured data from Claude's response (dialogue + JSON block)."""
    raw = state.get("ai_dialogue", "")

    dialogue = raw
    detected_moves = []
    intent = ""

    # Try to extract JSON block from response using robust parser
    # First, check if there's a code fence with JSON
    if "```" in raw:
        import re

        # Find content before the code fence (that's the dialogue)
        fence_match = re.search(r"```(?:json|JSON)?\s*\n?", raw)
        if fence_match:
            dialogue = raw[: fence_match.start()].strip()
            # Extract JSON from the fence
            try:
                data = safe_parse_json(raw, {})
                detected_moves = data.get("detected_moves", [])
                intent = data.get("intent", "")
            except Exception:
                pass
    elif raw.rstrip().endswith("}"):
        # Try to find inline JSON at end
        lines = raw.strip().split("\n")
        for i in range(len(lines) - 1, -1, -1):
            line = lines[i].strip()
            if line.startswith("{"):
                try:
                    data = json.loads("\n".join(lines[i:]))
                    detected_moves = data.get("detected_moves", [])
                    intent = data.get("intent", "")
                    dialogue = "\n".join(lines[:i]).strip()
                    break
                except json.JSONDecodeError:
                    continue

    return {
        "ai_dialogue": dialogue,
        "detected_moves": detected_moves,
        "intent": intent,
    }


async def score_hearts(state: DialogueState) -> dict:
    """Run Graph 5: HEARTS Scoring as subgraph."""
    result = await hearts_scoring_graph.ainvoke(
        {
            "player_id": state["player_id"],
            "current_scores": state["player_profile"].get("hearts_scores", {}),
            "dialogue_context": f"Player: {state['player_input']}\nNPC: {state.get('ai_dialogue', '')}",
            "detected_moves": state.get("detected_moves", []),
            "rubric_deltas": {},
            "damped_deltas": {},
            "new_scores": {},
            "pattern_alerts": [],
            "challenge_multiplier": 1.0,
            "db_session": state["db_session"],
        }
    )

    return {
        "hearts_deltas": result.get("damped_deltas", {}),
        "new_scores": result.get("new_scores", {}),
        "pattern_alerts": result.get("pattern_alerts", []),
    }


async def check_triggers(state: DialogueState) -> dict:
    """Run Graph 6: Route Resolution as subgraph."""
    result = await route_resolution_graph.ainvoke(
        {
            "player_id": state["player_id"],
            "current_scene": state["scene_id"],
            "player_profile": state.get("player_profile", {}),
            "event_type": "dialogue",
            "event_value": state.get("npc_id", ""),
            "eligible_routes": [],
            "auto_transition": None,
            "db_session": state["db_session"],
        }
    )

    return {
        "triggered_routes": result.get("eligible_routes", []),
        "auto_transition": result.get("auto_transition"),
    }


async def persist_state(state: DialogueState) -> dict:
    """Save conversation history, update HEARTS scores, update met NPCs."""
    db: AsyncSession = state["db_session"]

    # Save conversation — player message
    db.add(
        ConversationHistory(
            player_id=state["player_id"],
            npc_id=state["npc_id"],
            scene_id=state["scene_id"],
            role="user",
            content=state["player_input"],
        )
    )

    # Save conversation — NPC response
    db.add(
        ConversationHistory(
            player_id=state["player_id"],
            npc_id=state["npc_id"],
            scene_id=state["scene_id"],
            role="assistant",
            content=state.get("ai_dialogue", ""),
            hearts_deltas=state.get("hearts_deltas"),
        )
    )

    # Update player HEARTS scores
    new_scores = state.get("new_scores", {})
    if new_scores:
        await db.execute(
            update(PlayerProfile)
            .where(PlayerProfile.id == state["player_id"])
            .values(hearts_scores=new_scores)
        )

    # Update met NPCs
    player = await db.get(PlayerProfile, state["player_id"])
    if player:
        met = list(player.met_npcs or [])
        if state["npc_id"] not in met:
            met.append(state["npc_id"])
            player.met_npcs = met

    await db.flush()

    return {}


async def emit_response(state: DialogueState) -> dict:
    """Build the final response payload."""
    deltas = state.get("hearts_deltas", {})
    auto = state.get("auto_transition")

    triggers = []
    for route in state.get("triggered_routes", []):
        triggers.append(
            TriggerEvent(
                type="scene_transition",
                target_id=route.get("to_scene"),
                target_name=route.get("name"),
            ).model_dump()
        )

    payload = DialogueResponse(
        npc_id=state["npc_id"],
        npc_name=state.get("npc_name", "NPC"),
        dialogue=state.get("ai_dialogue", ""),
        detected_moves=state.get("detected_moves", []),
        intent=state.get("intent", ""),
        hearts_deltas=HeartsDeltas(
            **{k: v for k, v in deltas.items() if k in HeartsDeltas.model_fields}
        ),
        hearts_current=state.get("new_scores", {}),
        pattern_alerts=state.get("pattern_alerts", []),
        triggers=[TriggerEvent(**t) for t in triggers],
        scene_transition=auto if auto else None,
    ).model_dump()

    return {"response_payload": payload}


# ── Graph Assembly ──


def build_dialogue_graph():
    workflow = StateGraph(DialogueState)

    workflow.add_node("receive_input", receive_input)
    workflow.add_node("assemble_prompt", assemble_prompt)
    workflow.add_node("call_claude", call_claude)
    workflow.add_node("parse_response", parse_response)
    workflow.add_node("score_hearts", score_hearts)
    workflow.add_node("check_triggers", check_triggers)
    workflow.add_node("persist_state", persist_state)
    workflow.add_node("emit_response", emit_response)

    workflow.set_entry_point("receive_input")
    workflow.add_edge("receive_input", "assemble_prompt")
    workflow.add_edge("assemble_prompt", "call_claude")
    workflow.add_edge("call_claude", "parse_response")
    # After parsing, run HEARTS scoring and route resolution
    workflow.add_edge("parse_response", "score_hearts")
    workflow.add_edge("score_hearts", "check_triggers")
    workflow.add_edge("check_triggers", "persist_state")
    workflow.add_edge("persist_state", "emit_response")
    workflow.add_edge("emit_response", END)

    return workflow.compile()


dialogue_graph = build_dialogue_graph()


async def run_dialogue(
    player_id: str,
    scene_id: str,
    npc_id: str,
    player_input: str,
    db: AsyncSession,
) -> dict:
    """Entry point for the NPC Dialogue graph."""
    initial_state: DialogueState = {
        "player_id": player_id,
        "scene_id": scene_id,
        "npc_id": npc_id,
        "player_input": player_input,
        "db_session": db,
        "npc_name": "",
        "player_profile": {},
        "conversation_history": [],
        "system_prompt": "",
        "ai_dialogue": "",
        "detected_moves": [],
        "intent": "",
        "hearts_deltas": {},
        "new_scores": {},
        "pattern_alerts": [],
        "triggered_routes": [],
        "auto_transition": None,
        "response_payload": {},
    }

    result = await dialogue_graph.ainvoke(initial_state)
    return result.get("response_payload", {})
