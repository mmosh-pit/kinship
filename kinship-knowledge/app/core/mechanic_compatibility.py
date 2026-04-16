"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    MECHANIC COMPATIBILITY SYSTEM                              ║
║                                                                               ║
║  Ensures mechanics combine logically instead of randomly.                     ║
║                                                                               ║
║  TWO LEVELS:                                                                  ║
║  1. Scene-level: Which mechanics can appear together in one scene             ║
║  2. Game-level: Progression order across scenes                               ║
║                                                                               ║
║  FLOW:                                                                        ║
║  Mechanic Matcher → Game Loop Generator → Compatibility Check →               ║
║  Challenge Builder → Scene Builder                                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from dataclasses import dataclass, field
from typing import Optional
from enum import Enum

from app.core.mechanics import (
    Mechanic,
    MechanicCategory,
    MechanicPack,
    get_mechanic,
    ALL_MECHANICS,
)


# ═══════════════════════════════════════════════════════════════════════════════
#  COMPATIBILITY TYPES
# ═══════════════════════════════════════════════════════════════════════════════

class CompatibilityType(str, Enum):
    """Types of compatibility relationships between mechanics."""
    
    COMPATIBLE = "compatible"           # Can be used together
    SYNERGY = "synergy"                 # Work especially well together
    REQUIRES_BEFORE = "requires_before" # Must complete A before B
    ENABLES = "enables"                 # Completing A unlocks B
    INCOMPATIBLE = "incompatible"       # Should NOT be in same scene
    EXCLUSIVE = "exclusive"             # Only one of these per scene
    LIMITED = "limited"                 # Can combine but with limits


class ProgressionOrder(str, Enum):
    """Where a mechanic typically appears in game progression."""
    
    INTRO = "intro"           # Scene 1 or start of scene
    EARLY = "early"           # First third of game
    MID = "mid"               # Middle of game
    LATE = "late"             # Final third
    BOSS = "boss"             # Final challenge
    ANY = "any"               # Can appear anywhere


# ═══════════════════════════════════════════════════════════════════════════════
#  COMPATIBILITY RULE
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class CompatibilityRule:
    """A rule defining relationship between two mechanics."""
    
    mechanic_a: str
    mechanic_b: str
    compatibility_type: CompatibilityType
    
    # For LIMITED type: max count when combined
    limit: int = 0
    
    # Reason for this rule (documentation)
    reason: str = ""
    
    # Weight for scoring (higher = stronger rule)
    weight: float = 1.0


@dataclass
class CategoryCompatibility:
    """Compatibility between mechanic categories."""
    
    category_a: MechanicCategory
    category_b: MechanicCategory
    compatibility_type: CompatibilityType
    
    # For LIMITED type
    limit: int = 0
    
    reason: str = ""


# ═══════════════════════════════════════════════════════════════════════════════
#  SCENE-LEVEL COMPATIBILITY RULES
# ═══════════════════════════════════════════════════════════════════════════════
# Controls which mechanics can appear together within a single scene

# Category-level rules (applied first)
CATEGORY_COMPATIBILITY: list[CategoryCompatibility] = [
    # Combat + Social usually avoid
    CategoryCompatibility(
        MechanicCategory.COMBAT, MechanicCategory.SOCIAL,
        CompatibilityType.INCOMPATIBLE,
        reason="Combat disrupts social interactions"
    ),
    
    # Farming + Combat incompatible
    CategoryCompatibility(
        MechanicCategory.FARMING, MechanicCategory.COMBAT,
        CompatibilityType.INCOMPATIBLE,
        reason="Farming is peaceful, combat is not"
    ),
    
    # Puzzle + Puzzle limited
    CategoryCompatibility(
        MechanicCategory.PUZZLE, MechanicCategory.PUZZLE,
        CompatibilityType.LIMITED,
        limit=3,
        reason="Too many puzzles overwhelms player"
    ),
    
    # Combat + Combat limited
    CategoryCompatibility(
        MechanicCategory.COMBAT, MechanicCategory.COMBAT,
        CompatibilityType.LIMITED,
        limit=2,
        reason="Combat fatigue"
    ),
    
    # Environment + Puzzle synergy
    CategoryCompatibility(
        MechanicCategory.ENVIRONMENT, MechanicCategory.PUZZLE,
        CompatibilityType.SYNERGY,
        reason="Environmental puzzles work well together"
    ),
    
    # Interaction + Progression synergy
    CategoryCompatibility(
        MechanicCategory.INTERACTION, MechanicCategory.PROGRESSION,
        CompatibilityType.SYNERGY,
        reason="Collect then deliver feels natural"
    ),
    
    # Social + Progression synergy
    CategoryCompatibility(
        MechanicCategory.SOCIAL, MechanicCategory.PROGRESSION,
        CompatibilityType.SYNERGY,
        reason="Talk to NPC then do quest"
    ),
    
    # Crafting + Survival synergy
    CategoryCompatibility(
        MechanicCategory.CRAFTING, MechanicCategory.SURVIVAL,
        CompatibilityType.SYNERGY,
        reason="Craft tools to survive"
    ),
    
    # Management exclusive (one management mechanic per scene)
    CategoryCompatibility(
        MechanicCategory.MANAGEMENT, MechanicCategory.MANAGEMENT,
        CompatibilityType.EXCLUSIVE,
        reason="Management mechanics are complex, one at a time"
    ),
]

# Specific mechanic rules (override category rules)
MECHANIC_COMPATIBILITY: list[CompatibilityRule] = [
    # ─── SYNERGIES ─────────────────────────────────────────────────────────────
    
    CompatibilityRule(
        "push_to_target", "bridge_gap",
        CompatibilityType.SYNERGY,
        reason="Push objects to create bridges"
    ),
    
    CompatibilityRule(
        "collect_items", "deliver_item",
        CompatibilityType.SYNERGY,
        reason="Natural collect-then-deliver flow"
    ),
    
    CompatibilityRule(
        "key_unlock", "reach_destination",
        CompatibilityType.SYNERGY,
        reason="Unlock path then proceed"
    ),
    
    CompatibilityRule(
        "talk_to_npc", "collect_items",
        CompatibilityType.SYNERGY,
        reason="NPC gives quest to collect"
    ),
    
    CompatibilityRule(
        "talk_to_npc", "deliver_item",
        CompatibilityType.SYNERGY,
        reason="Deliver items to NPC"
    ),
    
    CompatibilityRule(
        "sequence_activate", "key_unlock",
        CompatibilityType.SYNERGY,
        reason="Solve puzzle to unlock"
    ),
    
    CompatibilityRule(
        "pressure_plate", "push_to_target",
        CompatibilityType.SYNERGY,
        reason="Push objects onto plates"
    ),
    
    CompatibilityRule(
        "stack_climb", "reach_destination",
        CompatibilityType.SYNERGY,
        reason="Stack to reach elevated goal"
    ),
    
    # ─── REQUIRES BEFORE ───────────────────────────────────────────────────────
    
    CompatibilityRule(
        "talk_to_npc", "trade_items",
        CompatibilityType.REQUIRES_BEFORE,
        reason="Must talk before trading"
    ),
    
    CompatibilityRule(
        "collect_items", "trade_items",
        CompatibilityType.REQUIRES_BEFORE,
        reason="Need items before trading"
    ),
    
    CompatibilityRule(
        "key_unlock", "reach_destination",
        CompatibilityType.REQUIRES_BEFORE,
        reason="Unlock before reaching locked area"
    ),
    
    CompatibilityRule(
        "collect_items", "deliver_item",
        CompatibilityType.REQUIRES_BEFORE,
        reason="Collect before delivering"
    ),
    
    # ─── ENABLES ───────────────────────────────────────────────────────────────
    
    CompatibilityRule(
        "lever_activate", "reach_destination",
        CompatibilityType.ENABLES,
        reason="Lever opens path"
    ),
    
    CompatibilityRule(
        "bridge_gap", "reach_destination",
        CompatibilityType.ENABLES,
        reason="Bridge enables crossing"
    ),
    
    CompatibilityRule(
        "key_unlock", "collect_all",
        CompatibilityType.ENABLES,
        reason="Unlock access to hidden items"
    ),
    
    # ─── INCOMPATIBLE ──────────────────────────────────────────────────────────
    
    CompatibilityRule(
        "attack_enemy", "befriend_npc",
        CompatibilityType.INCOMPATIBLE,
        reason="Combat and friendship don't mix"
    ),
    
    CompatibilityRule(
        "defend_position", "escort_npc",
        CompatibilityType.INCOMPATIBLE,
        reason="Can't defend and escort simultaneously"
    ),
    
    # ─── EXCLUSIVE ─────────────────────────────────────────────────────────────
    
    CompatibilityRule(
        "avoid_hazard", "reach_destination",
        CompatibilityType.EXCLUSIVE,
        reason="Both are navigation goals, pick one"
    ),
    
    # ─── LIMITED ───────────────────────────────────────────────────────────────
    
    CompatibilityRule(
        "collect_items", "collect_all",
        CompatibilityType.LIMITED,
        limit=1,
        reason="Only one collection challenge per scene"
    ),
]


# ═══════════════════════════════════════════════════════════════════════════════
#  GAME-LEVEL PROGRESSION RULES
# ═══════════════════════════════════════════════════════════════════════════════
# Controls progression order across scenes

@dataclass
class MechanicProgression:
    """Defines where a mechanic should appear in game progression."""
    
    mechanic_id: str
    
    # When this mechanic typically appears
    progression_order: ProgressionOrder = ProgressionOrder.ANY
    
    # Must these mechanics be introduced first?
    prerequisites: list[str] = field(default_factory=list)
    
    # Should this mechanic be taught before use?
    requires_tutorial: bool = False
    
    # Complexity score (1-10)
    complexity: int = 5


MECHANIC_PROGRESSION: dict[str, MechanicProgression] = {
    # ─── INTRO MECHANICS (Scene 1) ─────────────────────────────────────────────
    
    "talk_to_npc": MechanicProgression(
        mechanic_id="talk_to_npc",
        progression_order=ProgressionOrder.INTRO,
        requires_tutorial=False,
        complexity=1,
    ),
    
    "collect_items": MechanicProgression(
        mechanic_id="collect_items",
        progression_order=ProgressionOrder.INTRO,
        requires_tutorial=False,
        complexity=2,
    ),
    
    "reach_destination": MechanicProgression(
        mechanic_id="reach_destination",
        progression_order=ProgressionOrder.INTRO,
        requires_tutorial=False,
        complexity=1,
    ),
    
    # ─── EARLY MECHANICS ───────────────────────────────────────────────────────
    
    "push_to_target": MechanicProgression(
        mechanic_id="push_to_target",
        progression_order=ProgressionOrder.EARLY,
        requires_tutorial=True,
        complexity=3,
    ),
    
    "key_unlock": MechanicProgression(
        mechanic_id="key_unlock",
        progression_order=ProgressionOrder.EARLY,
        prerequisites=["collect_items"],
        requires_tutorial=False,
        complexity=3,
    ),
    
    "deliver_item": MechanicProgression(
        mechanic_id="deliver_item",
        progression_order=ProgressionOrder.EARLY,
        prerequisites=["collect_items", "talk_to_npc"],
        requires_tutorial=False,
        complexity=3,
    ),
    
    "lever_activate": MechanicProgression(
        mechanic_id="lever_activate",
        progression_order=ProgressionOrder.EARLY,
        requires_tutorial=False,
        complexity=2,
    ),
    
    "avoid_hazard": MechanicProgression(
        mechanic_id="avoid_hazard",
        progression_order=ProgressionOrder.EARLY,
        requires_tutorial=True,
        complexity=4,
    ),
    
    # ─── MID MECHANICS ─────────────────────────────────────────────────────────
    
    "sequence_activate": MechanicProgression(
        mechanic_id="sequence_activate",
        progression_order=ProgressionOrder.MID,
        prerequisites=["lever_activate"],
        requires_tutorial=True,
        complexity=5,
    ),
    
    "pressure_plate": MechanicProgression(
        mechanic_id="pressure_plate",
        progression_order=ProgressionOrder.MID,
        prerequisites=["push_to_target"],
        requires_tutorial=True,
        complexity=5,
    ),
    
    "stack_climb": MechanicProgression(
        mechanic_id="stack_climb",
        progression_order=ProgressionOrder.MID,
        prerequisites=["push_to_target"],
        requires_tutorial=True,
        complexity=6,
    ),
    
    "trade_items": MechanicProgression(
        mechanic_id="trade_items",
        progression_order=ProgressionOrder.MID,
        prerequisites=["talk_to_npc", "collect_items"],
        requires_tutorial=False,
        complexity=4,
    ),
    
    "escort_npc": MechanicProgression(
        mechanic_id="escort_npc",
        progression_order=ProgressionOrder.MID,
        prerequisites=["talk_to_npc", "avoid_hazard"],
        requires_tutorial=True,
        complexity=6,
    ),
    
    # ─── LATE MECHANICS ────────────────────────────────────────────────────────
    
    "bridge_gap": MechanicProgression(
        mechanic_id="bridge_gap",
        progression_order=ProgressionOrder.LATE,
        prerequisites=["push_to_target", "stack_climb"],
        requires_tutorial=True,
        complexity=7,
    ),
    
    "collect_all": MechanicProgression(
        mechanic_id="collect_all",
        progression_order=ProgressionOrder.LATE,
        prerequisites=["collect_items"],
        requires_tutorial=False,
        complexity=5,
    ),
    
    # ─── COMBAT PACK ───────────────────────────────────────────────────────────
    
    "attack_enemy": MechanicProgression(
        mechanic_id="attack_enemy",
        progression_order=ProgressionOrder.MID,
        requires_tutorial=True,
        complexity=5,
    ),
    
    "defend_position": MechanicProgression(
        mechanic_id="defend_position",
        progression_order=ProgressionOrder.LATE,
        prerequisites=["attack_enemy"],
        requires_tutorial=True,
        complexity=7,
    ),
}


# ═══════════════════════════════════════════════════════════════════════════════
#  SCENE LIMITS
# ═══════════════════════════════════════════════════════════════════════════════
# Maximum mechanics per scene by type

SCENE_MECHANIC_LIMITS = {
    "total": 4,                    # Max mechanics per scene
    "puzzle": 3,                   # Max puzzle mechanics
    "combat": 2,                   # Max combat mechanics
    "social": 2,                   # Max social mechanics
    "collection": 2,               # Max collection mechanics
    "complex": 2,                  # Max complexity >= 6 mechanics
}

# ═══════════════════════════════════════════════════════════════════════════════
#  GAME-LEVEL REPETITION LIMITS
# ═══════════════════════════════════════════════════════════════════════════════
# Maximum times a mechanic can appear across the entire game

GAME_MECHANIC_LIMITS = {
    # Default max repetitions
    "default": 3,
    
    # Specific mechanic limits
    "talk_to_npc": 5,           # NPCs are common
    "collect_items": 4,         # Collection is common
    "reach_destination": 5,     # Navigation is common
    "deliver_item": 3,
    "push_to_target": 3,
    "key_unlock": 2,            # Keys get repetitive
    "sequence_activate": 2,     # Complex puzzles limited
    "bridge_gap": 2,
    "stack_climb": 2,
    "pressure_plate": 3,
    "avoid_hazard": 3,
    "attack_enemy": 4,          # Combat can repeat more
    "defend_position": 2,
    "trade_items": 2,
    "escort_npc": 2,            # Escort missions limited
}

# ═══════════════════════════════════════════════════════════════════════════════
#  SCENE-LEVEL REPETITION LIMITS
# ═══════════════════════════════════════════════════════════════════════════════
# Maximum times same mechanic can appear in ONE scene

SCENE_SAME_MECHANIC_LIMIT = 1  # Default: each mechanic max once per scene

SCENE_MECHANIC_EXCEPTIONS = {
    # Some mechanics can appear twice in same scene
    "collect_items": 2,
    "talk_to_npc": 2,
    "avoid_hazard": 2,
}

# Consecutive repetition is NEVER allowed
ALLOW_CONSECUTIVE_SAME = False


def get_mechanic_limit(mechanic_id: str) -> int:
    """Get max repetitions allowed for a mechanic across game."""
    return GAME_MECHANIC_LIMITS.get(mechanic_id, GAME_MECHANIC_LIMITS["default"])


def get_scene_mechanic_limit(mechanic_id: str) -> int:
    """Get max repetitions allowed for a mechanic in ONE scene."""
    return SCENE_MECHANIC_EXCEPTIONS.get(mechanic_id, SCENE_SAME_MECHANIC_LIMIT)


def check_consecutive_repetition(sequence: list[str]) -> list[str]:
    """
    Check for consecutive same mechanic (bad: A → A → A).
    
    Returns:
        List of violations
    """
    violations = []
    
    for i in range(len(sequence) - 1):
        if sequence[i] == sequence[i + 1]:
            violations.append(
                f"Consecutive repetition: '{sequence[i]}' at positions {i} and {i+1}"
            )
    
    return violations


def check_scene_repetition(scene_mechanics: list[str]) -> dict:
    """
    Check if any mechanic repeats too many times in a single scene.
    
    Args:
        scene_mechanics: List of mechanics in one scene
        
    Returns:
        {"valid": bool, "violations": [...], "warnings": [...]}
    """
    violations = []
    warnings = []
    
    # Count occurrences
    counts: dict[str, int] = {}
    for mech in scene_mechanics:
        counts[mech] = counts.get(mech, 0) + 1
    
    # Check limits
    for mech, count in counts.items():
        limit = get_scene_mechanic_limit(mech)
        
        if count > limit:
            violations.append(
                f"'{mech}' appears {count} times in scene (max: {limit})"
            )
        elif count == limit and limit > 1:
            warnings.append(
                f"'{mech}' at max scene usage ({count}/{limit})"
            )
    
    # Check consecutive
    if not ALLOW_CONSECUTIVE_SAME:
        consecutive_violations = check_consecutive_repetition(scene_mechanics)
        violations.extend(consecutive_violations)
    
    return {
        "valid": len(violations) == 0,
        "violations": violations,
        "warnings": warnings,
    }


def check_repetition_limits(
    mechanic_counts: dict[str, int],
) -> dict:
    """
    Check if mechanic usage exceeds repetition limits (game-wide).
    
    Args:
        mechanic_counts: Map of mechanic_id to usage count across game
        
    Returns:
        {"valid": bool, "violations": [...], "warnings": [...]}
    """
    violations = []
    warnings = []
    
    for mechanic_id, count in mechanic_counts.items():
        limit = get_mechanic_limit(mechanic_id)
        
        if count > limit:
            violations.append(
                f"'{mechanic_id}' used {count} times (max: {limit})"
            )
        elif count == limit:
            warnings.append(
                f"'{mechanic_id}' at max usage ({count}/{limit})"
            )
    
    return {
        "valid": len(violations) == 0,
        "violations": violations,
        "warnings": warnings,
    }


def validate_no_repetition(
    game_mechanics: list[list[str]],
) -> dict:
    """
    Full repetition validation for entire game.
    
    Checks:
    1. No consecutive same mechanic in any scene
    2. Per-scene limits respected
    3. Game-wide limits respected
    
    Args:
        game_mechanics: List of mechanic lists, one per scene
        
    Returns:
        {"valid": bool, "scene_issues": [...], "game_issues": [...]}
    """
    scene_issues = []
    game_counts: dict[str, int] = {}
    
    for scene_idx, scene_mechs in enumerate(game_mechanics):
        # Check scene-level
        scene_result = check_scene_repetition(scene_mechs)
        
        if not scene_result["valid"]:
            scene_issues.append({
                "scene": scene_idx,
                "violations": scene_result["violations"],
            })
        
        # Accumulate counts
        for mech in scene_mechs:
            game_counts[mech] = game_counts.get(mech, 0) + 1
    
    # Check game-level
    game_result = check_repetition_limits(game_counts)
    
    return {
        "valid": len(scene_issues) == 0 and game_result["valid"],
        "scene_issues": scene_issues,
        "game_issues": game_result["violations"],
        "warnings": game_result["warnings"],
    }


def suggest_alternative_mechanics(
    overused_mechanic: str,
    available_mechanics: list[str],
    mechanic_counts: dict[str, int],
) -> list[str]:
    """
    Suggest alternatives when a mechanic is overused.
    
    Returns mechanics from same category that haven't hit their limit.
    """
    from app.core.mechanics import get_mechanic
    
    source = get_mechanic(overused_mechanic)
    if not source:
        return []
    
    alternatives = []
    
    for mech_id in available_mechanics:
        if mech_id == overused_mechanic:
            continue
        
        mech = get_mechanic(mech_id)
        if not mech:
            continue
        
        # Same category
        if mech.category == source.category:
            current_count = mechanic_counts.get(mech_id, 0)
            limit = get_mechanic_limit(mech_id)
            
            if current_count < limit:
                alternatives.append(mech_id)
    
    return alternatives


# ═══════════════════════════════════════════════════════════════════════════════
#  COMPATIBILITY CHECKER
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class CompatibilityResult:
    """Result of compatibility check."""
    
    is_compatible: bool
    score: float = 1.0  # 0.0 to 1.0
    
    synergies: list[str] = field(default_factory=list)
    conflicts: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    
    # Order violations
    order_violations: list[str] = field(default_factory=list)
    
    # Missing prerequisites
    missing_prerequisites: list[str] = field(default_factory=list)


def get_category_compatibility(
    cat_a: MechanicCategory,
    cat_b: MechanicCategory
) -> Optional[CategoryCompatibility]:
    """Get compatibility rule between two categories."""
    for rule in CATEGORY_COMPATIBILITY:
        if (rule.category_a == cat_a and rule.category_b == cat_b) or \
           (rule.category_a == cat_b and rule.category_b == cat_a):
            return rule
    return None


def get_mechanic_compatibility(
    mech_a: str,
    mech_b: str
) -> Optional[CompatibilityRule]:
    """Get specific compatibility rule between two mechanics."""
    for rule in MECHANIC_COMPATIBILITY:
        if (rule.mechanic_a == mech_a and rule.mechanic_b == mech_b) or \
           (rule.mechanic_a == mech_b and rule.mechanic_b == mech_a):
            return rule
    return None


def check_scene_compatibility(
    mechanic_ids: list[str],
) -> CompatibilityResult:
    """
    Check if a set of mechanics are compatible within a single scene.
    
    Args:
        mechanic_ids: List of mechanic IDs to check
        
    Returns:
        CompatibilityResult with score and issues
    """
    result = CompatibilityResult(is_compatible=True, score=1.0)
    
    mechanics = [get_mechanic(mid) for mid in mechanic_ids]
    mechanics = [m for m in mechanics if m is not None]
    
    if not mechanics:
        return result
    
    # Check total count
    if len(mechanics) > SCENE_MECHANIC_LIMITS["total"]:
        result.warnings.append(
            f"Too many mechanics ({len(mechanics)} > {SCENE_MECHANIC_LIMITS['total']})"
        )
        result.score -= 0.1
    
    # Count by category
    category_counts: dict[MechanicCategory, int] = {}
    complexity_sum = 0
    high_complexity_count = 0
    
    for mech in mechanics:
        cat = mech.category
        category_counts[cat] = category_counts.get(cat, 0) + 1
        
        prog = MECHANIC_PROGRESSION.get(mech.id)
        if prog:
            complexity_sum += prog.complexity
            if prog.complexity >= 6:
                high_complexity_count += 1
    
    # Check category limits
    puzzle_count = category_counts.get(MechanicCategory.PUZZLE, 0)
    if puzzle_count > SCENE_MECHANIC_LIMITS["puzzle"]:
        result.warnings.append(f"Too many puzzle mechanics ({puzzle_count})")
        result.score -= 0.1
    
    combat_count = category_counts.get(MechanicCategory.COMBAT, 0)
    if combat_count > SCENE_MECHANIC_LIMITS["combat"]:
        result.warnings.append(f"Too many combat mechanics ({combat_count})")
        result.score -= 0.1
    
    # Check high complexity
    if high_complexity_count > SCENE_MECHANIC_LIMITS["complex"]:
        result.warnings.append(f"Too many complex mechanics ({high_complexity_count})")
        result.score -= 0.15
    
    # Check pairwise compatibility
    for i, mech_a in enumerate(mechanics):
        for mech_b in mechanics[i + 1:]:
            # Check specific mechanic rule first
            rule = get_mechanic_compatibility(mech_a.id, mech_b.id)
            
            if rule:
                if rule.compatibility_type == CompatibilityType.INCOMPATIBLE:
                    result.is_compatible = False
                    result.conflicts.append(
                        f"{mech_a.id} + {mech_b.id}: {rule.reason}"
                    )
                    result.score -= 0.3
                    
                elif rule.compatibility_type == CompatibilityType.EXCLUSIVE:
                    result.is_compatible = False
                    result.conflicts.append(
                        f"{mech_a.id} / {mech_b.id} are exclusive: {rule.reason}"
                    )
                    result.score -= 0.25
                    
                elif rule.compatibility_type == CompatibilityType.SYNERGY:
                    result.synergies.append(
                        f"{mech_a.id} + {mech_b.id}: {rule.reason}"
                    )
                    result.score += 0.1
                    
                elif rule.compatibility_type == CompatibilityType.LIMITED:
                    # Check count doesn't exceed limit
                    pass  # Handled by category counts
                    
            else:
                # Fall back to category rule
                cat_rule = get_category_compatibility(mech_a.category, mech_b.category)
                
                if cat_rule:
                    if cat_rule.compatibility_type == CompatibilityType.INCOMPATIBLE:
                        result.is_compatible = False
                        result.conflicts.append(
                            f"{mech_a.category.value} + {mech_b.category.value}: {cat_rule.reason}"
                        )
                        result.score -= 0.25
                        
                    elif cat_rule.compatibility_type == CompatibilityType.SYNERGY:
                        result.synergies.append(
                            f"{mech_a.category.value} + {mech_b.category.value}"
                        )
                        result.score += 0.05
    
    # Clamp score
    result.score = max(0.0, min(1.0, result.score))
    
    return result


def check_progression_compatibility(
    mechanic_sequence: list[str],
    scene_index: int = 0,
    total_scenes: int = 4,
) -> CompatibilityResult:
    """
    Check if mechanics follow proper progression order.
    
    Args:
        mechanic_sequence: Ordered list of mechanic IDs
        scene_index: Which scene this is (0-based)
        total_scenes: Total scenes in game
        
    Returns:
        CompatibilityResult with order violations
    """
    result = CompatibilityResult(is_compatible=True, score=1.0)
    
    # Determine expected progression based on scene index
    if scene_index == 0:
        expected_order = ProgressionOrder.INTRO
    elif scene_index < total_scenes // 3:
        expected_order = ProgressionOrder.EARLY
    elif scene_index < 2 * total_scenes // 3:
        expected_order = ProgressionOrder.MID
    elif scene_index == total_scenes - 1:
        expected_order = ProgressionOrder.BOSS
    else:
        expected_order = ProgressionOrder.LATE
    
    introduced_mechanics = set()
    
    for mech_id in mechanic_sequence:
        prog = MECHANIC_PROGRESSION.get(mech_id)
        if not prog:
            continue
        
        # Check progression order
        if prog.progression_order != ProgressionOrder.ANY:
            order_value = {
                ProgressionOrder.INTRO: 0,
                ProgressionOrder.EARLY: 1,
                ProgressionOrder.MID: 2,
                ProgressionOrder.LATE: 3,
                ProgressionOrder.BOSS: 4,
            }
            
            mech_order = order_value.get(prog.progression_order, 2)
            expected_value = order_value.get(expected_order, 2)
            
            if mech_order > expected_value + 1:
                result.order_violations.append(
                    f"{mech_id} is {prog.progression_order.value} mechanic, "
                    f"but appears in {expected_order.value} scene"
                )
                result.score -= 0.15
        
        # Check prerequisites
        for prereq in prog.prerequisites:
            if prereq not in introduced_mechanics:
                result.missing_prerequisites.append(
                    f"{mech_id} requires {prereq} to be introduced first"
                )
                result.score -= 0.2
        
        introduced_mechanics.add(mech_id)
    
    # Check for violations
    if result.order_violations or result.missing_prerequisites:
        result.is_compatible = False
    
    result.score = max(0.0, min(1.0, result.score))
    
    return result


def check_game_loop_compatibility(
    loop_mechanics: list[list[str]],
) -> CompatibilityResult:
    """
    Check compatibility for entire game (multiple scenes).
    
    Args:
        loop_mechanics: List of mechanic lists, one per scene
        
    Returns:
        Combined CompatibilityResult
    """
    result = CompatibilityResult(is_compatible=True, score=1.0)
    
    total_scenes = len(loop_mechanics)
    all_introduced = set()
    
    for scene_idx, scene_mechanics in enumerate(loop_mechanics):
        # Check scene-level compatibility
        scene_result = check_scene_compatibility(scene_mechanics)
        
        if not scene_result.is_compatible:
            result.is_compatible = False
        
        result.synergies.extend(scene_result.synergies)
        result.conflicts.extend(scene_result.conflicts)
        result.warnings.extend(scene_result.warnings)
        
        # Check progression compatibility
        prog_result = check_progression_compatibility(
            scene_mechanics, scene_idx, total_scenes
        )
        
        if not prog_result.is_compatible:
            result.is_compatible = False
        
        result.order_violations.extend(prog_result.order_violations)
        result.missing_prerequisites.extend(prog_result.missing_prerequisites)
        
        # Track introduced mechanics
        all_introduced.update(scene_mechanics)
        
        # Average scores
        result.score = (result.score + scene_result.score + prog_result.score) / 3
    
    result.score = max(0.0, min(1.0, result.score))
    
    return result


# ═══════════════════════════════════════════════════════════════════════════════
#  MECHANIC SUGGESTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def suggest_compatible_mechanics(
    existing_mechanics: list[str],
    available_mechanics: list[str],
    max_suggestions: int = 5,
) -> list[tuple[str, float]]:
    """
    Suggest mechanics that would work well with existing selection.
    
    Args:
        existing_mechanics: Already selected mechanics
        available_mechanics: Pool of available mechanics
        max_suggestions: Max number to suggest
        
    Returns:
        List of (mechanic_id, score) sorted by score descending
    """
    suggestions = []
    
    for candidate in available_mechanics:
        if candidate in existing_mechanics:
            continue
        
        # Check compatibility with existing
        test_set = existing_mechanics + [candidate]
        result = check_scene_compatibility(test_set)
        
        if result.is_compatible:
            # Boost score for synergies
            score = result.score
            
            # Check for direct synergies
            for existing in existing_mechanics:
                rule = get_mechanic_compatibility(existing, candidate)
                if rule and rule.compatibility_type == CompatibilityType.SYNERGY:
                    score += 0.2
            
            suggestions.append((candidate, min(1.0, score)))
    
    # Sort by score descending
    suggestions.sort(key=lambda x: x[1], reverse=True)
    
    return suggestions[:max_suggestions]


def get_required_tutorials(mechanic_ids: list[str]) -> list[str]:
    """Get list of mechanics that require tutorials."""
    tutorials = []
    
    for mid in mechanic_ids:
        prog = MECHANIC_PROGRESSION.get(mid)
        if prog and prog.requires_tutorial:
            tutorials.append(mid)
    
    return tutorials


def get_mechanic_complexity(mechanic_id: str) -> int:
    """Get complexity score for a mechanic."""
    prog = MECHANIC_PROGRESSION.get(mechanic_id)
    return prog.complexity if prog else 5


def sort_by_progression(mechanic_ids: list[str]) -> list[str]:
    """Sort mechanics by their intended progression order."""
    
    order_values = {
        ProgressionOrder.INTRO: 0,
        ProgressionOrder.EARLY: 1,
        ProgressionOrder.MID: 2,
        ProgressionOrder.LATE: 3,
        ProgressionOrder.BOSS: 4,
        ProgressionOrder.ANY: 2,
    }
    
    def get_order(mid: str) -> tuple[int, int]:
        prog = MECHANIC_PROGRESSION.get(mid)
        if prog:
            return (order_values[prog.progression_order], prog.complexity)
        return (2, 5)  # Default to mid, medium complexity
    
    return sorted(mechanic_ids, key=get_order)
