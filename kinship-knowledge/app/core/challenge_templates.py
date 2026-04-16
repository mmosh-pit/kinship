"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    CHALLENGE TEMPLATES                                        ║
║                                                                               ║
║  Templates REFERENCE mechanics (single source of truth).                      ║
║  Templates DO NOT redefine mechanic logic.                                    ║
║                                                                               ║
║  Mechanic defines:                                                            ║
║  • Object slots                                                               ║
║  • Success conditions                                                         ║
║  • Required affordances                                                       ║
║                                                                               ║
║  Template adds:                                                               ║
║  • Parameter constraints (min/max counts)                                     ║
║  • Difficulty metadata (range, estimated time)                                ║
║  • Scaling rules per difficulty level                                         ║
║  • AI fill points                                                             ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from dataclasses import dataclass, field
from typing import Optional
from enum import Enum

from app.core.mechanics import Mechanic, get_mechanic


# ═══════════════════════════════════════════════════════════════════════════════
#  ENUMS
# ═══════════════════════════════════════════════════════════════════════════════


class Difficulty(str, Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


# ═══════════════════════════════════════════════════════════════════════════════
#  CONSTRAINTS
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class Constraint:
    """A constraint on a numeric value."""

    min_value: int
    max_value: int
    default: int

    def validate(self, value: int) -> int:
        """Clamp value to valid range."""
        return max(self.min_value, min(self.max_value, value))

    def is_valid(self, value: int) -> bool:
        """Check if value is within range."""
        return self.min_value <= value <= self.max_value

    def enforce(self, value: int) -> tuple[int, bool]:
        """Enforce constraint. Returns (clamped_value, was_modified)."""
        clamped = self.validate(value)
        return clamped, clamped != value


# Global constraints for parameter types
PARAMETER_CONSTRAINTS = {
    # Object counts
    "object_count": Constraint(1, 10, 3),
    "collect_count": Constraint(3, 12, 5),
    "sequence_length": Constraint(2, 6, 3),
    "bridge_pieces": Constraint(1, 5, 2),
    "stack_height": Constraint(2, 5, 3),
    "deliver_count": Constraint(1, 5, 2),
    "hazard_count": Constraint(1, 6, 3),
    # Time
    "time_limit": Constraint(15, 300, 60),
    # Zones
    "zone_radius": Constraint(1, 5, 2),
    # Hints
    "hint_count": Constraint(0, 5, 2),
}


# ═══════════════════════════════════════════════════════════════════════════════
#  CHALLENGE TEMPLATE
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class ChallengeTemplate:
    """
    Template that REFERENCES a mechanic (single source of truth).

    Does NOT redefine:
    - object_slots (comes from mechanic)
    - success_condition (comes from mechanic)
    - required_affordances (comes from mechanic)

    Adds:
    - constraints (parameter limits)
    - difficulty_range (0-100 score range)
    - estimated_time_seconds
    - scaling (how params change by difficulty)
    """

    # ─── MECHANIC REFERENCE ────────────────────────────────────────────────────
    mechanic_id: str

    # ─── PARAMETER CONSTRAINTS ─────────────────────────────────────────────────
    constraints: dict[str, Constraint] = field(default_factory=dict)

    # ─── DIFFICULTY METADATA ───────────────────────────────────────────────────
    difficulty_range: tuple[int, int] = (30, 50)
    estimated_time_seconds: int = 60

    # Factors affecting difficulty
    difficulty_factors: list[str] = field(default_factory=list)
    factor_weights: dict[str, float] = field(default_factory=dict)

    # ─── SCALING PER DIFFICULTY ────────────────────────────────────────────────
    scaling: dict[Difficulty, dict] = field(default_factory=dict)

    # ─── REWARDS ───────────────────────────────────────────────────────────────
    base_score: int = 100
    base_hearts: dict[str, int] = field(default_factory=dict)

    # ─── METHODS ───────────────────────────────────────────────────────────────

    def get_mechanic(self) -> Optional[Mechanic]:
        """Get the referenced mechanic."""
        return get_mechanic(self.mechanic_id)

    def get_constraint(self, param: str) -> Optional[Constraint]:
        """Get constraint for a parameter."""
        return self.constraints.get(param) or PARAMETER_CONSTRAINTS.get(param)

    def enforce_constraints(self, params: dict) -> tuple[dict, list[str]]:
        """Enforce all constraints. Returns (enforced_params, modifications)."""
        enforced = {}
        modifications = []

        for key, value in params.items():
            constraint = self.get_constraint(key)
            if constraint and isinstance(value, (int, float)):
                new_value, was_modified = constraint.enforce(int(value))
                enforced[key] = new_value
                if was_modified:
                    modifications.append(
                        f"{key}: {value} → {new_value} (range: {constraint.min_value}-{constraint.max_value})"
                    )
            else:
                enforced[key] = value

        return enforced, modifications

    def get_scaled_params(self, difficulty: Difficulty) -> dict:
        """Get parameters for a difficulty level."""
        return self.scaling.get(difficulty, {})

    def estimate_difficulty_score(self, params: dict) -> int:
        """Calculate difficulty score (0-100) based on parameters."""
        if not self.factor_weights:
            return (self.difficulty_range[0] + self.difficulty_range[1]) // 2

        score = 0.0
        total_weight = sum(self.factor_weights.values())

        for factor, weight in self.factor_weights.items():
            value = params.get(factor, 0)
            constraint = self.get_constraint(factor)

            if constraint:
                normalized = (value - constraint.min_value) / max(
                    1, constraint.max_value - constraint.min_value
                )
                normalized = max(0, min(1, normalized))
                score += normalized * weight

        if total_weight > 0:
            score = (score / total_weight) * 100

        return int(max(self.difficulty_range[0], min(self.difficulty_range[1], score)))


# ═══════════════════════════════════════════════════════════════════════════════
#  FILLED CHALLENGE (Output from AI + System)
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class FilledChallenge:
    """
    A complete challenge with:
    - Structure from mechanic (object slots, success condition)
    - Constraints from template (enforced)
    - Flavor from AI (name, description, hints)
    - Positions from system (coordinates)
    """

    # Identity
    mechanic_id: str

    # From AI (flavor)
    name: str = ""
    description: str = ""
    hints: list[str] = field(default_factory=list)
    completion_message: str = ""
    difficulty: Difficulty = Difficulty.MEDIUM

    # Parameters (AI chooses, system enforces constraints)
    params: dict = field(default_factory=dict)
    # e.g., {"object_count": 5, "time_limit": 60}

    # Object assignments (system fills based on mechanic slots)
    objects: list[dict] = field(default_factory=list)
    # Format: [{"slot": "moveable", "asset_name": "stone", "count": 3, "positions": [...]}]

    # Zone positions (system calculates)
    zones: list[dict] = field(default_factory=list)
    # Format: [{"type": "goal", "position": {"x": 10, "y": 8}, "radius": 2}]

    # Rewards (calculated from difficulty)
    score_points: int = 100
    hearts_reward: dict[str, int] = field(default_factory=dict)

    # Computed difficulty score (0-100)
    difficulty_score: int = 50
    estimated_time_seconds: int = 60


# ═══════════════════════════════════════════════════════════════════════════════
#  CHALLENGE TEMPLATES REGISTRY
# ═══════════════════════════════════════════════════════════════════════════════

CHALLENGE_TEMPLATES: dict[str, ChallengeTemplate] = {
    "push_to_target": ChallengeTemplate(
        mechanic_id="push_to_target",
        constraints={
            "object_count": Constraint(1, 10, 3),
        },
        difficulty_range=(20, 70),
        estimated_time_seconds=60,
        difficulty_factors=["object_count", "distance", "obstacles"],
        factor_weights={"object_count": 0.4, "distance": 0.3, "obstacles": 0.3},
        scaling={
            Difficulty.EASY: {"object_count": 2, "distance": 3, "obstacles": 0},
            Difficulty.MEDIUM: {"object_count": 4, "distance": 5, "obstacles": 2},
            Difficulty.HARD: {"object_count": 6, "distance": 8, "obstacles": 4},
        },
        base_score=100,
        base_hearts={"R": 5, "A": 3},
    ),
    "collect_items": ChallengeTemplate(
        mechanic_id="collect_items",
        constraints={
            "collect_count": Constraint(3, 12, 5),
        },
        difficulty_range=(15, 60),
        estimated_time_seconds=45,
        difficulty_factors=["collect_count", "spread", "hazards"],
        factor_weights={"collect_count": 0.5, "spread": 0.3, "hazards": 0.2},
        scaling={
            Difficulty.EASY: {"collect_count": 3, "spread": 3, "hazards": 0},
            Difficulty.MEDIUM: {"collect_count": 6, "spread": 5, "hazards": 2},
            Difficulty.HARD: {"collect_count": 10, "spread": 8, "hazards": 4},
        },
        base_score=100,
        base_hearts={"E": 5, "A": 3},
    ),
    "sequence_activate": ChallengeTemplate(
        mechanic_id="sequence_activate",
        constraints={
            "sequence_length": Constraint(2, 6, 3),
        },
        difficulty_range=(30, 80),
        estimated_time_seconds=90,
        difficulty_factors=["sequence_length"],
        factor_weights={"sequence_length": 1.0},
        scaling={
            Difficulty.EASY: {"sequence_length": 2},
            Difficulty.MEDIUM: {"sequence_length": 4},
            Difficulty.HARD: {"sequence_length": 6},
        },
        base_score=150,
        base_hearts={"T": 5, "A": 5},
    ),
    "key_unlock": ChallengeTemplate(
        mechanic_id="key_unlock",
        constraints={
            "decoy_count": Constraint(0, 3, 0),
        },
        difficulty_range=(20, 60),
        estimated_time_seconds=45,
        difficulty_factors=["key_hidden", "distance", "decoy_count"],
        factor_weights={"key_hidden": 0.3, "distance": 0.3, "decoy_count": 0.4},
        scaling={
            Difficulty.EASY: {"key_hidden": False, "distance": 3, "decoy_count": 0},
            Difficulty.MEDIUM: {"key_hidden": True, "distance": 5, "decoy_count": 1},
            Difficulty.HARD: {"key_hidden": True, "distance": 8, "decoy_count": 3},
        },
        base_score=120,
        base_hearts={"E": 5, "R": 3},
    ),
    "bridge_gap": ChallengeTemplate(
        mechanic_id="bridge_gap",
        constraints={
            "bridge_pieces": Constraint(1, 5, 2),
        },
        difficulty_range=(40, 80),
        estimated_time_seconds=90,
        difficulty_factors=["gap_width", "bridge_pieces"],
        factor_weights={"gap_width": 0.5, "bridge_pieces": 0.5},
        scaling={
            Difficulty.EASY: {"gap_width": 1, "bridge_pieces": 1},
            Difficulty.MEDIUM: {"gap_width": 2, "bridge_pieces": 2},
            Difficulty.HARD: {"gap_width": 3, "bridge_pieces": 3},
        },
        base_score=150,
        base_hearts={"A": 5, "T": 5},
    ),
    "deliver_item": ChallengeTemplate(
        mechanic_id="deliver_item",
        constraints={
            "deliver_count": Constraint(1, 5, 2),
        },
        difficulty_range=(25, 65),
        estimated_time_seconds=60,
        difficulty_factors=["deliver_count", "distance", "hazards"],
        factor_weights={"deliver_count": 0.4, "distance": 0.3, "hazards": 0.3},
        scaling={
            Difficulty.EASY: {"deliver_count": 1, "distance": 3, "hazards": 0},
            Difficulty.MEDIUM: {"deliver_count": 3, "distance": 5, "hazards": 2},
            Difficulty.HARD: {"deliver_count": 5, "distance": 8, "hazards": 4},
        },
        base_score=120,
        base_hearts={"H": 5, "E": 3},
    ),
    "reach_destination": ChallengeTemplate(
        mechanic_id="reach_destination",
        constraints={
            "obstacle_count": Constraint(0, 8, 3),
        },
        difficulty_range=(15, 55),
        estimated_time_seconds=45,
        difficulty_factors=["distance", "obstacles", "hazards"],
        factor_weights={"distance": 0.3, "obstacles": 0.4, "hazards": 0.3},
        scaling={
            Difficulty.EASY: {"distance": 4, "obstacles": 0, "hazards": 0},
            Difficulty.MEDIUM: {"distance": 7, "obstacles": 3, "hazards": 2},
            Difficulty.HARD: {"distance": 10, "obstacles": 6, "hazards": 4},
        },
        base_score=80,
        base_hearts={"R": 5},
    ),
    "avoid_hazard": ChallengeTemplate(
        mechanic_id="avoid_hazard",
        constraints={
            "hazard_count": Constraint(2, 8, 4),
            "time_limit": Constraint(30, 180, 60),
        },
        difficulty_range=(40, 85),
        estimated_time_seconds=60,
        difficulty_factors=["hazard_count", "path_width", "time_limit"],
        factor_weights={"hazard_count": 0.4, "path_width": 0.3, "time_limit": 0.3},
        scaling={
            Difficulty.EASY: {"hazard_count": 2, "path_width": 3, "time_limit": 120},
            Difficulty.MEDIUM: {"hazard_count": 4, "path_width": 2, "time_limit": 60},
            Difficulty.HARD: {"hazard_count": 6, "path_width": 1, "time_limit": 45},
        },
        base_score=150,
        base_hearts={"R": 8, "A": 5},
    ),
    "stack_climb": ChallengeTemplate(
        mechanic_id="stack_climb",
        constraints={
            "stack_height": Constraint(2, 5, 3),
        },
        difficulty_range=(35, 75),
        estimated_time_seconds=75,
        difficulty_factors=["stack_height", "stability"],
        factor_weights={"stack_height": 0.6, "stability": 0.4},
        scaling={
            Difficulty.EASY: {"stack_height": 2, "stability": "high"},
            Difficulty.MEDIUM: {"stack_height": 3, "stability": "medium"},
            Difficulty.HARD: {"stack_height": 5, "stability": "low"},
        },
        base_score=140,
        base_hearts={"R": 6, "T": 4},
    ),
    "pressure_plate": ChallengeTemplate(
        mechanic_id="pressure_plate",
        constraints={
            "plate_count": Constraint(1, 4, 1),
        },
        difficulty_range=(25, 65),
        estimated_time_seconds=50,
        difficulty_factors=["plate_count", "requires_object"],
        factor_weights={"plate_count": 0.6, "requires_object": 0.4},
        scaling={
            Difficulty.EASY: {"plate_count": 1, "requires_object": False},
            Difficulty.MEDIUM: {"plate_count": 2, "requires_object": True},
            Difficulty.HARD: {"plate_count": 3, "requires_object": True},
        },
        base_score=110,
        base_hearts={"A": 5, "T": 4},
    ),
    "talk_to_npc": ChallengeTemplate(
        mechanic_id="talk_to_npc",
        constraints={},
        difficulty_range=(5, 15),
        estimated_time_seconds=20,
        difficulty_factors=[],
        factor_weights={},
        scaling={
            Difficulty.EASY: {},
            Difficulty.MEDIUM: {},
            Difficulty.HARD: {},
        },
        base_score=50,
        base_hearts={"So": 5, "E": 3},
    ),
    "trade_items": ChallengeTemplate(
        mechanic_id="trade_items",
        constraints={
            "trade_count": Constraint(1, 5, 2),
        },
        difficulty_range=(20, 50),
        estimated_time_seconds=40,
        difficulty_factors=["trade_count", "item_rarity"],
        factor_weights={"trade_count": 0.6, "item_rarity": 0.4},
        scaling={
            Difficulty.EASY: {"trade_count": 1, "item_rarity": "common"},
            Difficulty.MEDIUM: {"trade_count": 3, "item_rarity": "common"},
            Difficulty.HARD: {"trade_count": 5, "item_rarity": "rare"},
        },
        base_score=100,
        base_hearts={"So": 5, "A": 4},
    ),
    # ─── TIMED / COMBAT / SURVIVAL TEMPLATES ───────────────────────────────────
    "defend_position": ChallengeTemplate(
        mechanic_id="defend_position",
        constraints={
            "wave_count": Constraint(1, 5, 3),
            "timer_seconds": Constraint(30, 180, 90),
            "enemy_count": Constraint(1, 5, 2),
        },
        difficulty_range=(20, 80),
        estimated_time_seconds=90,
        difficulty_factors=["wave_count", "enemy_count", "timer_seconds"],
        factor_weights={"wave_count": 0.4, "enemy_count": 0.3, "timer_seconds": 0.3},
        scaling={
            Difficulty.EASY: {"wave_count": 2, "timer_seconds": 120, "enemy_count": 1},
            Difficulty.MEDIUM: {"wave_count": 3, "timer_seconds": 90, "enemy_count": 2},
            Difficulty.HARD: {"wave_count": 5, "timer_seconds": 60, "enemy_count": 3},
        },
        base_score=100,
        base_hearts={"R": 10, "T": 5},
    ),
    "attack_enemy": ChallengeTemplate(
        mechanic_id="attack_enemy",
        constraints={
            "enemy_count": Constraint(1, 5, 2),
            "timer_seconds": Constraint(30, 120, 60),
        },
        difficulty_range=(30, 90),
        estimated_time_seconds=60,
        difficulty_factors=["enemy_count", "timer_seconds"],
        factor_weights={"enemy_count": 0.6, "timer_seconds": 0.4},
        scaling={
            Difficulty.EASY: {"enemy_count": 1, "timer_seconds": 90},
            Difficulty.MEDIUM: {"enemy_count": 2, "timer_seconds": 60},
            Difficulty.HARD: {"enemy_count": 4, "timer_seconds": 45},
        },
        base_score=80,
        base_hearts={"E": 5, "T": 10},
    ),
    "find_food": ChallengeTemplate(
        mechanic_id="find_food",
        constraints={
            "food_count": Constraint(1, 6, 3),
            "timer_seconds": Constraint(30, 120, 60),
        },
        difficulty_range=(10, 60),
        estimated_time_seconds=60,
        difficulty_factors=["food_count", "timer_seconds"],
        factor_weights={"food_count": 0.5, "timer_seconds": 0.5},
        scaling={
            Difficulty.EASY: {"food_count": 2, "timer_seconds": 90},
            Difficulty.MEDIUM: {"food_count": 3, "timer_seconds": 60},
            Difficulty.HARD: {"food_count": 5, "timer_seconds": 45},
        },
        base_score=60,
        base_hearts={"R": 5, "Si": 5},
    ),
    "build_shelter": ChallengeTemplate(
        mechanic_id="build_shelter",
        constraints={
            "material_count": Constraint(2, 8, 4),
            "timer_seconds": Constraint(45, 180, 90),
        },
        difficulty_range=(20, 70),
        estimated_time_seconds=90,
        difficulty_factors=["material_count", "timer_seconds"],
        factor_weights={"material_count": 0.6, "timer_seconds": 0.4},
        scaling={
            Difficulty.EASY: {"material_count": 3, "timer_seconds": 120},
            Difficulty.MEDIUM: {"material_count": 4, "timer_seconds": 90},
            Difficulty.HARD: {"material_count": 6, "timer_seconds": 60},
        },
        base_score=80,
        base_hearts={"R": 10, "E": 5},
    ),
    "equip_item": ChallengeTemplate(
        mechanic_id="equip_item",
        constraints={
            "equipment_count": Constraint(1, 3, 1),
        },
        difficulty_range=(10, 40),
        estimated_time_seconds=30,
        difficulty_factors=["equipment_count"],
        factor_weights={"equipment_count": 1.0},
        scaling={
            Difficulty.EASY: {"equipment_count": 1},
            Difficulty.MEDIUM: {"equipment_count": 2},
            Difficulty.HARD: {"equipment_count": 3},
        },
        base_score=40,
        base_hearts={"E": 10},
    ),
}


# ═══════════════════════════════════════════════════════════════════════════════
#  MECHANIC-TEMPLATE COMPATIBILITY
# ═══════════════════════════════════════════════════════════════════════════════
# Ensures templates don't expect roles that mechanics don't provide


def validate_mechanic_template_compatibility(mechanic_id: str) -> dict:
    """
    Validate that a template is compatible with its mechanic.

    Checks:
    - Mechanic exists
    - Template constraints don't exceed mechanic limits
    - Object roles match

    Returns:
        {"valid": bool, "errors": [...], "warnings": [...]}
    """
    from app.core.mechanics import get_mechanic

    template = get_template(mechanic_id)
    if not template:
        return {
            "valid": False,
            "errors": [f"No template for mechanic: {mechanic_id}"],
            "warnings": [],
        }

    mechanic = get_mechanic(mechanic_id)
    if not mechanic:
        return {
            "valid": False,
            "errors": [f"Mechanic not found: {mechanic_id}"],
            "warnings": [],
        }

    errors = []
    warnings = []

    # Check that template constraints don't exceed mechanic limits
    for param, constraint in template.constraints.items():
        mechanic_slot = None

        # Find matching slot in mechanic
        for slot_name, slot in mechanic.object_slots.items():
            if param.startswith(slot_name) or param == "object_count":
                mechanic_slot = slot
                break

        if mechanic_slot:
            # Check constraint max doesn't exceed mechanic max
            if constraint.max_value > mechanic_slot.max_count:
                warnings.append(
                    f"Template constraint '{param}' max ({constraint.max_value}) "
                    f"exceeds mechanic slot max ({mechanic_slot.max_count})"
                )

    # Verify mechanic has object slots if template expects objects
    if template.scaling:
        for difficulty, params in template.scaling.items():
            for param, value in params.items():
                if "count" in param and isinstance(value, int):
                    if not mechanic.object_slots:
                        errors.append(
                            f"Template expects object count but mechanic has no object slots"
                        )
                        break

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
    }


def validate_all_templates() -> dict:
    """
    Validate all template-mechanic pairs.

    Returns:
        {"valid_count": int, "invalid_count": int, "results": {...}}
    """
    results = {}
    valid_count = 0
    invalid_count = 0

    for mechanic_id in CHALLENGE_TEMPLATES:
        result = validate_mechanic_template_compatibility(mechanic_id)
        results[mechanic_id] = result

        if result["valid"]:
            valid_count += 1
        else:
            invalid_count += 1

    return {
        "valid_count": valid_count,
        "invalid_count": invalid_count,
        "results": results,
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  TEMPLATE FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════


def get_template(mechanic_id: str) -> Optional[ChallengeTemplate]:
    """Get template for a mechanic."""
    return CHALLENGE_TEMPLATES.get(mechanic_id)


def get_all_templates() -> dict[str, ChallengeTemplate]:
    """Get all challenge templates."""
    return CHALLENGE_TEMPLATES


def validate_filled_challenge(filled: FilledChallenge) -> dict:
    """
    Validate a filled challenge against its template.

    Returns:
        {"valid": bool, "errors": [...], "warnings": [...], "enforced_params": {...}}
    """

    template = get_template(filled.mechanic_id)
    if not template:
        return {
            "valid": False,
            "errors": [f"No template for mechanic: {filled.mechanic_id}"],
            "warnings": [],
            "enforced_params": {},
        }

    errors = []
    warnings = []

    # Enforce constraints
    enforced_params, modifications = template.enforce_constraints(filled.params)
    for mod in modifications:
        warnings.append(f"Constraint enforced: {mod}")

    # Check required fields
    if not filled.name:
        errors.append("Challenge must have a name")

    if not filled.description:
        warnings.append("Challenge has no description")

    # Check hints
    hint_constraint = PARAMETER_CONSTRAINTS["hint_count"]
    if not hint_constraint.is_valid(len(filled.hints)):
        warnings.append(
            f"Hint count {len(filled.hints)} outside range "
            f"[{hint_constraint.min_value}, {hint_constraint.max_value}]"
        )

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "enforced_params": enforced_params,
    }


def calculate_rewards(template: ChallengeTemplate, difficulty: Difficulty) -> dict:
    """Calculate rewards based on difficulty."""

    multipliers = {
        Difficulty.EASY: 0.8,
        Difficulty.MEDIUM: 1.0,
        Difficulty.HARD: 1.5,
    }

    multiplier = multipliers.get(difficulty, 1.0)

    return {
        "score_points": int(template.base_score * multiplier),
        "hearts_reward": {
            k: int(v * multiplier) for k, v in template.base_hearts.items()
        },
    }


def create_filled_challenge(
    mechanic_id: str,
    name: str,
    description: str,
    difficulty: Difficulty,
    params: dict,
    hints: list[str] = None,
    completion_message: str = "",
) -> FilledChallenge:
    """
    Create a filled challenge with enforced constraints.
    """

    template = get_template(mechanic_id)
    if not template:
        raise ValueError(f"No template for mechanic: {mechanic_id}")

    # Enforce constraints
    enforced_params, _ = template.enforce_constraints(params)

    # Calculate rewards
    rewards = calculate_rewards(template, difficulty)

    # Calculate difficulty score
    difficulty_score = template.estimate_difficulty_score(enforced_params)

    return FilledChallenge(
        mechanic_id=mechanic_id,
        name=name,
        description=description,
        hints=hints or [],
        completion_message=completion_message,
        difficulty=difficulty,
        params=enforced_params,
        score_points=rewards["score_points"],
        hearts_reward=rewards["hearts_reward"],
        difficulty_score=difficulty_score,
        estimated_time_seconds=template.estimated_time_seconds,
    )
