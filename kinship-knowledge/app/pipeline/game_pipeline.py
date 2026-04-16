"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    GAME PIPELINE                                              ║
║                                                                               ║
║  End-to-end pipeline for generating complete games.                           ║
║                                                                               ║
║  USAGE:                                                                       ║
║    from app.pipeline import GamePipeline                                      ║
║                                                                               ║
║    pipeline = GamePipeline()                                                  ║
║    result = await pipeline.generate(                                          ║
║        game_id="game_123",                                                    ║
║        game_name="Forest Adventure",                                          ║
║        assets=assets_list,                                                    ║
║        goal_type="escape",                                                    ║
║        seed=12345,  # For reproducibility                                     ║
║    )                                                                          ║
║                                                                               ║
║    if result.success:                                                         ║
║        manifest = result.manifest                                             ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from typing import Optional, Callable
import logging
import asyncio

from app.agents.orchestrator import (
    Orchestrator,
    OrchestratorConfig,
    OrchestratorResult,
)
from app.agents.base_agent import AgentConfig
from app.pipeline.pipeline_state import PipelineState


logger = logging.getLogger(__name__)


class GamePipeline:
    """
    High-level interface for game generation.

    Wraps the Orchestrator with sensible defaults.
    """

    def __init__(
        self,
        max_retries: int = 3,
        timeout_seconds: float = 300.0,
        skip_dialogue: bool = False,
        skip_verification: bool = False,
        skip_auto_balance: bool = False,
        use_ai_dialogue: bool = False,
        include_debug: bool = False,
        on_progress: Optional[Callable] = None,
    ):
        """
        Initialize the pipeline.

        Args:
            max_retries: Max retries per agent
            timeout_seconds: Total timeout
            skip_dialogue: Skip dialogue generation
            skip_verification: Skip verification (not recommended)
            skip_auto_balance: Skip auto-balancing
            use_ai_dialogue: Use AI for dialogue generation
            include_debug: Include debug info in manifest
            on_progress: Callback for progress updates
        """
        # Agent config
        agent_config = AgentConfig(
            max_retries=max_retries,
            timeout_seconds=timeout_seconds,
            use_ai=use_ai_dialogue,
        )

        # Orchestrator config
        orch_config = OrchestratorConfig(
            default_agent_config=agent_config,
            skip_dialogue=skip_dialogue,
            skip_verification=skip_verification,
            skip_auto_balance=skip_auto_balance,
            total_timeout_seconds=timeout_seconds,
            include_debug=include_debug,
            on_agent_complete=on_progress,
        )

        self.orchestrator = Orchestrator(orch_config)

    async def generate(
        self,
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
    ) -> OrchestratorResult:
        """
        Generate a complete game.

        Args:
            game_id: Unique game identifier
            game_name: Display name for the game
            assets: List of asset dicts from kinship-assets
            goal_type: Player goal (escape, rescue, fetch, etc.)
            goal_description: Optional custom goal description
            audience_type: Target audience
            num_scenes: Number of scenes (1-10)
            zone_type: Zone type (forest, village, cave, etc.)
            seed: Random seed for determinism (auto-generated if None)
            **kwargs: Additional options

        Returns:
            OrchestratorResult with manifest and state
        """
        logger.info(f"Generating game: {game_name} (seed={seed})")

        result = await self.orchestrator.run(
            game_id=game_id,
            game_name=game_name,
            assets=assets,
            goal_type=goal_type,
            goal_description=goal_description,
            audience_type=audience_type,
            num_scenes=num_scenes,
            zone_type=zone_type,
            seed=seed,
            **kwargs,
        )

        if result.success:
            logger.info(f"Game generated successfully: {game_id}")
        else:
            logger.error(f"Game generation failed: {result.errors}")

        return result

    async def generate_simple(
        self,
        assets: list[dict],
        goal_type: str = "escape",
        num_scenes: int = 3,
        seed: int = None,
    ) -> dict:
        """
        Simple generation with minimal config.

        Returns manifest directly or empty dict on failure.
        """
        import uuid

        result = await self.generate(
            game_id=str(uuid.uuid4()),
            game_name="Generated Game",
            assets=assets,
            goal_type=goal_type,
            num_scenes=num_scenes,
            seed=seed,
        )

        return result.manifest if result.success else {}

    async def regenerate(
        self,
        previous_result: OrchestratorResult,
        new_seed: int = None,
    ) -> OrchestratorResult:
        """
        Regenerate a game with same config but new seed.

        Useful for getting variations.
        """
        if not previous_result.state:
            raise ValueError("Previous result has no state")

        state = previous_result.state
        input_cfg = state.input

        return await self.generate(
            game_id=input_cfg.game_id,
            game_name=input_cfg.game_name,
            assets=list(input_cfg.assets),
            goal_type=input_cfg.goal_type,
            goal_description=input_cfg.goal_description,
            audience_type=input_cfg.audience_type,
            num_scenes=input_cfg.num_scenes,
            zone_type=input_cfg.zone_type,
            seed=new_seed,  # New seed for variation
        )


# ═══════════════════════════════════════════════════════════════════════════════
#  CONVENIENCE FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════


async def generate_game_manifest(
    game_id: str,
    game_name: str,
    assets: list[dict],
    goal_type: str = "escape",
    num_scenes: int = 3,
    zone_type: str = "forest",
    seed: int = None,
    **kwargs,
) -> dict:
    """
    Generate a game and return the manifest.

    Returns empty dict on failure.
    """
    pipeline = GamePipeline()
    result = await pipeline.generate(
        game_id=game_id,
        game_name=game_name,
        assets=assets,
        goal_type=goal_type,
        num_scenes=num_scenes,
        zone_type=zone_type,
        seed=seed,
        **kwargs,
    )
    return result.manifest if result.success else {}


def generate_game_sync(
    game_id: str,
    game_name: str,
    assets: list[dict],
    seed: int = None,
    **kwargs,
) -> OrchestratorResult:
    """
    Synchronous wrapper for game generation.

    Use this when not in an async context.
    """
    pipeline = GamePipeline()
    return asyncio.run(
        pipeline.generate(
            game_id=game_id,
            game_name=game_name,
            assets=assets,
            seed=seed,
            **kwargs,
        )
    )


# ═══════════════════════════════════════════════════════════════════════════════
#  EXAMPLE USAGE
# ═══════════════════════════════════════════════════════════════════════════════


async def _example():
    """Example usage of the pipeline."""

    # Sample assets
    assets = [
        {
            "id": "1",
            "name": "tree_01",
            "type": "object",
            "tags": ["nature", "decoration"],
        },
        {
            "id": "2",
            "name": "rock_01",
            "type": "object",
            "tags": ["nature", "pushable"],
        },
        {"id": "3", "name": "key_01", "type": "object", "tags": ["collectible", "key"]},
        {"id": "4", "name": "door_01", "type": "object", "tags": ["door", "lockable"]},
        {"id": "5", "name": "npc_guide", "type": "character", "tags": ["npc", "guide"]},
    ]

    # Create pipeline
    pipeline = GamePipeline(
        max_retries=3,
        use_ai_dialogue=False,
        include_debug=True,
    )

    # Generate game with seed for reproducibility
    result = await pipeline.generate(
        game_id="example_001",
        game_name="Forest Escape",
        assets=assets,
        goal_type="escape",
        num_scenes=3,
        zone_type="forest",
        seed=12345,  # Reproducible!
    )

    if result.success:
        print(f"Generated {len(result.manifest['scenes'])} scenes")
        print(f"Seed: {result.state.seed}")
        print(f"Duration: {result.total_duration_ms}ms")

        # Regenerate with different seed
        result2 = await pipeline.regenerate(result, new_seed=67890)
        print(f"Variation generated: seed={result2.state.seed}")
    else:
        print(f"Failed: {result.errors}")

    return result


if __name__ == "__main__":
    asyncio.run(_example())
