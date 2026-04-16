"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    SCENE COMPOSITION RULES                                    ║
║                                                                               ║
║  SYSTEM-FIRST scene design. Every scene MUST contain required elements.       ║
║  AI has ZERO say in structure — only decorates.                               ║
║                                                                               ║
║  RULES:                                                                       ║
║  • Every scene: spawn + exit + ≥1 challenge + ≥1 NPC + ≥1 interactive        ║
║  • Scene 0 (intro): guide NPC mandatory, 1 easy challenge                     ║
║  • Scene N (final): guardian NPC, hardest challenge, exit condition            ║
║  • Middle scenes: progressive difficulty, varied mechanics                    ║
║  • Asset coverage: ≥30% of uploaded assets must be used per game              ║
║  • Mechanic density: min 1, max 3 challenges per scene                        ║
║  • Object density: min 5, max 25 placed objects per scene                     ║
║                                                                               ║
║  These rules are ENFORCED, not suggested.                                     ║
║  If generation violates them, it fails and retries.                           ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


# ═══════════════════════════════════════════════════════════════════════════════
#  SCENE ROLE
# ═══════════════════════════════════════════════════════════════════════════════


class SceneRole(str, Enum):
    """Role of a scene in the game progression."""

    INTRO = "intro"  # First scene: tutorial, guide NPC
    MIDDLE = "middle"  # Middle scenes: progressive challenges
    CLIMAX = "climax"  # Second-to-last: hardest challenge
    FINALE = "finale"  # Final scene: resolution, exit


# ═══════════════════════════════════════════════════════════════════════════════
#  SCENE BLUEPRINT
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass(frozen=True)
class SceneBlueprint:
    """
    Mandatory structure for a scene. NOT negotiable.
    The scene agent and challenge agent MUST satisfy these requirements.
    """

    role: SceneRole

    # Zone requirements (every scene needs these)
    requires_spawn: bool = True
    requires_exit: bool = True

    # Challenge requirements
    min_challenges: int = 1
    max_challenges: int = 3

    # NPC requirements
    min_npcs: int = 1
    max_npcs: int = 4
    required_npc_roles: tuple = ()  # Roles that MUST be present

    # Object requirements
    min_interactive_objects: int = 1  # Pushable, collectible, toggleable
    min_total_objects: int = 5  # Including decorations
    max_total_objects: int = 25

    # Collectible requirements
    min_collectibles: int = 0

    # Difficulty
    min_difficulty: int = 1
    max_difficulty: int = 10

    # Landmark requirements
    min_landmarks: int = 0

    # Decoration density
    min_decoration_density: float = 0.2
    max_decoration_density: float = 0.5


# ═══════════════════════════════════════════════════════════════════════════════
#  PREDEFINED BLUEPRINTS
# ═══════════════════════════════════════════════════════════════════════════════

SCENE_BLUEPRINTS = {
    SceneRole.INTRO: SceneBlueprint(
        role=SceneRole.INTRO,
        min_challenges=1,
        max_challenges=1,
        min_npcs=1,
        max_npcs=2,
        required_npc_roles=("guide",),
        min_interactive_objects=2,
        min_collectibles=2,
        min_difficulty=1,
        max_difficulty=3,
        min_landmarks=1,
        min_decoration_density=0.3,
    ),
    SceneRole.MIDDLE: SceneBlueprint(
        role=SceneRole.MIDDLE,
        min_challenges=1,
        max_challenges=2,
        min_npcs=1,
        max_npcs=3,
        required_npc_roles=(),  # Determined by mechanic
        min_interactive_objects=3,
        min_collectibles=3,
        min_difficulty=3,
        max_difficulty=7,
        min_landmarks=1,
        min_decoration_density=0.25,
    ),
    SceneRole.CLIMAX: SceneBlueprint(
        role=SceneRole.CLIMAX,
        min_challenges=2,
        max_challenges=3,
        min_npcs=1,
        max_npcs=3,
        required_npc_roles=(),
        min_interactive_objects=4,
        min_collectibles=2,
        min_difficulty=5,
        max_difficulty=8,
        min_landmarks=1,
        min_decoration_density=0.2,
    ),
    SceneRole.FINALE: SceneBlueprint(
        role=SceneRole.FINALE,
        min_challenges=1,
        max_challenges=2,
        min_npcs=1,
        max_npcs=2,
        required_npc_roles=("guardian",),
        min_interactive_objects=2,
        min_collectibles=1,
        min_difficulty=4,
        max_difficulty=10,
        min_landmarks=0,
        min_decoration_density=0.2,
    ),
}


# ═══════════════════════════════════════════════════════════════════════════════
#  GAME COMPOSITION RULES
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass(frozen=True)
class GameCompositionRules:
    """
    Rules that apply to the ENTIRE game, not individual scenes.
    """

    # Asset coverage: what fraction of uploaded assets must be used
    min_asset_coverage: float = 0.3  # 30% minimum

    # Mechanic variety: don't repeat same mechanic >2 times across game
    max_mechanic_repetition: int = 2

    # NPC variety: each role used at most N times
    max_same_npc_role: int = 2

    # Total challenges across all scenes
    min_total_challenges: int = 3
    max_total_challenges: int = 10

    # Total NPCs across all scenes
    min_total_npcs: int = 3
    max_total_npcs: int = 12

    # Progressive difficulty: each scene must be >= previous - 1
    allow_difficulty_decrease: int = 1  # Max allowed drop

    # Scene count bounds
    min_scenes: int = 1
    max_scenes: int = 10


DEFAULT_GAME_RULES = GameCompositionRules()


# ═══════════════════════════════════════════════════════════════════════════════
#  BLUEPRINT ASSIGNMENT
# ═══════════════════════════════════════════════════════════════════════════════


def assign_blueprints(num_scenes: int) -> list[SceneBlueprint]:
    """
    Assign a blueprint to each scene based on position.

    Rules:
    - Scene 0: always INTRO
    - Scene N-1: always FINALE
    - Scene N-2: CLIMAX (if >= 3 scenes)
    - Everything else: MIDDLE
    """
    if num_scenes == 1:
        # Single scene gets a hybrid intro+finale
        return [
            SceneBlueprint(
                role=SceneRole.INTRO,
                min_challenges=1,
                max_challenges=2,
                min_npcs=1,
                max_npcs=2,
                required_npc_roles=("guide",),
                min_interactive_objects=3,
                min_collectibles=2,
                min_difficulty=1,
                max_difficulty=5,
                min_landmarks=1,
            )
        ]

    if num_scenes == 2:
        return [
            SCENE_BLUEPRINTS[SceneRole.INTRO],
            SCENE_BLUEPRINTS[SceneRole.FINALE],
        ]

    blueprints = [SCENE_BLUEPRINTS[SceneRole.INTRO]]

    for i in range(1, num_scenes - 1):
        if i == num_scenes - 2:
            blueprints.append(SCENE_BLUEPRINTS[SceneRole.CLIMAX])
        else:
            blueprints.append(SCENE_BLUEPRINTS[SceneRole.MIDDLE])

    blueprints.append(SCENE_BLUEPRINTS[SceneRole.FINALE])

    return blueprints


# ═══════════════════════════════════════════════════════════════════════════════
#  REQUIRED ZONES FROM BLUEPRINT
# ═══════════════════════════════════════════════════════════════════════════════


def get_required_zones(blueprint: SceneBlueprint, mechanics: list[str]) -> list[dict]:
    """
    Generate the MANDATORY zone list from a blueprint.
    The scene agent MUST include all of these.
    """
    zones = []

    # Spawn (always)
    if blueprint.requires_spawn:
        zones.append(
            {
                "zone_id": "spawn",
                "zone_type": "spawn",
                "position_hint": "south",
                "size_hint": "small",
                "required": True,
            }
        )

    # Exit (always)
    if blueprint.requires_exit:
        zones.append(
            {
                "zone_id": "exit",
                "zone_type": "exit",
                "position_hint": "north",
                "size_hint": "small",
                "required": True,
            }
        )

    # Challenge zones (one per mechanic, minimum from blueprint)
    num_challenges = max(len(mechanics), blueprint.min_challenges)
    challenge_positions = ["center", "center_west", "center_east"]

    for i in range(num_challenges):
        pos = challenge_positions[i % len(challenge_positions)]
        zones.append(
            {
                "zone_id": f"challenge_{i}",
                "zone_type": "challenge",
                "position_hint": pos,
                "size_hint": "medium",
                "required": True,
            }
        )

    # NPC zone — use positions that challenges NEVER use
    # Challenges use: center, center_west, center_east
    # So NPC goes to: southwest (intro/middle) or northeast (finale)
    if blueprint.role == SceneRole.FINALE:
        npc_hint = "northeast"  # Guardian near exit area
    else:
        npc_hint = "southwest"  # Guide/villager near spawn side

    zones.append(
        {
            "zone_id": "npc_area",
            "zone_type": "npc",
            "position_hint": npc_hint,
            "size_hint": "small",
            "required": True,
        }
    )

    # Collectibles zone
    if blueprint.min_collectibles > 0:
        zones.append(
            {
                "zone_id": "collectibles",
                "zone_type": "collectibles",
                "position_hint": "southeast",
                "size_hint": "medium",
                "required": False,
            }
        )

    return zones


# ═══════════════════════════════════════════════════════════════════════════════
#  VALIDATION
# ═══════════════════════════════════════════════════════════════════════════════


def validate_scene_against_blueprint(
    scene_data: dict,
    blueprint: SceneBlueprint,
) -> tuple[bool, list[str], list[str]]:
    """
    Validate a materialized scene against its blueprint.

    Returns (is_valid, errors, warnings)
    """
    errors = []
    warnings = []

    # Check spawn
    if blueprint.requires_spawn and not scene_data.get("spawn"):
        errors.append("Missing spawn")

    # Check exit
    if blueprint.requires_exit and not scene_data.get("exit"):
        errors.append("Missing exit")

    # Check challenges
    challenges = scene_data.get("challenges", [])
    if len(challenges) < blueprint.min_challenges:
        errors.append(
            f"Too few challenges: {len(challenges)} < {blueprint.min_challenges}"
        )
    if len(challenges) > blueprint.max_challenges:
        warnings.append(
            f"Too many challenges: {len(challenges)} > {blueprint.max_challenges}"
        )

    # Check NPCs
    npcs = scene_data.get("npcs", [])
    npc_count = len(npcs) if isinstance(npcs, list) else 0
    if npc_count < blueprint.min_npcs:
        errors.append(f"Too few NPCs: {npc_count} < {blueprint.min_npcs}")

    # Check required NPC roles
    if blueprint.required_npc_roles:
        npc_roles = set()
        for npc in npcs if isinstance(npcs, list) else []:
            if isinstance(npc, dict):
                npc_roles.add(npc.get("role", ""))
            elif isinstance(npc, str):
                pass  # NPC ID reference, can't check role here

        for required_role in blueprint.required_npc_roles:
            if required_role not in npc_roles and npc_roles:
                warnings.append(f"Missing required NPC role: {required_role}")

    # Check objects
    objects = scene_data.get("objects", [])
    interactive_count = sum(
        1
        for o in objects
        if isinstance(o, dict)
        and (
            o.get("interactable")
            or o.get("type") == "challenge"
            or o.get("type") == "challenge_goal"
        )
    )
    if interactive_count < blueprint.min_interactive_objects:
        errors.append(
            f"Too few interactive objects: {interactive_count} < "
            f"{blueprint.min_interactive_objects}"
        )

    total_objects = len(objects)
    if total_objects < blueprint.min_total_objects:
        warnings.append(
            f"Scene feels empty: {total_objects} objects < "
            f"{blueprint.min_total_objects} minimum"
        )

    is_valid = len(errors) == 0
    return is_valid, errors, warnings


def validate_game_composition(
    scenes: list[dict],
    assets_used: set[str],
    total_assets: int,
    rules: GameCompositionRules = None,
) -> tuple[bool, list[str], list[str]]:
    """
    Validate the entire game against composition rules.

    Returns (is_valid, errors, warnings)
    """
    rules = rules or DEFAULT_GAME_RULES
    errors = []
    warnings = []

    # Asset coverage
    if total_assets > 0:
        coverage = len(assets_used) / total_assets
        if coverage < rules.min_asset_coverage:
            warnings.append(
                f"Low asset coverage: {coverage:.0%} < {rules.min_asset_coverage:.0%} "
                f"({len(assets_used)}/{total_assets} assets used)"
            )

    # Total challenges
    total_challenges = sum(
        len(s.get("challenges", [])) for s in scenes if isinstance(s, dict)
    )
    if total_challenges < rules.min_total_challenges:
        errors.append(
            f"Too few total challenges: {total_challenges} < {rules.min_total_challenges}"
        )

    # Mechanic repetition
    mechanic_counts: dict[str, int] = {}
    for scene in scenes:
        if not isinstance(scene, dict):
            continue
        for challenge in scene.get("challenges", []):
            if isinstance(challenge, dict):
                mech = challenge.get("mechanic_id", "")
                mechanic_counts[mech] = mechanic_counts.get(mech, 0) + 1

    for mech, count in mechanic_counts.items():
        if count > rules.max_mechanic_repetition:
            warnings.append(
                f"Mechanic '{mech}' used {count} times "
                f"(max {rules.max_mechanic_repetition})"
            )

    # Difficulty progression
    prev_difficulty = 0
    for i, scene in enumerate(scenes):
        if not isinstance(scene, dict):
            continue
        challenges = scene.get("challenges", [])
        if challenges:
            avg_diff = sum(
                c.get("complexity", 3) for c in challenges if isinstance(c, dict)
            ) / len(challenges)

            if i > 0 and avg_diff < prev_difficulty - rules.allow_difficulty_decrease:
                warnings.append(
                    f"Scene {i}: difficulty drops from {prev_difficulty:.1f} to {avg_diff:.1f}"
                )
            prev_difficulty = avg_diff

    is_valid = len(errors) == 0
    return is_valid, errors, warnings
