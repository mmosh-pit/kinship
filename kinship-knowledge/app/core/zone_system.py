"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    ZONE SYSTEM                                                ║
║                                                                               ║
║  Converts SEMANTIC zone descriptions to COORDINATES.                         ║
║                                                                               ║
║  AI outputs: "forest in northwest", "clearing at center"                      ║
║  System converts to: exact grid positions                                     ║
║                                                                               ║
║  FEATURES:                                                                    ║
║  • Semantic position names → coordinates                                      ║
║  • Zone influence weights for asset placement                                 ║
║  • Tile occupancy grid for collision                                          ║
║  • Pathfinding validation                                                     ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from dataclasses import dataclass, field
from typing import Optional
from enum import Enum
import random


# ═══════════════════════════════════════════════════════════════════════════════
#  ENUMS
# ═══════════════════════════════════════════════════════════════════════════════

class SemanticPosition(str, Enum):
    """Semantic position names AI can use."""
    
    NORTH = "north"
    SOUTH = "south"
    EAST = "east"
    WEST = "west"
    CENTER = "center"
    NORTHWEST = "northwest"
    NORTHEAST = "northeast"
    SOUTHWEST = "southwest"
    SOUTHEAST = "southeast"
    
    # Relative positions
    NEAR_SPAWN = "near_spawn"
    NEAR_EXIT = "near_exit"
    ALONG_PATH = "along_path"
    PERIMETER = "perimeter"


class ZoneType(str, Enum):
    """Types of zones in a scene."""
    
    SPAWN = "spawn"
    TRANSITION = "transition"
    VEGETATION_DENSE = "vegetation_dense"
    VEGETATION_SPARSE = "vegetation_sparse"
    CLEARING = "clearing"
    WATER = "water"
    PATH = "path"
    CHALLENGE = "challenge"
    NPC = "npc"
    COLLECTIBLES = "collectibles"
    HAZARD = "hazard"
    BUILDING = "building"
    DECORATION = "decoration"


class TileOccupancy(int, Enum):
    """Tile occupancy states."""
    
    EMPTY = 0
    BLOCKED = 1
    WALKABLE_OCCUPIED = 2
    HAZARD = 3


# ═══════════════════════════════════════════════════════════════════════════════
#  ZONE DEFINITION
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class ZoneInfluence:
    """Influence weights for asset placement in a zone."""
    
    # Asset category → probability weight (0.0 - 1.0)
    weights: dict[str, float] = field(default_factory=dict)
    
    # Examples:
    # vegetation_dense: {"tree": 0.7, "bush": 0.5, "flower": 0.2, "rock": 0.1}
    # clearing: {"rock": 0.4, "flower": 0.3, "tree": 0.05}


@dataclass
class Zone:
    """A zone in the scene."""
    
    zone_id: str
    zone_type: ZoneType
    
    # Position (center of zone)
    position: dict = field(default_factory=lambda: {"x": 0, "y": 0})
    
    # Size
    radius: int = 3
    width: Optional[int] = None   # If rectangular
    height: Optional[int] = None
    
    # Influence weights for asset placement
    influence: ZoneInfluence = field(default_factory=ZoneInfluence)
    
    # Constraints
    max_assets: int = 20
    min_spacing: float = 1.0


@dataclass
class SemanticZone:
    """A zone described semantically by AI."""
    
    zone_type: ZoneType
    position_name: SemanticPosition
    
    # Optional modifiers
    size: str = "medium"  # small, medium, large
    density: str = "medium"  # sparse, medium, dense
    
    # Optional specific assets
    primary_asset: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════════════════
#  POSITION CONVERSION
# ═══════════════════════════════════════════════════════════════════════════════

def semantic_to_coordinates(
    position: SemanticPosition,
    scene_width: int = 16,
    scene_height: int = 16,
    spawn: dict = None,
    exit_pos: dict = None,
) -> dict:
    """
    Convert semantic position name to grid coordinates.
    
    Args:
        position: Semantic position name
        scene_width: Scene width in tiles
        scene_height: Scene height in tiles
        spawn: Spawn position {"x": int, "y": int}
        exit_pos: Exit position {"x": int, "y": int}
        
    Returns:
        {"x": int, "y": int}
    """
    
    spawn = spawn or {"x": scene_width // 2, "y": scene_height - 2}
    exit_pos = exit_pos or {"x": scene_width // 2, "y": 2}
    
    # Calculate center and edges
    cx = scene_width // 2
    cy = scene_height // 2
    
    # Edge positions (with margin)
    margin = 2
    north_y = margin
    south_y = scene_height - margin - 1
    west_x = margin
    east_x = scene_width - margin - 1
    
    # Quarter positions
    quarter_x = scene_width // 4
    quarter_y = scene_height // 4
    
    positions = {
        SemanticPosition.NORTH: {"x": cx, "y": north_y},
        SemanticPosition.SOUTH: {"x": cx, "y": south_y},
        SemanticPosition.EAST: {"x": east_x, "y": cy},
        SemanticPosition.WEST: {"x": west_x, "y": cy},
        SemanticPosition.CENTER: {"x": cx, "y": cy},
        SemanticPosition.NORTHWEST: {"x": quarter_x, "y": quarter_y},
        SemanticPosition.NORTHEAST: {"x": scene_width - quarter_x, "y": quarter_y},
        SemanticPosition.SOUTHWEST: {"x": quarter_x, "y": scene_height - quarter_y},
        SemanticPosition.SOUTHEAST: {"x": scene_width - quarter_x, "y": scene_height - quarter_y},
        SemanticPosition.NEAR_SPAWN: {"x": spawn["x"], "y": spawn["y"] - 2},
        SemanticPosition.NEAR_EXIT: {"x": exit_pos["x"], "y": exit_pos["y"] + 2},
        SemanticPosition.ALONG_PATH: {"x": (spawn["x"] + exit_pos["x"]) // 2, "y": (spawn["y"] + exit_pos["y"]) // 2},
        SemanticPosition.PERIMETER: {"x": margin, "y": margin},  # Will be expanded to ring
    }
    
    return positions.get(position, {"x": cx, "y": cy})


def get_size_radius(size: str) -> int:
    """Convert size name to radius."""
    sizes = {
        "small": 2,
        "medium": 3,
        "large": 5,
        "huge": 7,
    }
    return sizes.get(size, 3)


def get_density_factor(density: str) -> float:
    """Convert density name to factor."""
    densities = {
        "sparse": 0.3,
        "medium": 0.6,
        "dense": 0.9,
    }
    return densities.get(density, 0.6)


# ═══════════════════════════════════════════════════════════════════════════════
#  ZONE INFLUENCE WEIGHTS
# ═══════════════════════════════════════════════════════════════════════════════

DEFAULT_ZONE_INFLUENCES: dict[ZoneType, dict[str, float]] = {
    ZoneType.VEGETATION_DENSE: {
        "tree": 0.8,
        "bush": 0.6,
        "flower": 0.3,
        "mushroom": 0.4,
        "rock": 0.2,
        "grass_tall": 0.5,
    },
    ZoneType.VEGETATION_SPARSE: {
        "tree": 0.3,
        "bush": 0.4,
        "flower": 0.5,
        "rock": 0.3,
        "grass_tall": 0.3,
    },
    ZoneType.CLEARING: {
        "tree": 0.05,
        "bush": 0.1,
        "flower": 0.4,
        "rock": 0.4,
        "grass_patch": 0.3,
    },
    ZoneType.PATH: {
        "stepping_stone": 0.6,
        "pebbles": 0.4,
        "signpost": 0.2,
        "lantern": 0.3,
    },
    ZoneType.WATER: {
        "lily_pad": 0.5,
        "reed": 0.4,
        "rock_water": 0.3,
    },
    ZoneType.BUILDING: {
        "furniture": 0.5,
        "decoration": 0.4,
        "container": 0.3,
    },
    ZoneType.HAZARD: {
        "spike": 0.5,
        "fire": 0.4,
        "pit": 0.3,
    },
    ZoneType.COLLECTIBLES: {
        "berry": 0.6,
        "coin": 0.5,
        "gem": 0.4,
        "feather": 0.3,
    },
    ZoneType.DECORATION: {
        "statue": 0.3,
        "fountain": 0.2,
        "bench": 0.3,
        "lamp": 0.4,
    },
}


def get_zone_influence(zone_type: ZoneType) -> ZoneInfluence:
    """Get default influence weights for a zone type."""
    weights = DEFAULT_ZONE_INFLUENCES.get(zone_type, {})
    return ZoneInfluence(weights=weights)


# ═══════════════════════════════════════════════════════════════════════════════
#  TILE OCCUPANCY GRID
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class OccupancyGrid:
    """
    Grid tracking tile occupancy for collision and pathfinding.
    """
    
    width: int
    height: int
    grid: list[list[TileOccupancy]] = field(default_factory=list)
    
    def __post_init__(self):
        if not self.grid:
            self.grid = [
                [TileOccupancy.EMPTY for _ in range(self.width)]
                for _ in range(self.height)
            ]
    
    def get(self, x: int, y: int) -> TileOccupancy:
        """Get occupancy at position."""
        if 0 <= x < self.width and 0 <= y < self.height:
            return self.grid[y][x]
        return TileOccupancy.BLOCKED  # Out of bounds = blocked
    
    def set(self, x: int, y: int, value: TileOccupancy):
        """Set occupancy at position."""
        if 0 <= x < self.width and 0 <= y < self.height:
            self.grid[y][x] = value
    
    def is_walkable(self, x: int, y: int) -> bool:
        """Check if tile is walkable."""
        state = self.get(x, y)
        return state in (TileOccupancy.EMPTY, TileOccupancy.WALKABLE_OCCUPIED)
    
    def is_empty(self, x: int, y: int) -> bool:
        """Check if tile is completely empty."""
        return self.get(x, y) == TileOccupancy.EMPTY
    
    def mark_blocked(self, x: int, y: int):
        """Mark tile as blocked."""
        self.set(x, y, TileOccupancy.BLOCKED)
    
    def mark_occupied(self, x: int, y: int, blocking: bool = True):
        """Mark tile as occupied."""
        self.set(x, y, TileOccupancy.BLOCKED if blocking else TileOccupancy.WALKABLE_OCCUPIED)
    
    def mark_hazard(self, x: int, y: int):
        """Mark tile as hazard."""
        self.set(x, y, TileOccupancy.HAZARD)
    
    def get_empty_tiles(self) -> list[dict]:
        """Get all empty tiles."""
        tiles = []
        for y in range(self.height):
            for x in range(self.width):
                if self.is_empty(x, y):
                    tiles.append({"x": x, "y": y})
        return tiles
    
    def get_empty_tiles_in_radius(self, cx: int, cy: int, radius: int) -> list[dict]:
        """Get empty tiles within radius of center."""
        tiles = []
        for y in range(max(0, cy - radius), min(self.height, cy + radius + 1)):
            for x in range(max(0, cx - radius), min(self.width, cx + radius + 1)):
                if self.is_empty(x, y):
                    # Check actual distance
                    dist = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
                    if dist <= radius:
                        tiles.append({"x": x, "y": y})
        return tiles


# ═══════════════════════════════════════════════════════════════════════════════
#  SEMANTIC ZONE CONVERSION
# ═══════════════════════════════════════════════════════════════════════════════

def convert_semantic_zone(
    semantic: SemanticZone,
    scene_width: int = 16,
    scene_height: int = 16,
    spawn: dict = None,
    exit_pos: dict = None,
) -> Zone:
    """
    Convert a semantic zone description to a concrete Zone.
    
    Args:
        semantic: Semantic zone from AI
        scene_width: Scene width
        scene_height: Scene height
        spawn: Spawn position
        exit_pos: Exit position
        
    Returns:
        Concrete Zone with coordinates
    """
    
    # Convert position
    position = semantic_to_coordinates(
        semantic.position_name,
        scene_width,
        scene_height,
        spawn,
        exit_pos,
    )
    
    # Convert size
    radius = get_size_radius(semantic.size)
    
    # Get influence weights
    influence = get_zone_influence(semantic.zone_type)
    
    # Adjust weights by density
    density_factor = get_density_factor(semantic.density)
    for key in influence.weights:
        influence.weights[key] *= density_factor
    
    # Calculate max assets based on size and density
    area = 3.14159 * radius * radius
    max_assets = int(area * density_factor)
    
    return Zone(
        zone_id=f"{semantic.zone_type.value}_{semantic.position_name.value}",
        zone_type=semantic.zone_type,
        position=position,
        radius=radius,
        influence=influence,
        max_assets=max_assets,
    )


def convert_all_semantic_zones(
    semantic_zones: list[SemanticZone],
    scene_width: int = 16,
    scene_height: int = 16,
    spawn: dict = None,
    exit_pos: dict = None,
) -> list[Zone]:
    """Convert all semantic zones to concrete zones."""
    
    return [
        convert_semantic_zone(sz, scene_width, scene_height, spawn, exit_pos)
        for sz in semantic_zones
    ]


# ═══════════════════════════════════════════════════════════════════════════════
#  PATHFINDING (BFS)
# ═══════════════════════════════════════════════════════════════════════════════

def bfs_reachable(
    grid: OccupancyGrid,
    start: dict,
    goal: dict,
) -> bool:
    """
    Check if goal is reachable from start using BFS.
    
    Args:
        grid: Occupancy grid
        start: Start position {"x": int, "y": int}
        goal: Goal position {"x": int, "y": int}
        
    Returns:
        True if path exists
    """
    
    from collections import deque
    
    start_pos = (start["x"], start["y"])
    goal_pos = (goal["x"], goal["y"])
    
    if start_pos == goal_pos:
        return True
    
    if not grid.is_walkable(goal["x"], goal["y"]):
        return False
    
    visited = set()
    queue = deque([start_pos])
    visited.add(start_pos)
    
    # 4-directional movement
    directions = [(0, 1), (0, -1), (1, 0), (-1, 0)]
    
    while queue:
        x, y = queue.popleft()
        
        for dx, dy in directions:
            nx, ny = x + dx, y + dy
            
            if (nx, ny) == goal_pos:
                return True
            
            if (nx, ny) not in visited and grid.is_walkable(nx, ny):
                visited.add((nx, ny))
                queue.append((nx, ny))
    
    return False


def find_all_reachable(
    grid: OccupancyGrid,
    start: dict,
) -> set[tuple[int, int]]:
    """
    Find all tiles reachable from start.
    
    Returns:
        Set of (x, y) tuples for all reachable tiles
    """
    
    from collections import deque
    
    start_pos = (start["x"], start["y"])
    
    visited = set()
    queue = deque([start_pos])
    visited.add(start_pos)
    
    directions = [(0, 1), (0, -1), (1, 0), (-1, 0)]
    
    while queue:
        x, y = queue.popleft()
        
        for dx, dy in directions:
            nx, ny = x + dx, y + dy
            
            if (nx, ny) not in visited and grid.is_walkable(nx, ny):
                visited.add((nx, ny))
                queue.append((nx, ny))
    
    return visited


def validate_zone_reachability(
    grid: OccupancyGrid,
    spawn: dict,
    zones: list[Zone],
) -> dict:
    """
    Validate that all important zones are reachable from spawn.
    
    Returns:
        {"valid": bool, "unreachable": [...], "reachable": [...]}
    """
    
    reachable_tiles = find_all_reachable(grid, spawn)
    
    reachable_zones = []
    unreachable_zones = []
    
    for zone in zones:
        pos = (zone.position["x"], zone.position["y"])
        
        # Check if any tile in zone radius is reachable
        zone_reachable = False
        for dy in range(-zone.radius, zone.radius + 1):
            for dx in range(-zone.radius, zone.radius + 1):
                if (pos[0] + dx, pos[1] + dy) in reachable_tiles:
                    zone_reachable = True
                    break
            if zone_reachable:
                break
        
        if zone_reachable:
            reachable_zones.append(zone.zone_id)
        else:
            unreachable_zones.append(zone.zone_id)
    
    return {
        "valid": len(unreachable_zones) == 0,
        "reachable": reachable_zones,
        "unreachable": unreachable_zones,
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  ZONE SPACING RULES
# ═══════════════════════════════════════════════════════════════════════════════
# Minimum distances between zone types to prevent overlap

ZONE_SPACING_RULES: dict[tuple[ZoneType, ZoneType], int] = {
    # Spawn must be far from exit
    (ZoneType.SPAWN, ZoneType.TRANSITION): 8,
    
    # Spawn must be away from challenges
    (ZoneType.SPAWN, ZoneType.CHALLENGE): 4,
    (ZoneType.SPAWN, ZoneType.HAZARD): 3,
    
    # Challenge zones need space
    (ZoneType.CHALLENGE, ZoneType.CHALLENGE): 4,
    (ZoneType.CHALLENGE, ZoneType.NPC): 2,
    
    # Hazards need buffer
    (ZoneType.HAZARD, ZoneType.SPAWN): 3,
    (ZoneType.HAZARD, ZoneType.NPC): 2,
    
    # NPCs need space from each other
    (ZoneType.NPC, ZoneType.NPC): 3,
    
    # Collectibles can be spread out
    (ZoneType.COLLECTIBLES, ZoneType.COLLECTIBLES): 2,
    
    # Buildings need space
    (ZoneType.BUILDING, ZoneType.BUILDING): 3,
    (ZoneType.BUILDING, ZoneType.SPAWN): 2,
}


def get_zone_spacing(zone_a: ZoneType, zone_b: ZoneType) -> int:
    """Get minimum spacing between two zone types."""
    # Check both orderings
    spacing = ZONE_SPACING_RULES.get((zone_a, zone_b))
    if spacing is not None:
        return spacing
    
    spacing = ZONE_SPACING_RULES.get((zone_b, zone_a))
    if spacing is not None:
        return spacing
    
    # Default minimum spacing
    return 2


def validate_zone_spacing(zones: list[Zone]) -> dict:
    """
    Validate that all zones respect spacing rules.
    
    Returns:
        {"valid": bool, "violations": [...]}
    """
    violations = []
    
    for i, zone_a in enumerate(zones):
        for zone_b in zones[i + 1:]:
            min_spacing = get_zone_spacing(zone_a.zone_type, zone_b.zone_type)
            
            # Calculate distance between zone centers
            dx = zone_a.position["x"] - zone_b.position["x"]
            dy = zone_a.position["y"] - zone_b.position["y"]
            distance = (dx ** 2 + dy ** 2) ** 0.5
            
            # Account for radii
            effective_distance = distance - zone_a.radius - zone_b.radius
            
            if effective_distance < min_spacing:
                violations.append({
                    "zone_a": zone_a.zone_id,
                    "zone_b": zone_b.zone_id,
                    "min_required": min_spacing,
                    "actual": round(effective_distance, 2),
                })
    
    return {
        "valid": len(violations) == 0,
        "violations": violations,
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  PATH CORRIDOR RESERVATION
# ═══════════════════════════════════════════════════════════════════════════════
# Reserve corridors before decorating to ensure paths remain clear

def reserve_path_corridor(
    grid: OccupancyGrid,
    start: dict,
    end: dict,
    corridor_width: int = 2,
) -> list[dict]:
    """
    Reserve a corridor path from start to end.
    
    Uses Bresenham's line algorithm with corridor width.
    Returns list of reserved tiles.
    
    Args:
        grid: Occupancy grid to modify
        start: Start position {"x": int, "y": int}
        end: End position {"x": int, "y": int}
        corridor_width: Width of corridor (default 2)
        
    Returns:
        List of reserved tile positions
    """
    reserved = []
    
    x0, y0 = start["x"], start["y"]
    x1, y1 = end["x"], end["y"]
    
    dx = abs(x1 - x0)
    dy = abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx - dy
    
    while True:
        # Reserve tiles in corridor width around this point
        half_width = corridor_width // 2
        for ox in range(-half_width, half_width + 1):
            for oy in range(-half_width, half_width + 1):
                nx, ny = x0 + ox, y0 + oy
                if 0 <= nx < grid.width and 0 <= ny < grid.height:
                    if grid.is_empty(nx, ny):
                        # Mark as walkable but occupied (reserved)
                        grid.set(nx, ny, TileOccupancy.WALKABLE_OCCUPIED)
                        reserved.append({"x": nx, "y": ny})
        
        if x0 == x1 and y0 == y1:
            break
        
        e2 = 2 * err
        if e2 > -dy:
            err -= dy
            x0 += sx
        if e2 < dx:
            err += dx
            y0 += sy
    
    return reserved


def reserve_main_corridors(
    grid: OccupancyGrid,
    spawn: dict,
    exit_pos: dict,
    waypoints: list[dict] = None,
    corridor_width: int = 2,
) -> list[dict]:
    """
    Reserve main path corridors before decoration.
    
    Creates corridors:
    - spawn → center (or waypoints) → exit
    
    Args:
        grid: Occupancy grid
        spawn: Spawn position
        exit_pos: Exit position
        waypoints: Optional intermediate points
        corridor_width: Width of corridors
        
    Returns:
        All reserved tiles
    """
    all_reserved = []
    
    # Build path through waypoints
    points = [spawn]
    if waypoints:
        points.extend(waypoints)
    else:
        # Default: go through center
        center = {"x": grid.width // 2, "y": grid.height // 2}
        points.append(center)
    points.append(exit_pos)
    
    # Reserve corridor between each pair
    for i in range(len(points) - 1):
        reserved = reserve_path_corridor(
            grid, points[i], points[i + 1], corridor_width
        )
        all_reserved.extend(reserved)
    
    return all_reserved

def calculate_z_index(x: int, y: int, scene_width: int = 16, layer_offset: int = 0) -> int:
    """
    Calculate z-index for isometric rendering.
    
    Formula: (y * width + x) * 10 + layer_offset
    
    Args:
        x: Grid X position
        y: Grid Y position
        scene_width: Scene width
        layer_offset: Additional offset for layer (ground=0, objects=1, player=2, overhead=3)
        
    Returns:
        Z-index value
    """
    return (y * scene_width + x) * 10 + layer_offset


def calculate_z_indices_for_placements(
    placements: list[dict],
    scene_width: int = 16,
) -> list[dict]:
    """
    Add z_index to all placements.
    
    Args:
        placements: List of {"x": int, "y": int, "layer": str, ...}
        scene_width: Scene width
        
    Returns:
        Placements with z_index added
    """
    
    layer_offsets = {
        "ground": 0,
        "objects": 1,
        "player": 2,
        "overhead": 3,
    }
    
    for p in placements:
        x = p.get("x", p.get("position", {}).get("x", 0))
        y = p.get("y", p.get("position", {}).get("y", 0))
        layer = p.get("layer", "objects")
        
        offset = layer_offsets.get(layer, 1)
        p["z_index"] = calculate_z_index(x, y, scene_width, offset)
    
    return placements
