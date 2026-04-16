"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    MECHANIC GRAPH                                             ║
║                                                                               ║
║  Graph representation of mechanic relationships.                              ║
║  Allows the Game Loop Generator to build logical sequences                    ║
║  instead of random ones.                                                      ║
║                                                                               ║
║  Without graph: AI guesses gameplay flow                                      ║
║  With graph: System constructs gameplay flow                                  ║
║                                                                               ║
║  EDGE TYPES:                                                                  ║
║  • leads_to: Natural progression (talk → collect)                             ║
║  • enables: Completion unlocks next (key_unlock → reach_destination)          ║
║  • combines_with: Can be done together (push + pressure_plate)                ║
║  • requires: Must be done first (collect → deliver)                           ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from dataclasses import dataclass, field
from typing import Optional
from enum import Enum
from collections import defaultdict


# ═══════════════════════════════════════════════════════════════════════════════
#  EDGE TYPES
# ═══════════════════════════════════════════════════════════════════════════════

class EdgeType(str, Enum):
    """Types of edges in the mechanic graph."""
    
    LEADS_TO = "leads_to"       # Natural progression flow
    ENABLES = "enables"         # Completion unlocks next
    COMBINES_WITH = "combines"  # Can be done together
    REQUIRES = "requires"       # Must be done first (dependency)
    TEACHES = "teaches"         # Tutorial for another mechanic


# ═══════════════════════════════════════════════════════════════════════════════
#  GRAPH EDGE
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class MechanicEdge:
    """An edge connecting two mechanics."""
    
    source: str
    target: str
    edge_type: EdgeType
    
    # Weight for pathfinding (higher = preferred)
    weight: float = 1.0
    
    # Is this edge required or optional?
    required: bool = False
    
    # Context/reason for this edge
    reason: str = ""


# ═══════════════════════════════════════════════════════════════════════════════
#  MECHANIC GRAPH
# ═══════════════════════════════════════════════════════════════════════════════

class MechanicGraph:
    """
    Directed graph of mechanic relationships.
    
    Nodes: Mechanic IDs
    Edges: Relationships between mechanics
    """
    
    def __init__(self):
        # Adjacency list: source → list of edges
        self.edges: dict[str, list[MechanicEdge]] = defaultdict(list)
        
        # Reverse adjacency: target → list of edges leading to it
        self.reverse_edges: dict[str, list[MechanicEdge]] = defaultdict(list)
        
        # All mechanics in graph
        self.nodes: set[str] = set()
        
        # Entry points (mechanics that can start a sequence)
        self.entry_points: set[str] = set()
        
        # Exit points (mechanics that can end a sequence)
        self.exit_points: set[str] = set()
    
    def add_edge(self, edge: MechanicEdge):
        """Add an edge to the graph."""
        self.edges[edge.source].append(edge)
        self.reverse_edges[edge.target].append(edge)
        self.nodes.add(edge.source)
        self.nodes.add(edge.target)
    
    def add_edges(self, edges: list[MechanicEdge]):
        """Add multiple edges."""
        for edge in edges:
            self.add_edge(edge)
    
    def set_entry_points(self, mechanics: list[str]):
        """Set entry point mechanics."""
        self.entry_points = set(mechanics)
    
    def set_exit_points(self, mechanics: list[str]):
        """Set exit point mechanics."""
        self.exit_points = set(mechanics)
    
    def get_outgoing(self, mechanic: str, edge_type: EdgeType = None) -> list[MechanicEdge]:
        """Get outgoing edges from a mechanic."""
        edges = self.edges.get(mechanic, [])
        if edge_type:
            edges = [e for e in edges if e.edge_type == edge_type]
        return edges
    
    def get_incoming(self, mechanic: str, edge_type: EdgeType = None) -> list[MechanicEdge]:
        """Get incoming edges to a mechanic."""
        edges = self.reverse_edges.get(mechanic, [])
        if edge_type:
            edges = [e for e in edges if e.edge_type == edge_type]
        return edges
    
    def get_next_mechanics(self, mechanic: str) -> list[str]:
        """Get all mechanics that can follow this one."""
        return [e.target for e in self.get_outgoing(mechanic)]
    
    def get_prev_mechanics(self, mechanic: str) -> list[str]:
        """Get all mechanics that can precede this one."""
        return [e.source for e in self.get_incoming(mechanic)]
    
    def get_required_before(self, mechanic: str) -> list[str]:
        """Get mechanics that MUST come before this one."""
        return [
            e.source for e in self.get_incoming(mechanic, EdgeType.REQUIRES)
        ]
    
    def get_enabled_by(self, mechanic: str) -> list[str]:
        """Get mechanics that this one enables."""
        return [
            e.target for e in self.get_outgoing(mechanic, EdgeType.ENABLES)
        ]
    
    def can_combine(self, mech_a: str, mech_b: str) -> bool:
        """Check if two mechanics can be combined."""
        for edge in self.get_outgoing(mech_a, EdgeType.COMBINES_WITH):
            if edge.target == mech_b:
                return True
        for edge in self.get_outgoing(mech_b, EdgeType.COMBINES_WITH):
            if edge.target == mech_a:
                return True
        return False
    
    def find_path(
        self,
        start: str,
        end: str,
        max_length: int = 10,
    ) -> Optional[list[str]]:
        """
        Find a path from start to end mechanic.
        Uses BFS for shortest path.
        
        Returns:
            List of mechanics from start to end, or None if no path exists
        """
        if start not in self.nodes or end not in self.nodes:
            return None
        
        if start == end:
            return [start]
        
        # BFS
        from collections import deque
        
        queue = deque([(start, [start])])
        visited = {start}
        
        while queue:
            current, path = queue.popleft()
            
            if len(path) > max_length:
                continue
            
            for edge in self.get_outgoing(current):
                next_mech = edge.target
                
                if next_mech == end:
                    return path + [next_mech]
                
                if next_mech not in visited:
                    visited.add(next_mech)
                    queue.append((next_mech, path + [next_mech]))
        
        return None
    
    def find_all_paths(
        self,
        start: str,
        end: str,
        max_length: int = 6,
    ) -> list[list[str]]:
        """
        Find all paths from start to end (up to max_length).
        """
        if start not in self.nodes or end not in self.nodes:
            return []
        
        all_paths = []
        
        def dfs(current: str, path: list[str], visited: set):
            if len(path) > max_length:
                return
            
            if current == end:
                all_paths.append(path.copy())
                return
            
            for edge in self.get_outgoing(current):
                next_mech = edge.target
                if next_mech not in visited:
                    visited.add(next_mech)
                    path.append(next_mech)
                    dfs(next_mech, path, visited)
                    path.pop()
                    visited.remove(next_mech)
        
        dfs(start, [start], {start})
        return all_paths
    
    def generate_sequence(
        self,
        start: str,
        length: int = 4,
        available_mechanics: set[str] = None,
        prefer_edge_types: list[EdgeType] = None,
    ) -> list[str]:
        """
        Generate a logical sequence of mechanics starting from start.
        
        Args:
            start: Starting mechanic
            length: Desired sequence length
            available_mechanics: Only use these mechanics (if provided)
            prefer_edge_types: Prefer these edge types
            
        Returns:
            List of mechanics forming a logical sequence
        """
        if start not in self.nodes:
            return [start] if start else []
        
        prefer_edge_types = prefer_edge_types or [
            EdgeType.LEADS_TO,
            EdgeType.ENABLES,
            EdgeType.REQUIRES,
        ]
        
        sequence = [start]
        current = start
        visited = {start}
        
        while len(sequence) < length:
            # Get outgoing edges, filtered by available mechanics
            edges = self.get_outgoing(current)
            
            if available_mechanics:
                edges = [e for e in edges if e.target in available_mechanics]
            
            # Filter out visited
            edges = [e for e in edges if e.target not in visited]
            
            if not edges:
                break
            
            # Score edges by preference
            def score_edge(edge: MechanicEdge) -> float:
                base = edge.weight
                if edge.edge_type in prefer_edge_types:
                    base += 1.0
                if edge.required:
                    base += 0.5
                return base
            
            edges.sort(key=score_edge, reverse=True)
            
            # Pick best edge
            best_edge = edges[0]
            next_mech = best_edge.target
            
            sequence.append(next_mech)
            visited.add(next_mech)
            current = next_mech
        
        return sequence
    
    def validate_sequence(self, sequence: list[str]) -> dict:
        """
        Validate that a sequence follows graph rules.
        
        Returns:
            {"valid": bool, "errors": [...], "warnings": [...]}
        """
        errors = []
        warnings = []
        
        for i in range(len(sequence) - 1):
            current = sequence[i]
            next_mech = sequence[i + 1]
            
            # Check if edge exists
            edges = self.get_outgoing(current)
            edge_to_next = None
            
            for edge in edges:
                if edge.target == next_mech:
                    edge_to_next = edge
                    break
            
            if not edge_to_next:
                warnings.append(
                    f"No direct edge from '{current}' to '{next_mech}'"
                )
        
        # Check required dependencies
        seen = set()
        for mech in sequence:
            required = self.get_required_before(mech)
            for req in required:
                if req not in seen:
                    errors.append(
                        f"'{mech}' requires '{req}' before it, but '{req}' not in sequence"
                    )
            seen.add(mech)
        
        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
        }


# ═══════════════════════════════════════════════════════════════════════════════
#  DEFAULT MECHANIC GRAPH
# ═══════════════════════════════════════════════════════════════════════════════

def build_default_graph() -> MechanicGraph:
    """Build the default mechanic relationship graph."""
    
    graph = MechanicGraph()
    
    # ─── ENTRY POINTS ──────────────────────────────────────────────────────────
    graph.set_entry_points([
        "talk_to_npc",
        "collect_items",
        "reach_destination",
    ])
    
    # ─── EXIT POINTS ───────────────────────────────────────────────────────────
    graph.set_exit_points([
        "reach_destination",
        "deliver_item",
        "trade_items",
    ])
    
    # ─── LEADS_TO EDGES (Natural Flow) ─────────────────────────────────────────
    leads_to_edges = [
        # NPC interactions lead to quests
        MechanicEdge("talk_to_npc", "collect_items", EdgeType.LEADS_TO, 1.0,
                     reason="NPC gives collection quest"),
        MechanicEdge("talk_to_npc", "deliver_item", EdgeType.LEADS_TO, 0.9,
                     reason="NPC asks for delivery"),
        MechanicEdge("talk_to_npc", "key_unlock", EdgeType.LEADS_TO, 0.8,
                     reason="NPC hints about locked area"),
        
        # Collection leads to delivery/trade
        MechanicEdge("collect_items", "deliver_item", EdgeType.LEADS_TO, 1.0,
                     reason="Collect then deliver"),
        MechanicEdge("collect_items", "trade_items", EdgeType.LEADS_TO, 0.9,
                     reason="Collect items to trade"),
        MechanicEdge("collect_items", "key_unlock", EdgeType.LEADS_TO, 0.7,
                     reason="Collect key"),
        
        # Push puzzles lead to more complex puzzles
        MechanicEdge("push_to_target", "pressure_plate", EdgeType.LEADS_TO, 0.9,
                     reason="Push to plate"),
        MechanicEdge("push_to_target", "bridge_gap", EdgeType.LEADS_TO, 0.8,
                     reason="Push to create bridge"),
        MechanicEdge("push_to_target", "stack_climb", EdgeType.LEADS_TO, 0.7,
                     reason="Push then stack"),
        
        # Unlock leads to progression
        MechanicEdge("key_unlock", "reach_destination", EdgeType.LEADS_TO, 1.0,
                     reason="Unlock then proceed"),
        MechanicEdge("key_unlock", "collect_all", EdgeType.LEADS_TO, 0.8,
                     reason="Unlock access to hidden items"),
        
        # Lever/plates lead to unlock
        MechanicEdge("lever_activate", "reach_destination", EdgeType.LEADS_TO, 0.9,
                     reason="Lever opens path"),
        MechanicEdge("pressure_plate", "reach_destination", EdgeType.LEADS_TO, 0.9,
                     reason="Plate opens path"),
        MechanicEdge("sequence_activate", "key_unlock", EdgeType.LEADS_TO, 0.8,
                     reason="Sequence reveals key"),
        
        # Hazard navigation
        MechanicEdge("avoid_hazard", "reach_destination", EdgeType.LEADS_TO, 1.0,
                     reason="Navigate hazards to goal"),
        MechanicEdge("bridge_gap", "reach_destination", EdgeType.LEADS_TO, 1.0,
                     reason="Bridge then cross"),
        
        # Delivery completes quest
        MechanicEdge("deliver_item", "talk_to_npc", EdgeType.LEADS_TO, 0.8,
                     reason="Deliver and report back"),
        MechanicEdge("deliver_item", "reach_destination", EdgeType.LEADS_TO, 0.9,
                     reason="Deliver then proceed"),
        
        # Trade leads to progression
        MechanicEdge("trade_items", "key_unlock", EdgeType.LEADS_TO, 0.8,
                     reason="Trade for key"),
        MechanicEdge("trade_items", "reach_destination", EdgeType.LEADS_TO, 0.7,
                     reason="Trade then proceed"),
    ]
    
    # ─── ENABLES EDGES (Unlocking) ─────────────────────────────────────────────
    enables_edges = [
        MechanicEdge("key_unlock", "reach_destination", EdgeType.ENABLES, 1.0, True,
                     reason="Key unlocks path"),
        MechanicEdge("lever_activate", "reach_destination", EdgeType.ENABLES, 1.0, True,
                     reason="Lever opens gate"),
        MechanicEdge("bridge_gap", "reach_destination", EdgeType.ENABLES, 1.0, True,
                     reason="Bridge enables crossing"),
        MechanicEdge("sequence_activate", "key_unlock", EdgeType.ENABLES, 0.9,
                     reason="Sequence reveals key location"),
        MechanicEdge("pressure_plate", "reach_destination", EdgeType.ENABLES, 1.0, True,
                     reason="Plate opens path"),
        MechanicEdge("stack_climb", "collect_all", EdgeType.ENABLES, 0.8,
                     reason="Stack to reach high items"),
    ]
    
    # ─── REQUIRES EDGES (Dependencies) ─────────────────────────────────────────
    requires_edges = [
        MechanicEdge("deliver_item", "collect_items", EdgeType.REQUIRES, 1.0, True,
                     reason="Must collect before delivering"),
        MechanicEdge("trade_items", "collect_items", EdgeType.REQUIRES, 1.0, True,
                     reason="Must have items to trade"),
        MechanicEdge("stack_climb", "push_to_target", EdgeType.REQUIRES, 0.8,
                     reason="Stacking often needs pushing first"),
        MechanicEdge("escort_npc", "talk_to_npc", EdgeType.REQUIRES, 1.0, True,
                     reason="Must talk to NPC before escorting"),
    ]
    
    # ─── COMBINES_WITH EDGES (Can do together) ─────────────────────────────────
    combines_edges = [
        MechanicEdge("push_to_target", "pressure_plate", EdgeType.COMBINES_WITH, 1.0,
                     reason="Push objects onto plates"),
        MechanicEdge("collect_items", "avoid_hazard", EdgeType.COMBINES_WITH, 0.8,
                     reason="Collect while avoiding hazards"),
        MechanicEdge("push_to_target", "stack_climb", EdgeType.COMBINES_WITH, 0.9,
                     reason="Push and stack together"),
        MechanicEdge("key_unlock", "collect_items", EdgeType.COMBINES_WITH, 0.7,
                     reason="Find key while collecting"),
    ]
    
    # ─── TEACHES EDGES (Tutorial relationships) ────────────────────────────────
    teaches_edges = [
        MechanicEdge("talk_to_npc", "push_to_target", EdgeType.TEACHES, 0.8,
                     reason="NPC teaches pushing"),
        MechanicEdge("talk_to_npc", "sequence_activate", EdgeType.TEACHES, 0.8,
                     reason="NPC teaches sequence"),
        MechanicEdge("push_to_target", "stack_climb", EdgeType.TEACHES, 0.7,
                     reason="Push is prerequisite for stack"),
        MechanicEdge("lever_activate", "sequence_activate", EdgeType.TEACHES, 0.7,
                     reason="Simple lever before complex sequence"),
    ]
    
    # Add all edges
    graph.add_edges(leads_to_edges)
    graph.add_edges(enables_edges)
    graph.add_edges(requires_edges)
    graph.add_edges(combines_edges)
    graph.add_edges(teaches_edges)
    
    return graph


# Global default graph instance
DEFAULT_GRAPH = build_default_graph()


# ═══════════════════════════════════════════════════════════════════════════════
#  SEQUENCE GENERATION HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def generate_gameplay_sequence(
    available_mechanics: list[str],
    length: int = 4,
    start_mechanic: str = None,
    end_mechanic: str = None,
    graph: MechanicGraph = None,
) -> list[str]:
    """
    Generate a logical gameplay sequence using the mechanic graph.
    
    Args:
        available_mechanics: Mechanics that can be used
        length: Desired sequence length
        start_mechanic: Force specific start (or auto-select entry point)
        end_mechanic: Force specific end (or auto-select exit point)
        graph: Mechanic graph to use (defaults to DEFAULT_GRAPH)
        
    Returns:
        List of mechanics forming a logical sequence
    """
    graph = graph or DEFAULT_GRAPH
    available_set = set(available_mechanics)
    
    # Select start
    if not start_mechanic:
        # Pick from entry points that are available
        entry_options = graph.entry_points & available_set
        if entry_options:
            start_mechanic = list(entry_options)[0]
        elif available_mechanics:
            start_mechanic = available_mechanics[0]
        else:
            return []
    
    # If end is specified, find path
    if end_mechanic:
        path = graph.find_path(start_mechanic, end_mechanic, max_length=length)
        if path:
            # Filter to available
            return [m for m in path if m in available_set]
    
    # Generate sequence
    return graph.generate_sequence(
        start_mechanic,
        length=length,
        available_mechanics=available_set,
    )


def suggest_next_mechanic(
    current_sequence: list[str],
    available_mechanics: list[str],
    graph: MechanicGraph = None,
) -> list[tuple[str, float]]:
    """
    Suggest what mechanic should come next in a sequence.
    
    Returns:
        List of (mechanic_id, score) sorted by score descending
    """
    graph = graph or DEFAULT_GRAPH
    
    if not current_sequence:
        # Suggest entry points
        return [
            (m, 1.0) for m in available_mechanics
            if m in graph.entry_points
        ]
    
    current = current_sequence[-1]
    used = set(current_sequence)
    available_set = set(available_mechanics) - used
    
    suggestions = []
    
    for edge in graph.get_outgoing(current):
        if edge.target in available_set:
            score = edge.weight
            if edge.edge_type == EdgeType.LEADS_TO:
                score += 0.3
            if edge.edge_type == EdgeType.ENABLES:
                score += 0.2
            if edge.required:
                score += 0.5
            
            suggestions.append((edge.target, min(2.0, score)))
    
    # Sort by score
    suggestions.sort(key=lambda x: x[1], reverse=True)
    
    return suggestions


def validate_gameplay_sequence(
    sequence: list[str],
    graph: MechanicGraph = None,
) -> dict:
    """
    Validate a gameplay sequence against the mechanic graph.
    
    Returns:
        {"valid": bool, "score": float, "errors": [...], "suggestions": [...]}
    """
    graph = graph or DEFAULT_GRAPH
    
    result = graph.validate_sequence(sequence)
    
    # Calculate sequence score
    score = 1.0
    edge_count = 0
    
    for i in range(len(sequence) - 1):
        current = sequence[i]
        next_mech = sequence[i + 1]
        
        for edge in graph.get_outgoing(current):
            if edge.target == next_mech:
                score += edge.weight * 0.1
                edge_count += 1
                break
    
    # Normalize score
    if len(sequence) > 1:
        score = score * (edge_count / (len(sequence) - 1))
    
    result["score"] = min(1.0, score)
    
    # Add suggestions for improvement
    result["suggestions"] = []
    if sequence:
        next_options = suggest_next_mechanic(sequence, list(graph.nodes))
        if next_options:
            result["suggestions"] = [opt[0] for opt in next_options[:3]]
    
    return result
