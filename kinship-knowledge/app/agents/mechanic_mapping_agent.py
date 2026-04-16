"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    MECHANIC MAPPING AGENT                                     ║
║                                                                               ║
║  Maps mechanics from Planner to assets and affordances.                       ║
║                                                                               ║
║  RESPONSIBILITIES:                                                            ║
║  1. Take mechanics from Planner output                                        ║
║  2. Map each mechanic to required affordances                                 ║
║  3. Find assets that support each mechanic                                    ║
║  4. Assign mechanics to specific scenes/challenges                            ║
║  5. Verify assets can actually implement each mechanic                        ║
║  6. Generate fallback mappings when assets are missing                        ║
║                                                                               ║
║  INPUT:                                                                       ║
║    - GamePlan with mechanics per scene                                        ║
║    - Available assets with affordances                                        ║
║                                                                               ║
║  OUTPUT:                                                                      ║
║    - MechanicMapping with asset assignments per mechanic                      ║
║    - Warnings for unsupported mechanics                                       ║
║    - Fallback suggestions                                                     ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import logging
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any, Set, Tuple

from app.agents.base_agent import BaseAgent, AgentConfig, AgentResult, AgentStatus


logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  MECHANIC → AFFORDANCE MAPPING
# ═══════════════════════════════════════════════════════════════════════════════

# Maps each mechanic to the affordances required to implement it
MECHANIC_AFFORDANCES = {
    # Collection mechanics
    "collect_items": {
        "required": ["collectible"],
        "optional": ["stackable", "valuable"],
        "asset_types": ["item", "object", "collectible"],
    },
    "collect_all": {
        "required": ["collectible"],
        "optional": [],
        "asset_types": ["item", "object", "collectible"],
    },
    "gather_resources": {
        "required": ["collectible", "resource"],
        "optional": ["renewable"],
        "asset_types": ["item", "resource", "plant"],
    },
    # Navigation mechanics
    "reach_destination": {
        "required": ["trigger_zone"],
        "optional": ["landmark", "glowing"],
        "asset_types": ["zone", "marker", "destination"],
    },
    "follow_path": {
        "required": ["trigger_zone"],
        "optional": ["waypoint"],
        "asset_types": ["zone", "path", "marker"],
    },
    "explore_area": {
        "required": [],
        "optional": ["discoverable", "hidden"],
        "asset_types": ["zone", "area"],
    },
    # Interaction mechanics
    "talk_to_npc": {
        "required": ["talkable"],
        "optional": ["quest_giver", "merchant"],
        "asset_types": ["npc", "character"],
    },
    "interact_object": {
        "required": ["interactable"],
        "optional": ["activatable", "toggleable"],
        "asset_types": ["object", "interactive"],
    },
    "use_item": {
        "required": ["usable", "collectible"],
        "optional": ["consumable"],
        "asset_types": ["item", "tool"],
    },
    # Delivery mechanics
    "deliver_item": {
        "required": ["collectible", "receivable"],
        "optional": ["quest_item"],
        "asset_types": ["item", "npc"],
    },
    "escort_npc": {
        "required": ["followable", "trigger_zone"],
        "optional": ["vulnerable"],
        "asset_types": ["npc", "zone"],
    },
    # Puzzle mechanics
    "push_to_target": {
        "required": ["pushable", "push_target"],
        "optional": ["heavy", "slideable"],
        "asset_types": ["object", "target"],
    },
    "solve_puzzle": {
        "required": ["interactable"],
        "optional": ["sequenced", "pattern"],
        "asset_types": ["puzzle", "object"],
    },
    "unlock_door": {
        "required": ["lockable", "collectible"],
        "optional": ["key"],
        "asset_types": ["door", "key", "gate"],
    },
    "activate_switch": {
        "required": ["activatable"],
        "optional": ["toggleable", "timed"],
        "asset_types": ["switch", "button", "lever"],
    },
    # Hazard mechanics
    "avoid_hazard": {
        "required": ["hazard"],
        "optional": ["damaging", "timed"],
        "asset_types": ["hazard", "trap", "obstacle"],
    },
    "defend_position": {
        "required": ["trigger_zone"],
        "optional": ["defensible"],
        "asset_types": ["zone", "barricade"],
    },
    # Social mechanics
    "trade_items": {
        "required": ["tradeable", "talkable"],
        "optional": ["merchant", "valuable"],
        "asset_types": ["npc", "item"],
    },
    "befriend_npc": {
        "required": ["talkable"],
        "optional": ["giftable", "trustable"],
        "asset_types": ["npc", "item"],
    },
    "complete_dialogue": {
        "required": ["talkable"],
        "optional": [],
        "asset_types": ["npc"],
    },
    # Timed mechanics
    "timed_challenge": {
        "required": [],
        "optional": ["timed"],
        "asset_types": [],
    },
    "survive_duration": {
        "required": ["hazard"],
        "optional": ["safe_zone"],
        "asset_types": ["hazard", "zone"],
    },
}

# Fallback mechanics when required mechanics can't be implemented
MECHANIC_FALLBACKS = {
    "push_to_target": "collect_items",
    "unlock_door": "reach_destination",
    "solve_puzzle": "collect_items",
    "trade_items": "talk_to_npc",
    "escort_npc": "reach_destination",
    "defend_position": "avoid_hazard",
    "activate_switch": "interact_object",
}


# ═══════════════════════════════════════════════════════════════════════════════
#  DATA STRUCTURES
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class MechanicAssetMatch:
    """A match between a mechanic and an asset that can implement it."""

    asset_name: str
    asset_type: str
    matched_affordances: List[str]
    missing_affordances: List[str]
    match_score: float  # 0.0 - 1.0

    def is_complete_match(self) -> bool:
        return len(self.missing_affordances) == 0


@dataclass
class MechanicAssignment:
    """Assignment of a mechanic to a scene with supporting assets."""

    mechanic_id: str
    scene_name: str

    # Assets that can implement this mechanic
    primary_asset: Optional[str] = None
    supporting_assets: List[str] = field(default_factory=list)

    # Match quality
    is_fully_supported: bool = True
    missing_affordances: List[str] = field(default_factory=list)

    # Fallback
    fallback_mechanic: Optional[str] = None
    using_fallback: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "mechanic_id": self.mechanic_id,
            "scene_name": self.scene_name,
            "primary_asset": self.primary_asset,
            "supporting_assets": self.supporting_assets,
            "is_fully_supported": self.is_fully_supported,
            "missing_affordances": self.missing_affordances,
            "fallback_mechanic": self.fallback_mechanic,
            "using_fallback": self.using_fallback,
        }


@dataclass
class MechanicMapping:
    """Complete mapping of mechanics to assets across all scenes."""

    assignments: List[MechanicAssignment] = field(default_factory=list)

    # Summary
    total_mechanics: int = 0
    fully_supported: int = 0
    using_fallbacks: int = 0
    unsupported: int = 0

    # Asset usage
    asset_usage: Dict[str, List[str]] = field(
        default_factory=dict
    )  # asset → [mechanics]

    # Warnings
    warnings: List[str] = field(default_factory=list)

    def get_assignment(
        self, mechanic_id: str, scene_name: str
    ) -> Optional[MechanicAssignment]:
        for a in self.assignments:
            if a.mechanic_id == mechanic_id and a.scene_name == scene_name:
                return a
        return None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "assignments": [a.to_dict() for a in self.assignments],
            "total_mechanics": self.total_mechanics,
            "fully_supported": self.fully_supported,
            "using_fallbacks": self.using_fallbacks,
            "unsupported": self.unsupported,
            "asset_usage": self.asset_usage,
            "warnings": self.warnings,
        }


@dataclass
class MappingResult:
    """Result of mechanic mapping."""

    success: bool = True
    mapping: Optional[MechanicMapping] = None
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    duration_ms: int = 0


# ═══════════════════════════════════════════════════════════════════════════════
#  MECHANIC MAPPING AGENT
# ═══════════════════════════════════════════════════════════════════════════════


class MechanicMappingAgent(BaseAgent):
    """
    Maps mechanics from Planner to assets and affordances.

    This agent ensures that each mechanic in the game plan
    can be implemented with the available assets.
    """

    def __init__(self, config: AgentConfig = None):
        super().__init__(config or AgentConfig())
        self._logger = logging.getLogger("mechanic_mapping_agent")

        # Build affordance → assets index
        self._affordance_index: Dict[str, List[Dict]] = {}
        self._asset_affordances: Dict[str, Set[str]] = {}

    @property
    def name(self) -> str:
        return "mechanic_mapping"

    async def _execute(self, state) -> dict:
        """
        Execute mechanic mapping on pipeline state.

        Args:
            state: PipelineState with planner output and assets

        Returns:
            dict with mapping data
        """
        # Get inputs from state
        assets = list(state.input.assets) if state.input else []
        planner_output = state.planner_output

        if not planner_output:
            raise ValueError("No planner output available")

        # Get mechanics from planner
        mechanic_sequence = (
            list(planner_output.mechanic_sequence)
            if planner_output.mechanic_sequence
            else []
        )

        # Get scene assignments from plan
        scene_mechanics = self._extract_scene_mechanics(state)

        # Run mapping
        mapping_result = self.map_mechanics(
            mechanics=mechanic_sequence,
            assets=assets,
            scene_mechanics=scene_mechanics,
        )

        if not mapping_result.success:
            raise ValueError(f"Mapping failed: {mapping_result.errors}")

        # Store mapping in state
        state.mechanic_mapping = mapping_result.mapping

        return mapping_result.mapping.to_dict()

    def _validate_output(self, output: dict, state) -> tuple[bool, list[str]]:
        """
        Validate the mechanic mapping output.

        Args:
            output: Output data from _execute
            state: Pipeline state

        Returns:
            (is_valid, list of error messages)
        """
        errors = []

        # Check that we have assignments
        if not output.get("assignments"):
            errors.append("No mechanic assignments generated")

        # Check for critical unsupported mechanics
        unsupported = output.get("unsupported", 0)
        total = output.get("total_mechanics", 0)

        if total > 0 and unsupported == total:
            errors.append(
                "All mechanics are unsupported - no valid game can be generated"
            )

        # Warnings are acceptable, only errors fail validation
        return len(errors) == 0, errors

    async def run(self, state) -> AgentResult:
        """
        Run mechanic mapping on pipeline state.

        Args:
            state: PipelineState with planner output and assets

        Returns:
            AgentResult
        """
        result = AgentResult(agent_name=self.name)

        try:
            # Get inputs from state
            assets = list(state.input.assets) if state.input else []
            planner_output = state.planner_output

            if not planner_output:
                result.errors.append("No planner output available")
                result.status = AgentStatus.FAILED
                return result

            # Get mechanics from planner
            mechanic_sequence = (
                list(planner_output.mechanic_sequence)
                if planner_output.mechanic_sequence
                else []
            )

            # Get scene assignments from plan
            scene_mechanics = self._extract_scene_mechanics(state)

            # Run mapping
            mapping_result = self.map_mechanics(
                mechanics=mechanic_sequence,
                assets=assets,
                scene_mechanics=scene_mechanics,
            )

            if mapping_result.success:
                # Store mapping in state
                state.mechanic_mapping = mapping_result.mapping
                result.status = AgentStatus.SUCCESS
                result.data = mapping_result.mapping.to_dict()
                result.warnings = mapping_result.warnings
            else:
                result.errors = mapping_result.errors
                result.status = AgentStatus.FAILED

        except Exception as e:
            self._logger.exception(f"Mechanic mapping failed: {e}")
            result.errors.append(str(e))
            result.status = AgentStatus.FAILED

        return result

    def map_mechanics(
        self,
        mechanics: List[str],
        assets: List[Dict[str, Any]],
        scene_mechanics: Optional[Dict[str, List[str]]] = None,
    ) -> MappingResult:
        """
        Map mechanics to assets.

        Args:
            mechanics: List of mechanic IDs
            assets: Available assets with affordances
            scene_mechanics: Optional mapping of scene → mechanics

        Returns:
            MappingResult
        """
        import time

        start_time = time.time()

        result = MappingResult()
        mapping = MechanicMapping()

        # Build indexes
        self._build_indexes(assets)

        # Get unique mechanics
        unique_mechanics = list(set(mechanics))
        mapping.total_mechanics = len(unique_mechanics)

        # If no scene assignment provided, create default
        if not scene_mechanics:
            scene_mechanics = {"default_scene": unique_mechanics}

        # Map each mechanic in each scene
        for scene_name, scene_mechs in scene_mechanics.items():
            for mechanic in scene_mechs:
                assignment = self._map_single_mechanic(mechanic, scene_name, assets)
                mapping.assignments.append(assignment)

                # Track stats
                if assignment.is_fully_supported:
                    mapping.fully_supported += 1
                elif assignment.using_fallback:
                    mapping.using_fallbacks += 1
                else:
                    mapping.unsupported += 1

                # Track asset usage
                if assignment.primary_asset:
                    if assignment.primary_asset not in mapping.asset_usage:
                        mapping.asset_usage[assignment.primary_asset] = []
                    mapping.asset_usage[assignment.primary_asset].append(mechanic)

                # Add warnings
                if assignment.missing_affordances:
                    mapping.warnings.append(
                        f"Mechanic '{mechanic}' in '{scene_name}' missing affordances: "
                        f"{assignment.missing_affordances}"
                    )
                if assignment.using_fallback:
                    mapping.warnings.append(
                        f"Mechanic '{mechanic}' in '{scene_name}' using fallback: "
                        f"{assignment.fallback_mechanic}"
                    )

        result.success = mapping.unsupported == 0 or mapping.using_fallbacks > 0
        result.mapping = mapping
        result.warnings = mapping.warnings
        result.duration_ms = int((time.time() - start_time) * 1000)

        self._logger.info(
            f"Mechanic mapping complete: {mapping.fully_supported}/{mapping.total_mechanics} "
            f"fully supported, {mapping.using_fallbacks} fallbacks, {mapping.unsupported} unsupported"
        )

        return result

    def _build_indexes(self, assets: List[Dict[str, Any]]):
        """Build indexes for fast affordance lookup."""
        self._affordance_index = {}
        self._asset_affordances = {}

        for asset in assets:
            name = asset.get("name", "")

            # Get affordances from various locations
            affordances = set()

            # Direct affordances
            if asset.get("affordances"):
                if isinstance(asset["affordances"], list):
                    affordances.update(asset["affordances"])
                elif isinstance(asset["affordances"], str):
                    affordances.update(asset["affordances"].split(","))

            # From knowledge
            knowledge = asset.get("knowledge", {})
            if knowledge.get("affordances"):
                if isinstance(knowledge["affordances"], list):
                    affordances.update(knowledge["affordances"])

            # From tags (infer affordances)
            tags = asset.get("tags", [])
            if isinstance(tags, list):
                for tag in tags:
                    tag_lower = tag.lower()
                    if tag_lower in ["collectible", "item", "pickup"]:
                        affordances.add("collectible")
                    if tag_lower in ["npc", "character", "person"]:
                        affordances.add("talkable")
                    if tag_lower in ["door", "gate", "lock"]:
                        affordances.add("lockable")
                    if tag_lower in ["pushable", "moveable", "box", "crate"]:
                        affordances.add("pushable")
                    if tag_lower in ["hazard", "danger", "trap"]:
                        affordances.add("hazard")
                    if tag_lower in ["switch", "button", "lever"]:
                        affordances.add("activatable")

            # Store
            self._asset_affordances[name] = affordances

            # Index by affordance
            for aff in affordances:
                if aff not in self._affordance_index:
                    self._affordance_index[aff] = []
                self._affordance_index[aff].append(asset)

    def _map_single_mechanic(
        self,
        mechanic: str,
        scene_name: str,
        assets: List[Dict[str, Any]],
    ) -> MechanicAssignment:
        """Map a single mechanic to assets."""

        assignment = MechanicAssignment(
            mechanic_id=mechanic,
            scene_name=scene_name,
        )

        # Get mechanic requirements
        mechanic_lower = mechanic.lower()
        if mechanic_lower not in MECHANIC_AFFORDANCES:
            # Unknown mechanic
            assignment.is_fully_supported = False
            assignment.missing_affordances = ["unknown_mechanic"]
            return assignment

        spec = MECHANIC_AFFORDANCES[mechanic_lower]
        required_affordances = spec.get("required", [])
        optional_affordances = spec.get("optional", [])
        preferred_asset_types = spec.get("asset_types", [])

        # Find assets with required affordances
        matches = self._find_matching_assets(
            required_affordances,
            optional_affordances,
            preferred_asset_types,
        )

        if matches:
            # Use best match
            best_match = matches[0]
            assignment.primary_asset = best_match.asset_name
            assignment.is_fully_supported = best_match.is_complete_match()
            assignment.missing_affordances = best_match.missing_affordances

            # Add supporting assets if needed
            if len(matches) > 1:
                assignment.supporting_assets = [m.asset_name for m in matches[1:3]]
        else:
            # No matching assets - try fallback
            assignment.is_fully_supported = False
            assignment.missing_affordances = required_affordances

            if mechanic_lower in MECHANIC_FALLBACKS:
                fallback = MECHANIC_FALLBACKS[mechanic_lower]
                assignment.fallback_mechanic = fallback
                assignment.using_fallback = True

                # Try to map fallback
                fallback_spec = MECHANIC_AFFORDANCES.get(fallback, {})
                fallback_matches = self._find_matching_assets(
                    fallback_spec.get("required", []),
                    fallback_spec.get("optional", []),
                    fallback_spec.get("asset_types", []),
                )

                if fallback_matches:
                    assignment.primary_asset = fallback_matches[0].asset_name

        return assignment

    def _find_matching_assets(
        self,
        required_affordances: List[str],
        optional_affordances: List[str],
        preferred_types: List[str],
    ) -> List[MechanicAssetMatch]:
        """Find assets that match required affordances."""

        matches = []

        for asset_name, affordances in self._asset_affordances.items():
            # Check required affordances
            matched_required = [a for a in required_affordances if a in affordances]
            missing_required = [a for a in required_affordances if a not in affordances]

            # Skip if missing too many required
            if len(missing_required) > len(required_affordances) * 0.5:
                continue

            # Check optional affordances
            matched_optional = [a for a in optional_affordances if a in affordances]

            # Calculate score
            if required_affordances:
                required_score = len(matched_required) / len(required_affordances)
            else:
                required_score = 1.0

            if optional_affordances:
                optional_score = len(matched_optional) / len(optional_affordances) * 0.3
            else:
                optional_score = 0.0

            score = required_score + optional_score

            matches.append(
                MechanicAssetMatch(
                    asset_name=asset_name,
                    asset_type="unknown",  # Would need asset lookup
                    matched_affordances=matched_required + matched_optional,
                    missing_affordances=missing_required,
                    match_score=score,
                )
            )

        # Sort by score descending
        matches.sort(key=lambda m: m.match_score, reverse=True)

        return matches

    def _extract_scene_mechanics(self, state) -> Dict[str, List[str]]:
        """Extract scene → mechanics mapping from state."""
        scene_mechanics = {}

        # From plan
        if hasattr(state, "plan") and state.plan:
            plan = state.plan
            if hasattr(plan, "scenes"):
                for scene in plan.scenes:
                    scene_name = (
                        scene.scene_name
                        if hasattr(scene, "scene_name")
                        else str(scene.get("scene_name", ""))
                    )
                    mechs = (
                        scene.mechanics
                        if hasattr(scene, "mechanics")
                        else scene.get("mechanics", [])
                    )
                    scene_mechanics[scene_name] = list(mechs)

        # From planner output
        if not scene_mechanics and state.planner_output:
            loop = state.planner_output.gameplay_loop
            if isinstance(loop, dict) and loop.get("steps"):
                for step in loop["steps"]:
                    scene = step.get("scene", "default")
                    mech = step.get("mechanic", step.get("assigned_mechanic"))
                    if mech:
                        if scene not in scene_mechanics:
                            scene_mechanics[scene] = []
                        scene_mechanics[scene].append(mech)

        return scene_mechanics

    def get_mechanic_requirements(self, mechanic: str) -> Dict[str, Any]:
        """Get requirements for a specific mechanic."""
        return MECHANIC_AFFORDANCES.get(mechanic.lower(), {})

    def get_supported_mechanics(self) -> List[str]:
        """Get list of all supported mechanics."""
        return list(MECHANIC_AFFORDANCES.keys())


# ═══════════════════════════════════════════════════════════════════════════════
#  CONVENIENCE FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════


def map_mechanics(
    mechanics: List[str],
    assets: List[Dict[str, Any]],
    scene_mechanics: Optional[Dict[str, List[str]]] = None,
) -> MappingResult:
    """
    Map mechanics to assets.

    Convenience function that creates an agent and runs it.

    Args:
        mechanics: List of mechanic IDs
        assets: Available assets with affordances
        scene_mechanics: Optional mapping of scene → mechanics

    Returns:
        MappingResult
    """
    agent = MechanicMappingAgent()
    return agent.map_mechanics(mechanics, assets, scene_mechanics)


def get_mechanic_affordances(mechanic: str) -> Dict[str, Any]:
    """Get affordance requirements for a mechanic."""
    return MECHANIC_AFFORDANCES.get(mechanic.lower(), {})


def get_fallback_mechanic(mechanic: str) -> Optional[str]:
    """Get fallback mechanic if primary can't be implemented."""
    return MECHANIC_FALLBACKS.get(mechanic.lower())
