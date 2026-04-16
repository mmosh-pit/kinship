"""Graph 6: Route Resolution — evaluates triggers/conditions for scene transitions.

Subgraph: Called by Graph 4 after each dialogue turn.
Flow: load_routes → eval_triggers → eval_conditions → resolve
"""

import logging
from typing import TypedDict

from langgraph.graph import StateGraph, END
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Route

logger = logging.getLogger(__name__)


class RouteState(TypedDict):
    player_id: str
    current_scene: str
    player_profile: dict  # HEARTS scores + completed items
    event_type: str  # What just happened: dialogue, quest_complete, challenge_complete
    event_value: str  # ID of completed quest/challenge, or NPC talked to
    eligible_routes: list[dict]
    auto_transition: dict | None
    db_session: object


# ── Nodes ──

async def load_active_routes(state: RouteState) -> dict:
    """Load all routes from current scene + wildcard routes."""
    db: AsyncSession = state["db_session"]
    result = await db.execute(
        select(Route).where(
            or_(
                Route.from_scene == state["current_scene"],
                Route.from_scene == "*",
            ),
            Route.status == "active",
        )
    )
    routes = result.scalars().all()

    return {
        "eligible_routes": [
            {
                "id": str(r.id),
                "name": r.name,
                "from_scene": r.from_scene,
                "to_scene": r.to_scene,
                "trigger_type": r.trigger_type,
                "trigger_value": r.trigger_value,
                "conditions": r.conditions or [],
                "bidirectional": r.bidirectional,
                "hidden_until_triggered": r.hidden_until_triggered,
            }
            for r in routes
        ]
    }


async def eval_triggers(state: RouteState) -> dict:
    """Evaluate which routes have their trigger condition met."""
    routes = state.get("eligible_routes", [])
    profile = state.get("player_profile", {})
    event_type = state.get("event_type", "dialogue")
    event_value = state.get("event_value", "")

    triggered = []

    for route in routes:
        trigger = route.get("trigger_type", "manual")
        trigger_val = route.get("trigger_value", "")

        match = False

        if trigger == "manual":
            match = True  # Always available

        elif trigger == "quest_complete":
            completed = profile.get("completed_quests", [])
            match = trigger_val in [str(q) for q in completed]

        elif trigger == "challenge_complete":
            completed = profile.get("completed_challenges", [])
            match = trigger_val in [str(c) for c in completed]

        elif trigger == "npc_dialogue":
            met = profile.get("met_npcs", [])
            match = trigger_val in [str(n) for n in met]

        elif trigger == "hearts_threshold":
            # Format: "E:70" means E score >= 70
            try:
                facet, threshold = trigger_val.split(":")
                scores = profile.get("hearts_scores", {})
                match = scores.get(facet, 0) >= float(threshold)
            except (ValueError, KeyError):
                match = False

        elif trigger == "exit_zone":
            # Position-based — handled by WS layer, always include
            match = event_type == "exit_zone" and event_value == trigger_val

        if match:
            triggered.append(route)

    return {"eligible_routes": triggered}


async def eval_conditions(state: RouteState) -> dict:
    """For triggered routes, check ALL conditions pass."""
    routes = state.get("eligible_routes", [])
    profile = state.get("player_profile", {})
    scores = profile.get("hearts_scores", {})

    passing = []

    for route in routes:
        conditions = route.get("conditions", [])
        all_pass = True

        for cond in conditions:
            cond_type = cond.get("type", "")
            facet = cond.get("facet", "")
            value = cond.get("value", "")

            if cond_type == "hearts_above":
                if scores.get(facet, 0) < float(value):
                    all_pass = False
            elif cond_type == "hearts_below":
                if scores.get(facet, 0) > float(value):
                    all_pass = False
            elif cond_type == "quest_completed":
                if value not in [str(q) for q in profile.get("completed_quests", [])]:
                    all_pass = False
            elif cond_type == "challenge_completed":
                if value not in [str(c) for c in profile.get("completed_challenges", [])]:
                    all_pass = False
            elif cond_type == "npc_met":
                if value not in [str(n) for n in profile.get("met_npcs", [])]:
                    all_pass = False

        if all_pass:
            passing.append(route)

    return {"eligible_routes": passing}


async def resolve(state: RouteState) -> dict:
    """Determine if auto-transition or player choice."""
    routes = state.get("eligible_routes", [])

    if len(routes) == 1 and not routes[0].get("hidden_until_triggered"):
        return {"auto_transition": routes[0]}

    return {"auto_transition": None}


# ── Graph Assembly ──

def build_route_resolution_graph():
    workflow = StateGraph(RouteState)

    workflow.add_node("load_routes", load_active_routes)
    workflow.add_node("eval_triggers", eval_triggers)
    workflow.add_node("eval_conditions", eval_conditions)
    workflow.add_node("resolve", resolve)

    workflow.set_entry_point("load_routes")
    workflow.add_edge("load_routes", "eval_triggers")
    workflow.add_edge("eval_triggers", "eval_conditions")
    workflow.add_edge("eval_conditions", "resolve")
    workflow.add_edge("resolve", END)

    return workflow.compile()


route_resolution_graph = build_route_resolution_graph()
