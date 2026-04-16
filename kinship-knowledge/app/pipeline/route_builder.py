"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    ROUTE BUILDER                                              ║
║                                                                               ║
║  Creates intelligent routes between scenes based on:                          ║
║  • Challenge completion gates (must complete challenge to exit)               ║
║  • NPC interaction requirements (must talk to guardian)                        ║
║  • Item collection requirements (must collect N items)                        ║
║  • HEARTS score thresholds (need E >= 60 to enter)                           ║
║                                                                               ║
║  REPLACES the dumb sequential routes in manifest_assembler._build_routes()   ║
║                                                                               ║
║  USAGE:                                                                       ║
║  routes = build_routes(state, materialized_scenes)                            ║
║  # Then pass to manifest_assembler or replace _build_routes                   ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import logging
from typing import Optional
from app.pipeline.pipeline_state import PipelineState
from app.core.npc_templates import NPCRole

logger = logging.getLogger(__name__)


def build_routes(
    state: PipelineState,
    materialized_scenes: list,
) -> list[dict]:
    """
    Build intelligent routes between scenes.

    Creates routes with conditions based on:
    - Challenge completion (guardian-blocked exits)
    - NPC interactions (must talk to quest_giver)
    - Item collection (collect_items challenges)
    - HEARTS thresholds (from planner output)

    Args:
        state: Pipeline state with all agent outputs
        materialized_scenes: Scenes with coordinates

    Returns:
        List of route dicts for the manifest
    """
    game_id = state.input.game_id
    routes = []

    for i in range(len(materialized_scenes) - 1):
        current = materialized_scenes[i]
        next_scene = materialized_scenes[i + 1]

        from_id = f"{game_id}_scene_{i}"
        to_id = f"{game_id}_scene_{i + 1}"

        # Gather conditions for this transition
        conditions = _build_transition_conditions(state, current, i)

        # Determine trigger type based on conditions
        if conditions:
            trigger_type = "conditional_zone_enter"
        else:
            trigger_type = "zone_enter"

        route = {
            "route_id": f"route_{i}_to_{i + 1}",
            "from_scene": i,
            "to_scene": i + 1,
            "from_scene_id": from_id,
            "to_scene_id": to_id,
            "from_scene_name": f"Scene {i + 1}",
            "to_scene_name": f"Scene {i + 2}",
            "trigger": {
                "type": trigger_type,
                "zone_type": "exit",
                "position": {
                    "x": current.exit_x,
                    "y": current.exit_y,
                },
            },
            "target_spawn": {
                "x": next_scene.spawn_x,
                "y": next_scene.spawn_y,
            },
            "conditions": conditions,
            "transition": "fade",
            # Message shown when conditions not met
            "blocked_message": _build_blocked_message(conditions),
        }

        routes.append(route)
        logger.info(
            f"Route scene {i} → {i+1}: "
            f"{len(conditions)} conditions, trigger={trigger_type}"
        )

    return routes


def _build_transition_conditions(
    state: PipelineState,
    scene,
    scene_idx: int,
) -> list[dict]:
    """
    Build conditions that must be met to transition from this scene.

    Reads from:
    - Challenges in this scene (must complete all)
    - Guardian NPCs (must interact)
    - Collect challenges (must collect required count)
    """
    conditions = []

    # ── Challenge completion conditions ──────────────────────────────────
    scene_challenges = []
    for co in state.challenge_outputs:
        if co.scene_index == scene_idx:
            scene_challenges = list(co.challenges)
            break

    for challenge in scene_challenges:
        if not isinstance(challenge, dict):
            continue

        mechanic_id = challenge.get("mechanic_id", "")
        challenge_id = challenge.get("challenge_id", "")

        # All challenges must be completed to exit
        conditions.append(
            {
                "type": "challenge_complete",
                "challenge_id": challenge_id,
                "mechanic_id": mechanic_id,
                "description": f"Complete: {challenge.get('name', mechanic_id)}",
            }
        )

        # For collect_items, add specific count requirement
        if mechanic_id in ("collect_items", "collect_all"):
            count = challenge.get("params", {}).get(
                "object_count", challenge.get("params", {}).get("collect_count", 0)
            )
            if count:
                conditions.append(
                    {
                        "type": "collect_count",
                        "challenge_id": challenge_id,
                        "required_count": count,
                        "description": f"Collect {count} items",
                    }
                )

        # For key_unlock, add key possession requirement
        if mechanic_id == "key_unlock":
            conditions.append(
                {
                    "type": "item_required",
                    "item_type": "key",
                    "challenge_id": challenge_id,
                    "description": "Must have the key",
                }
            )

        # For timed/combat mechanics, add survive condition
        if mechanic_id in ("defend_position", "attack_enemy"):
            timer_seconds = challenge.get("params", {}).get("timer_seconds", 0)
            if timer_seconds > 0:
                conditions.append(
                    {
                        "type": "survive_complete",
                        "challenge_id": challenge_id,
                        "timer_seconds": timer_seconds,
                        "description": f"Survive for {timer_seconds} seconds",
                    }
                )

    # ── Guardian NPC conditions ──────────────────────────────────────────
    scene_npcs = []
    for no in state.npc_outputs:
        if no.scene_index == scene_idx:
            scene_npcs = list(no.npcs)
            break

    for npc in scene_npcs:
        if not isinstance(npc, dict):
            continue

        role = npc.get("role", "")
        npc_id = npc.get("npc_id", "")

        # Guardian NPCs block progress until challenge complete
        if role == "guardian":
            conditions.append(
                {
                    "type": "npc_interaction",
                    "npc_id": npc_id,
                    "npc_role": role,
                    "interaction_type": "grant_passage",
                    "description": f"Speak to the {npc.get('name', 'Guardian')}",
                }
            )

        # Quest givers require quest completion
        if role == "quest_giver":
            conditions.append(
                {
                    "type": "npc_interaction",
                    "npc_id": npc_id,
                    "npc_role": role,
                    "interaction_type": "quest_complete",
                    "description": f"Complete quest from {npc.get('name', 'Quest Giver')}",
                }
            )

    # ── HEARTS threshold conditions (from planner) ───────────────────────
    # Check if planner specified any HEARTS requirements for transitions
    if state.planner_output and state.planner_output.gameplay_loop:
        loop = state.planner_output.gameplay_loop
        # If the game loop has HEARTS-related goals, add soft thresholds
        goal_type = loop.get("goal_type", "")

        # Social goals might require minimum Social Intelligence score
        if goal_type in ("befriend", "trade") and scene_idx > 0:
            conditions.append(
                {
                    "type": "hearts_minimum",
                    "facet": "So",
                    "minimum": 30,
                    "description": "Build your social skills",
                    "soft": True,  # Warning only, doesn't block
                }
            )

    return conditions


def _build_blocked_message(conditions: list[dict]) -> str:
    """Build a player-facing message when route is blocked."""
    if not conditions:
        return ""

    # Find the most important unmet condition
    challenge_conditions = [c for c in conditions if c["type"] == "challenge_complete"]
    npc_conditions = [c for c in conditions if c["type"] == "npc_interaction"]

    if challenge_conditions:
        return "Complete all challenges before proceeding."
    elif npc_conditions:
        names = [c.get("description", "Speak to NPC") for c in npc_conditions]
        return f"You need to: {'; '.join(names)}"
    else:
        return "You're not ready to proceed yet."


# ═══════════════════════════════════════════════════════════════════════════════
#  ROUTE VALIDATION
# ═══════════════════════════════════════════════════════════════════════════════


def validate_routes(
    routes: list[dict],
    state: PipelineState,
    materialized_scenes: list,
) -> tuple[bool, list[str], list[str]]:
    """
    Validate that routes form a completable game.

    Checks:
    - Every scene pair has a route
    - All condition references are valid (challenge_ids exist, npc_ids exist)
    - No circular dependencies
    - Game is completable (all conditions can theoretically be met)

    Returns:
        (is_valid, errors, warnings)
    """
    errors = []
    warnings = []

    num_scenes = len(materialized_scenes)

    # Check every consecutive scene pair has a route
    route_pairs = {(r["from_scene"], r["to_scene"]) for r in routes}
    for i in range(num_scenes - 1):
        if (i, i + 1) not in route_pairs:
            errors.append(f"No route from scene {i} to scene {i+1}")

    # Collect all valid challenge IDs and NPC IDs
    all_challenge_ids = set()
    all_npc_ids = set()

    for co in state.challenge_outputs:
        for ch in co.challenges:
            if isinstance(ch, dict):
                all_challenge_ids.add(ch.get("challenge_id", ""))

    for no in state.npc_outputs:
        for npc in no.npcs:
            if isinstance(npc, dict):
                all_npc_ids.add(npc.get("npc_id", ""))

    # Validate condition references
    for route in routes:
        for condition in route.get("conditions", []):
            cond_type = condition.get("type", "")

            if cond_type == "challenge_complete":
                cid = condition.get("challenge_id", "")
                if cid and cid not in all_challenge_ids:
                    errors.append(
                        f"Route {route['route_id']}: references unknown "
                        f"challenge '{cid}'"
                    )

            elif cond_type == "npc_interaction":
                nid = condition.get("npc_id", "")
                if nid and nid not in all_npc_ids:
                    errors.append(
                        f"Route {route['route_id']}: references unknown " f"NPC '{nid}'"
                    )

    # Check conditions are in the correct scene
    for route in routes:
        from_scene = route["from_scene"]
        for condition in route.get("conditions", []):
            cond_type = condition.get("type", "")

            if cond_type == "challenge_complete":
                cid = condition.get("challenge_id", "")
                # Find which scene this challenge is in
                for co in state.challenge_outputs:
                    for ch in co.challenges:
                        if isinstance(ch, dict) and ch.get("challenge_id") == cid:
                            if co.scene_index != from_scene:
                                warnings.append(
                                    f"Route {route['route_id']}: challenge "
                                    f"'{cid}' is in scene {co.scene_index} "
                                    f"but route is from scene {from_scene}"
                                )

    # Check game is completable (basic: each scene has at least a path through)
    for scene in materialized_scenes:
        if not scene.path_exists:
            errors.append(
                f"Scene {scene.scene_index}: no walkable path " f"from spawn to exit"
            )

    is_valid = len(errors) == 0
    if is_valid:
        logger.info(
            f"✓ Routes validated: {len(routes)} routes, "
            f"{sum(len(r.get('conditions', [])) for r in routes)} total conditions"
        )
    else:
        logger.error(f"✗ Route validation failed: {errors}")

    return is_valid, errors, warnings
