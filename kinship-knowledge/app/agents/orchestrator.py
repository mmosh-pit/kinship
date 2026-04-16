"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    ORCHESTRATOR (FULL ARCHITECTURE)                           ║
║                                                                               ║
║  Complete multi-agent pipeline with AI interpretation and validators.        ║
║                                                                               ║
║  PIPELINE FLOW (28 Stages):                                                   ║
║                                                                               ║
║  ┌─ PRE-PIPELINE (handled by API layer) ────────────────────────────────────┐ ║
║  │  Stage 0:  Clarification Agent (asks questions if prompt is ambiguous)  │ ║
║  └──────────────────────────────────────────────────────────────────────────┘ ║
║                                                                               ║
║  ┌─ INTERPRETATION ─────────────────────────────────────────────────────────┐ ║
║  │  Stage 1:  Prompt Validation                                             │ ║
║  │  Stage 2:  Prompt Interpretation (LLM-based)                            │ ║
║  └──────────────────────────────────────────────────────────────────────────┘ ║
║                                                                               ║
║  ┌─ KNOWLEDGE RETRIEVAL ────────────────────────────────────────────────────┐ ║
║  │  Stage 3:  Knowledge Retrieval (Pinecone → asset_embeddings.py)         │ ║
║  │  Stage 4:  Retrieval Validation                                          │ ║
║  └──────────────────────────────────────────────────────────────────────────┘ ║
║                                                                               ║
║  ┌─ PLANNING ───────────────────────────────────────────────────────────────┐ ║
║  │  Stage 5:  Planner Agent (AI-driven scene/mechanic planning)            │ ║
║  │  Stage 6:  Plan Validation                                               │ ║
║  │  Stage 7:  Gameplay Loop Planning (start → progression → goal)          │ ║
║  │  Stage 8:  Loop Validation                                               │ ║
║  └──────────────────────────────────────────────────────────────────────────┘ ║
║                                                                               ║
║  ┌─ STATE SETUP ────────────────────────────────────────────────────────────┐ ║
║  │  Stage 9:  GameState Creation                                            │ ║
║  │  Stage 10: State Validation                                              │ ║
║  └──────────────────────────────────────────────────────────────────────────┘ ║
║                                                                               ║
║  ┌─ MECHANIC SETUP ─────────────────────────────────────────────────────────┐ ║
║  │  Stage 11: Mechanic Mapping Agent (map mechanics to Flame)              │ ║
║  │  Stage 12: Affordance Enrichment (derive pickable/climbable/etc)        │ ║
║  │  Stage 13: Pipeline State Creation                                       │ ║
║  │  Stage 14: Mechanic Validation                                           │ ║
║  └──────────────────────────────────────────────────────────────────────────┘ ║
║                                                                               ║
║  ┌─ CONTENT GENERATION ─────────────────────────────────────────────────────┐ ║
║  │  Stage 15: Scene Agent (scene_agent.py)                                 │ ║
║  │  Stage 16: Challenge Agent (challenge_agent.py)                         │ ║
║  │  Stage 17: NPC Agent (npc_agent.py)                                     │ ║
║  │  Stage 18: Auto-Balancer (HEARTS difficulty/reward scaling)             │ ║
║  │  Stage 19: Dialogue Agent (dialogue_agent.py)                           │ ║
║  │  Stage 20: Verification Agent                                            │ ║
║  └──────────────────────────────────────────────────────────────────────────┘ ║
║                                                                               ║
║  ┌─ MATERIALIZATION ────────────────────────────────────────────────────────┐ ║
║  │  Stage 21: Global Validation (inter-step consistency)                   │ ║
║  │  Stage 22: Scene Materialization (GameState → Flame scene graph)        │ ║
║  │  Stage 23: Engine Validation (assets, tilemaps, physics)                │ ║
║  │  Stage 24: Route Building (entry/exit points, paths)                    │ ║
║  └──────────────────────────────────────────────────────────────────────────┘ ║
║                                                                               ║
║  ┌─ OUTPUT ─────────────────────────────────────────────────────────────────┐ ║
║  │  Stage 25: Manifest Assembly                                             │ ║
║  │  Stage 26: Manifest Validation                                           │ ║
║  │  Stage 27: Full Validation Pipeline + Auto-Repair                        │ ║
║  └──────────────────────────────────────────────────────────────────────────┘ ║
║                                                                               ║
║  KEY FILES:                                                                   ║
║  • clarification_agent.py  - Conversational clarification                    ║
║  • asset_embeddings.py     - Pinecone retrieval                              ║
║  • affordance_deriver.py   - Asset capability enrichment                     ║
║  • gameplay_loop_planner.py - Loop structure planning                        ║
║  • auto_balancer.py        - HEARTS difficulty balancing                     ║
║  • scene_materializer.py   - Physical layout generation                      ║
║  • route_builder.py        - Path/connection building                        ║
║  • auto_repair.py          - Automatic issue fixing                          ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from typing import Optional, Callable, List, Dict, Any
import logging
import time
import asyncio
from dataclasses import dataclass, field

# Base agent
from app.agents.base_agent import BaseAgent, AgentConfig, AgentResult, AgentStatus

# Pipeline state
from app.pipeline.pipeline_state import (
    PipelineState,
    PipelineStage,
    GenerationInput,
    PlannerOutput,
    create_pipeline_state,
)

# New agents
from app.agents.prompt_interpreter import (
    PromptInterpreter,
    GameConcept,
    InterpretationResult,
    interpret_prompt,
)
from app.agents.planner_agent import (
    PlannerAgent,
    PlannerValidator,
    GamePlan,
    PlannerResult,
    plan_game,
)

# EditorAgent imported lazily in edit() method to avoid circular import
from app.agents.mechanic_mapping_agent import (
    MechanicMappingAgent,
    MappingResult,
    map_mechanics,
)

# Existing agents
from app.agents.scene_agent import SceneAgent
from app.agents.challenge_agent import ChallengeAgent
from app.agents.npc_agent import NPCAgent
from app.agents.dialogue_agent import DialogueAgent
from app.agents.verification_agent import VerificationAgent

# State management
from app.state.game_state import (
    GameState,
    GameStateManager,
    StateStatus,
    get_state_manager,
)

# Pipeline components
from app.pipeline.scene_materializer import SceneMaterializer
from app.pipeline.manifest_assembler import ManifestAssembler
from app.pipeline.auto_balancer import AutoBalancer, auto_balance
from app.core.gameplay_loop_planner import GoalType, plan_from_goal

# Validators
from app.validators.prompt_validator import PromptValidator, validate_prompt
from app.validators.retrieval_validator import RetrievalValidator, validate_retrieval
from app.validators.plan_validator import (
    PlanValidator,
    validate_plan,
    validate_and_repair_plan,
)
from app.validators.loop_validator import GameplayLoopValidator, validate_gameplay_loop
from app.validators.state_validator import StateValidator, validate_game_state
from app.validators.mechanic_validator import MechanicValidator, validate_mechanics
from app.validators.npc_validator import NPCValidator as NPCValidatorNew, validate_npcs
from app.validators.dialogue_validator import (
    DialogueValidator as DialogueValidatorNew,
    validate_dialogues,
)
from app.validators.engine_validator import (
    EngineValidator,
    validate_engine_compatibility,
)
from app.validators.manifest_validator import ManifestValidator, validate_manifest
from app.validators.inter_step_validator import InterStepValidator
from app.validators.validation_pipeline import ValidationPipeline

# Services
from app.services.mechanic_matcher import build_affordance_map
from app.services.affordance_deriver import (
    ensure_affordances,
    check_affordance_coverage,
)
from app.services.asset_embeddings import (
    retrieve_relevant_assets,
    retrieve_design_knowledge,
)


logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  ORCHESTRATOR CONFIG
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class OrchestratorConfig:
    """Configuration for the orchestrator."""

    default_agent_config: AgentConfig = field(default_factory=AgentConfig)

    # Skip options
    skip_dialogue: bool = False
    skip_verification: bool = False
    skip_auto_balance: bool = False
    stop_on_first_error: bool = False
    include_debug: bool = False

    # AI options
    use_ai_interpretation: bool = True
    use_ai_planning: bool = True

    # Timeouts
    total_timeout_seconds: float = 300.0

    # Logging
    log_level: str = "INFO"
    log_agent_results: bool = True

    # Callbacks
    on_stage_complete: Optional[Callable] = None
    on_agent_complete: Optional[Callable] = None


# ═══════════════════════════════════════════════════════════════════════════════
#  ORCHESTRATOR RESULT
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class OrchestratorResult:
    """Result of orchestrator execution."""

    success: bool = False

    manifest: dict = field(default_factory=dict)
    state: Optional[PipelineState] = None
    game_state: Optional[GameState] = None

    # AI outputs
    concept: Optional[GameConcept] = None
    plan: Optional[GamePlan] = None

    # Timing
    total_duration_ms: int = 0
    stage_durations: Dict[str, int] = field(default_factory=dict)

    agent_results: list[AgentResult] = field(default_factory=list)

    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    # Validation
    validation_passed: bool = False
    validation_errors: int = 0
    validation_warnings: int = 0

    def to_dict(self) -> dict:
        return {
            "success": self.success,
            "duration_ms": self.total_duration_ms,
            "agents_run": len(self.agent_results),
            "agents_succeeded": sum(1 for r in self.agent_results if r.is_success()),
            "errors": self.errors,
            "warnings": self.warnings,
            "validation_passed": self.validation_passed,
        }


# ═══════════════════════════════════════════════════════════════════════════════
#  ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════════════════════


class Orchestrator:
    """
    Main coordinator for the multi-agent generation pipeline.

    Implements the full proposed architecture with:
    - AI Prompt Interpretation
    - Pinecone Knowledge Retrieval
    - AI Planning
    - GameState Management
    - Per-stage Validation with Repair
    - Vibe Coding Support
    """

    def __init__(self, config: OrchestratorConfig = None):
        self.config = config or OrchestratorConfig()
        self._logger = logging.getLogger("orchestrator")

        agent_config = self.config.default_agent_config

        # New AI agents
        self.prompt_interpreter = PromptInterpreter()
        self.planner_agent = PlannerAgent()
        self.planner_validator = PlannerValidator()
        self.mechanic_mapping_agent = MechanicMappingAgent(agent_config)

        # Existing agents
        self.agents = {
            "scene": SceneAgent(agent_config),
            "challenge": ChallengeAgent(agent_config),
            "npc": NPCAgent(agent_config),
            "dialogue": DialogueAgent(agent_config),
            "verification": VerificationAgent(agent_config),
        }

        self.auto_balancer = AutoBalancer()
        self.manifest_assembler = ManifestAssembler(
            include_debug=self.config.include_debug
        )

        # State manager
        self.state_manager = get_state_manager()

    # ═══════════════════════════════════════════════════════════════════════
    #  MAIN ENTRY POINT
    # ═══════════════════════════════════════════════════════════════════════

    async def run(
        self,
        prompt: str = "",
        game_id: str = "",
        game_name: str = "",
        assets: list = None,
        platform_id: str = None,
        goal_type: str = "explore",
        goal_description: str = "",
        audience_type: str = "children_9_12",
        num_scenes: int = 3,
        zone_type: str = "forest",
        scene_width: int = 16,
        scene_height: int = 16,
        seed: int = None,
        enable_tutorials: bool = True,
        enable_landmarks: bool = True,
        difficulty_curve: list = None,
        **kwargs,
    ) -> OrchestratorResult:
        """
        Run the full generation pipeline.

        Args:
            prompt: Natural language game description (NEW)
            game_id: Unique game identifier
            game_name: Display name
            assets: Available assets
            platform_id: Platform ID for asset fetching
            goal_type: Goal type (if no prompt)
            goal_description: Goal description (if no prompt)
            audience_type: Target audience
            num_scenes: Number of scenes
            zone_type: Default zone type
            scene_width: Scene grid width
            scene_height: Scene grid height
            seed: Random seed
            enable_tutorials: Enable tutorial challenges
            enable_landmarks: Enable landmark placement
            difficulty_curve: Custom difficulty curve
            **kwargs: Additional options

        Returns:
            OrchestratorResult
        """
        result = OrchestratorResult()
        start_time = time.time()
        assets = assets or []
        game_state = None  # Initialize before try block

        import uuid as _uuid

        if not game_id:
            game_id = str(_uuid.uuid4())

        try:
            self._logger.info(f"═══ Pipeline Start ═══")
            self._logger.info(
                f"  Prompt: {prompt[:80]}..." if prompt else f"  Goal: {goal_type}"
            )

            # ─── Stage 1: Prompt Validation ─────────────────────────────
            stage_start = time.time()

            if prompt and self.config.use_ai_interpretation:
                prompt_result = validate_prompt(prompt)

                if not prompt_result.valid:
                    result.errors.extend(prompt_result.errors)
                    result.warnings.extend(prompt_result.warnings)
                    if self.config.stop_on_first_error:
                        return result
                else:
                    result.warnings.extend(prompt_result.warnings)
                    prompt = prompt_result.cleaned_prompt

            result.stage_durations["prompt_validation"] = int(
                (time.time() - stage_start) * 1000
            )
            self._log_stage(
                "Prompt Validation", result.stage_durations["prompt_validation"]
            )

            # ─── Stage 2: Prompt Interpretation ─────────────────────────
            stage_start = time.time()
            concept = None

            if prompt and self.config.use_ai_interpretation:
                interpretation = await self.prompt_interpreter.interpret(
                    prompt=prompt,
                    num_scenes=num_scenes,
                    existing_assets=assets,
                )

                if interpretation.success and interpretation.concept:
                    concept = interpretation.concept
                    result.concept = concept
                    result.warnings.extend(interpretation.warnings)

                    # Extract values from concept
                    goal_type = (
                        concept.goal_type.value
                        if hasattr(concept.goal_type, "value")
                        else str(concept.goal_type)
                    )
                    goal_description = concept.goal_description
                    game_name = game_name or concept.title
                    zone_type = (
                        concept.locations[0].zone_type
                        if concept.locations
                        else zone_type
                    )
                else:
                    result.warnings.append("AI interpretation failed, using defaults")
                    result.warnings.extend(interpretation.errors)

            result.stage_durations["interpretation"] = int(
                (time.time() - stage_start) * 1000
            )
            self._log_stage("Interpretation", result.stage_durations["interpretation"])

            # ─── Stage 3: Knowledge Retrieval ───────────────────────────
            stage_start = time.time()

            # FIX: Use assets from interpreter if available (avoids double Pinecone call)
            if not assets and concept and concept.relevant_assets:
                assets = concept.relevant_assets
                self._logger.info(
                    f"  Using {len(assets)} assets from interpreter (skip Pinecone)"
                )
            elif prompt and not assets:
                try:
                    retrieved_assets = await retrieve_relevant_assets(
                        context=prompt,
                        top_k=30,
                        platform_id=platform_id,
                    )
                    if retrieved_assets:
                        assets = retrieved_assets
                        self._logger.info(
                            f"  Retrieved {len(assets)} assets from Pinecone"
                        )
                except Exception as e:
                    result.warnings.append(f"Asset retrieval failed: {e}")

            result.stage_durations["retrieval"] = int(
                (time.time() - stage_start) * 1000
            )
            self._log_stage("Knowledge Retrieval", result.stage_durations["retrieval"])

            # ─── Stage 4: Retrieval Validation ──────────────────────────
            stage_start = time.time()

            mechanics = concept.suggested_mechanics if concept else []
            retrieval_result = validate_retrieval(assets, mechanics)
            result.warnings.extend(retrieval_result.warnings)

            # Use validated assets
            assets = (
                retrieval_result.valid_assets
                if retrieval_result.valid_assets
                else assets
            )
            mechanics = (
                retrieval_result.valid_mechanics
                if retrieval_result.valid_mechanics
                else ["collect_items"]
            )

            result.stage_durations["retrieval_validation"] = int(
                (time.time() - stage_start) * 1000
            )
            self._log_stage(
                "Retrieval Validation", result.stage_durations["retrieval_validation"]
            )

            # ─── Stage 5: Planning ──────────────────────────────────────
            stage_start = time.time()
            plan = None

            if concept and self.config.use_ai_planning:
                planner_result = await self.planner_agent.plan(
                    concept=concept,
                    available_assets=assets,
                )

                if planner_result.success and planner_result.plan:
                    plan = planner_result.plan
                    result.plan = plan
                    result.warnings.extend(planner_result.warnings)
                else:
                    result.warnings.append("AI planning failed, using template")
                    result.warnings.extend(planner_result.errors)

            result.stage_durations["planning"] = int((time.time() - stage_start) * 1000)
            self._log_stage("Planning", result.stage_durations["planning"])

            # ─── Stage 6: Plan Validation ───────────────────────────────
            stage_start = time.time()

            if plan:
                plan_result, plan = validate_and_repair_plan(
                    plan.to_dict() if hasattr(plan, "to_dict") else plan
                )
                result.warnings.extend(plan_result.warnings)
                result.errors.extend(plan_result.errors)

            result.stage_durations["plan_validation"] = int(
                (time.time() - stage_start) * 1000
            )
            self._log_stage(
                "Plan Validation", result.stage_durations["plan_validation"]
            )

            # ─── Stage 7: Gameplay Loop Planning ────────────────────────
            # FIX: If AI planner (Stage 5) succeeded, extract loop from the plan.
            # Only use template planner as fallback when AI planning failed.
            stage_start = time.time()

            try:
                goal_enum = (
                    GoalType(goal_type) if isinstance(goal_type, str) else goal_type
                )
            except ValueError:
                goal_enum = GoalType.EXPLORE

            gameplay_loop = None

            # Try to extract loop from AI plan first
            if plan and hasattr(plan, "scenes") and plan.scenes:
                try:
                    plan_steps = []
                    plan_mechanics = []
                    for si, scene in enumerate(plan.scenes):
                        scene_mechs = (
                            scene.mechanics if hasattr(scene, "mechanics") else []
                        )
                        plan_mechanics.extend(scene_mechs)

                        for mi, mech in enumerate(scene_mechs):
                            step_type = (
                                "entry"
                                if si == 0 and mi == 0
                                else (
                                    "goal"
                                    if si == len(plan.scenes) - 1
                                    and mi == len(scene_mechs) - 1
                                    else "challenge"
                                )
                            )
                            plan_steps.append(
                                {
                                    "step_id": f"plan_step_{si}_{mi}",
                                    "description": f"{mech} in {scene.scene_name if hasattr(scene, 'scene_name') else f'scene {si}'}",
                                    "type": step_type,
                                    "mechanic": mech,
                                    "mechanic_options": [mech],
                                    "assigned_mechanic": mech,
                                    "requires_npc": False,
                                    "npc_role": None,
                                    "required": True,
                                    "narrative_beat": (
                                        "introduction"
                                        if si == 0
                                        else (
                                            "resolution"
                                            if si == len(plan.scenes) - 1
                                            else "rising_action"
                                        )
                                    ),
                                }
                            )

                    if plan_steps:
                        gameplay_loop = {
                            "loop_id": "plan_loop",
                            "goal_type": (
                                goal_enum.value
                                if hasattr(goal_enum, "value")
                                else str(goal_enum)
                            ),
                            "goal_description": (
                                goal_description or concept.goal_description
                                if concept
                                else "Complete the adventure"
                            ),
                            "steps": plan_steps,
                            "mechanics": list(set(plan_mechanics)),
                            "required_npcs": [],
                            "is_valid": True,
                            "story_hook": concept.story_hook if concept else "",
                            "resolution": concept.resolution if concept else "",
                        }
                        # Also update mechanics to match plan
                        mechanics = list(set(plan_mechanics)) or mechanics
                        self._logger.info(
                            f"  Loop extracted from AI plan: {len(plan_steps)} steps"
                        )
                except Exception as e:
                    self._logger.warning(f"  Failed to extract loop from plan: {e}")

            # Fallback: use template planner
            if not gameplay_loop:
                planned_loop = plan_from_goal(
                    goal_type=goal_enum,
                    available_mechanics=mechanics,
                )

                if planned_loop and hasattr(planned_loop, "loop") and planned_loop.loop:
                    steps_data = []
                    for i, step in enumerate(planned_loop.loop.steps):
                        step_mechanic = step.assigned_mechanic
                        if not step_mechanic and step.mechanic_options:
                            step_mechanic = step.mechanic_options[0]

                        step_type = "challenge"
                        if step.narrative_beat == "introduction":
                            step_type = "entry" if i == 0 else "challenge"
                        elif step.narrative_beat == "resolution":
                            step_type = "goal"

                        steps_data.append(
                            {
                                "step_id": step.step_id,
                                "description": step.description,
                                "type": step_type,
                                "mechanic": step_mechanic,
                                "mechanic_options": step.mechanic_options,
                                "assigned_mechanic": step.assigned_mechanic,
                                "requires_npc": step.requires_npc,
                                "npc_role": step.npc_role,
                                "required": step.required,
                                "narrative_beat": step.narrative_beat,
                            }
                        )
                    gameplay_loop = {
                        "loop_id": planned_loop.loop.loop_id,
                        "goal_type": (
                            planned_loop.loop.goal_type.value
                            if hasattr(planned_loop.loop.goal_type, "value")
                            else str(planned_loop.loop.goal_type)
                        ),
                        "goal_description": planned_loop.loop.goal_description,
                        "steps": steps_data,
                        "mechanics": planned_loop.mechanics,
                        "required_npcs": planned_loop.required_npcs,
                        "is_valid": planned_loop.is_valid,
                        "story_hook": planned_loop.loop.story_hook,
                        "resolution": planned_loop.loop.resolution,
                    }
                else:
                    gameplay_loop = {
                        "loop_id": "default_loop",
                        "goal_type": (
                            goal_enum.value
                            if hasattr(goal_enum, "value")
                            else str(goal_enum)
                        ),
                        "goal_description": goal_description
                        or "Complete the adventure",
                        "steps": [],
                        "mechanics": mechanics,
                        "required_npcs": [],
                        "is_valid": True,
                    }

            result.stage_durations["loop_planning"] = int(
                (time.time() - stage_start) * 1000
            )
            self._log_stage("Loop Planning", result.stage_durations["loop_planning"])

            # ─── Stage 8: Loop Validation ───────────────────────────────
            stage_start = time.time()

            # Ensure gameplay_loop is a dict before validation
            if gameplay_loop is None:
                gameplay_loop = {
                    "loop_id": "fallback_loop",
                    "goal_type": goal_type,
                    "goal_description": goal_description or "Complete the adventure",
                    "steps": [],
                    "mechanics": mechanics,
                }

            loop_result = validate_gameplay_loop(
                loop=gameplay_loop,
                steps=(
                    gameplay_loop.get("steps", [])
                    if isinstance(gameplay_loop, dict)
                    else []
                ),
            )
            result.warnings.extend(loop_result.warnings)

            result.stage_durations["loop_validation"] = int(
                (time.time() - stage_start) * 1000
            )
            self._log_stage(
                "Loop Validation", result.stage_durations["loop_validation"]
            )

            # ─── Stage 9: GameState Creation ────────────────────────────
            stage_start = time.time()

            game_state = self.state_manager.get_or_create(
                game_id=game_id,
                prompt=prompt,
                platform_id=platform_id,
                seed=seed,
            )
            game_state.status = StateStatus.GENERATING
            game_state.concept = concept
            game_state.plan = plan
            result.game_state = game_state

            result.stage_durations["state_creation"] = int(
                (time.time() - stage_start) * 1000
            )
            self._log_stage("State Creation", result.stage_durations["state_creation"])

            # ─── Stage 10: State Validation ─────────────────────────────
            stage_start = time.time()

            state_result = validate_game_state(
                game_state.to_dict() if hasattr(game_state, "to_dict") else {}
            )
            result.warnings.extend(state_result.warnings)

            result.stage_durations["state_validation"] = int(
                (time.time() - stage_start) * 1000
            )
            self._log_stage(
                "State Validation", result.stage_durations["state_validation"]
            )

            # ─── Stage 11: Mechanic Mapping Agent ─────────────────────────
            stage_start = time.time()

            # Build scene → mechanics mapping from plan
            scene_mechanics = {}
            if plan and hasattr(plan, "scenes"):
                for scene in plan.scenes:
                    scene_name = (
                        scene.scene_name if hasattr(scene, "scene_name") else "default"
                    )
                    scene_mechs = scene.mechanics if hasattr(scene, "mechanics") else []
                    scene_mechanics[scene_name] = list(scene_mechs)

            mapping_result = self.mechanic_mapping_agent.map_mechanics(
                mechanics=mechanics,
                assets=assets,
                scene_mechanics=scene_mechanics if scene_mechanics else None,
            )

            if mapping_result.success and mapping_result.mapping:
                game_state.mechanic_mapping = mapping_result.mapping
                result.warnings.extend(mapping_result.warnings)
                self._logger.info(
                    f"  Mechanic mapping: {mapping_result.mapping.fully_supported}/"
                    f"{mapping_result.mapping.total_mechanics} fully supported"
                )
            else:
                result.warnings.append("Mechanic mapping incomplete")
                result.warnings.extend(mapping_result.errors)

            result.stage_durations["mechanic_mapping"] = int(
                (time.time() - stage_start) * 1000
            )
            self._log_stage(
                "Mechanic Mapping", result.stage_durations["mechanic_mapping"]
            )

            # ─── Stage 12: Ensure Affordances ───────────────────────────
            stage_start = time.time()

            ensure_affordances(assets)
            # check_affordance_coverage takes only one argument (assets)
            coverage = check_affordance_coverage(assets)

            if coverage and coverage.get("missing"):
                result.warnings.append(
                    f"Missing affordances for: {coverage['missing'][:5]}"  # Limit to 5
                )

            result.stage_durations["affordances"] = int(
                (time.time() - stage_start) * 1000
            )
            self._log_stage("Affordances", result.stage_durations["affordances"])

            # ─── Stage 13: Create Pipeline State ────────────────────────
            stage_start = time.time()

            # Build mechanic sequence from plan or gameplay loop
            mechanic_sequence = mechanics
            if plan and hasattr(plan, "scenes"):
                mechanic_sequence = []
                for scene in plan.scenes:
                    mechanic_sequence.extend(
                        scene.mechanics if hasattr(scene, "mechanics") else []
                    )

            pipeline_state = create_pipeline_state(
                game_id=game_id,
                game_name=game_name or "Generated Game",
                assets=assets,
                goal_type=goal_type,
                goal_description=goal_description or prompt,
                audience_type=audience_type,
                num_scenes=num_scenes,
                zone_type=zone_type,
                scene_width=scene_width,
                scene_height=scene_height,
                seed=seed,
                enable_tutorials=enable_tutorials,
                enable_landmarks=enable_landmarks,
                difficulty_curve=difficulty_curve,
            )

            # Set planner output
            characters_list = []
            if concept and hasattr(concept, "characters") and concept.characters:
                characters_list = [
                    {"role": c.role, "name": c.name}
                    for c in concept.characters
                    if c and hasattr(c, "role") and hasattr(c, "name")
                ]

            pipeline_state.planner_output = PlannerOutput(
                gameplay_loop=gameplay_loop,
                mechanic_sequence=tuple(mechanic_sequence),
                required_npcs=tuple(characters_list),
                available_mechanics=tuple(set(mechanic_sequence)),
            )

            result.state = pipeline_state

            result.stage_durations["pipeline_state"] = int(
                (time.time() - stage_start) * 1000
            )
            self._log_stage("Pipeline State", result.stage_durations["pipeline_state"])

            # ─── Stage 14: Mechanic Validation ──────────────────────────
            stage_start = time.time()

            # Build affordances set from assets, with defensive checks
            affordances = set()
            for a in assets or []:
                if isinstance(a, dict):
                    aff = a.get("affordances", [])
                    if isinstance(aff, (list, tuple)):
                        affordances.add(tuple(aff))  # Convert to hashable tuple

            flat_affordances = set()
            for aff_tuple in affordances:
                flat_affordances.update(aff_tuple)

            mech_result = validate_mechanics(
                mechanics=mechanic_sequence,
                available_affordances=flat_affordances,
            )
            result.warnings.extend(mech_result.warnings)

            result.stage_durations["mechanic_validation"] = int(
                (time.time() - stage_start) * 1000
            )
            self._log_stage(
                "Mechanic Validation", result.stage_durations["mechanic_validation"]
            )

            # ─── Stage 15-18: Run Agents ────────────────────────────────
            agent_success = await self._run_agent_pipeline(pipeline_state, result)

            if not agent_success and self.config.stop_on_first_error:
                return result

            # ─── Stage 19: Global Validation ────────────────────────────
            stage_start = time.time()

            inter_validator = InterStepValidator(pipeline_state)
            # Use validate_after_dialogue as final validation before materialization
            # (validate_final_state doesn't exist - it was a planned method)
            is_valid, errors, warnings = inter_validator.validate_after_dialogue()
            result.warnings.extend(warnings)
            result.errors.extend(errors)

            result.stage_durations["global_validation"] = int(
                (time.time() - stage_start) * 1000
            )
            self._log_stage(
                "Global Validation", result.stage_durations["global_validation"]
            )

            # ─── Stage 20: Scene Materialization ────────────────────────
            stage_start = time.time()

            materializer = SceneMaterializer(seed=pipeline_state.seed)
            materialized_scenes = materializer.materialize_all(pipeline_state)

            result.stage_durations["materialization"] = int(
                (time.time() - stage_start) * 1000
            )
            self._log_stage(
                "Materialization", result.stage_durations["materialization"]
            )

            # ─── Stage 21: Engine Validation ────────────────────────────
            stage_start = time.time()

            # Convert MaterializedScene objects to dicts for validator
            scenes_as_dicts = []
            for ms in materialized_scenes:
                if hasattr(ms, "to_manifest"):
                    scenes_as_dicts.append(ms.to_manifest())
                elif isinstance(ms, dict):
                    scenes_as_dicts.append(ms)
                else:
                    # Fallback: try to get attributes directly
                    scenes_as_dicts.append(
                        {
                            "scene_name": f"scene_{getattr(ms, 'scene_index', 0)}",
                            "scene_index": getattr(ms, "scene_index", 0),
                            "actors": getattr(ms, "objects", []),
                            "spawn": {
                                "x": getattr(ms, "spawn_x", 0),
                                "y": getattr(ms, "spawn_y", 0),
                            },
                        }
                    )

            engine_result = validate_engine_compatibility(scenes_as_dicts)
            result.warnings.extend(engine_result.warnings)
            result.errors.extend(engine_result.errors)

            result.stage_durations["engine_validation"] = int(
                (time.time() - stage_start) * 1000
            )
            self._log_stage(
                "Engine Validation", result.stage_durations["engine_validation"]
            )

            # ─── Stage 22: Route Building ───────────────────────────────
            stage_start = time.time()

            from app.pipeline.route_builder import build_routes

            routes = build_routes(pipeline_state, materialized_scenes)

            result.stage_durations["routes"] = int((time.time() - stage_start) * 1000)
            self._log_stage("Routes", result.stage_durations["routes"])

            # ─── Stage 23: Manifest Assembly ────────────────────────────
            stage_start = time.time()

            manifest = self.manifest_assembler.assemble(
                pipeline_state, materialized_scenes
            )
            manifest["routes"] = routes

            result.stage_durations["assembly"] = int((time.time() - stage_start) * 1000)
            self._log_stage("Assembly", result.stage_durations["assembly"])

            # ─── Stage 24: Manifest Validation ──────────────────────────
            stage_start = time.time()

            manifest_result = validate_manifest(manifest)
            result.warnings.extend(manifest_result.warnings)
            result.errors.extend(manifest_result.errors)

            result.stage_durations["manifest_validation"] = int(
                (time.time() - stage_start) * 1000
            )
            self._log_stage(
                "Manifest Validation", result.stage_durations["manifest_validation"]
            )

            # ─── Stage 25: Full Validation Pipeline ─────────────────────
            stage_start = time.time()

            full_validator = ValidationPipeline(stop_on_error=False)
            validation_result = full_validator.validate(manifest)

            result.stage_durations["full_validation"] = int(
                (time.time() - stage_start) * 1000
            )
            self._log_stage(
                "Full Validation", result.stage_durations["full_validation"]
            )

            # ─── Stage 26: Auto-Repair (if validation failed) ─────────────
            if not validation_result.valid:
                stage_start = time.time()

                from app.validators.auto_repair import ManifestRepairer

                repairer = ManifestRepairer()
                repair_result = repairer.repair(manifest)

                if repair_result.success and repair_result.repair_count > 0:
                    manifest = repair_result.manifest

                    self._logger.info(
                        f"Auto-repair applied {repair_result.repair_count} fixes"
                    )

                    # Re-validate after repair
                    validation_result = full_validator.validate(manifest)

                    # Add repair info to warnings
                    for repair in repair_result.repairs:
                        result.warnings.append(f"Auto-repair: {repair.description}")

                result.stage_durations["auto_repair"] = int(
                    (time.time() - stage_start) * 1000
                )
                self._log_stage("Auto-Repair", result.stage_durations["auto_repair"])

            # Add validation results to manifest
            manifest["validation"] = {
                "is_valid": validation_result.valid,
                "errors": [e.to_dict() for e in validation_result.all_errors],
                "warnings": [w.to_dict() for w in validation_result.all_warnings],
            }

            result.validation_passed = validation_result.valid
            result.validation_errors = len(validation_result.all_errors)
            result.validation_warnings = len(validation_result.all_warnings)

            # ─── Complete ───────────────────────────────────────────────
            game_state.manifest = manifest
            game_state.status = StateStatus.READY
            game_state.clear_dirty()
            self.state_manager.save(game_state)

            result.success = len(result.errors) == 0
            result.manifest = manifest

            self._logger.info(
                f"═══ Pipeline Complete ═══\n"
                f"  Success: {result.success}\n"
                f"  Validation: {'PASS' if result.validation_passed else 'FAIL'}\n"
                f"  Scenes: {len(manifest.get('scenes', []))}\n"
                f"  Errors: {len(result.errors)}\n"
                f"  Warnings: {len(result.warnings)}"
            )

        except Exception as e:
            self._logger.exception(f"Pipeline failed: {e}")
            result.errors.append(str(e))

            if game_state:
                game_state.status = StateStatus.ERROR

        finally:
            result.total_duration_ms = int((time.time() - start_time) * 1000)

        return result

    # ═══════════════════════════════════════════════════════════════════════
    #  AGENT PIPELINE
    # ═══════════════════════════════════════════════════════════════════════

    async def _run_agent_pipeline(
        self,
        pipeline_state: PipelineState,
        result: OrchestratorResult,
    ) -> bool:
        """Run the existing agent pipeline."""

        validator = InterStepValidator(pipeline_state)

        try:
            # ─── Scene Agent ────────────────────────────────────────────
            stage_start = time.time()
            pipeline_state.advance_stage(PipelineStage.SCENE_GENERATION)

            scene_result = await self.agents["scene"].run(pipeline_state)
            result.agent_results.append(scene_result)

            if not scene_result.is_success():
                result.errors.append(f"Scene generation failed: {scene_result.errors}")
                return False

            # Scene validation
            is_valid, errors, warnings = validator.validate_after_scenes()
            result.warnings.extend(warnings)

            result.stage_durations["scene_agent"] = int(
                (time.time() - stage_start) * 1000
            )
            self._log_stage("Scene Agent", result.stage_durations["scene_agent"])

            # ─── Challenge Agent ────────────────────────────────────────
            stage_start = time.time()
            pipeline_state.advance_stage(PipelineStage.CHALLENGE_GENERATION)

            challenge_result = await self.agents["challenge"].run(pipeline_state)
            result.agent_results.append(challenge_result)

            if not challenge_result.is_success():
                result.warnings.append(f"Challenge issues: {challenge_result.errors}")

            # Challenge validation
            is_valid, errors, warnings = validator.validate_after_challenges()
            result.warnings.extend(warnings)

            result.stage_durations["challenge_agent"] = int(
                (time.time() - stage_start) * 1000
            )
            self._log_stage(
                "Challenge Agent", result.stage_durations["challenge_agent"]
            )

            # ─── NPC Agent ──────────────────────────────────────────────
            stage_start = time.time()
            pipeline_state.advance_stage(PipelineStage.NPC_GENERATION)

            npc_result = await self.agents["npc"].run(pipeline_state)
            result.agent_results.append(npc_result)

            if not npc_result.is_success():
                result.warnings.append(f"NPC issues: {npc_result.errors}")

            # NPC validation
            is_valid, errors, warnings = validator.validate_after_npcs()
            result.warnings.extend(warnings)

            result.stage_durations["npc_agent"] = int(
                (time.time() - stage_start) * 1000
            )
            self._log_stage("NPC Agent", result.stage_durations["npc_agent"])

            # ─── Auto-Balance ───────────────────────────────────────────
            if not self.config.skip_auto_balance:
                stage_start = time.time()
                balance_result = auto_balance(pipeline_state)

                if balance_result.adjustments:
                    self._logger.info(
                        f"  Auto-balanced: {len(balance_result.adjustments)} adjustments"
                    )

                result.stage_durations["auto_balance"] = int(
                    (time.time() - stage_start) * 1000
                )

            # ─── Dialogue Agent ─────────────────────────────────────────
            if not self.config.skip_dialogue:
                stage_start = time.time()
                pipeline_state.advance_stage(PipelineStage.DIALOGUE_GENERATION)

                dialogue_result = await self.agents["dialogue"].run(pipeline_state)
                result.agent_results.append(dialogue_result)

                if not dialogue_result.is_success():
                    result.warnings.append(f"Dialogue issues: {dialogue_result.errors}")

                # Dialogue validation - use scene_outputs not scenes
                scenes_for_validation = []
                for so in pipeline_state.scene_outputs:
                    if hasattr(so, "to_dict"):
                        scenes_for_validation.append(so.to_dict())
                    elif isinstance(so, dict):
                        scenes_for_validation.append(so)
                dial_result = validate_dialogues(scenes_for_validation)
                result.warnings.extend(dial_result.warnings)

                result.stage_durations["dialogue_agent"] = int(
                    (time.time() - stage_start) * 1000
                )
                self._log_stage(
                    "Dialogue Agent", result.stage_durations["dialogue_agent"]
                )

            # ─── Verification Agent ─────────────────────────────────────
            if not self.config.skip_verification:
                stage_start = time.time()
                pipeline_state.advance_stage(PipelineStage.VERIFICATION)

                verify_result = await self.agents["verification"].run(pipeline_state)
                result.agent_results.append(verify_result)

                if not verify_result.is_success():
                    result.warnings.extend(verify_result.errors)

                result.stage_durations["verification_agent"] = int(
                    (time.time() - stage_start) * 1000
                )
                self._log_stage(
                    "Verification Agent", result.stage_durations["verification_agent"]
                )

            return True

        except Exception as e:
            self._logger.error(f"Agent pipeline failed: {e}")
            result.errors.append(str(e))
            return False

    # ═══════════════════════════════════════════════════════════════════════
    #  EDIT MODE (VIBE CODING)
    # ═══════════════════════════════════════════════════════════════════════

    async def edit(
        self,
        game_id: str,
        instruction: str,
        available_assets: Optional[List[Dict]] = None,
    ):
        """
        Apply a natural language edit to an existing game.

        NOTE: This is the legacy edit path via orchestrator.
        The new edit pipeline (app.edit) is preferred for vibe coding.

        Args:
            game_id: Game to edit
            instruction: Natural language edit instruction
            available_assets: Available assets

        Returns:
            EditorResult with applied changes
        """
        # Lazy import to avoid circular dependency at module load time
        from app.agents.editor_agent import EditorAgent, EditorResult

        game_state = self.state_manager.get(game_id)

        if not game_state:
            result = EditorResult(success=False)
            result.errors.append(f"Game not found: {game_id}")
            return result

        # Apply edit
        editor = EditorAgent()
        result = await editor.edit(
            state=game_state,
            instruction=instruction,
            available_assets=available_assets,
        )

        # Save state
        self.state_manager.save(game_state)

        return result

    # ═══════════════════════════════════════════════════════════════════════
    #  HELPERS
    # ═══════════════════════════════════════════════════════════════════════

    def _log_stage(self, stage_name: str, duration_ms: int):
        """Log stage completion."""
        self._logger.info(f"  ├─ {stage_name}: {duration_ms}ms")

        if self.config.on_stage_complete:
            try:
                self.config.on_stage_complete(stage_name, duration_ms)
            except:
                pass


# ═══════════════════════════════════════════════════════════════════════════════
#  CONVENIENCE FUNCTION
# ═══════════════════════════════════════════════════════════════════════════════


async def generate_game(
    prompt: str = "",
    game_id: str = "",
    game_name: str = "",
    assets: list = None,
    platform_id: str = None,
    goal_type: str = "explore",
    goal_description: str = "",
    num_scenes: int = 3,
    **kwargs,
) -> OrchestratorResult:
    """
    Generate a game using the full pipeline.

    Convenience function that creates an orchestrator and runs it.
    """
    orchestrator = Orchestrator()
    return await orchestrator.run(
        prompt=prompt,
        game_id=game_id,
        game_name=game_name,
        assets=assets,
        platform_id=platform_id,
        goal_type=goal_type,
        goal_description=goal_description,
        num_scenes=num_scenes,
        **kwargs,
    )
