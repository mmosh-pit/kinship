"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    EDITOR AGENT                                               ║
║                                                                               ║
║  AI-powered game modification based on natural language instructions.         ║
║                                                                               ║
║  RESPONSIBILITIES:                                                            ║
║  1. Parse natural language edit instructions                                  ║
║  2. Determine edit type and target                                            ║
║  3. Generate appropriate EditRecord                                           ║
║  4. Apply edits to GameState                                                  ║
║  5. Trigger partial regeneration when needed                                  ║
║                                                                               ║
║  EXAMPLE INSTRUCTIONS:                                                        ║
║  - "Add a campfire to scene 1"           → ADD_OBJECT                         ║
║  - "Make the fairy give a quest"         → UPDATE_NPC                         ║
║  - "Remove the puzzle in the cave"       → REMOVE_CHALLENGE                   ║
║  - "Add a new forest scene"              → ADD_SCENE                          ║
║  - "Move the mushrooms closer together"  → UPDATE_OBJECT                      ║
║  - "Make the game easier"                → UPDATE_CHALLENGE (multiple)        ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import logging
import json
import uuid
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from datetime import datetime

from app.services.claude_client import invoke_claude
from app.state.game_state import GameState, EditRecord, EditType


logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  DATA STRUCTURES
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class ParsedEdit:
    """A parsed edit instruction."""

    edit_type: EditType
    target_type: str  # "scene", "npc", "challenge", "object", "route", "global"
    target_id: Optional[str] = None
    target_scene: Optional[str] = None  # Scene context for the edit

    # Extracted details
    details: Dict[str, Any] = field(default_factory=dict)

    # Confidence
    confidence: float = 1.0
    reasoning: str = ""

    # Requires regeneration?
    requires_regeneration: bool = False
    regeneration_scope: str = "none"  # "none", "scene", "npc", "challenge", "all"


@dataclass
class EditorResult:
    """Result of edit operation."""

    success: bool
    edits_applied: List[EditRecord] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    # What was changed
    affected_scenes: List[str] = field(default_factory=list)
    affected_npcs: List[str] = field(default_factory=list)
    affected_challenges: List[str] = field(default_factory=list)

    # Does regeneration need to happen?
    needs_regeneration: bool = False
    regeneration_scope: str = "none"

    duration_ms: int = 0


# ═══════════════════════════════════════════════════════════════════════════════
#  EDITOR PROMPT
# ═══════════════════════════════════════════════════════════════════════════════


EDITOR_SYSTEM_PROMPT = """You are a game editor. Parse the user's edit instruction and return a JSON array of edits.

Use ONLY information from the GAME STATE and AVAILABLE ASSETS provided. Do not assume or invent anything not in the context.

Response format — JSON array:
[
    {
        "edit_type": "add_object|remove_object|move_object|update_object|add_npc|remove_npc|update_npc|update_npc_dialogue|add_challenge|remove_challenge|update_challenge|add_scene|remove_scene|update_scene|add_route|remove_route",
        "target_type": "scene|npc|challenge|object|route|global",
        "target_id": "id of existing item (null for new items)",
        "target_scene": "exact scene name from game state",
        "details": {},
        "confidence": 0.0-1.0,
        "reasoning": "why this edit and these values"
    }
]

For add_object details: {"asset_name": "from available assets", "x": int, "y": int}
For move_object details: {"object_id": "existing id", "x": int, "y": int}
For remove_object details: {"object_id": "existing id"}
For update_npc details: {"personality": "...", "dialogue_style": "..."}
For add_challenge details: {"mechanic_id": "...", "name": "...", "difficulty": "easy|medium|hard"}

Respond ONLY with the JSON array."""


EDITOR_USER_PROMPT = """CURRENT GAME STATE:
{game_state_summary}

USER'S EDIT INSTRUCTION:
"{instruction}"

AVAILABLE ASSETS:
{available_assets}

Analyze this edit instruction and respond with a JSON array of edits to apply."""


# ═══════════════════════════════════════════════════════════════════════════════
#  EDITOR AGENT
# ═══════════════════════════════════════════════════════════════════════════════


class EditorAgent:
    """
    AI-powered editor for game modifications.

    Parses natural language instructions and applies appropriate
    edits to the GameState.
    """

    def __init__(self):
        self._logger = logging.getLogger("editor_agent")

    async def edit(
        self,
        state: GameState,
        instruction: str,
        available_assets: Optional[List[Dict]] = None,
    ) -> EditorResult:
        """
        Apply an edit instruction to a game state.

        Args:
            state: Current GameState
            instruction: Natural language edit instruction
            available_assets: Available assets for adding objects

        Returns:
            EditorResult with applied edits
        """
        import time

        start_time = time.time()

        result = EditorResult(success=False)

        try:
            self._logger.info(f"Processing edit: {instruction[:100]}...")

            # Parse the instruction using Claude
            parsed_edits = await self._parse_instruction(
                state=state,
                instruction=instruction,
                available_assets=available_assets,
            )

            if not parsed_edits:
                result.errors.append("Could not parse edit instruction")
                return result

            # Apply each parsed edit
            for parsed in parsed_edits:
                edit_record = self._create_edit_record(parsed, instruction)

                if state.apply_edit(edit_record):
                    result.edits_applied.append(edit_record)

                    # Track affected items
                    if parsed.target_scene:
                        result.affected_scenes.append(parsed.target_scene)
                    if parsed.target_type == "npc" and parsed.target_id:
                        result.affected_npcs.append(parsed.target_id)
                    if parsed.target_type == "challenge" and parsed.target_id:
                        result.affected_challenges.append(parsed.target_id)

                    # Track regeneration needs
                    if parsed.requires_regeneration:
                        result.needs_regeneration = True
                        if parsed.regeneration_scope in ["all", "scene"]:
                            result.regeneration_scope = parsed.regeneration_scope
                        elif result.regeneration_scope == "none":
                            result.regeneration_scope = parsed.regeneration_scope
                else:
                    result.warnings.append(
                        f"Failed to apply edit: {parsed.edit_type.value}"
                    )

            result.success = len(result.edits_applied) > 0

            self._logger.info(
                f"Edit complete: {len(result.edits_applied)} edits applied, "
                f"regen={result.regeneration_scope}"
            )

        except Exception as e:
            self._logger.error(f"Edit failed: {e}")
            result.errors.append(str(e))

        result.duration_ms = int((time.time() - start_time) * 1000)
        return result

    async def _parse_instruction(
        self,
        state: GameState,
        instruction: str,
        available_assets: Optional[List[Dict]],
    ) -> List[ParsedEdit]:
        """Parse instruction using Claude."""

        # Build state summary
        state_summary = self._build_state_summary(state)

        # Build asset list with context
        asset_list = "No external assets provided. Assets already in the scene above can be reused."
        if available_assets:
            asset_entries = []
            for a in available_assets[:40]:
                name = a.get("name", "")
                if not name:
                    continue
                a_type = a.get("type", "object")
                tags = a.get("tags", [])
                has_url = bool(a.get("file_url"))
                tag_str = f" [{', '.join(tags[:3])}]" if tags else ""
                url_str = "" if has_url else " (no file_url)"
                asset_entries.append(f"  - {name} ({a_type}{tag_str}){url_str}")
            if asset_entries:
                asset_list = "\n".join(asset_entries)

        user_message = EDITOR_USER_PROMPT.format(
            game_state_summary=state_summary,
            instruction=instruction,
            available_assets=asset_list,
        )

        try:
            response = await invoke_claude(
                system_prompt=EDITOR_SYSTEM_PROMPT,
                user_message=user_message,
            )

            if not response:
                self._logger.error("Empty response from Claude")
                return []

            return self._parse_response(response)

        except Exception as e:
            self._logger.error(f"Claude call failed: {e}")
            return []

    def _build_state_summary(self, state: GameState) -> str:
        """Build spatial context from the manifest — no hardcoded rules.

        Everything Claude needs to make placement decisions comes
        from the actual manifest data: grid size, spawn/exit positions,
        object positions, and available coordinates.
        """
        if not state.manifest:
            return "Empty game - no scenes yet"

        lines = []

        # Game identity
        game = state.manifest.get("game", {})
        lines.append(f"Game: {game.get('name', 'Untitled')}")
        lines.append(f"Theme: {game.get('theme', 'unknown')}")

        # Grid config from manifest
        config = state.manifest.get("config", {})
        default_width = config.get("scene_width", 16)
        default_height = config.get("scene_height", 16)
        lines.append(f"Default grid: {default_width}x{default_height}")
        lines.append("")

        # ── Per-scene spatial context ──────────────────────────────
        scenes = state.manifest.get("scenes", [])
        lines.append(f"SCENES ({len(scenes)}):")

        for i, scene in enumerate(scenes):
            scene_name = scene.get("scene_name", f"Scene {i + 1}")
            zone_type = scene.get("zone_type", "unknown")
            width = scene.get("width", default_width)
            height = scene.get("height", default_height)

            lines.append(
                f'  Scene {i + 1}: "{scene_name}" '
                f"(zone: {zone_type}, grid: {width}x{height})"
            )
            lines.append(f"    Valid x: 0-{width - 1}, Valid y: 0-{height - 1}")

            # Spawn and exit — let Claude derive directions from these
            spawn = scene.get("spawn", {})
            if spawn:
                lines.append(
                    f"    Spawn point: ({spawn.get('x', '?')}, {spawn.get('y', '?')})"
                )

            # Find exit position from routes or exit zone
            exit_pos = self._find_exit_position(scene, state.manifest, i)
            if exit_pos:
                lines.append(f"    Exit point: ({exit_pos[0]}, {exit_pos[1]})")

            # ── All objects with positions ─────────────────────────
            seen_ids = set()
            all_objects = []
            for obj in scene.get("actors", []) + scene.get("objects", []):
                if not isinstance(obj, dict):
                    continue
                oid = obj.get("object_id", obj.get("id", id(obj)))
                if oid in seen_ids:
                    continue
                seen_ids.add(oid)
                all_objects.append(obj)

            occupied = set()
            if all_objects:
                lines.append(f"    Objects ({len(all_objects)}):")
                for obj in all_objects:
                    name = obj.get("asset_name", obj.get("name", "?"))
                    pos = obj.get("position", {})
                    ox = obj.get("x", pos.get("x", None))
                    oy = obj.get("y", pos.get("y", None))
                    oid = obj.get("object_id", obj.get("id", ""))

                    coord_str = f"({ox}, {oy})" if ox is not None else "(?, ?)"
                    id_str = f" id={oid}" if oid else ""
                    lines.append(f"      - {name} at {coord_str}{id_str}")

                    if ox is not None and oy is not None:
                        occupied.add((int(ox), int(oy)))
            else:
                lines.append("    Objects: none")

            # Show occupied so Claude avoids collisions
            if occupied:
                sorted_occ = sorted(occupied)
                lines.append(
                    f"    Occupied cells: {sorted_occ[:25]}"
                    + (" ..." if len(sorted_occ) > 25 else "")
                )

            # ── NPCs ──────────────────────────────────────────────
            npcs = scene.get("npcs", [])
            if npcs:
                lines.append(f"    NPCs ({len(npcs)}):")
                for npc in npcs:
                    if isinstance(npc, str):
                        lines.append(f"      - {npc}")
                    elif isinstance(npc, dict):
                        npc_name = npc.get("name", "Unknown")
                        npc_role = npc.get("role", "villager")
                        npc_pos = npc.get("position", {})
                        nx = npc.get("x", npc_pos.get("x", "?"))
                        ny = npc.get("y", npc_pos.get("y", "?"))
                        npc_id = npc.get("npc_id", npc.get("id", ""))
                        lines.append(
                            f"      - {npc_name} ({npc_role}) "
                            f"at ({nx}, {ny}) id={npc_id}"
                        )

            # ── Challenges ────────────────────────────────────────
            challenges = scene.get("challenges", [])
            if challenges:
                lines.append(f"    Challenges ({len(challenges)}):")
                for ch in challenges:
                    if isinstance(ch, str):
                        lines.append(f"      - {ch}")
                    elif isinstance(ch, dict):
                        ch_name = ch.get("name", "Challenge")
                        mechanic = ch.get("mechanic_id", "unknown")
                        ch_id = ch.get("challenge_id", ch.get("id", ""))
                        lines.append(f"      - {ch_name} ({mechanic}) id={ch_id}")

            lines.append("")

        return "\n".join(lines)

    @staticmethod
    def _find_exit_position(
        scene: dict, manifest: dict, scene_index: int
    ) -> Optional[tuple]:
        """Derive exit position from routes or scene zones."""
        # Check routes for this scene's exit
        for route in manifest.get("routes", []):
            if route.get("from_scene") == scene_index:
                trigger = route.get("trigger", {})
                pos = trigger.get("position", {})
                if pos.get("x") is not None:
                    return (pos["x"], pos["y"])

        # Check zones for exit type
        for zone in scene.get("zones", []):
            if isinstance(zone, dict) and zone.get("zone_type") == "exit":
                return (zone.get("x", None), zone.get("y", None))

        return None

    def _parse_response(self, response: str) -> List[ParsedEdit]:
        """Parse Claude's JSON response into ParsedEdit objects."""
        try:
            # Clean response
            cleaned = response.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("```")[1]
                if cleaned.startswith("json"):
                    cleaned = cleaned[4:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]

            data = json.loads(cleaned.strip())

            # Handle single edit vs array
            if isinstance(data, dict):
                data = [data]

            parsed = []
            for edit_data in data:
                try:
                    edit_type = EditType(edit_data.get("edit_type", "update_scene"))
                except ValueError:
                    self._logger.warning(
                        f"Unknown edit type: {edit_data.get('edit_type')}"
                    )
                    continue

                parsed.append(
                    ParsedEdit(
                        edit_type=edit_type,
                        target_type=edit_data.get("target_type", "scene"),
                        target_id=edit_data.get("target_id"),
                        target_scene=edit_data.get("target_scene"),
                        details=edit_data.get("details", {}),
                        confidence=edit_data.get("confidence", 0.8),
                        reasoning=edit_data.get("reasoning", ""),
                        requires_regeneration=edit_data.get(
                            "requires_regeneration", False
                        ),
                        regeneration_scope=edit_data.get("regeneration_scope", "none"),
                    )
                )

            return parsed

        except json.JSONDecodeError as e:
            self._logger.error(f"JSON parse error: {e}")
            return []
        except Exception as e:
            self._logger.error(f"Response parsing error: {e}")
            return []

    def _create_edit_record(self, parsed: ParsedEdit, instruction: str) -> EditRecord:
        """Create an EditRecord from a ParsedEdit."""
        # For scene-targeting operations (add_object, add_npc, add_challenge),
        # use target_scene as the target_id (the scene to modify)
        # For item-targeting operations (update_npc, remove_object),
        # use target_id (the specific item)

        scene_targeting_types = {
            EditType.ADD_OBJECT,
            EditType.ADD_NPC,
            EditType.ADD_CHALLENGE,
            EditType.ADD_SCENE,
            EditType.UPDATE_SCENE,
            EditType.REMOVE_SCENE,
        }

        if parsed.edit_type in scene_targeting_types:
            # Prefer target_scene for scene-targeting operations
            effective_target = parsed.target_scene or parsed.target_id
        else:
            # Prefer target_id for item-targeting operations
            effective_target = parsed.target_id or parsed.target_scene

        return EditRecord(
            edit_id=str(uuid.uuid4())[:8],
            edit_type=parsed.edit_type,
            timestamp=datetime.utcnow(),
            target_type=parsed.target_type,
            target_id=effective_target,
            instruction=instruction,
            changes=parsed.details,
            ai_generated=True,
            confidence=parsed.confidence,
        )


# ═══════════════════════════════════════════════════════════════════════════════
#  CONVENIENCE FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════


async def apply_edit(
    state: GameState,
    instruction: str,
    available_assets: Optional[List[Dict]] = None,
) -> EditorResult:
    """
    Apply an edit instruction to a game state.

    Convenience function that creates an EditorAgent and runs it.

    Args:
        state: Current GameState
        instruction: Natural language edit instruction
        available_assets: Available assets for adding objects

    Returns:
        EditorResult with applied edits
    """
    editor = EditorAgent()
    return await editor.edit(state, instruction, available_assets)


async def batch_edit(
    state: GameState,
    instructions: List[str],
    available_assets: Optional[List[Dict]] = None,
) -> List[EditorResult]:
    """
    Apply multiple edit instructions in sequence.

    Args:
        state: Current GameState
        instructions: List of edit instructions
        available_assets: Available assets

    Returns:
        List of EditorResults
    """
    editor = EditorAgent()
    results = []

    for instruction in instructions:
        result = await editor.edit(state, instruction, available_assets)
        results.append(result)

        # Stop if an edit fails critically
        if result.errors and not result.success:
            break

    return results
