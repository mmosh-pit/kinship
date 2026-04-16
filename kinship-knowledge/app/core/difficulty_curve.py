"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    DIFFICULTY CURVE GENERATOR                                 ║
║                                                                               ║
║  Enforces a proper difficulty curve across scenes.                            ║
║                                                                               ║
║  EXAMPLE CURVE:                                                               ║
║  Scene 1 → complexity 1-3 (intro)                                             ║
║  Scene 2 → complexity 2-5 (learning)                                          ║
║  Scene 3 → complexity 4-7 (challenge)                                         ║
║  Scene 4 → complexity 6-8 (mastery)                                           ║
║                                                                               ║
║  CURVE TYPES:                                                                 ║
║  • Linear: Steady increase                                                    ║
║  • Gentle: Slow start, moderate increase                                      ║
║  • Steep: Fast ramp-up                                                        ║
║  • Wave: Difficulty waves (hard → rest → harder)                              ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from dataclasses import dataclass, field
from typing import Optional
from enum import Enum
import math


# ═══════════════════════════════════════════════════════════════════════════════
#  CURVE TYPES
# ═══════════════════════════════════════════════════════════════════════════════

class CurveType(str, Enum):
    """Types of difficulty curves."""
    
    LINEAR = "linear"       # Steady increase
    GENTLE = "gentle"       # Slow start, moderate increase
    STEEP = "steep"         # Fast ramp-up
    WAVE = "wave"           # Difficulty waves
    PLATEAU = "plateau"     # Steps with flat sections
    CUSTOM = "custom"       # User-defined


class AudienceType(str, Enum):
    """Target audience types with different curve presets."""
    
    CHILDREN_6_8 = "children_6_8"
    CHILDREN_9_12 = "children_9_12"
    TEENS = "teens"
    ADULTS = "adults"
    CASUAL = "casual"
    HARDCORE = "hardcore"


# ═══════════════════════════════════════════════════════════════════════════════
#  DIFFICULTY RANGE
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class DifficultyRange:
    """Difficulty range for a scene."""
    
    min_complexity: int
    max_complexity: int
    target_complexity: int
    
    # Time expectations
    min_time_seconds: int = 30
    max_time_seconds: int = 300
    target_time_seconds: int = 60
    
    # Pass rate expectations
    expected_pass_rate: float = 0.8  # 80% of players should complete
    
    def contains(self, complexity: int) -> bool:
        """Check if complexity is within range."""
        return self.min_complexity <= complexity <= self.max_complexity
    
    def clamp(self, complexity: int) -> int:
        """Clamp complexity to range."""
        return max(self.min_complexity, min(self.max_complexity, complexity))


# ═══════════════════════════════════════════════════════════════════════════════
#  DIFFICULTY CURVE
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class DifficultyCurve:
    """Complete difficulty curve for a game."""
    
    curve_type: CurveType
    total_scenes: int
    
    # Global bounds
    min_complexity: int = 1
    max_complexity: int = 10
    
    # Scene-specific ranges
    scene_ranges: list[DifficultyRange] = field(default_factory=list)
    
    # Audience-specific settings
    audience: AudienceType = AudienceType.CASUAL
    
    def get_range(self, scene_index: int) -> Optional[DifficultyRange]:
        """Get difficulty range for a scene."""
        if 0 <= scene_index < len(self.scene_ranges):
            return self.scene_ranges[scene_index]
        return None
    
    def validate_complexity(self, scene_index: int, complexity: int) -> dict:
        """
        Validate complexity for a scene.
        
        Returns:
            {"valid": bool, "actual": int, "expected_range": (min, max), "adjustment": int}
        """
        range_obj = self.get_range(scene_index)
        if not range_obj:
            return {"valid": True, "actual": complexity, "expected_range": (1, 10), "adjustment": 0}
        
        is_valid = range_obj.contains(complexity)
        adjustment = 0
        
        if complexity < range_obj.min_complexity:
            adjustment = range_obj.min_complexity - complexity
        elif complexity > range_obj.max_complexity:
            adjustment = range_obj.max_complexity - complexity
        
        return {
            "valid": is_valid,
            "actual": complexity,
            "expected_range": (range_obj.min_complexity, range_obj.max_complexity),
            "adjustment": adjustment,
        }


# ═══════════════════════════════════════════════════════════════════════════════
#  CURVE GENERATORS
# ═══════════════════════════════════════════════════════════════════════════════

def generate_linear_curve(
    total_scenes: int,
    min_complexity: int = 1,
    max_complexity: int = 10,
) -> list[DifficultyRange]:
    """Generate a linear difficulty curve."""
    
    ranges = []
    complexity_step = (max_complexity - min_complexity) / max(1, total_scenes - 1)
    
    for i in range(total_scenes):
        base = min_complexity + (complexity_step * i)
        
        ranges.append(DifficultyRange(
            min_complexity=max(1, int(base - 1)),
            max_complexity=min(10, int(base + 2)),
            target_complexity=int(base),
            expected_pass_rate=0.95 - (i * 0.05),  # 95% → 80%
        ))
    
    return ranges


def generate_gentle_curve(
    total_scenes: int,
    min_complexity: int = 1,
    max_complexity: int = 8,
) -> list[DifficultyRange]:
    """Generate a gentle difficulty curve (slow start)."""
    
    ranges = []
    
    for i in range(total_scenes):
        # Use square root for gentle curve
        progress = i / max(1, total_scenes - 1)
        sqrt_progress = math.sqrt(progress)
        
        base = min_complexity + (max_complexity - min_complexity) * sqrt_progress
        
        ranges.append(DifficultyRange(
            min_complexity=max(1, int(base - 1)),
            max_complexity=min(10, int(base + 2)),
            target_complexity=int(base),
            expected_pass_rate=0.95 - (sqrt_progress * 0.15),
        ))
    
    return ranges


def generate_steep_curve(
    total_scenes: int,
    min_complexity: int = 2,
    max_complexity: int = 10,
) -> list[DifficultyRange]:
    """Generate a steep difficulty curve (fast ramp)."""
    
    ranges = []
    
    for i in range(total_scenes):
        # Use square for steep curve
        progress = i / max(1, total_scenes - 1)
        steep_progress = progress ** 2
        
        base = min_complexity + (max_complexity - min_complexity) * steep_progress
        
        ranges.append(DifficultyRange(
            min_complexity=max(1, int(base - 1)),
            max_complexity=min(10, int(base + 2)),
            target_complexity=int(base),
            expected_pass_rate=0.9 - (steep_progress * 0.25),
        ))
    
    return ranges


def generate_wave_curve(
    total_scenes: int,
    min_complexity: int = 2,
    max_complexity: int = 9,
    wave_amplitude: float = 2.0,
) -> list[DifficultyRange]:
    """Generate a wave difficulty curve (peaks and valleys)."""
    
    ranges = []
    
    for i in range(total_scenes):
        progress = i / max(1, total_scenes - 1)
        
        # Base increasing trend
        base = min_complexity + (max_complexity - min_complexity) * progress
        
        # Add wave pattern
        wave = math.sin(progress * math.pi * 2) * wave_amplitude
        
        # Final value (increasing overall but with waves)
        final = base + wave * (1 - progress * 0.5)  # Waves dampen as game progresses
        
        ranges.append(DifficultyRange(
            min_complexity=max(1, int(final - 1)),
            max_complexity=min(10, int(final + 2)),
            target_complexity=max(1, min(10, int(final))),
            expected_pass_rate=0.9 - (progress * 0.15),
        ))
    
    return ranges


def generate_plateau_curve(
    total_scenes: int,
    plateau_levels: list[int] = None,
    scenes_per_plateau: int = 2,
) -> list[DifficultyRange]:
    """Generate a plateau curve (steps with flat sections)."""
    
    plateau_levels = plateau_levels or [2, 4, 6, 8]
    ranges = []
    
    plateau_index = 0
    scenes_in_current = 0
    
    for i in range(total_scenes):
        if scenes_in_current >= scenes_per_plateau and plateau_index < len(plateau_levels) - 1:
            plateau_index += 1
            scenes_in_current = 0
        
        base = plateau_levels[min(plateau_index, len(plateau_levels) - 1)]
        
        ranges.append(DifficultyRange(
            min_complexity=max(1, base - 1),
            max_complexity=min(10, base + 2),
            target_complexity=base,
            expected_pass_rate=0.9 - (plateau_index * 0.1),
        ))
        
        scenes_in_current += 1
    
    return ranges


# ═══════════════════════════════════════════════════════════════════════════════
#  AUDIENCE PRESETS
# ═══════════════════════════════════════════════════════════════════════════════

AUDIENCE_PRESETS = {
    AudienceType.CHILDREN_6_8: {
        "curve_type": CurveType.GENTLE,
        "min_complexity": 1,
        "max_complexity": 5,
        "base_pass_rate": 0.95,
        "time_multiplier": 1.5,  # More time allowed
    },
    AudienceType.CHILDREN_9_12: {
        "curve_type": CurveType.GENTLE,
        "min_complexity": 1,
        "max_complexity": 7,
        "base_pass_rate": 0.9,
        "time_multiplier": 1.2,
    },
    AudienceType.TEENS: {
        "curve_type": CurveType.LINEAR,
        "min_complexity": 2,
        "max_complexity": 9,
        "base_pass_rate": 0.85,
        "time_multiplier": 1.0,
    },
    AudienceType.ADULTS: {
        "curve_type": CurveType.LINEAR,
        "min_complexity": 2,
        "max_complexity": 10,
        "base_pass_rate": 0.8,
        "time_multiplier": 1.0,
    },
    AudienceType.CASUAL: {
        "curve_type": CurveType.GENTLE,
        "min_complexity": 1,
        "max_complexity": 6,
        "base_pass_rate": 0.9,
        "time_multiplier": 1.3,
    },
    AudienceType.HARDCORE: {
        "curve_type": CurveType.STEEP,
        "min_complexity": 3,
        "max_complexity": 10,
        "base_pass_rate": 0.7,
        "time_multiplier": 0.8,  # Less time
    },
}


# ═══════════════════════════════════════════════════════════════════════════════
#  CURVE FACTORY
# ═══════════════════════════════════════════════════════════════════════════════

def create_difficulty_curve(
    total_scenes: int,
    curve_type: CurveType = CurveType.LINEAR,
    audience: AudienceType = AudienceType.CASUAL,
    min_complexity: int = None,
    max_complexity: int = None,
) -> DifficultyCurve:
    """
    Create a difficulty curve for a game.
    
    Args:
        total_scenes: Number of scenes in game
        curve_type: Type of curve
        audience: Target audience
        min_complexity: Override min complexity
        max_complexity: Override max complexity
        
    Returns:
        DifficultyCurve with scene ranges
    """
    
    # Get audience preset
    preset = AUDIENCE_PRESETS.get(audience, AUDIENCE_PRESETS[AudienceType.CASUAL])
    
    # Use preset values unless overridden
    min_c = min_complexity if min_complexity is not None else preset["min_complexity"]
    max_c = max_complexity if max_complexity is not None else preset["max_complexity"]
    curve = curve_type or preset["curve_type"]
    
    # Generate ranges based on curve type
    if curve == CurveType.LINEAR:
        ranges = generate_linear_curve(total_scenes, min_c, max_c)
    elif curve == CurveType.GENTLE:
        ranges = generate_gentle_curve(total_scenes, min_c, max_c)
    elif curve == CurveType.STEEP:
        ranges = generate_steep_curve(total_scenes, min_c, max_c)
    elif curve == CurveType.WAVE:
        ranges = generate_wave_curve(total_scenes, min_c, max_c)
    elif curve == CurveType.PLATEAU:
        ranges = generate_plateau_curve(total_scenes)
    else:
        ranges = generate_linear_curve(total_scenes, min_c, max_c)
    
    # Apply time multiplier
    time_mult = preset.get("time_multiplier", 1.0)
    for r in ranges:
        r.min_time_seconds = int(r.min_time_seconds * time_mult)
        r.max_time_seconds = int(r.max_time_seconds * time_mult)
        r.target_time_seconds = int(r.target_time_seconds * time_mult)
    
    return DifficultyCurve(
        curve_type=curve,
        total_scenes=total_scenes,
        min_complexity=min_c,
        max_complexity=max_c,
        scene_ranges=ranges,
        audience=audience,
    )


# ═══════════════════════════════════════════════════════════════════════════════
#  VALIDATION HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def validate_game_difficulty(
    scene_complexities: list[int],
    curve: DifficultyCurve,
) -> dict:
    """
    Validate that scene complexities follow the curve.
    
    Args:
        scene_complexities: List of complexity values per scene
        curve: Expected difficulty curve
        
    Returns:
        {"valid": bool, "issues": [...], "adjustments": [...]}
    """
    issues = []
    adjustments = []
    
    for i, complexity in enumerate(scene_complexities):
        result = curve.validate_complexity(i, complexity)
        
        if not result["valid"]:
            issues.append(
                f"Scene {i+1}: complexity {complexity} outside range "
                f"{result['expected_range']}"
            )
            adjustments.append({
                "scene": i,
                "current": complexity,
                "suggested": complexity + result["adjustment"],
            })
    
    return {
        "valid": len(issues) == 0,
        "issues": issues,
        "adjustments": adjustments,
    }


def suggest_mechanic_complexity_order(
    mechanics: list[str],
    mechanic_complexities: dict[str, int],
) -> list[str]:
    """
    Sort mechanics by complexity for optimal introduction order.
    
    Args:
        mechanics: List of mechanic IDs
        mechanic_complexities: Map of mechanic_id to complexity score
        
    Returns:
        Sorted list of mechanics
    """
    return sorted(
        mechanics,
        key=lambda m: mechanic_complexities.get(m, 5)
    )


def get_recommended_mechanics_for_scene(
    available_mechanics: list[str],
    mechanic_complexities: dict[str, int],
    scene_range: DifficultyRange,
    max_mechanics: int = 3,
) -> list[str]:
    """
    Get recommended mechanics for a scene based on difficulty range.
    
    Args:
        available_mechanics: Pool of mechanics to choose from
        mechanic_complexities: Complexity scores
        scene_range: Target difficulty range
        max_mechanics: Max mechanics to recommend
        
    Returns:
        List of recommended mechanics
    """
    # Filter to mechanics in range
    in_range = [
        m for m in available_mechanics
        if scene_range.contains(mechanic_complexities.get(m, 5))
    ]
    
    # Sort by closeness to target
    target = scene_range.target_complexity
    in_range.sort(
        key=lambda m: abs(mechanic_complexities.get(m, 5) - target)
    )
    
    return in_range[:max_mechanics]
