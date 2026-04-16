"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    SCENE POPULATOR                                            ║
║                                                                               ║
║  Smart object placement using algorithms (not random).                        ║
║                                                                               ║
║  ALGORITHMS:                                                                  ║
║  • Poisson Disc Sampling — Natural distribution with min spacing              ║
║  • Object Clustering — Group related objects together                         ║
║  • Path Corridor Preservation — Keep walkable paths clear                     ║
║  • Decoration Distribution — Fill zones with appropriate density              ║
║                                                                               ║
║  FLOW:                                                                        ║
║  1. Create occupancy grid                                                     ║
║  2. Reserve spawn + exit zones                                                ║
║  3. Reserve path corridors (spawn → exit)                                     ║
║  4. Place challenge objects                                                   ║
║  5. Place NPCs                                                                ║
║  6. Poisson disc sample decorations                                           ║
║  7. Cluster related decorations                                               ║
║  8. Validate final grid                                                       ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from dataclasses import dataclass, field
from typing import Optional, Callable
from enum import Enum
import random
import math


# ═══════════════════════════════════════════════════════════════════════════════
#  OCCUPANCY TYPES
# ═══════════════════════════════════════════════════════════════════════════════


class CellType(str, Enum):
    """Types of cells in the occupancy grid."""

    EMPTY = "empty"  # Can place anything
    WALKABLE = "walkable"  # Reserved for walking (corridors)
    BLOCKED = "blocked"  # Impassable (walls, water)
    OBJECT = "object"  # Has a placeable object
    NPC = "npc"  # Has an NPC
    DECORATION = "decoration"  # Has decoration (walkable)
    SPAWN = "spawn"  # Player spawn area
    EXIT = "exit"  # Exit area
    CHALLENGE = "challenge"  # Challenge zone
    HAZARD = "hazard"  # Hazard zone


# ═══════════════════════════════════════════════════════════════════════════════
#  PLACED OBJECT
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class PlacedObject:
    """An object placed in the scene."""

    object_id: str
    asset_name: str
    x: int
    y: int

    # Size
    width: int = 1
    height: int = 1

    # Properties
    cell_type: CellType = CellType.OBJECT
    is_walkable: bool = False
    is_interactable: bool = False

    # Grouping
    cluster_id: Optional[str] = None

    # Z-index for rendering
    z_index: int = 0

    # Metadata
    metadata: dict = field(default_factory=dict)


# ═══════════════════════════════════════════════════════════════════════════════
#  OCCUPANCY GRID
# ═══════════════════════════════════════════════════════════════════════════════


class OccupancyGrid:
    """
    Grid tracking what's placed where.
    """

    def __init__(self, width: int, height: int):
        self.width = width
        self.height = height

        # Cell types
        self.cells: list[list[CellType]] = [
            [CellType.EMPTY for _ in range(width)] for _ in range(height)
        ]

        # Placed objects by position
        self.objects: dict[tuple[int, int], PlacedObject] = {}

        # All placed objects list
        self.all_objects: list[PlacedObject] = []

    def in_bounds(self, x: int, y: int) -> bool:
        """Check if position is within grid."""
        return 0 <= x < self.width and 0 <= y < self.height

    def get_cell(self, x: int, y: int) -> CellType:
        """Get cell type at position."""
        if not self.in_bounds(x, y):
            return CellType.BLOCKED
        return self.cells[y][x]

    def set_cell(self, x: int, y: int, cell_type: CellType):
        """Set cell type at position."""
        if self.in_bounds(x, y):
            self.cells[y][x] = cell_type

    def is_empty(self, x: int, y: int) -> bool:
        """Check if cell is empty."""
        return self.get_cell(x, y) == CellType.EMPTY

    def is_walkable(self, x: int, y: int) -> bool:
        """Check if cell can be walked on."""
        cell = self.get_cell(x, y)
        # SPAWN and EXIT must be walkable for pathfinding to work!
        return cell in [
            CellType.EMPTY,
            CellType.WALKABLE,
            CellType.DECORATION,
            CellType.SPAWN,
            CellType.EXIT,
        ]

    def is_placeable(self, x: int, y: int, width: int = 1, height: int = 1) -> bool:
        """Check if area is available for placement."""
        for dy in range(height):
            for dx in range(width):
                if not self.is_empty(x + dx, y + dy):
                    return False
        return True

    def place_object(self, obj: PlacedObject) -> bool:
        """
        Place an object on the grid.

        Returns True if successful.
        """
        # Check if area is available
        if not self.is_placeable(obj.x, obj.y, obj.width, obj.height):
            return False

        # Mark cells
        for dy in range(obj.height):
            for dx in range(obj.width):
                self.set_cell(obj.x + dx, obj.y + dy, obj.cell_type)
                self.objects[(obj.x + dx, obj.y + dy)] = obj

        self.all_objects.append(obj)
        return True

    def reserve_area(self, x: int, y: int, radius: int, cell_type: CellType):
        """Reserve a circular area."""
        for dy in range(-radius, radius + 1):
            for dx in range(-radius, radius + 1):
                if dx * dx + dy * dy <= radius * radius:
                    nx, ny = x + dx, y + dy
                    if self.in_bounds(nx, ny) and self.is_empty(nx, ny):
                        self.set_cell(nx, ny, cell_type)

    def get_empty_cells(self) -> list[tuple[int, int]]:
        """Get all empty cell positions."""
        empty = []
        for y in range(self.height):
            for x in range(self.width):
                if self.is_empty(x, y):
                    empty.append((x, y))
        return empty

    def count_cells(self, cell_type: CellType) -> int:
        """Count cells of a specific type."""
        count = 0
        for y in range(self.height):
            for x in range(self.width):
                if self.cells[y][x] == cell_type:
                    count += 1
        return count


# ═══════════════════════════════════════════════════════════════════════════════
#  POISSON DISC SAMPLING
# ═══════════════════════════════════════════════════════════════════════════════


def poisson_disc_sampling(
    width: int,
    height: int,
    min_distance: float,
    max_attempts: int = 30,
    existing_points: list[tuple[int, int]] = None,
) -> list[tuple[int, int]]:
    """
    Generate evenly-spaced random points using Poisson disc sampling.

    This creates natural-looking distribution (like trees in a forest).

    Args:
        width: Grid width
        height: Grid height
        min_distance: Minimum distance between points
        max_attempts: Attempts before giving up on a point
        existing_points: Points already placed (to avoid)

    Returns:
        List of (x, y) positions
    """
    cell_size = min_distance / math.sqrt(2)
    grid_width = int(math.ceil(width / cell_size))
    grid_height = int(math.ceil(height / cell_size))

    # Grid to track which cell contains a point
    grid: list[list[Optional[tuple[int, int]]]] = [
        [None for _ in range(grid_width)] for _ in range(grid_height)
    ]

    points: list[tuple[int, int]] = []
    active: list[tuple[int, int]] = []

    # Add existing points to grid
    if existing_points:
        for px, py in existing_points:
            gx = int(px / cell_size)
            gy = int(py / cell_size)
            if 0 <= gx < grid_width and 0 <= gy < grid_height:
                grid[gy][gx] = (px, py)
                points.append((px, py))

    def is_valid(x: float, y: float) -> bool:
        """Check if point is valid (not too close to others)."""
        if x < 0 or x >= width or y < 0 or y >= height:
            return False

        gx = int(x / cell_size)
        gy = int(y / cell_size)

        # Check neighboring cells
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                nx, ny = gx + dx, gy + dy
                if 0 <= nx < grid_width and 0 <= ny < grid_height:
                    neighbor = grid[ny][nx]
                    if neighbor:
                        dist = math.sqrt(
                            (x - neighbor[0]) ** 2 + (y - neighbor[1]) ** 2
                        )
                        if dist < min_distance:
                            return False
        return True

    # Start with random point if no existing points
    if not points:
        start_x = random.uniform(0, width)
        start_y = random.uniform(0, height)
        start = (int(start_x), int(start_y))
        points.append(start)
        active.append(start)

        gx = int(start_x / cell_size)
        gy = int(start_y / cell_size)
        if 0 <= gx < grid_width and 0 <= gy < grid_height:
            grid[gy][gx] = start
    else:
        active = list(points)

    # Generate points
    while active:
        idx = random.randint(0, len(active) - 1)
        point = active[idx]

        found = False
        for _ in range(max_attempts):
            # Random point in annulus around current point
            angle = random.uniform(0, 2 * math.pi)
            dist = random.uniform(min_distance, 2 * min_distance)

            new_x = point[0] + dist * math.cos(angle)
            new_y = point[1] + dist * math.sin(angle)

            if is_valid(new_x, new_y):
                new_point = (int(new_x), int(new_y))
                points.append(new_point)
                active.append(new_point)

                gx = int(new_x / cell_size)
                gy = int(new_y / cell_size)
                if 0 <= gx < grid_width and 0 <= gy < grid_height:
                    grid[gy][gx] = new_point

                found = True
                break

        if not found:
            active.pop(idx)

    return points


# ═══════════════════════════════════════════════════════════════════════════════
#  PATH FINDING (BFS)
# ═══════════════════════════════════════════════════════════════════════════════


def find_path_bfs(
    grid: OccupancyGrid,
    start: tuple[int, int],
    end: tuple[int, int],
) -> Optional[list[tuple[int, int]]]:
    """
    Find path from start to end using BFS.

    Returns:
        List of positions forming path, or None if no path exists
    """
    from collections import deque

    if not grid.in_bounds(start[0], start[1]) or not grid.in_bounds(end[0], end[1]):
        return None

    queue = deque([(start, [start])])
    visited = {start}

    directions = [(0, 1), (0, -1), (1, 0), (-1, 0)]

    while queue:
        (x, y), path = queue.popleft()

        if (x, y) == end:
            return path

        for dx, dy in directions:
            nx, ny = x + dx, y + dy

            if (nx, ny) not in visited and grid.is_walkable(nx, ny):
                visited.add((nx, ny))
                queue.append(((nx, ny), path + [(nx, ny)]))

    return None


def find_path_astar(
    grid: OccupancyGrid,
    start: tuple[int, int],
    end: tuple[int, int],
    allow_blocked: bool = True,
) -> Optional[list[tuple[int, int]]]:
    """
    Find path using A* algorithm.

    Args:
        grid: Occupancy grid
        start: Start position
        end: End position
        allow_blocked: Allow traversing any cell (for corridor creation)

    Returns:
        List of positions forming path
    """
    import heapq

    if not grid.in_bounds(start[0], start[1]) or not grid.in_bounds(end[0], end[1]):
        return None

    def heuristic(a: tuple[int, int], b: tuple[int, int]) -> float:
        return abs(a[0] - b[0]) + abs(a[1] - b[1])

    open_set = [(0, start)]
    came_from: dict[tuple[int, int], tuple[int, int]] = {}
    g_score: dict[tuple[int, int], float] = {start: 0}

    directions = [(0, 1), (0, -1), (1, 0), (-1, 0)]

    while open_set:
        _, current = heapq.heappop(open_set)

        if current == end:
            # Reconstruct path
            path = [current]
            while current in came_from:
                current = came_from[current]
                path.append(current)
            return list(reversed(path))

        for dx, dy in directions:
            neighbor = (current[0] + dx, current[1] + dy)

            if not grid.in_bounds(neighbor[0], neighbor[1]):
                continue

            if not allow_blocked and not grid.is_walkable(neighbor[0], neighbor[1]):
                continue

            tentative_g = g_score[current] + 1

            if neighbor not in g_score or tentative_g < g_score[neighbor]:
                came_from[neighbor] = current
                g_score[neighbor] = tentative_g
                f_score = tentative_g + heuristic(neighbor, end)
                heapq.heappush(open_set, (f_score, neighbor))

    return None


def reserve_corridor(
    grid: OccupancyGrid,
    start: tuple[int, int],
    end: tuple[int, int],
    width: int = 2,
) -> list[tuple[int, int]]:
    """
    Reserve a corridor between two points.

    Uses L-shaped path (horizontal then vertical).

    Returns:
        List of reserved positions
    """
    reserved = []

    x0, y0 = start
    x1, y1 = end

    # Horizontal segment
    for x in range(min(x0, x1), max(x0, x1) + 1):
        for w in range(-width // 2, width // 2 + 1):
            ny = y0 + w
            if grid.in_bounds(x, ny):
                if grid.is_empty(x, ny):
                    grid.set_cell(x, ny, CellType.WALKABLE)
                    reserved.append((x, ny))

    # Vertical segment
    for y in range(min(y0, y1), max(y0, y1) + 1):
        for w in range(-width // 2, width // 2 + 1):
            nx = x1 + w
            if grid.in_bounds(nx, y):
                if grid.is_empty(nx, y):
                    grid.set_cell(nx, y, CellType.WALKABLE)
                    reserved.append((nx, y))

    return reserved


def reserve_corridor_natural(
    grid: OccupancyGrid,
    start: tuple[int, int],
    end: tuple[int, int],
    width: int = 2,
    noise_strength: float = 0.3,
    use_astar: bool = True,
) -> list[tuple[int, int]]:
    """
    Reserve a natural-looking corridor using A* with noise.

    Creates organic, winding paths instead of rigid L-shapes.

    Args:
        grid: Occupancy grid
        start: Start position
        end: End position
        width: Corridor width
        noise_strength: How much to deviate from straight line (0-1)
        use_astar: Use A* pathfinding (vs random walk)

    Returns:
        List of reserved positions
    """
    reserved = []

    if use_astar:
        # Use A* to find base path
        path = find_path_astar(grid, start, end, allow_blocked=True)

        if not path:
            # Fallback to L-shape
            return reserve_corridor(grid, start, end, width)
    else:
        # Random walk approach
        path = _random_walk_path(grid, start, end, noise_strength)

    # Apply noise to path for natural look
    noisy_path = _apply_path_noise(path, grid, noise_strength)

    # Reserve corridor along path
    for x, y in noisy_path:
        for dx in range(-width // 2, width // 2 + 1):
            for dy in range(-width // 2, width // 2 + 1):
                nx, ny = x + dx, y + dy
                if grid.in_bounds(nx, ny):
                    cell = grid.get_cell(nx, ny)
                    if cell == CellType.EMPTY:
                        grid.set_cell(nx, ny, CellType.WALKABLE)
                        reserved.append((nx, ny))

    return reserved


def _random_walk_path(
    grid: OccupancyGrid,
    start: tuple[int, int],
    end: tuple[int, int],
    noise_strength: float = 0.3,
) -> list[tuple[int, int]]:
    """
    Generate path using biased random walk.
    """
    path = [start]
    current = start
    max_steps = grid.width * grid.height

    for _ in range(max_steps):
        if current == end:
            break

        x, y = current
        tx, ty = end

        # Calculate direction toward target
        dx = 1 if tx > x else (-1 if tx < x else 0)
        dy = 1 if ty > y else (-1 if ty < y else 0)

        # Add noise
        if random.random() < noise_strength:
            # Random perpendicular movement
            if dx != 0:
                dy = random.choice([-1, 0, 1])
            else:
                dx = random.choice([-1, 0, 1])

        # Move
        nx, ny = x + dx, y + dy

        if grid.in_bounds(nx, ny):
            current = (nx, ny)
            path.append(current)

    # Ensure we reach the end
    if path[-1] != end:
        path.append(end)

    return path


def _apply_path_noise(
    path: list[tuple[int, int]],
    grid: OccupancyGrid,
    noise_strength: float = 0.3,
) -> list[tuple[int, int]]:
    """
    Apply noise to a path for natural look.
    """
    if len(path) < 3 or noise_strength == 0:
        return path

    noisy_path = [path[0]]  # Keep start

    for i in range(1, len(path) - 1):
        x, y = path[i]

        # Add small random offset
        if random.random() < noise_strength:
            offset = random.choice([-1, 0, 1])
            if random.random() < 0.5:
                x += offset
            else:
                y += offset

        if grid.in_bounds(x, y):
            noisy_path.append((x, y))
        else:
            noisy_path.append(path[i])

    noisy_path.append(path[-1])  # Keep end

    return noisy_path


# ═══════════════════════════════════════════════════════════════════════════════
#  OBJECT CLUSTERING
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class ClusterRule:
    """Rule for clustering objects together."""

    primary_type: str  # e.g., "tree"
    secondary_types: list[str]  # e.g., ["bush", "flower", "mushroom"]

    # How many secondary objects per primary
    min_secondary: int = 1
    max_secondary: int = 3

    # Distance from primary
    min_distance: float = 1.0
    max_distance: float = 3.0


# Default clustering rules
DEFAULT_CLUSTER_RULES: list[ClusterRule] = [
    ClusterRule("tree", ["bush", "flower", "mushroom"], 1, 3, 1.0, 2.5),
    ClusterRule("rock", ["pebble", "grass"], 0, 2, 0.5, 1.5),
    ClusterRule("pond", ["lily", "reed", "frog"], 1, 4, 0.5, 2.0),
    ClusterRule("house", ["fence", "barrel", "crate"], 1, 3, 1.0, 3.0),
    ClusterRule("campfire", ["log", "tent", "backpack"], 1, 2, 1.5, 3.0),
]


# ═══════════════════════════════════════════════════════════════════════════════
#  LANDMARK SYSTEM
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class LandmarkTemplate:
    """Template for a landmark (visual anchor)."""

    landmark_id: str
    primary_asset: str
    secondary_assets: list[str] = field(default_factory=list)
    radius: int = 3

    # How many secondary objects
    min_secondary: int = 1
    max_secondary: int = 3

    # Is this landmark walkable?
    walkable: bool = True


# Predefined landmarks
LANDMARKS: dict[str, LandmarkTemplate] = {
    "campfire": LandmarkTemplate(
        landmark_id="campfire",
        primary_asset="campfire",
        secondary_assets=["log", "tent", "backpack", "bedroll"],
        radius=3,
        min_secondary=2,
        max_secondary=4,
    ),
    "ruins": LandmarkTemplate(
        landmark_id="ruins",
        primary_asset="stone_ruin",
        secondary_assets=["broken_column", "moss_rock", "rubble"],
        radius=4,
        min_secondary=2,
        max_secondary=5,
    ),
    "pond": LandmarkTemplate(
        landmark_id="pond",
        primary_asset="pond",
        secondary_assets=["lily", "reed", "frog", "rock"],
        radius=3,
        min_secondary=2,
        max_secondary=4,
        walkable=False,
    ),
    "shrine": LandmarkTemplate(
        landmark_id="shrine",
        primary_asset="shrine",
        secondary_assets=["candle", "offering", "statue"],
        radius=2,
        min_secondary=1,
        max_secondary=3,
    ),
    "well": LandmarkTemplate(
        landmark_id="well",
        primary_asset="well",
        secondary_assets=["bucket", "rope", "flower"],
        radius=2,
        min_secondary=1,
        max_secondary=2,
    ),
    "market_stall": LandmarkTemplate(
        landmark_id="market_stall",
        primary_asset="stall",
        secondary_assets=["barrel", "crate", "basket", "sign"],
        radius=3,
        min_secondary=2,
        max_secondary=4,
    ),
    "crystal_cluster": LandmarkTemplate(
        landmark_id="crystal_cluster",
        primary_asset="crystal_large",
        secondary_assets=["crystal_small", "glowing_rock"],
        radius=2,
        min_secondary=2,
        max_secondary=4,
    ),
    "fallen_tree": LandmarkTemplate(
        landmark_id="fallen_tree",
        primary_asset="fallen_tree",
        secondary_assets=["mushroom", "moss", "branch"],
        radius=3,
        min_secondary=2,
        max_secondary=4,
    ),
}

# Zone-specific landmarks
ZONE_LANDMARKS: dict[str, list[str]] = {
    "forest": ["campfire", "pond", "ruins", "fallen_tree", "shrine"],
    "village": ["well", "market_stall"],
    "cave": ["crystal_cluster", "ruins"],
    "temple": ["shrine", "ruins"],
    "beach": ["campfire", "ruins"],
}


def get_landmarks_for_zone(zone_type: str) -> list[LandmarkTemplate]:
    """Get appropriate landmarks for a zone type."""
    landmark_ids = ZONE_LANDMARKS.get(zone_type, ["campfire", "ruins"])
    return [LANDMARKS[lid] for lid in landmark_ids if lid in LANDMARKS]


def place_landmark(
    grid: OccupancyGrid,
    landmark: LandmarkTemplate,
    x: int,
    y: int,
    available_assets: list[str] = None,
) -> list[PlacedObject]:
    """
    Place a landmark at the specified position.

    Args:
        grid: Occupancy grid
        landmark: Landmark template
        x, y: Center position
        available_assets: Filter to only available assets

    Returns:
        List of placed objects
    """
    placed = []

    # Check if area is available
    for dy in range(-landmark.radius, landmark.radius + 1):
        for dx in range(-landmark.radius, landmark.radius + 1):
            nx, ny = x + dx, y + dy
            if grid.in_bounds(nx, ny):
                cell = grid.get_cell(nx, ny)
                if cell not in [CellType.EMPTY, CellType.DECORATION]:
                    if dx == 0 and dy == 0:
                        return []  # Can't place primary

    # Place primary object
    primary_obj = PlacedObject(
        object_id=f"landmark_{landmark.landmark_id}_{x}_{y}",
        asset_name=landmark.primary_asset,
        x=x,
        y=y,
        cell_type=CellType.OBJECT if not landmark.walkable else CellType.DECORATION,
        is_walkable=landmark.walkable,
        is_interactable=True,
        metadata={"landmark": landmark.landmark_id},
    )

    if grid.place_object(primary_obj):
        placed.append(primary_obj)
    else:
        return []

    # Reserve area around landmark
    for dy in range(-landmark.radius, landmark.radius + 1):
        for dx in range(-landmark.radius, landmark.radius + 1):
            if dx == 0 and dy == 0:
                continue
            nx, ny = x + dx, y + dy
            if grid.in_bounds(nx, ny) and grid.is_empty(nx, ny):
                # Mark as decoration so decorations don't fill it
                grid.set_cell(nx, ny, CellType.DECORATION)

    # Filter secondary assets
    secondary = landmark.secondary_assets
    if available_assets:
        secondary = [a for a in secondary if a in available_assets]

    if not secondary:
        secondary = landmark.secondary_assets[:2]  # Fallback

    # Place secondary objects
    count = random.randint(landmark.min_secondary, landmark.max_secondary)

    for _ in range(count):
        asset_name = random.choice(secondary)

        # Find position around primary
        for attempt in range(20):
            angle = random.uniform(0, 2 * math.pi)
            dist = random.uniform(1, landmark.radius - 0.5)

            sx = int(x + dist * math.cos(angle))
            sy = int(y + dist * math.sin(angle))

            if grid.in_bounds(sx, sy):
                cell = grid.get_cell(sx, sy)
                if cell == CellType.DECORATION:  # We reserved this
                    obj = PlacedObject(
                        object_id=f"landmark_sec_{len(placed)}",
                        asset_name=asset_name,
                        x=sx,
                        y=sy,
                        cell_type=CellType.DECORATION,
                        is_walkable=True,
                        cluster_id=f"landmark_{landmark.landmark_id}",
                        metadata={
                            "rotation": random.uniform(-15, 15),
                            "scale": random.uniform(0.85, 1.15),
                        },
                    )

                    grid.objects[(sx, sy)] = obj
                    grid.all_objects.append(obj)
                    placed.append(obj)
                    break

    return placed


def calculate_landmark_count(width: int, height: int) -> int:
    """Calculate recommended landmark count based on map size."""
    area = width * height
    if area <= 256:  # 16x16
        return 1
    elif area <= 576:  # 24x24
        return 2
    else:
        return min(3, area // 256)


# ═══════════════════════════════════════════════════════════════════════════════
#  TERRAIN NOISE
# ═══════════════════════════════════════════════════════════════════════════════


def terrain_noise(x: int, y: int, scale: float = 0.15, seed: int = None) -> float:
    """
    Generate Perlin-like noise value for terrain variation.

    Uses simplified noise without external dependencies.

    Args:
        x, y: Position
        scale: Noise scale (smaller = larger features)
        seed: Random seed

    Returns:
        Value between -1 and 1
    """
    if seed is not None:
        random.seed(seed + x * 1000 + y)

    # Simple pseudo-Perlin using sin waves
    nx = x * scale
    ny = y * scale

    # Multiple octaves for more natural look
    value = 0.0
    value += math.sin(nx * 1.0 + ny * 0.5) * 0.5
    value += math.sin(nx * 2.1 - ny * 1.3) * 0.25
    value += math.sin(nx * 0.7 + ny * 2.2) * 0.25

    # Add some randomness
    value += (random.random() - 0.5) * 0.2

    return max(-1, min(1, value))


def should_place_decoration_noise(
    x: int,
    y: int,
    base_density: float,
    noise_threshold: float = 0.2,
    scale: float = 0.15,
) -> bool:
    """
    Determine if decoration should be placed based on noise.

    This creates natural patchy distribution instead of uniform.

    Args:
        x, y: Position
        base_density: Base probability
        noise_threshold: Noise value must exceed this
        scale: Noise scale

    Returns:
        True if should place decoration
    """
    noise = terrain_noise(x, y, scale)

    if noise < noise_threshold:
        return False

    # Higher noise = higher probability
    probability = base_density * (0.5 + noise * 0.5)
    return random.random() < probability


# ═══════════════════════════════════════════════════════════════════════════════
#  ZONE-BASED DECORATIONS
# ═══════════════════════════════════════════════════════════════════════════════

ZONE_DECORATIONS: dict[str, list[str]] = {
    "forest": ["tree", "bush", "flower", "mushroom", "rock", "log", "fern"],
    "village": ["barrel", "crate", "fence", "cart", "hay", "pot", "lantern"],
    "cave": ["stalactite", "crystal", "rock", "mushroom", "moss"],
    "beach": ["palm", "shell", "rock", "driftwood", "seaweed"],
    "temple": ["pillar", "statue", "torch", "urn", "plant"],
    "meadow": ["flower", "grass", "butterfly", "rock", "bush"],
    "swamp": ["dead_tree", "lily", "mushroom", "vine", "fog"],
}

ZONE_DECORATION_WEIGHTS: dict[str, dict[str, float]] = {
    "forest": {"tree": 0.4, "bush": 0.25, "flower": 0.15, "mushroom": 0.1, "rock": 0.1},
    "village": {
        "barrel": 0.2,
        "crate": 0.2,
        "fence": 0.2,
        "cart": 0.1,
        "hay": 0.15,
        "pot": 0.15,
    },
    "cave": {
        "rock": 0.4,
        "crystal": 0.2,
        "stalactite": 0.2,
        "mushroom": 0.1,
        "moss": 0.1,
    },
    "beach": {
        "shell": 0.3,
        "rock": 0.25,
        "palm": 0.2,
        "driftwood": 0.15,
        "seaweed": 0.1,
    },
}


def get_decorations_for_zone(
    zone_type: str,
    available_assets: list[str],
) -> tuple[list[str], dict[str, float]]:
    """
    Get filtered decorations and weights for a zone.

    Returns:
        (filtered_assets, weights)
    """
    zone_assets = ZONE_DECORATIONS.get(zone_type, ["rock", "bush", "flower"])
    weights = ZONE_DECORATION_WEIGHTS.get(zone_type, {})

    # Filter to available
    filtered = [a for a in available_assets if any(z in a.lower() for z in zone_assets)]

    if not filtered:
        filtered = available_assets[:5]  # Fallback

    # Build weights for filtered
    filtered_weights = {}
    for asset in filtered:
        for zone_asset, weight in weights.items():
            if zone_asset in asset.lower():
                filtered_weights[asset] = weight
                break
        if asset not in filtered_weights:
            filtered_weights[asset] = 0.1

    return filtered, filtered_weights


def cluster_objects(
    grid: OccupancyGrid,
    primary_positions: list[tuple[int, int]],
    primary_type: str,
    secondary_types: list[str],
    secondary_assets: dict[str, list[str]],
    min_secondary: int = 1,
    max_secondary: int = 3,
    min_distance: float = 1.0,
    max_distance: float = 3.0,
) -> list[PlacedObject]:
    """
    Place secondary objects clustered around primary objects.

    Args:
        grid: Occupancy grid
        primary_positions: Where primary objects are
        primary_type: Type of primary object
        secondary_types: Types of secondary objects
        secondary_assets: Map of type to available asset names
        min_secondary: Min secondary objects per primary
        max_secondary: Max secondary objects per primary
        min_distance: Min distance from primary
        max_distance: Max distance from primary

    Returns:
        List of placed secondary objects
    """
    placed = []

    for px, py in primary_positions:
        # How many secondary objects for this primary
        count = random.randint(min_secondary, max_secondary)

        for _ in range(count):
            # Choose secondary type
            sec_type = random.choice(secondary_types)

            # Get available assets for this type
            assets = secondary_assets.get(sec_type, [])
            if not assets:
                continue

            asset_name = random.choice(assets)

            # Find position around primary
            for attempt in range(20):
                angle = random.uniform(0, 2 * math.pi)
                dist = random.uniform(min_distance, max_distance)

                sx = int(px + dist * math.cos(angle))
                sy = int(py + dist * math.sin(angle))

                if grid.is_empty(sx, sy):
                    obj = PlacedObject(
                        object_id=f"cluster_{primary_type}_{len(placed)}",
                        asset_name=asset_name,
                        x=sx,
                        y=sy,
                        cell_type=CellType.DECORATION,
                        is_walkable=True,
                        cluster_id=f"{primary_type}_{px}_{py}",
                    )

                    if grid.place_object(obj):
                        placed.append(obj)
                        break

    return placed


# ═══════════════════════════════════════════════════════════════════════════════
#  DECORATION DISTRIBUTION
# ═══════════════════════════════════════════════════════════════════════════════


def distribute_decorations(
    grid: OccupancyGrid,
    decoration_assets: list[str],
    density: float = 0.3,
    min_spacing: float = 2.0,
    zone_bounds: dict = None,
    spawn_pos: tuple[int, int] = None,
    exit_pos: tuple[int, int] = None,
    edge_margin: int = 1,
    challenge_positions: list[tuple[int, int]] = None,
    landmark_positions: list[tuple[int, int, int]] = None,  # (x, y, radius)
    decoration_weights: dict[str, float] = None,
    max_decorations: int = None,
) -> list[PlacedObject]:
    """
    Distribute decorations using Poisson disc sampling.

    Args:
        grid: Occupancy grid
        decoration_assets: Available decoration asset names
        density: 0.0 to 1.0, how densely to fill
        min_spacing: Minimum distance between decorations
        zone_bounds: Optional bounds {"x": int, "y": int, "width": int, "height": int}
        spawn_pos: Spawn position to avoid
        exit_pos: Exit position to avoid
        edge_margin: Margin from edges
        challenge_positions: Challenge objects to avoid
        landmark_positions: Landmarks to avoid [(x, y, radius), ...]
        decoration_weights: Weight per decoration type
        max_decorations: Hard limit on decorations

    Returns:
        List of placed decorations
    """
    if not decoration_assets:
        return []

    # Get bounds
    if zone_bounds:
        x_start = zone_bounds.get("x", 0)
        y_start = zone_bounds.get("y", 0)
        width = zone_bounds.get("width", grid.width)
        height = zone_bounds.get("height", grid.height)
    else:
        x_start, y_start = 0, 0
        width, height = grid.width, grid.height

    # Set max decorations limit (Fix #10)
    if max_decorations is None:
        max_decorations = int(width * height * 0.25)

    # Get existing object positions
    existing = [
        (obj.x, obj.y)
        for obj in grid.all_objects
        if x_start <= obj.x < x_start + width and y_start <= obj.y < y_start + height
    ]

    # Generate candidate positions using Poisson disc
    candidates = poisson_disc_sampling(
        width,
        height,
        min_spacing,
        existing_points=[(x - x_start, y - y_start) for x, y in existing],
    )

    # Adjust back to grid coordinates
    candidates = [(x + x_start, y + y_start) for x, y in candidates]

    # Helper: check if near spawn or exit (Fix #2)
    def near_reserved(x: int, y: int, radius: int = 3) -> bool:
        if spawn_pos:
            if abs(x - spawn_pos[0]) <= radius and abs(y - spawn_pos[1]) <= radius:
                return True
        if exit_pos:
            if abs(x - exit_pos[0]) <= radius and abs(y - exit_pos[1]) <= radius:
                return True
        return False

    # Helper: check if near challenge objects (Fix #11)
    def near_challenge(x: int, y: int, avoid_radius: int = 2) -> bool:
        if not challenge_positions:
            return False
        for cx, cy in challenge_positions:
            if abs(x - cx) <= avoid_radius and abs(y - cy) <= avoid_radius:
                return True
        return False

    # Helper: check if near landmark (NEW - Decoration Avoidance Near Landmarks)
    def near_landmark(x: int, y: int) -> bool:
        if not landmark_positions:
            return False
        for lx, ly, lr in landmark_positions:
            # Avoid radius = landmark radius + 1 buffer
            avoid_radius = lr + 1
            dist = math.sqrt((x - lx) ** 2 + (y - ly) ** 2)
            if dist <= avoid_radius:
                return True
        return False

    # Helper: weighted choice (Improvement #8)
    def weighted_choice(assets: list[str], weights: dict[str, float] = None) -> str:
        if not weights:
            return random.choice(assets)

        weighted_assets = []
        total_weight = 0
        for asset in assets:
            w = weights.get(asset, 0.1)
            weighted_assets.append((asset, w))
            total_weight += w

        r = random.uniform(0, total_weight)
        cumulative = 0
        for asset, w in weighted_assets:
            cumulative += w
            if r <= cumulative:
                return asset
        return assets[0]

    # Helper: edge factor for denser edges (Improvement #3 - Edge Decoration)
    def edge_factor(x: int, y: int) -> float:
        edge_dist = min(x, y, grid.width - x - 1, grid.height - y - 1)
        return max(0, 1 - edge_dist / 5)

    # Filter candidates with all rules
    valid = []
    for x, y in candidates:
        # Fix #1 & #4: Only place in EMPTY cells (not WALKABLE corridors)
        if grid.get_cell(x, y) != CellType.EMPTY:
            continue

        # Fix #3: Enforce edge margin
        if x < edge_margin or x >= grid.width - edge_margin:
            continue
        if y < edge_margin or y >= grid.height - edge_margin:
            continue

        # Fix #2: Avoid spawn/exit areas
        if near_reserved(x, y, radius=3):
            continue

        # Fix #11: Avoid challenge objects
        if near_challenge(x, y, avoid_radius=2):
            continue

        # NEW: Avoid landmarks
        if near_landmark(x, y):
            continue

        valid.append((x, y))

    # Apply density with edge factor boost
    selected = []
    for x, y in valid:
        # Base density + edge boost
        effective_density = density + edge_factor(x, y) * 0.3
        if random.random() < effective_density:
            selected.append((x, y))

    # Apply hard limit
    if len(selected) > max_decorations:
        random.shuffle(selected)
        selected = selected[:max_decorations]

    # Place decorations with rotation/scale variation
    placed = []
    for x, y in selected:
        asset_name = weighted_choice(decoration_assets, decoration_weights)

        # Improvement #2: Add rotation and scale variation
        rotation = random.uniform(-10, 10)
        scale = random.uniform(0.9, 1.1)

        obj = PlacedObject(
            object_id=f"decoration_{len(placed)}",
            asset_name=asset_name,
            x=x,
            y=y,
            cell_type=CellType.DECORATION,
            is_walkable=True,
            metadata={
                "rotation": rotation,
                "scale": scale,
            },
        )

        if grid.place_object(obj):
            placed.append(obj)

    return placed


# ═══════════════════════════════════════════════════════════════════════════════
#  SCENE POPULATOR
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class PopulatorConfig:
    """Configuration for scene populator."""

    # Grid size
    width: int = 16
    height: int = 16

    # Spawn and exit
    spawn_pos: tuple[int, int] = (8, 14)
    exit_pos: tuple[int, int] = (8, 1)
    spawn_radius: int = 2
    exit_radius: int = 2

    # Corridor
    corridor_width: int = 2
    use_natural_corridors: bool = True  # Use A* with noise
    corridor_noise_strength: float = 0.3  # How winding (0-1)

    # Decoration
    decoration_density: float = 0.3
    decoration_min_spacing: float = 2.0
    max_decorations: int = None  # Auto-calculated if None

    # Clustering
    enable_clustering: bool = True

    # Landmarks
    enable_landmarks: bool = True
    landmark_count: int = None  # Auto-calculated if None

    # Noise
    use_terrain_noise: bool = True
    noise_threshold: float = 0.2

    # Zone
    zone_type: str = "forest"

    # Margin from edges
    edge_margin: int = 2

    # Validation
    min_spawn_exit_distance: float = 0.5  # As fraction of grid size
    min_walkable_coverage: float = 0.4  # 40% must be walkable

    # Placement attempts
    max_placement_attempts: int = 20


@dataclass
class PopulatedScene:
    """Result of scene population."""

    grid: OccupancyGrid

    # All placed objects by category
    challenge_objects: list[PlacedObject] = field(default_factory=list)
    npcs: list[PlacedObject] = field(default_factory=list)
    landmarks: list[PlacedObject] = field(default_factory=list)
    decorations: list[PlacedObject] = field(default_factory=list)

    # Reserved areas
    spawn_area: list[tuple[int, int]] = field(default_factory=list)
    exit_area: list[tuple[int, int]] = field(default_factory=list)
    corridors: list[tuple[int, int]] = field(default_factory=list)

    # Validation
    is_valid: bool = True
    path_exists: bool = True
    walkable_coverage: float = 0.0
    issues: list[str] = field(default_factory=list)


class ScenePopulator:
    """
    Main scene population engine.
    """

    def __init__(self, config: PopulatorConfig = None):
        self.config = config or PopulatorConfig()

    def _validate_spawn_exit_distance(self) -> bool:
        """Fix #12: Ensure spawn and exit are not too close."""
        cfg = self.config
        dx = cfg.exit_pos[0] - cfg.spawn_pos[0]
        dy = cfg.exit_pos[1] - cfg.spawn_pos[1]
        distance = math.sqrt(dx * dx + dy * dy)

        min_distance = max(cfg.width, cfg.height) * cfg.min_spawn_exit_distance
        return distance >= min_distance

    def _find_valid_position(
        self,
        grid: OccupancyGrid,
        start_x: int,
        start_y: int,
        avoid_corridors: bool = True,
    ) -> Optional[tuple[int, int]]:
        """Fix #5: Find valid position avoiding corridors."""
        cfg = self.config

        for dy in range(-5, 6):
            for dx in range(-5, 6):
                nx, ny = start_x + dx, start_y + dy

                if not grid.in_bounds(nx, ny):
                    continue

                cell = grid.get_cell(nx, ny)

                # Must be empty
                if cell != CellType.EMPTY:
                    continue

                # Fix #5: Avoid corridors
                if avoid_corridors and cell == CellType.WALKABLE:
                    continue

                # Respect edge margin
                if nx < cfg.edge_margin or nx >= grid.width - cfg.edge_margin:
                    continue
                if ny < cfg.edge_margin or ny >= grid.height - cfg.edge_margin:
                    continue

                return (nx, ny)

        return None

    def _post_validate(self, scene: PopulatedScene) -> None:
        """Fix #14: Post-placement validation."""
        cfg = self.config
        grid = scene.grid

        # Check walkable coverage
        total_cells = grid.width * grid.height
        walkable_count = 0

        for y in range(grid.height):
            for x in range(grid.width):
                if grid.is_walkable(x, y):
                    walkable_count += 1

        scene.walkable_coverage = walkable_count / total_cells

        if scene.walkable_coverage < cfg.min_walkable_coverage:
            scene.issues.append(
                f"Walkable coverage too low: {scene.walkable_coverage:.1%} < {cfg.min_walkable_coverage:.1%}"
            )

        # Check corridor integrity
        path = find_path_bfs(grid, cfg.spawn_pos, cfg.exit_pos)
        if not path:
            scene.is_valid = False
            scene.path_exists = False
            scene.issues.append("Corridor blocked - no path from spawn to exit!")

    def populate(
        self,
        challenge_objects: list[dict] = None,
        npc_positions: list[dict] = None,
        decoration_assets: list[str] = None,
        cluster_rules: list[ClusterRule] = None,
        waypoints: list[tuple[int, int]] = None,
        landmark_templates: list[LandmarkTemplate] = None,
    ) -> PopulatedScene:
        """
        Populate a scene with objects.

        Args:
            challenge_objects: Objects for challenges
                [{"asset_name": str, "x": int, "y": int, "type": str}, ...]
            npc_positions: NPC placements
                [{"role": str, "x": int, "y": int}, ...]
            decoration_assets: Available decoration assets
            cluster_rules: Rules for clustering decorations
            waypoints: Intermediate points for corridors
            landmark_templates: Custom landmarks to place

        Returns:
            PopulatedScene with all placements
        """
        cfg = self.config

        # Create grid
        grid = OccupancyGrid(cfg.width, cfg.height)
        result = PopulatedScene(grid=grid)

        # Fix #12: Validate spawn-exit distance
        if not self._validate_spawn_exit_distance():
            result.issues.append(
                f"Spawn and exit too close (min distance: {cfg.min_spawn_exit_distance * 100:.0f}% of grid)"
            )

        # Step 1: Reserve spawn area
        spawn_x, spawn_y = cfg.spawn_pos
        grid.reserve_area(spawn_x, spawn_y, cfg.spawn_radius, CellType.SPAWN)
        result.spawn_area = [
            (x, y)
            for y in range(cfg.height)
            for x in range(cfg.width)
            if grid.get_cell(x, y) == CellType.SPAWN
        ]

        # Step 2: Reserve exit area
        exit_x, exit_y = cfg.exit_pos
        grid.reserve_area(exit_x, exit_y, cfg.exit_radius, CellType.EXIT)
        result.exit_area = [
            (x, y)
            for y in range(cfg.height)
            for x in range(cfg.width)
            if grid.get_cell(x, y) == CellType.EXIT
        ]

        # Step 3: Reserve corridors (spawn → waypoints → exit)
        path_points = [cfg.spawn_pos]
        if waypoints:
            path_points.extend(waypoints)
        else:
            # Default: go through center
            center = (cfg.width // 2, cfg.height // 2)
            path_points.append(center)
        path_points.append(cfg.exit_pos)

        for i in range(len(path_points) - 1):
            # Use natural corridors if enabled
            if cfg.use_natural_corridors:
                corridor = reserve_corridor_natural(
                    grid,
                    path_points[i],
                    path_points[i + 1],
                    cfg.corridor_width,
                    cfg.corridor_noise_strength,
                )
            else:
                corridor = reserve_corridor(
                    grid, path_points[i], path_points[i + 1], cfg.corridor_width
                )
            result.corridors.extend(corridor)

        # Step 4: Place challenge objects (Fix #5: avoid corridors)
        challenge_positions = []
        if challenge_objects:
            for obj_data in challenge_objects:
                start_x = obj_data.get("x", cfg.width // 2)
                start_y = obj_data.get("y", cfg.height // 2)

                # Find valid position avoiding corridors
                pos = self._find_valid_position(
                    grid, start_x, start_y, avoid_corridors=True
                )

                if pos:
                    obj = PlacedObject(
                        object_id=f"challenge_{len(result.challenge_objects)}",
                        asset_name=obj_data.get("asset_name", "object"),
                        x=pos[0],
                        y=pos[1],
                        cell_type=CellType.OBJECT,
                        is_interactable=True,
                        metadata=obj_data,
                    )

                    if grid.place_object(obj):
                        result.challenge_objects.append(obj)
                        challenge_positions.append((pos[0], pos[1]))
                else:
                    result.issues.append(
                        f"Could not place challenge object: {obj_data.get('asset_name')}"
                    )

        # Step 5: Place NPCs (Fix #5: avoid corridors)
        if npc_positions:
            for npc_data in npc_positions:
                start_x = npc_data.get("x", cfg.width // 2)
                start_y = npc_data.get("y", cfg.height // 2)

                # Find valid position avoiding corridors
                pos = self._find_valid_position(
                    grid, start_x, start_y, avoid_corridors=True
                )

                if pos:
                    npc = PlacedObject(
                        object_id=f"npc_{npc_data.get('role', 'villager')}_{len(result.npcs)}",
                        asset_name=npc_data.get("asset_name", "npc"),
                        x=pos[0],
                        y=pos[1],
                        cell_type=CellType.NPC,
                        is_interactable=True,
                        metadata=npc_data,
                    )

                    if grid.place_object(npc):
                        result.npcs.append(npc)
                else:
                    result.issues.append(f"Could not place NPC: {npc_data.get('role')}")

        # Step 6: Place landmarks (NEW)
        landmark_positions = []  # Track for decoration avoidance
        if cfg.enable_landmarks:
            landmark_count = cfg.landmark_count or calculate_landmark_count(
                cfg.width, cfg.height
            )

            # Get appropriate landmarks for zone
            if landmark_templates:
                available_landmarks = landmark_templates
            else:
                available_landmarks = get_landmarks_for_zone(cfg.zone_type)

            # Helper: check if position is too close to existing landmarks
            def too_close_to_existing_landmarks(x: int, y: int, radius: int) -> bool:
                """Prevent landmarks from overlapping."""
                for lx, ly, lr in landmark_positions:
                    # Minimum distance = sum of radii + buffer
                    min_dist = radius + lr + 2
                    dist = math.sqrt((x - lx) ** 2 + (y - ly) ** 2)
                    if dist < min_dist:
                        return True
                return False

            if available_landmarks:
                for _ in range(landmark_count):
                    landmark = random.choice(available_landmarks)

                    # Find position for landmark
                    for attempt in range(cfg.max_placement_attempts):
                        lx = random.randint(
                            cfg.edge_margin + landmark.radius,
                            cfg.width - cfg.edge_margin - landmark.radius - 1,
                        )
                        ly = random.randint(
                            cfg.edge_margin + landmark.radius,
                            cfg.height - cfg.edge_margin - landmark.radius - 1,
                        )

                        # Check not too close to spawn/exit
                        spawn_dist = math.sqrt(
                            (lx - spawn_x) ** 2 + (ly - spawn_y) ** 2
                        )
                        exit_dist = math.sqrt((lx - exit_x) ** 2 + (ly - exit_y) ** 2)

                        # NEW: Check not too close to other landmarks
                        if too_close_to_existing_landmarks(lx, ly, landmark.radius):
                            continue

                        if (
                            spawn_dist > cfg.spawn_radius + landmark.radius + 2
                            and exit_dist > cfg.exit_radius + landmark.radius + 2
                        ):

                            placed = place_landmark(
                                grid, landmark, lx, ly, decoration_assets
                            )
                            if placed:
                                result.landmarks.extend(placed)
                                # Track position and radius for decoration avoidance
                                landmark_positions.append((lx, ly, landmark.radius))
                                break

        # Step 7: Distribute decorations (with all fixes including landmark avoidance)
        if decoration_assets:
            # Get zone-specific decorations and weights
            filtered_assets, weights = get_decorations_for_zone(
                cfg.zone_type, decoration_assets
            )

            decorations = distribute_decorations(
                grid,
                filtered_assets,
                density=cfg.decoration_density,
                min_spacing=cfg.decoration_min_spacing,
                spawn_pos=cfg.spawn_pos,
                exit_pos=cfg.exit_pos,
                edge_margin=cfg.edge_margin,
                challenge_positions=challenge_positions,
                landmark_positions=landmark_positions,  # NEW: Pass landmarks to avoid
                decoration_weights=weights,
                max_decorations=cfg.max_decorations,
            )
            result.decorations.extend(decorations)

        # Step 8: Apply clustering (if enabled)
        if cfg.enable_clustering and cluster_rules:
            # Find primary objects for clustering
            for rule in cluster_rules:
                primary_positions = [
                    (obj.x, obj.y)
                    for obj in result.decorations
                    if rule.primary_type in obj.asset_name.lower()
                ]

                if primary_positions:
                    # Build secondary assets dict
                    secondary_assets = {}
                    assets_to_check = decoration_assets or []
                    for sec_type in rule.secondary_types:
                        matching = [a for a in assets_to_check if sec_type in a.lower()]
                        if matching:
                            secondary_assets[sec_type] = matching

                    if secondary_assets:
                        # Add cluster radius variation (Improvement #9)
                        clustered = cluster_objects(
                            grid,
                            primary_positions,
                            rule.primary_type,
                            rule.secondary_types,
                            secondary_assets,
                            rule.min_secondary,
                            rule.max_secondary,
                            rule.min_distance * random.uniform(0.8, 1.2),
                            rule.max_distance * random.uniform(0.9, 1.1),
                        )
                        result.decorations.extend(clustered)

        # Step 9: Validate path exists
        path = find_path_bfs(grid, cfg.spawn_pos, cfg.exit_pos)
        result.path_exists = path is not None

        if not result.path_exists:
            result.is_valid = False
            result.issues.append("No valid path from spawn to exit!")

        # Step 10: Post-validation (Fix #14)
        self._post_validate(result)

        return result

    def calculate_z_indices(self, scene: PopulatedScene):
        """
        Calculate z-indices for all objects based on y-position.

        Higher y = lower z-index (objects at bottom render on top).
        """
        all_objects = (
            scene.challenge_objects + scene.npcs + scene.landmarks + scene.decorations
        )

        for obj in all_objects:
            # Base z-index on y position
            obj.z_index = obj.y * 10

            # NPCs render above decorations
            if obj.cell_type == CellType.NPC:
                obj.z_index += 5

            # Challenge objects render above decorations
            if obj.cell_type == CellType.OBJECT:
                obj.z_index += 3


# ═══════════════════════════════════════════════════════════════════════════════
#  HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════


def populate_scene(
    width: int,
    height: int,
    spawn_pos: tuple[int, int],
    exit_pos: tuple[int, int],
    challenge_objects: list[dict] = None,
    npc_positions: list[dict] = None,
    decoration_assets: list[str] = None,
    decoration_density: float = 0.3,
    enable_clustering: bool = True,
    enable_landmarks: bool = True,
    use_natural_corridors: bool = True,
    corridor_noise_strength: float = 0.3,
    zone_type: str = "forest",
) -> PopulatedScene:
    """
    Convenience function to populate a scene.

    Args:
        width, height: Scene dimensions
        spawn_pos: Player spawn position
        exit_pos: Exit position
        challenge_objects: Challenge object definitions
        npc_positions: NPC position definitions
        decoration_assets: Available decoration asset names
        decoration_density: How densely to fill with decorations
        enable_clustering: Whether to cluster decorations
        enable_landmarks: Whether to place landmarks
        use_natural_corridors: Use A* with noise for corridors
        corridor_noise_strength: How winding corridors are (0-1)
        zone_type: Zone type for decoration selection

    Returns:
        PopulatedScene with all placements
    """
    config = PopulatorConfig(
        width=width,
        height=height,
        spawn_pos=spawn_pos,
        exit_pos=exit_pos,
        decoration_density=decoration_density,
        enable_clustering=enable_clustering,
        enable_landmarks=enable_landmarks,
        use_natural_corridors=use_natural_corridors,
        corridor_noise_strength=corridor_noise_strength,
        zone_type=zone_type,
    )

    populator = ScenePopulator(config)

    scene = populator.populate(
        challenge_objects=challenge_objects,
        npc_positions=npc_positions,
        decoration_assets=decoration_assets,
        cluster_rules=DEFAULT_CLUSTER_RULES if enable_clustering else None,
    )

    populator.calculate_z_indices(scene)

    return scene


def get_scene_manifest(scene: PopulatedScene) -> dict:
    """
    Convert populated scene to manifest format.

    Returns:
        Dict ready for JSON serialization
    """
    return {
        "grid": {
            "width": scene.grid.width,
            "height": scene.grid.height,
        },
        "spawn": {
            "x": scene.spawn_area[0][0] if scene.spawn_area else 0,
            "y": scene.spawn_area[0][1] if scene.spawn_area else 0,
        },
        "exit": {
            "x": scene.exit_area[0][0] if scene.exit_area else 0,
            "y": scene.exit_area[0][1] if scene.exit_area else 0,
        },
        "objects": [
            {
                "id": obj.object_id,
                "asset": obj.asset_name,
                "x": obj.x,
                "y": obj.y,
                "z_index": obj.z_index,
                "type": obj.cell_type.value,
                "walkable": obj.is_walkable,
                "interactable": obj.is_interactable,
                "cluster_id": obj.cluster_id,
                "metadata": obj.metadata,
            }
            for obj in scene.grid.all_objects
        ],
        "landmarks": [
            {
                "id": obj.object_id,
                "asset": obj.asset_name,
                "x": obj.x,
                "y": obj.y,
            }
            for obj in scene.landmarks
            if obj.metadata.get("landmark")
        ],
        "stats": {
            "challenge_count": len(scene.challenge_objects),
            "npc_count": len(scene.npcs),
            "landmark_count": len(
                [l for l in scene.landmarks if l.metadata.get("landmark")]
            ),
            "decoration_count": len(scene.decorations),
            "corridor_tiles": len(scene.corridors),
            "walkable_coverage": scene.walkable_coverage,
        },
        "valid": scene.is_valid,
        "path_exists": scene.path_exists,
        "issues": scene.issues,
    }
