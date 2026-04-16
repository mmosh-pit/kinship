"""
Multi-Agent Generation Pipeline — Pipeline Module

ARCHITECTURE:
• State is READ-ONLY for agents (no mutations)
• Each agent produces IMMUTABLE OUTPUT
• SceneMaterializer converts semantic → coordinates
• ManifestAssembler produces final manifest
• AutoBalancer adjusts difficulty
• Seed ensures DETERMINISTIC generation

Key classes:
- PipelineState: Shared state (mostly read-only)
- GenerationInput: Input configuration (immutable)
- SceneOutput, ChallengeOutput, etc.: Immutable stage outputs
- SceneMaterializer: Converts semantic to coordinates
- ManifestAssembler: Produces final manifest
- AutoBalancer: Adjusts difficulty
- GamePipeline: High-level interface
"""

from app.pipeline.pipeline_state import (
    # Stage enum
    PipelineStage,
    # Input (immutable)
    GenerationInput,
    # Immutable outputs
    PlannerOutput,
    SceneZone,
    SceneOutput,
    ChallengeOutput,
    NPCOutput,
    DialogueOutput,
    VerificationOutput,
    # State and logging
    AgentLogEntry,
    PipelineState,
    create_pipeline_state,
)

from app.pipeline.scene_materializer import (
    MaterializedScene,
    SceneMaterializer,
    materialize_scenes,
    position_hint_to_coordinates,
)

from app.pipeline.manifest_assembler import (
    ManifestAssembler,
    assemble_game_manifest,
    validate_manifest,
    manifest_to_json,
    manifest_to_file,
    manifest_from_file,
    MANIFEST_VERSION,
)

from app.pipeline.auto_balancer import (
    BalanceConfig,
    BalanceAdjustment,
    BalanceResult,
    AutoBalancer,
    auto_balance,
)

# NOTE: GamePipeline imported separately to avoid circular imports
# Use: from app.pipeline.game_pipeline import GamePipeline


__all__ = [
    # Stage
    "PipelineStage",
    # Input
    "GenerationInput",
    # Immutable outputs
    "PlannerOutput",
    "SceneZone",
    "SceneOutput",
    "ChallengeOutput",
    "NPCOutput",
    "DialogueOutput",
    "VerificationOutput",
    # State
    "AgentLogEntry",
    "PipelineState",
    "create_pipeline_state",
    # Materializer
    "MaterializedScene",
    "SceneMaterializer",
    "materialize_scenes",
    "position_hint_to_coordinates",
    # Assembler
    "ManifestAssembler",
    "assemble_game_manifest",
    "validate_manifest",
    "manifest_to_json",
    "manifest_to_file",
    "manifest_from_file",
    "MANIFEST_VERSION",
    # Balancer
    "BalanceConfig",
    "BalanceAdjustment",
    "BalanceResult",
    "AutoBalancer",
    "auto_balance",
]
