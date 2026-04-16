"""
Layer 6 — Impact Layer.

Impact Analyzer: read dirty flags + dependency graphs → determine
  which agents and validators must run.
Conditional Agent Runner: execute agents in correct order,
  scoped to affected scenes/entities only.
"""

import logging
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any, Set

from app.state.game_state import GameState
from app.pipeline.pipeline_state import PipelineState
from app.edit.config import (
    AGENT_ORDER,
    AGENT_TRIGGERS,
    ALWAYS_VALIDATORS,
    SCOPE_VALIDATORS,
    EditScope,
)

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  DATA STRUCTURES
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class ImpactAnalysis:
    """Result of impact analysis — what needs to run."""

    # Agents to run (in order)
    agents_to_run: List[str] = field(default_factory=list)

    # Validators to run
    validators_to_run: Set[str] = field(default_factory=set)

    # Scopes affected
    scopes: Set[str] = field(default_factory=set)

    # Specific targets
    affected_scenes: List[str] = field(default_factory=list)
    affected_npcs: List[str] = field(default_factory=list)
    affected_challenges: List[str] = field(default_factory=list)
    routes_affected: bool = False
    new_scenes: List[str] = field(default_factory=list)


@dataclass
class AgentRunResult:
    """Result from running conditional agents."""

    success: bool = True
    agents_run: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════════
#  IMPACT ANALYZER
# ═══════════════════════════════════════════════════════════════════════════════


def analyze_impact(
    game_state: GameState,
    scopes: Set[str],
) -> ImpactAnalysis:
    """
    Determine which agents and validators must run based on dirty flags
    and dependency graphs.
    """
    analysis = ImpactAnalysis()
    analysis.scopes = scopes

    # Read dirty flags
    dirty = game_state.get_dirty_items()
    dirty_scenes = set(dirty.get("scenes", []))
    dirty_npcs = set(dirty.get("npcs", []))
    dirty_challenges = set(dirty.get("challenges", []))
    dirty_routes = dirty.get("routes", False)

    analysis.affected_scenes = list(dirty_scenes)
    analysis.affected_npcs = list(dirty_npcs)
    analysis.affected_challenges = list(dirty_challenges)
    analysis.routes_affected = dirty_routes

    # ── Determine agents to run (ordered) ───────────────────────
    # Build set of active triggers
    active_triggers = set()
    if dirty_npcs:
        active_triggers.add("dirty_npcs")
    if dirty_challenges:
        active_triggers.add("dirty_challenges")
    if EditScope.GLOBAL in scopes:
        # Global scope triggers everything
        active_triggers.update(
            {"dirty_npcs", "dirty_challenges", "dirty_new_scenes"}
        )

    # Check which agents are triggered
    for agent_name in AGENT_ORDER:
        required_triggers = AGENT_TRIGGERS.get(agent_name, set())
        if required_triggers & active_triggers:
            analysis.agents_to_run.append(agent_name)

    # ── Cross-domain dependencies ───────────────────────────────
    # If NPC was added/changed, check if any challenge depends on NPC role
    if dirty_npcs:
        _check_npc_challenge_deps(game_state, analysis)

    # If challenge was removed, check if any NPC dialogue references it
    if dirty_challenges:
        _check_challenge_dialogue_deps(game_state, analysis)

    # ── Determine validators to run ─────────────────────────────
    # Always run base validators
    analysis.validators_to_run.update(ALWAYS_VALIDATORS)

    # Add scope-specific validators
    for scope in scopes:
        scope_vals = SCOPE_VALIDATORS.get(scope, set())
        analysis.validators_to_run.update(scope_vals)

    # If any NPC is dirty, add NPC + dialogue validators
    if dirty_npcs:
        analysis.validators_to_run.update({"npc", "dialogue"})

    # If any challenge is dirty, add challenge + mechanic validators
    if dirty_challenges:
        analysis.validators_to_run.update({"challenge", "mechanic"})

    # If routes dirty, add route validator
    if dirty_routes:
        analysis.validators_to_run.add("route")

    logger.info(
        f"Impact analysis: agents={analysis.agents_to_run}, "
        f"validators={analysis.validators_to_run}, "
        f"scenes={analysis.affected_scenes}"
    )

    return analysis


def _check_npc_challenge_deps(
    game_state: GameState, analysis: ImpactAnalysis
):
    """Check if NPC changes affect challenges (e.g., quest_giver role)."""
    try:
        from app.core.npc_mechanic_mapping import MECHANIC_NPC_ROLES

        manifest = game_state.manifest or {}
        for scene in manifest.get("scenes", []):
            for ch in scene.get("challenges", []):
                if not isinstance(ch, dict):
                    continue
                mechanic = ch.get("mechanic_id", "")
                required_roles = MECHANIC_NPC_ROLES.get(mechanic, [])
                if required_roles:
                    # This challenge needs specific NPC roles — add to analysis
                    ch_id = ch.get("challenge_id", ch.get("id", ""))
                    if ch_id and ch_id not in analysis.affected_challenges:
                        analysis.affected_challenges.append(ch_id)
                        if "challenge_agent" not in analysis.agents_to_run:
                            # Insert before dialogue but after npc
                            idx = (
                                analysis.agents_to_run.index("dialogue_agent")
                                if "dialogue_agent" in analysis.agents_to_run
                                else len(analysis.agents_to_run)
                            )
                            analysis.agents_to_run.insert(idx, "challenge_agent")
    except ImportError:
        pass


def _check_challenge_dialogue_deps(
    game_state: GameState, analysis: ImpactAnalysis
):
    """Check if challenge changes affect NPC dialogue."""
    # If challenges changed, NPCs that give those challenges may need
    # dialogue updates
    manifest = game_state.manifest or {}
    npcs_dict = manifest.get("npcs", {})

    for npc_id, npc_data in npcs_dict.items():
        if not isinstance(npc_data, dict):
            continue
        # Check if NPC has dialogue referencing dirty challenges
        dialogue = npc_data.get("dialogue", {})
        for line in dialogue.get("lines", []):
            if isinstance(line, dict):
                refs = line.get("challenge_refs", [])
                for ref in refs:
                    if ref in game_state.dirty_challenges:
                        if npc_id not in analysis.affected_npcs:
                            analysis.affected_npcs.append(npc_id)
                        if "dialogue_agent" not in analysis.agents_to_run:
                            analysis.agents_to_run.append("dialogue_agent")


# ═══════════════════════════════════════════════════════════════════════════════
#  CONDITIONAL AGENT RUNNER
# ═══════════════════════════════════════════════════════════════════════════════


async def run_conditional_agents(
    game_state: GameState,
    analysis: ImpactAnalysis,
) -> AgentRunResult:
    """
    Run agents that are triggered by the impact analysis.
    Agents are scoped to affected scenes/entities only.
    """
    result = AgentRunResult()

    for agent_name in analysis.agents_to_run:
        try:
            logger.info(f"Running conditional agent: {agent_name}")

            if agent_name == "mechanic_mapping":
                await _run_mechanic_mapping(game_state, analysis)

            elif agent_name == "npc_agent":
                await _run_npc_agent(game_state, analysis)

            elif agent_name == "challenge_agent":
                await _run_challenge_agent(game_state, analysis)

            elif agent_name == "dialogue_agent":
                await _run_dialogue_agent(game_state, analysis)

            elif agent_name == "auto_balancer":
                _run_auto_balancer(game_state, analysis)

            elif agent_name == "scene_builder":
                await _run_scene_builder(game_state, analysis)

            result.agents_run.append(agent_name)

        except Exception as e:
            logger.error(f"Agent {agent_name} failed: {e}")
            result.warnings.append(f"{agent_name} failed: {e}")

    result.success = not result.errors
    return result


# ═══════════════════════════════════════════════════════════════════════════════
#  AGENT RUNNERS (SCOPED)
# ═══════════════════════════════════════════════════════════════════════════════


async def _run_mechanic_mapping(
    game_state: GameState, analysis: ImpactAnalysis
):
    """Run mechanic mapping for new/changed mechanics only."""
    from app.agents.mechanic_mapping_agent import MechanicMappingAgent
    from app.agents.base_agent import AgentConfig

    manifest = game_state.manifest or {}
    mechanics = set()

    # Collect mechanics from dirty challenges
    for scene in manifest.get("scenes", []):
        for ch in scene.get("challenges", []):
            if isinstance(ch, dict):
                ch_id = ch.get("challenge_id", ch.get("id", ""))
                if ch_id in analysis.affected_challenges:
                    mech = ch.get("mechanic_id")
                    if mech:
                        mechanics.add(mech)

    if mechanics:
        agent = MechanicMappingAgent(AgentConfig())
        assets = []
        for scene in manifest.get("scenes", []):
            for obj in scene.get("actors", []) + scene.get("objects", []):
                if isinstance(obj, dict):
                    assets.append(obj)

        result = agent.map_mechanics(
            mechanics=list(mechanics),
            assets=assets,
        )
        if result.success and result.mapping:
            game_state.mechanic_mapping = result.mapping


async def _run_npc_agent(
    game_state: GameState, analysis: ImpactAnalysis
):
    """Run NPC agent for new NPCs only — existing NPCs untouched."""
    # Only generate content for NPCs that were just added
    # (dirty_npcs set by merge). Existing NPCs keep their data.
    logger.info(
        f"NPC agent: processing {len(analysis.affected_npcs)} NPCs"
    )
    # Note: For add_npc, the NPC data is already in the patch.
    # This agent would enrich incomplete NPCs (e.g., generate dialogue).
    # Currently a no-op for simple edits; implement when needed.


async def _run_challenge_agent(
    game_state: GameState, analysis: ImpactAnalysis
):
    """Run challenge agent for new/changed challenges only."""
    logger.info(
        f"Challenge agent: processing {len(analysis.affected_challenges)} challenges"
    )
    # Similar to NPC agent — enrich incomplete challenges.
    # For simple edits (add_challenge with full data), this is a no-op.


async def _run_dialogue_agent(
    game_state: GameState, analysis: ImpactAnalysis
):
    """Run dialogue agent for affected NPCs only."""
    logger.info(
        f"Dialogue agent: processing {len(analysis.affected_npcs)} NPCs"
    )
    # Generate/update dialogue for NPCs that changed.
    # For simple property updates, this is a no-op.


def _run_auto_balancer(
    game_state: GameState, analysis: ImpactAnalysis
):
    """Run HEARTS auto-balancer on affected scenes only."""
    try:
        from app.pipeline.auto_balancer import AutoBalancer

        balancer = AutoBalancer()
        # Balancer works on PipelineState, but we can pass scoped data
        # For now, just log — full integration when PipelineState adapter exists
        logger.info(
            f"Auto-balancer: {len(analysis.affected_scenes)} scenes"
        )
    except Exception as e:
        logger.warning(f"Auto-balancer skipped: {e}")


async def _run_scene_builder(
    game_state: GameState, analysis: ImpactAnalysis
):
    """Run scene builder for new scenes only."""
    if analysis.new_scenes:
        logger.info(
            f"Scene builder: generating {len(analysis.new_scenes)} new scenes"
        )
        # Full scene generation for new scenes would go here.
        # This triggers the SceneAgent from the create pipeline,
        # scoped to new scenes only.
