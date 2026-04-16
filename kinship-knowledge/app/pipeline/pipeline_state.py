"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    PIPELINE STATE                                             ║
║                                                                               ║
║  Shared state that flows through the multi-agent pipeline.                    ║
║                                                                               ║
║  ARCHITECTURE:                                                                ║
║  • State is READ-ONLY for agents (no mutations)                               ║
║  • Each agent produces IMMUTABLE OUTPUT                                       ║
║  • System MERGES outputs at the end                                           ║
║  • Seed ensures DETERMINISTIC generation                                      ║
║                                                                               ║
║  FLOW:                                                                        ║
║  Orchestrator creates state → Agents READ state + PRODUCE output              ║
║  → System MERGES all outputs → ManifestAssembler                              ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from dataclasses import dataclass, field
from typing import Any, Optional
from enum import Enum
from datetime import datetime
import json
import uuid
import random


# ═══════════════════════════════════════════════════════════════════════════════
#  PIPELINE STAGE
# ═══════════════════════════════════════════════════════════════════════════════


class PipelineStage(str, Enum):
    """Stages in the generation pipeline."""

    INIT = "init"
    PLANNING = "planning"
    SCENE_GENERATION = "scene_generation"
    CHALLENGE_GENERATION = "challenge_generation"
    NPC_GENERATION = "npc_generation"
    DIALOGUE_GENERATION = "dialogue_generation"
    VERIFICATION = "verification"
    ASSEMBLY = "assembly"
    COMPLETE = "complete"
    FAILED = "failed"


# ═══════════════════════════════════════════════════════════════════════════════
#  INPUT CONFIG (IMMUTABLE)
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass(frozen=True)
class GenerationInput:
    """Input configuration for game generation. IMMUTABLE."""

    # Required
    game_id: str = ""
    game_name: str = ""

    # Seed for determinism
    seed: int = 0

    # Assets (tuple for immutability)
    assets: tuple = field(default_factory=tuple)
    asset_ids: tuple = field(default_factory=tuple)

    # Goal
    goal_type: str = "escape"
    goal_description: str = ""

    # Audience
    audience_type: str = "children_9_12"
    difficulty_curve: str = "gentle"

    # Scene config
    num_scenes: int = 3
    scene_width: int = 16
    scene_height: int = 16

    # Zone type
    zone_type: str = "forest"

    # Options
    enable_tutorials: bool = True
    enable_landmarks: bool = True
    enable_clustering: bool = True

    # Theme
    theme_id: str = ""

    def to_dict(self) -> dict:
        return {
            "game_id": self.game_id,
            "game_name": self.game_name,
            "seed": self.seed,
            "asset_count": len(self.assets),
            "goal_type": self.goal_type,
            "goal_description": self.goal_description,
            "audience_type": self.audience_type,
            "num_scenes": self.num_scenes,
            "zone_type": self.zone_type,
        }


# ═══════════════════════════════════════════════════════════════════════════════
#  IMMUTABLE STAGE OUTPUTS
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass(frozen=True)
class PlannerOutput:
    """Output from planning stage. IMMUTABLE."""

    gameplay_loop: dict = field(default_factory=dict)
    mechanic_sequence: tuple = field(default_factory=tuple)
    required_npcs: tuple = field(default_factory=tuple)
    available_mechanics: tuple = field(default_factory=tuple)
    mechanic_scores: dict = field(default_factory=dict)
    difficulty_curve: dict = field(default_factory=dict)
    scene_difficulties: tuple = field(default_factory=tuple)


@dataclass(frozen=True)
class SceneZone:
    """Semantic zone definition. IMMUTABLE."""

    zone_id: str
    zone_type: str  # "spawn", "challenge", "exit", "landmark", "forest", etc.
    position_hint: str  # "south", "center", "north", "northwest", etc.
    size_hint: str = "medium"  # "small", "medium", "large"

    # These are filled by zone_system, NOT by agent
    x: int = -1
    y: int = -1
    width: int = -1
    height: int = -1


@dataclass(frozen=True)
class SceneOutput:
    """Output from scene agent. IMMUTABLE. Uses SEMANTIC positions only."""

    scene_index: int
    layout_pattern: str  # "hub", "linear", "arena", etc.

    # Semantic zones (NOT coordinates - zone_system fills those)
    zones: tuple = field(default_factory=tuple)  # tuple of SceneZone

    # Landmark hints (semantic, not coordinates)
    landmark_hints: tuple = field(default_factory=tuple)

    # Decoration config (not placements)
    decoration_density: float = 0.3
    enable_clustering: bool = True


@dataclass(frozen=True)
class ChallengeOutput:
    """Output from challenge agent. IMMUTABLE."""

    scene_index: int
    challenges: tuple = field(default_factory=tuple)  # tuple of dicts
    tutorials: tuple = field(default_factory=tuple)
    mechanics_used: tuple = field(default_factory=tuple)


@dataclass(frozen=True)
class NPCOutput:
    """Output from NPC agent. IMMUTABLE."""

    scene_index: int
    npcs: tuple = field(default_factory=tuple)  # tuple of dicts


@dataclass(frozen=True)
class DialogueOutput:
    """Output from dialogue agent. IMMUTABLE."""

    npc_id: str
    dialogue: dict = field(default_factory=dict)


@dataclass(frozen=True)
class VerificationOutput:
    """Output from verification agent. IMMUTABLE."""

    is_valid: bool = True
    errors: tuple = field(default_factory=tuple)
    warnings: tuple = field(default_factory=tuple)
    check_results: dict = field(default_factory=dict)


# ═══════════════════════════════════════════════════════════════════════════════
#  AGENT LOG ENTRY
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class AgentLogEntry:
    """Log entry for agent execution."""

    agent_name: str
    stage: PipelineStage
    status: str
    timestamp: datetime = field(default_factory=datetime.utcnow)
    duration_ms: int = 0
    message: str = ""
    data: dict = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "agent": self.agent_name,
            "stage": self.stage.value,
            "status": self.status,
            "timestamp": self.timestamp.isoformat(),
            "duration_ms": self.duration_ms,
            "message": self.message,
            "errors": self.errors,
        }


# ═══════════════════════════════════════════════════════════════════════════════
#  PIPELINE STATE
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class PipelineState:
    """
    Shared state that flows through the generation pipeline.

    IMPORTANT: Agents should NOT modify this state directly.
    Instead, they produce IMMUTABLE OUTPUT objects.
    The orchestrator collects outputs and the assembler merges them.
    """

    # ─── Identity ──────────────────────────────────────────────────────────────

    pipeline_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = field(default_factory=datetime.utcnow)

    # ─── SEED FOR DETERMINISM ──────────────────────────────────────────────────

    seed: int = 0

    # ─── Input (IMMUTABLE) ─────────────────────────────────────────────────────

    input: GenerationInput = field(default_factory=GenerationInput)

    # ─── Stage Tracking ────────────────────────────────────────────────────────

    current_stage: PipelineStage = PipelineStage.INIT
    completed_stages: list[PipelineStage] = field(default_factory=list)

    # ─── IMMUTABLE STAGE OUTPUTS ───────────────────────────────────────────────
    # Each agent produces output, stored here. NOT MODIFIED after creation.

    planner_output: Optional[PlannerOutput] = None
    scene_outputs: list[SceneOutput] = field(default_factory=list)
    challenge_outputs: list[ChallengeOutput] = field(default_factory=list)
    npc_outputs: list[NPCOutput] = field(default_factory=list)
    dialogue_outputs: list[DialogueOutput] = field(default_factory=list)
    verification_output: Optional[VerificationOutput] = None

    # ─── POPULATED DATA (filled by system, not agents) ─────────────────────────
    # These are computed by system modules AFTER agent outputs are collected

    populated_scenes: list[dict] = field(default_factory=list)

    # ─── Final Output ──────────────────────────────────────────────────────────

    manifest: dict = field(default_factory=dict)

    # ─── Metadata ──────────────────────────────────────────────────────────────

    log: list[AgentLogEntry] = field(default_factory=list)
    total_duration_ms: int = 0

    # ─── Helper Methods ────────────────────────────────────────────────────────

    def initialize_seed(self):
        """Initialize random seed for deterministic generation."""
        if self.seed == 0:
            self.seed = self.input.seed or random.randint(1, 999999999)
        random.seed(self.seed)

    def get_rng(self) -> random.Random:
        """Get a seeded random number generator."""
        return random.Random(self.seed)

    def advance_stage(self, new_stage: PipelineStage):
        """Move to a new pipeline stage."""
        if self.current_stage != PipelineStage.FAILED:
            self.completed_stages.append(self.current_stage)
            self.current_stage = new_stage

    def fail(self, reason: str):
        """Mark pipeline as failed."""
        self.current_stage = PipelineStage.FAILED
        self.add_log("system", "FAILED", reason)

    def is_valid(self) -> bool:
        """Check if pipeline is still valid."""
        if self.verification_output:
            return self.verification_output.is_valid
        return self.current_stage != PipelineStage.FAILED

    def add_log(
        self,
        agent_name: str,
        status: str,
        message: str = "",
        duration_ms: int = 0,
        data: dict = None,
        errors: list[str] = None,
    ):
        """Add a log entry."""
        entry = AgentLogEntry(
            agent_name=agent_name,
            stage=self.current_stage,
            status=status,
            message=message,
            duration_ms=duration_ms,
            data=data or {},
            errors=errors or [],
        )
        self.log.append(entry)

    def get_assets(self) -> list[dict]:
        """Get assets as list (from immutable tuple)."""
        return list(self.input.assets)

    def get_assets_by_type(self, asset_type: str) -> list[dict]:
        """Get assets filtered by type."""
        return [a for a in self.input.assets if a.get("type") == asset_type]

    def get_decoration_assets(self) -> list[str]:
        """Get decoration asset names."""
        decorations = []
        for asset in self.input.assets:
            if asset.get("type") in ["object", "decoration", "prop"]:
                name = asset.get("name", "")
                if name:
                    decorations.append(name)
        return decorations

    def get_npc_assets(self) -> list[dict]:
        """Get NPC/character assets."""
        return [a for a in self.input.assets if a.get("type") in ["character", "npc"]]

    # ─── Accessors for outputs ─────────────────────────────────────────────────

    def get_mechanic_sequence(self) -> list[str]:
        """Get mechanic sequence from planner output."""
        if self.planner_output:
            return list(self.planner_output.mechanic_sequence)
        return []

    def get_available_mechanics(self) -> list[str]:
        """Get available mechanics from planner output."""
        if self.planner_output:
            return list(self.planner_output.available_mechanics)
        return []

    def get_required_npcs(self) -> list[dict]:
        """Get required NPCs from planner output."""
        if self.planner_output:
            return list(self.planner_output.required_npcs)
        return []

    def get_scene_difficulties(self) -> list[dict]:
        """Get scene difficulties from planner output."""
        if self.planner_output:
            return list(self.planner_output.scene_difficulties)
        return []

    @property
    def scene_npcs(self) -> list[list[dict]]:
        """
        Get NPCs organized by scene index.
        Returns list of lists: scene_npcs[scene_idx] = [npc1, npc2, ...]
        """
        if not self.npc_outputs:
            return []
        # Build a dict of scene_idx -> list of NPCs
        by_scene: dict[int, list[dict]] = {}
        for npc_output in self.npc_outputs:
            scene_idx = npc_output.scene_index
            if scene_idx not in by_scene:
                by_scene[scene_idx] = []
            by_scene[scene_idx].extend(list(npc_output.npcs))

        # Convert to ordered list
        if not by_scene:
            return []
        max_scene = max(by_scene.keys())
        result = []
        for i in range(max_scene + 1):
            result.append(by_scene.get(i, []))
        return result

    @property
    def scene_challenges(self) -> list[list[dict]]:
        """
        Get challenges organized by scene index.
        Returns list of lists: scene_challenges[scene_idx] = [challenge1, challenge2, ...]
        """
        if not self.challenge_outputs:
            return []
        # Build a dict of scene_idx -> list of challenges
        by_scene: dict[int, list[dict]] = {}
        for challenge_output in self.challenge_outputs:
            scene_idx = challenge_output.scene_index
            if scene_idx not in by_scene:
                by_scene[scene_idx] = []
            by_scene[scene_idx].extend(list(challenge_output.challenges))

        # Convert to ordered list
        if not by_scene:
            return []
        max_scene = max(by_scene.keys())
        result = []
        for i in range(max_scene + 1):
            result.append(by_scene.get(i, []))
        return result

    def to_summary(self) -> dict:
        """Get a summary of the pipeline state."""
        return {
            "pipeline_id": self.pipeline_id,
            "seed": self.seed,
            "game_id": self.input.game_id,
            "stage": self.current_stage.value,
            "is_valid": self.is_valid(),
            "scenes_generated": len(self.scene_outputs),
            "challenges_generated": sum(
                len(c.challenges) for c in self.challenge_outputs
            ),
            "npcs_generated": sum(len(n.npcs) for n in self.npc_outputs),
            "dialogues_generated": len(self.dialogue_outputs),
            "errors": (
                len(self.verification_output.errors) if self.verification_output else 0
            ),
            "warnings": (
                len(self.verification_output.warnings)
                if self.verification_output
                else 0
            ),
            "duration_ms": self.total_duration_ms,
        }

    def to_dict(self) -> dict:
        """Convert full state to dict (for debugging/logging)."""
        return {
            "pipeline_id": self.pipeline_id,
            "seed": self.seed,
            "created_at": self.created_at.isoformat(),
            "current_stage": self.current_stage.value,
            "completed_stages": [s.value for s in self.completed_stages],
            "input": self.input.to_dict(),
            "scene_count": len(self.scene_outputs),
            "is_valid": self.is_valid(),
            "log_entries": len(self.log),
            "duration_ms": self.total_duration_ms,
        }


# ═══════════════════════════════════════════════════════════════════════════════
#  STATE FACTORY
# ═══════════════════════════════════════════════════════════════════════════════


def create_pipeline_state(
    game_id: str,
    game_name: str,
    assets: list[dict],
    goal_type: str = "escape",
    goal_description: str = "",
    audience_type: str = "children_9_12",
    num_scenes: int = 3,
    zone_type: str = "forest",
    seed: int = None,
    **kwargs,
) -> PipelineState:
    """
    Factory function to create a new pipeline state.

    Args:
        game_id: Unique game identifier
        game_name: Display name for the game
        assets: List of asset dicts from kinship-assets
        goal_type: GoalType enum value
        goal_description: Optional custom goal description
        audience_type: AudienceType enum value
        num_scenes: Number of scenes to generate
        zone_type: Zone type (forest, village, etc.)
        seed: Random seed for determinism (auto-generated if None)
        **kwargs: Additional GenerationInput fields

    Returns:
        Initialized PipelineState
    """
    # Generate seed if not provided
    if seed is None:
        seed = random.randint(1, 999999999)

    # Convert assets to immutable tuple
    assets_tuple = tuple(assets)
    asset_ids = tuple(a.get("id", "") for a in assets if a.get("id"))

    input_config = GenerationInput(
        game_id=game_id,
        game_name=game_name,
        seed=seed,
        assets=assets_tuple,
        asset_ids=asset_ids,
        goal_type=goal_type,
        goal_description=goal_description,
        audience_type=audience_type,
        num_scenes=num_scenes,
        zone_type=zone_type,
        **{
            k: v for k, v in kwargs.items() if k in GenerationInput.__dataclass_fields__
        },
    )

    state = PipelineState(input=input_config, seed=seed)
    state.initialize_seed()

    return state
