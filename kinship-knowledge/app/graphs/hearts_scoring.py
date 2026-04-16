"""Graph 5: HEARTS Scoring Engine — classifies dialogue moves and computes score deltas.

Subgraph: Called by Graph 4 after each dialogue turn.
Flow: classify_moves → lookup_rubric → aggregate_deltas → apply_damping → detect_patterns
"""

import json
import logging
from typing import TypedDict

from langgraph.graph import StateGraph, END
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import HeartsRubric
from app.services.claude_client import invoke_claude, parse_json_response

logger = logging.getLogger(__name__)


class HeartsState(TypedDict):
    player_id: str
    current_scores: dict[str, float]
    dialogue_context: str
    detected_moves: list[str]
    rubric_deltas: dict[str, float]
    damped_deltas: dict[str, float]
    new_scores: dict[str, float]
    pattern_alerts: list[dict]
    challenge_multiplier: float
    db_session: object


# ── Nodes ──


async def classify_moves(state: HeartsState) -> dict:
    """Use Claude to classify what behavioral moves the player exhibited."""
    if state.get("detected_moves"):
        # Already extracted from dialogue response
        return {"detected_moves": state["detected_moves"]}

    system = """Analyze this game dialogue and classify the player's behavioral moves.
Return a JSON array of move type strings from this list:
["physical_activity", "emotional_expression", "creative_thinking", "self_reflection",
 "goal_setting", "problem_solving", "helping_others", "social_interaction",
 "active_listening", "showing_empathy", "taking_initiative", "managing_emotions",
 "asking_questions", "sharing_feelings", "team_work", "persistence"]
Respond with ONLY a JSON array. No explanation."""

    response = await invoke_claude(system, state["dialogue_context"], model="haiku")

    try:
        # Use robust parser to handle GPT/Gemini response formats
        parsed = parse_json_response(response)
        # Handle both array and dict with items key
        if isinstance(parsed, list):
            moves = parsed
        elif isinstance(parsed, dict) and "items" in parsed:
            moves = parsed["items"]
        elif isinstance(parsed, dict):
            # Try common keys for moves
            moves = parsed.get("moves", parsed.get("detected_moves", []))
        else:
            moves = []
        if not isinstance(moves, list):
            moves = []
    except (json.JSONDecodeError, TypeError):
        moves = []

    return {"detected_moves": moves}


async def lookup_rubric(state: HeartsState) -> dict:
    """Look up delta values from the HEARTS rubric table for detected moves."""
    db: AsyncSession = state["db_session"]
    moves = state.get("detected_moves", [])

    if not moves:
        return {"rubric_deltas": {}}

    result = await db.execute(
        select(HeartsRubric).where(HeartsRubric.move_type.in_(moves))
    )
    rubric_entries = result.scalars().all()

    # Accumulate deltas per facet
    deltas: dict[str, float] = {
        "H": 0,
        "E": 0,
        "A": 0,
        "R": 0,
        "T": 0,
        "Si": 0,
        "So": 0,
    }
    for entry in rubric_entries:
        deltas[entry.facet_key] = deltas.get(entry.facet_key, 0) + entry.delta

    return {"rubric_deltas": deltas}


async def aggregate_deltas(state: HeartsState) -> dict:
    """Apply challenge multiplier to raw deltas."""
    deltas = state.get("rubric_deltas", {}).copy()
    multiplier = state.get("challenge_multiplier", 1.0)

    for facet in deltas:
        deltas[facet] *= multiplier

    return {"rubric_deltas": deltas}


async def apply_damping(state: HeartsState) -> dict:
    """Apply diminishing returns: damped = delta × (1 - score/100). Clamp to [0, 100]."""
    deltas = state.get("rubric_deltas", {})
    current = state.get("current_scores", {})

    damped: dict[str, float] = {}
    new_scores: dict[str, float] = {}

    for facet in ["H", "E", "A", "R", "T", "Si", "So"]:
        raw = deltas.get(facet, 0)
        score = current.get(facet, 50)

        if raw > 0:
            # Positive deltas get dampened as score approaches 100
            damped_val = raw * (1 - score / 100)
        elif raw < 0:
            # Negative deltas get dampened as score approaches 0
            damped_val = raw * (score / 100)
        else:
            damped_val = 0

        damped[facet] = round(damped_val, 2)
        new_scores[facet] = round(max(0, min(100, score + damped_val)), 1)

    return {"damped_deltas": damped, "new_scores": new_scores}


async def detect_patterns(state: HeartsState) -> dict:
    """Flag under-patterns (<30) and over-patterns (>90) for NPC intervention."""
    scores = state.get("new_scores", {})
    alerts = []

    for facet, score in scores.items():
        if score < 30:
            alerts.append(
                {
                    "facet": facet,
                    "type": "under_pattern",
                    "score": score,
                    "message": f"{facet} score is low ({score}). Consider supportive interventions.",
                }
            )
        elif score > 90:
            alerts.append(
                {
                    "facet": facet,
                    "type": "over_pattern",
                    "score": score,
                    "message": f"{facet} score is very high ({score}). Encourage branching out.",
                }
            )

    return {"pattern_alerts": alerts}


# ── Graph Assembly ──


def build_hearts_scoring_graph():
    workflow = StateGraph(HeartsState)

    workflow.add_node("classify_moves", classify_moves)
    workflow.add_node("lookup_rubric", lookup_rubric)
    workflow.add_node("aggregate_deltas", aggregate_deltas)
    workflow.add_node("apply_damping", apply_damping)
    workflow.add_node("detect_patterns", detect_patterns)

    workflow.set_entry_point("classify_moves")
    workflow.add_edge("classify_moves", "lookup_rubric")
    workflow.add_edge("lookup_rubric", "aggregate_deltas")
    workflow.add_edge("aggregate_deltas", "apply_damping")
    workflow.add_edge("apply_damping", "detect_patterns")
    workflow.add_edge("detect_patterns", END)

    return workflow.compile()


hearts_scoring_graph = build_hearts_scoring_graph()
