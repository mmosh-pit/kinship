"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    LAYOUT PATTERNS                                            ║
║                                                                               ║
║  Scene layout strategies that define spatial organization.                    ║
║                                                                               ║
║  PATTERN TYPES:                                                               ║
║  • Hub: Central area with branches                                            ║
║  • Linear: Start to end corridor                                              ║
║  • Branching: Multiple paths                                                  ║
║  • Arena: Open central space                                                  ║
║  • Puzzle Room: Confined with objects                                         ║
║  • Maze: Complex paths                                                        ║
║                                                                               ║
║  Each pattern defines:                                                        ║
║  • Zone placements (where spawn, exit, challenges go)                         ║
║  • Corridor structure                                                         ║
║  • Decoration density by area                                                 ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


# ═══════════════════════════════════════════════════════════════════════════════
#  LAYOUT TYPES
# ═══════════════════════════════════════════════════════════════════════════════

class LayoutType(str, Enum):
    """Types of scene layouts."""
    
    HUB = "hub"                 # Central area with branches
    LINEAR = "linear"           # Start to end corridor
    BRANCHING = "branching"     # Multiple paths
    ARENA = "arena"             # Open central space
    PUZZLE_ROOM = "puzzle_room" # Confined with objects
    MAZE = "maze"               # Complex paths
    OPEN_FIELD = "open_field"   # Wide open area
    VILLAGE = "village"         # Multiple buildings


class ZonePlacement(str, Enum):
    """Standard zone placements within layouts."""
    
    SOUTH_CENTER = "south_center"   # Typical spawn
    NORTH_CENTER = "north_center"   # Typical exit
    CENTER = "center"               # Central hub
    CORNERS = "corners"             # In corners
    PERIMETER = "perimeter"         # Around edges
    SCATTERED = "scattered"         # Random throughout
    ALONG_PATH = "along_path"       # On main corridors


# ═══════════════════════════════════════════════════════════════════════════════
#  LAYOUT ZONE
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class LayoutZone:
    """A zone definition within a layout."""
    
    zone_type: str  # spawn, exit, challenge, npc, decoration, etc.
    placement: ZonePlacement
    
    # Size
    min_radius: int = 2
    max_radius: int = 4
    
    # Count (for scattered/corners)
    count: int = 1
    
    # Decoration density (0.0 - 1.0)
    decoration_density: float = 0.5
    
    # Is this zone required?
    required: bool = True
    
    # Custom position offset (optional)
    offset_x: int = 0
    offset_y: int = 0


@dataclass
class Corridor:
    """A corridor/path definition."""
    
    start_zone: str  # Zone type or "spawn"/"exit"
    end_zone: str
    
    width: int = 2
    
    # Corridor style
    style: str = "direct"  # direct, winding, stepped
    
    # Can have decorations along it?
    allow_decorations: bool = True
    decoration_density: float = 0.3


# ═══════════════════════════════════════════════════════════════════════════════
#  LAYOUT PATTERN
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class LayoutPattern:
    """Complete layout pattern definition."""
    
    pattern_id: str
    layout_type: LayoutType
    name: str
    description: str
    
    # Zones
    zones: list[LayoutZone] = field(default_factory=list)
    
    # Corridors
    corridors: list[Corridor] = field(default_factory=list)
    
    # Global decoration density
    base_decoration_density: float = 0.4
    
    # Suitable scene types
    suitable_scenes: list[str] = field(default_factory=list)
    
    # Recommended mechanics
    recommended_mechanics: list[str] = field(default_factory=list)
    
    # Size requirements
    min_width: int = 12
    min_height: int = 12
    recommended_width: int = 16
    recommended_height: int = 16


# ═══════════════════════════════════════════════════════════════════════════════
#  PREDEFINED PATTERNS
# ═══════════════════════════════════════════════════════════════════════════════

LAYOUT_PATTERNS: dict[str, LayoutPattern] = {
    
    # ─── HUB LAYOUT ────────────────────────────────────────────────────────────
    
    "hub": LayoutPattern(
        pattern_id="hub",
        layout_type=LayoutType.HUB,
        name="Hub Layout",
        description="Central area with branches leading to objectives",
        zones=[
            LayoutZone("spawn", ZonePlacement.SOUTH_CENTER, min_radius=2, max_radius=3),
            LayoutZone("hub", ZonePlacement.CENTER, min_radius=4, max_radius=5, decoration_density=0.3),
            LayoutZone("exit", ZonePlacement.NORTH_CENTER, min_radius=2, max_radius=3),
            LayoutZone("challenge", ZonePlacement.CORNERS, count=2, min_radius=3),
            LayoutZone("npc", ZonePlacement.CENTER, count=1, decoration_density=0.2),
        ],
        corridors=[
            Corridor("spawn", "hub", width=2, style="direct"),
            Corridor("hub", "exit", width=2, style="direct"),
            Corridor("hub", "challenge", width=2, style="winding"),
        ],
        base_decoration_density=0.4,
        suitable_scenes=["village", "town", "crossroads"],
        recommended_mechanics=["talk_to_npc", "collect_items", "deliver_item"],
    ),
    
    # ─── LINEAR LAYOUT ─────────────────────────────────────────────────────────
    
    "linear": LayoutPattern(
        pattern_id="linear",
        layout_type=LayoutType.LINEAR,
        name="Linear Path",
        description="Straight path from start to finish with challenges along the way",
        zones=[
            LayoutZone("spawn", ZonePlacement.SOUTH_CENTER, min_radius=2),
            LayoutZone("challenge", ZonePlacement.ALONG_PATH, count=2, min_radius=3),
            LayoutZone("npc", ZonePlacement.ALONG_PATH, count=1),
            LayoutZone("exit", ZonePlacement.NORTH_CENTER, min_radius=2),
        ],
        corridors=[
            Corridor("spawn", "challenge", width=3, style="direct"),
            Corridor("challenge", "exit", width=3, style="direct"),
        ],
        base_decoration_density=0.5,
        suitable_scenes=["path", "road", "corridor", "cave"],
        recommended_mechanics=["reach_destination", "collect_items", "avoid_hazard"],
    ),
    
    # ─── BRANCHING LAYOUT ──────────────────────────────────────────────────────
    
    "branching": LayoutPattern(
        pattern_id="branching",
        layout_type=LayoutType.BRANCHING,
        name="Branching Paths",
        description="Multiple paths to explore, converging at exit",
        zones=[
            LayoutZone("spawn", ZonePlacement.SOUTH_CENTER, min_radius=2),
            LayoutZone("branch_left", ZonePlacement.CORNERS, count=1, offset_x=-4, offset_y=-4),
            LayoutZone("branch_right", ZonePlacement.CORNERS, count=1, offset_x=4, offset_y=-4),
            LayoutZone("challenge", ZonePlacement.SCATTERED, count=2, min_radius=3),
            LayoutZone("collectible", ZonePlacement.SCATTERED, count=3),
            LayoutZone("exit", ZonePlacement.NORTH_CENTER, min_radius=2),
        ],
        corridors=[
            Corridor("spawn", "branch_left", width=2, style="winding"),
            Corridor("spawn", "branch_right", width=2, style="winding"),
            Corridor("branch_left", "exit", width=2, style="direct"),
            Corridor("branch_right", "exit", width=2, style="direct"),
        ],
        base_decoration_density=0.5,
        suitable_scenes=["forest", "ruins", "dungeon"],
        recommended_mechanics=["collect_items", "key_unlock", "push_to_target"],
    ),
    
    # ─── ARENA LAYOUT ──────────────────────────────────────────────────────────
    
    "arena": LayoutPattern(
        pattern_id="arena",
        layout_type=LayoutType.ARENA,
        name="Arena",
        description="Large open central area for combat or gathering",
        zones=[
            LayoutZone("spawn", ZonePlacement.SOUTH_CENTER, min_radius=2),
            LayoutZone("arena", ZonePlacement.CENTER, min_radius=5, max_radius=6, decoration_density=0.2),
            LayoutZone("obstacle", ZonePlacement.CENTER, count=4, min_radius=1),
            LayoutZone("exit", ZonePlacement.NORTH_CENTER, min_radius=2),
        ],
        corridors=[
            Corridor("spawn", "arena", width=3, style="direct"),
            Corridor("arena", "exit", width=3, style="direct"),
        ],
        base_decoration_density=0.3,
        suitable_scenes=["arena", "clearing", "battlefield", "plaza"],
        recommended_mechanics=["attack_enemy", "defend_position", "avoid_hazard"],
    ),
    
    # ─── PUZZLE ROOM LAYOUT ────────────────────────────────────────────────────
    
    "puzzle_room": LayoutPattern(
        pattern_id="puzzle_room",
        layout_type=LayoutType.PUZZLE_ROOM,
        name="Puzzle Room",
        description="Confined space with objects to manipulate",
        zones=[
            LayoutZone("spawn", ZonePlacement.SOUTH_CENTER, min_radius=2),
            LayoutZone("puzzle_area", ZonePlacement.CENTER, min_radius=4, decoration_density=0.1),
            LayoutZone("goal_zone", ZonePlacement.NORTH_CENTER, min_radius=2, offset_y=-2),
            LayoutZone("exit", ZonePlacement.NORTH_CENTER, min_radius=2, required=True),
        ],
        corridors=[
            Corridor("spawn", "puzzle_area", width=2, style="direct", allow_decorations=False),
            Corridor("goal_zone", "exit", width=2, style="direct", allow_decorations=False),
        ],
        base_decoration_density=0.2,
        suitable_scenes=["temple", "puzzle_room", "laboratory", "treasure_room"],
        recommended_mechanics=["push_to_target", "sequence_activate", "pressure_plate", "stack_climb"],
    ),
    
    # ─── MAZE LAYOUT ───────────────────────────────────────────────────────────
    
    "maze": LayoutPattern(
        pattern_id="maze",
        layout_type=LayoutType.MAZE,
        name="Maze",
        description="Complex winding paths with dead ends",
        zones=[
            LayoutZone("spawn", ZonePlacement.SOUTH_CENTER, min_radius=2),
            LayoutZone("dead_end", ZonePlacement.CORNERS, count=3, min_radius=2),
            LayoutZone("collectible", ZonePlacement.SCATTERED, count=5),
            LayoutZone("exit", ZonePlacement.NORTH_CENTER, min_radius=2),
        ],
        corridors=[
            Corridor("spawn", "exit", width=2, style="winding"),
        ],
        base_decoration_density=0.6,
        suitable_scenes=["maze", "hedge_maze", "cave_system", "labyrinth"],
        recommended_mechanics=["collect_all", "avoid_hazard", "key_unlock"],
        min_width=16,
        min_height=16,
    ),
    
    # ─── OPEN FIELD LAYOUT ─────────────────────────────────────────────────────
    
    "open_field": LayoutPattern(
        pattern_id="open_field",
        layout_type=LayoutType.OPEN_FIELD,
        name="Open Field",
        description="Wide open area with scattered objectives",
        zones=[
            LayoutZone("spawn", ZonePlacement.SOUTH_CENTER, min_radius=3),
            LayoutZone("collectible", ZonePlacement.SCATTERED, count=6, decoration_density=0.3),
            LayoutZone("npc", ZonePlacement.SCATTERED, count=2),
            LayoutZone("exit", ZonePlacement.NORTH_CENTER, min_radius=3),
        ],
        corridors=[],  # No corridors - open movement
        base_decoration_density=0.5,
        suitable_scenes=["field", "meadow", "plains", "beach"],
        recommended_mechanics=["collect_items", "deliver_item", "escort_npc"],
    ),
    
    # ─── VILLAGE LAYOUT ────────────────────────────────────────────────────────
    
    "village": LayoutPattern(
        pattern_id="village",
        layout_type=LayoutType.VILLAGE,
        name="Village",
        description="Multiple buildings with paths between",
        zones=[
            LayoutZone("spawn", ZonePlacement.SOUTH_CENTER, min_radius=2),
            LayoutZone("building", ZonePlacement.SCATTERED, count=4, min_radius=3, max_radius=4),
            LayoutZone("npc", ZonePlacement.SCATTERED, count=3),
            LayoutZone("merchant", ZonePlacement.CENTER, count=1),
            LayoutZone("exit", ZonePlacement.NORTH_CENTER, min_radius=2),
        ],
        corridors=[
            Corridor("spawn", "merchant", width=2, style="direct"),
            Corridor("merchant", "exit", width=2, style="direct"),
        ],
        base_decoration_density=0.4,
        suitable_scenes=["village", "town", "market", "settlement"],
        recommended_mechanics=["talk_to_npc", "trade_items", "deliver_item", "collect_items"],
    ),
}


# ═══════════════════════════════════════════════════════════════════════════════
#  PATTERN FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def get_layout_pattern(pattern_id: str) -> Optional[LayoutPattern]:
    """Get a layout pattern by ID."""
    return LAYOUT_PATTERNS.get(pattern_id)


def get_all_patterns() -> dict[str, LayoutPattern]:
    """Get all layout patterns."""
    return LAYOUT_PATTERNS


def get_patterns_for_scene_type(scene_type: str) -> list[LayoutPattern]:
    """Get patterns suitable for a scene type."""
    return [
        p for p in LAYOUT_PATTERNS.values()
        if scene_type in p.suitable_scenes
    ]


def suggest_pattern(
    scene_type: str,
    available_mechanics: list[str],
) -> Optional[LayoutPattern]:
    """
    Suggest the best pattern for a scene.
    
    Args:
        scene_type: Type of scene
        available_mechanics: What mechanics can be used
        
    Returns:
        Best matching pattern
    """
    # Get patterns for scene type
    candidates = get_patterns_for_scene_type(scene_type)
    
    if not candidates:
        candidates = list(LAYOUT_PATTERNS.values())
    
    # Score by mechanic match
    best = None
    best_score = -1
    
    for pattern in candidates:
        score = 0
        for mech in pattern.recommended_mechanics:
            if mech in available_mechanics:
                score += 1
        
        if score > best_score:
            best_score = score
            best = pattern
    
    return best


# ═══════════════════════════════════════════════════════════════════════════════
#  LAYOUT APPLICATION
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class AppliedZone:
    """A zone with computed position."""
    
    zone_type: str
    x: int
    y: int
    radius: int
    decoration_density: float


@dataclass
class AppliedCorridor:
    """A corridor with computed path."""
    
    start_x: int
    start_y: int
    end_x: int
    end_y: int
    width: int
    style: str
    path_tiles: list[dict] = field(default_factory=list)


@dataclass
class AppliedLayout:
    """A layout pattern applied to a specific scene size."""
    
    pattern: LayoutPattern
    width: int
    height: int
    
    zones: list[AppliedZone] = field(default_factory=list)
    corridors: list[AppliedCorridor] = field(default_factory=list)
    
    # Spawn and exit positions
    spawn: dict = field(default_factory=lambda: {"x": 0, "y": 0})
    exit: dict = field(default_factory=lambda: {"x": 0, "y": 0})


def apply_layout_pattern(
    pattern: LayoutPattern,
    width: int,
    height: int,
) -> AppliedLayout:
    """
    Apply a layout pattern to a specific scene size.
    
    Args:
        pattern: Layout pattern to apply
        width: Scene width
        height: Scene height
        
    Returns:
        AppliedLayout with computed positions
    """
    applied = AppliedLayout(
        pattern=pattern,
        width=width,
        height=height,
    )
    
    center_x = width // 2
    center_y = height // 2
    
    # Apply zones
    for zone in pattern.zones:
        positions = _compute_zone_positions(zone, width, height, center_x, center_y)
        
        for pos in positions:
            radius = (zone.min_radius + zone.max_radius) // 2
            
            applied_zone = AppliedZone(
                zone_type=zone.zone_type,
                x=pos["x"],
                y=pos["y"],
                radius=radius,
                decoration_density=zone.decoration_density,
            )
            applied.zones.append(applied_zone)
            
            # Track spawn and exit
            if zone.zone_type == "spawn":
                applied.spawn = {"x": pos["x"], "y": pos["y"]}
            elif zone.zone_type == "exit":
                applied.exit = {"x": pos["x"], "y": pos["y"]}
    
    # Apply corridors
    for corridor in pattern.corridors:
        start_pos = _find_zone_position(applied.zones, corridor.start_zone, applied.spawn)
        end_pos = _find_zone_position(applied.zones, corridor.end_zone, applied.exit)
        
        if start_pos and end_pos:
            path = _compute_corridor_path(
                start_pos, end_pos,
                corridor.width, corridor.style,
                width, height
            )
            
            applied_corridor = AppliedCorridor(
                start_x=start_pos["x"],
                start_y=start_pos["y"],
                end_x=end_pos["x"],
                end_y=end_pos["y"],
                width=corridor.width,
                style=corridor.style,
                path_tiles=path,
            )
            applied.corridors.append(applied_corridor)
    
    return applied


def _compute_zone_positions(
    zone: LayoutZone,
    width: int,
    height: int,
    center_x: int,
    center_y: int,
) -> list[dict]:
    """Compute positions for a zone based on placement type."""
    
    positions = []
    margin = 2
    
    if zone.placement == ZonePlacement.SOUTH_CENTER:
        positions.append({"x": center_x + zone.offset_x, "y": height - margin - 1 + zone.offset_y})
    
    elif zone.placement == ZonePlacement.NORTH_CENTER:
        positions.append({"x": center_x + zone.offset_x, "y": margin + zone.offset_y})
    
    elif zone.placement == ZonePlacement.CENTER:
        positions.append({"x": center_x + zone.offset_x, "y": center_y + zone.offset_y})
    
    elif zone.placement == ZonePlacement.CORNERS:
        corners = [
            {"x": margin + 2, "y": margin + 2},
            {"x": width - margin - 2, "y": margin + 2},
            {"x": margin + 2, "y": height - margin - 2},
            {"x": width - margin - 2, "y": height - margin - 2},
        ]
        for i in range(min(zone.count, len(corners))):
            positions.append(corners[i])
    
    elif zone.placement == ZonePlacement.PERIMETER:
        # Distribute around perimeter
        step = (2 * width + 2 * height) // max(1, zone.count)
        for i in range(zone.count):
            pos = i * step
            if pos < width:
                positions.append({"x": pos, "y": margin})
            elif pos < width + height:
                positions.append({"x": width - margin, "y": pos - width})
            elif pos < 2 * width + height:
                positions.append({"x": 2 * width + height - pos, "y": height - margin})
            else:
                positions.append({"x": margin, "y": 2 * width + 2 * height - pos})
    
    elif zone.placement == ZonePlacement.SCATTERED:
        import random
        for _ in range(zone.count):
            positions.append({
                "x": random.randint(margin + 2, width - margin - 3),
                "y": random.randint(margin + 2, height - margin - 3),
            })
    
    elif zone.placement == ZonePlacement.ALONG_PATH:
        # Distribute along center vertical
        step = (height - 2 * margin) // max(1, zone.count + 1)
        for i in range(zone.count):
            positions.append({
                "x": center_x + (i % 2) * 3 - 1,  # Alternate left/right of center
                "y": margin + step * (i + 1),
            })
    
    return positions


def _find_zone_position(
    zones: list[AppliedZone],
    zone_type: str,
    default: dict,
) -> dict:
    """Find position of a zone type, or return default."""
    for zone in zones:
        if zone.zone_type == zone_type:
            return {"x": zone.x, "y": zone.y}
    return default


def _compute_corridor_path(
    start: dict,
    end: dict,
    width: int,
    style: str,
    scene_width: int,
    scene_height: int,
) -> list[dict]:
    """Compute corridor path tiles."""
    
    path = []
    
    x0, y0 = start["x"], start["y"]
    x1, y1 = end["x"], end["y"]
    
    if style == "direct":
        # Bresenham's line
        dx = abs(x1 - x0)
        dy = abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx - dy
        
        x, y = x0, y0
        while True:
            # Add corridor width
            for ox in range(-width // 2, width // 2 + 1):
                for oy in range(-width // 2, width // 2 + 1):
                    nx, ny = x + ox, y + oy
                    if 0 <= nx < scene_width and 0 <= ny < scene_height:
                        path.append({"x": nx, "y": ny})
            
            if x == x1 and y == y1:
                break
            
            e2 = 2 * err
            if e2 > -dy:
                err -= dy
                x += sx
            if e2 < dx:
                err += dx
                y += sy
    
    elif style == "winding":
        # L-shaped path (go horizontal then vertical)
        # Horizontal segment
        for x in range(min(x0, x1), max(x0, x1) + 1):
            for oy in range(-width // 2, width // 2 + 1):
                ny = y0 + oy
                if 0 <= ny < scene_height:
                    path.append({"x": x, "y": ny})
        
        # Vertical segment
        for y in range(min(y0, y1), max(y0, y1) + 1):
            for ox in range(-width // 2, width // 2 + 1):
                nx = x1 + ox
                if 0 <= nx < scene_width:
                    path.append({"x": nx, "y": y})
    
    return path
