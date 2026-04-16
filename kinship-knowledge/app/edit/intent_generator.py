"""
Layer 3 — Intent Layer.

Intent Generator: single LLM call → structured intent (NOT a patch).
  LLM decides WHAT to do, not WHERE or HOW.
Intent Validator: verify intent references real assets/objects.
Deterministic Fallback: regex-based intent parsing when LLM fails.
"""

import re
import json
import logging
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any

from app.services.claude_client import invoke_claude
from app.edit.config import RetryConfig
from app.edit.state_layer import ExtractedContext

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  DATA STRUCTURES
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class EditIntent:
    """
    Structured intent from the LLM.

    LLM decides WHAT. Backend decides WHERE and HOW.
    """

    action: str  # "add", "remove", "move", "update"
    target_type: str  # "object", "npc", "challenge", "scene", "route"
    asset_name: Optional[str] = None  # For add: which asset
    target_id: Optional[str] = None  # For update/remove/move: which object
    target_scene: Optional[str] = None  # Which scene
    relative_to: Optional[str] = None  # "near rock1", "next to spawn"
    direction: Optional[str] = None  # "left", "right", "north", etc.
    properties: Dict[str, Any] = field(default_factory=dict)  # Extra attrs
    reasoning: str = ""
    confidence: float = 0.8


@dataclass
class IntentResult:
    """Result from intent generation."""

    success: bool = False
    intents: List[EditIntent] = field(default_factory=list)
    source: str = "llm"  # "llm" or "fallback"
    errors: List[str] = field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════════
#  INTENT GENERATOR PROMPT
# ═══════════════════════════════════════════════════════════════════════════════
#  LLM PROMPTS — SEMANTIC AI-DRIVEN ASSET SELECTION
# ═══════════════════════════════════════════════════════════════════════════════

INTENT_SYSTEM_PROMPT = """You are a game editor AI that interprets user requests and selects the appropriate assets/objects.

YOUR JOB: Understand what the user MEANS, not just what they literally typed. Also determine appropriate visual properties (scale, z_index) based on existing objects.

## FOR REMOVE REQUESTS:
The user will describe what they want to remove. You must:
1. Look at the "Existing objects" list in the context
2. SEMANTICALLY MATCH the user's description to objects in that list
3. Return the EXACT asset_name from the list

Examples:
- User says "remove red mushroom" → Match to "red_spotted_mushrooms" in the list
- User says "remove the well" → Match to "stone_well" in the list
- User says "remove trees" → Match to "pine_tree" objects in the list
- User says "remove all mushrooms" → Match ALL mushroom-type objects

## FOR ADD REQUESTS:
The user will describe what they want to add. You must:
1. Look at the "Available assets" list in the context
2. SEMANTICALLY MATCH the user's description to the best asset
3. Return the EXACT asset name from the available assets list
4. **CRITICAL: Look at existing objects of the SAME TYPE to copy their scale and z_index**

### SCALE GUIDANCE (VERY IMPORTANT):
Scale controls the visual size of objects. You MUST match the scale of existing objects of the same type.
- Look at the "Existing objects" section to see scale values for each asset type
- If adding a "campfire" and existing campfires have scale=1.0, use scale=1.0
- If adding a "mushroom" and existing mushrooms have scale=0.5, use scale=0.5
- NEVER use a different scale than existing objects of the same type
- If no existing object of that type, use scale=1.0 as default

### Z-INDEX GUIDANCE:
Z-index controls depth (which objects appear in front). Higher z-index = renders in front.
- Look at existing objects of the SAME TYPE to see their z_index pattern
- Objects lower on screen (higher Y) should have higher z_index
- The pattern is typically: z_index ≈ (y * grid_width + x) * 10
- Copy the z_index pattern from existing objects of the same type

## RESPONSE FORMAT — JSON array:
[
  {
    "action": "add | remove | move | update",
    "target_type": "object | npc | challenge",
    "asset_name": "EXACT name from available assets list (for ADD)",
    "target_id": "EXACT asset_name or object_id from existing objects (for REMOVE/MOVE/UPDATE)",
    "target_scene": "scene name",
    "quantity": 1,
    "remove_all": false,
    "scale": 1.0,
    "z_index": null,
    "relative_to": "object name to place near (optional)",
    "direction": "left | right | above | below | near (optional)",
    "properties": {},
    "reasoning": "explain your scale/z_index decision based on existing objects"
  }
]

## CRITICAL RULES:
1. For REMOVE: target_id MUST be an exact asset_name or object_id from "Existing objects"
2. For ADD: asset_name MUST be an exact name from "Available assets"
3. **For ADD: scale MUST match existing objects of the same type**
4. If user says "remove all X", set remove_all: true and match the type
5. Do NOT invent asset names — use ONLY names from the provided lists
6. Think semantically: "red mushroom" = "red_spotted_mushrooms", "well" = "stone_well"
7. Respond ONLY with JSON array, no explanation outside the JSON"""

INTENT_USER_PROMPT = """GAME CONTEXT:
{context}

{session_memory}

USER INSTRUCTION:
"{instruction}"

TASK: Parse this instruction using SEMANTIC MATCHING.

For REMOVE: Find the best matching object(s) from "Existing objects" list above.
For ADD: 
  - Find the best matching asset from "Available assets" list above
  - **IMPORTANT: Copy the scale value from existing objects of the same type**
  - Look at z_index pattern from existing objects to determine appropriate depth

Return the EXACT names and matching scale/z_index values in your response."""


# ═══════════════════════════════════════════════════════════════════════════════
#  LLM INTENT GENERATOR
# ═══════════════════════════════════════════════════════════════════════════════


async def generate_intent(
    instruction: str,
    context: ExtractedContext,
    session_memory: str = "",
    config: RetryConfig = None,
) -> IntentResult:
    """
    Generate structured intent from instruction using LLM.
    Falls back to deterministic parsing on failure.
    """
    config = config or RetryConfig()
    result = IntentResult()

    # ── Try LLM ─────────────────────────────────────────────────
    for attempt in range(1 + config.max_intent_retries):
        try:
            memory_section = f"\n{session_memory}" if session_memory else ""

            user_msg = INTENT_USER_PROMPT.format(
                context=context.context_text,
                session_memory=memory_section,
                instruction=instruction,
            )

            response = await invoke_claude(
                system_prompt=INTENT_SYSTEM_PROMPT,
                user_message=user_msg,
            )

            if response:
                intents = _parse_intent_response(response, context)
                if intents:
                    # Validate intents
                    valid_intents, errors = _validate_intents(intents, context)
                    if valid_intents:
                        result.success = True
                        result.intents = valid_intents
                        result.source = "llm"
                        result.errors = errors
                        return result
                    else:
                        # Validation failed — retry with feedback
                        logger.warning(
                            f"Intent validation failed (attempt {attempt + 1}): {errors}"
                        )
                        continue

        except Exception as e:
            logger.warning(f"LLM intent failed (attempt {attempt + 1}): {e}")

    # ── Fallback to deterministic ───────────────────────────────
    if config.use_deterministic_fallback:
        logger.info("Using deterministic fallback for intent")
        # Reset quantity tracker
        _deterministic_intent.quantity = 1
        
        fallback = _deterministic_intent(instruction, context)
        if fallback:
            # Get quantity from the deterministic parser
            quantity = getattr(_deterministic_intent, 'quantity', 1)
            
            # Generate multiple intents if quantity > 1
            intents = []
            for _ in range(quantity):
                # Create a copy of the intent for each quantity
                intent_copy = EditIntent(
                    action=fallback.action,
                    target_type=fallback.target_type,
                    asset_name=fallback.asset_name,
                    target_id=fallback.target_id,
                    target_scene=fallback.target_scene,
                    relative_to=fallback.relative_to,
                    direction=fallback.direction,
                    properties=dict(fallback.properties),
                    reasoning=f"Deterministic fallback (qty {quantity})",
                    confidence=0.7,
                )
                intents.append(intent_copy)
            
            # Validate fallback intents too
            valid_intents, validation_errors = _validate_intents(intents, context)
            
            if valid_intents:
                result.success = True
                result.intents = valid_intents
                result.source = "fallback"
                result.errors = validation_errors  # Include any warnings
                return result
            else:
                # Validation failed - report the errors
                logger.warning(f"Fallback intent validation failed: {validation_errors}")
                result.errors.extend(validation_errors)
                # Don't return yet - fall through to final error

    result.errors.append("Could not parse edit instruction")
    return result


# ═══════════════════════════════════════════════════════════════════════════════
#  RESPONSE PARSER
# ═══════════════════════════════════════════════════════════════════════════════


def _parse_intent_response(
    response: str, context: ExtractedContext
) -> List[EditIntent]:
    """Parse LLM JSON response into EditIntent list."""
    try:
        cleaned = response.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]

        data = json.loads(cleaned.strip())
        if isinstance(data, dict):
            data = [data]

        intents = []
        for item in data:
            # Handle remove_all flag
            remove_all = item.get("remove_all", False)
            
            # Handle quantity field - expand into multiple intents (but not for remove_all)
            quantity = item.get("quantity", 1)
            if not isinstance(quantity, int) or quantity < 1:
                quantity = 1
            
            # For remove_all, we create a single intent with the flag
            if remove_all:
                quantity = 1
            
            properties = item.get("properties", {})
            if remove_all:
                properties["remove_all"] = True
            
            # Extract AI-provided z_index if present
            ai_z_index = item.get("z_index")
            if ai_z_index is not None:
                properties["z_index"] = ai_z_index
                logger.info(f"AI provided z_index: {ai_z_index}")
            
            # Extract AI-provided scale if present (CRITICAL for proper sizing)
            ai_scale = item.get("scale")
            if ai_scale is not None:
                properties["scale"] = float(ai_scale)
                logger.info(f"AI provided scale: {ai_scale} for {item.get('asset_name', 'unknown')}")
            else:
                logger.warning(f"AI did not provide scale for {item.get('asset_name', 'unknown')} - will use template")
            
            for _ in range(quantity):
                intent = EditIntent(
                    action=item.get("action", "add"),
                    target_type=item.get("target_type", "object"),
                    asset_name=item.get("asset_name"),
                    target_id=item.get("target_id"),
                    target_scene=item.get("target_scene", context.scene_name),
                    relative_to=item.get("relative_to"),
                    direction=item.get("direction"),
                    properties=dict(properties),  # Copy to avoid sharing
                    reasoning=item.get("reasoning", ""),
                    confidence=item.get("confidence", 0.8),
                )
                intents.append(intent)
        
        logger.info(f"Parsed {len(intents)} intents from LLM response")
        return intents

    except (json.JSONDecodeError, KeyError, TypeError) as e:
        logger.error(f"Intent parse error: {e}")
        return []


# ═══════════════════════════════════════════════════════════════════════════════
#  INTENT VALIDATOR — SEMANTIC AI-DRIVEN (TRUST AI SELECTION)
# ═══════════════════════════════════════════════════════════════════════════════


def _validate_intents(
    intents: List[EditIntent],
    context: ExtractedContext,
) -> tuple:
    """
    Validate intents — lightweight validation that trusts AI's semantic selection.
    
    The AI has already done semantic matching against the provided lists.
    We only do basic sanity checks here:
    - Required fields are present
    - Action is valid
    
    We do NOT reject based on string matching since the AI handles semantics.
    Returns (valid_intents, warnings).
    """
    valid = []
    warnings = []
    
    # Build lookup sets for logging/debugging only
    asset_names = {a.get("name", "").lower() for a in context.available_assets}
    object_names = set()
    
    for obj in context.scene_data.get("actors", []) + context.scene_data.get("objects", []):
        if isinstance(obj, dict):
            name = obj.get("asset_name", obj.get("name", ""))
            if name:
                object_names.add(name.lower())
    
    logger.info(
        f"Validation context: {len(object_names)} scene objects, "
        f"{len(asset_names)} available assets"
    )
    logger.debug(f"Scene objects: {sorted(object_names)}")

    for intent in intents:
        intent_warnings = []
        is_valid = True

        # Basic required field checks
        if intent.action not in ("add", "remove", "move", "update"):
            intent_warnings.append(f"Invalid action: '{intent.action}'")
            is_valid = False
        
        # For ADD: asset_name is required
        if intent.action == "add":
            if not intent.asset_name:
                intent_warnings.append("ADD requires asset_name")
                is_valid = False
            else:
                # Log if AI selected something not in list (warning, not error)
                if intent.asset_name.lower() not in asset_names:
                    logger.warning(
                        f"AI selected asset '{intent.asset_name}' not in available list - "
                        f"trusting AI's semantic selection"
                    )
        
        # For REMOVE/MOVE/UPDATE: target_id is required
        if intent.action in ("remove", "move", "update"):
            if not intent.target_id:
                intent_warnings.append(f"{intent.action.upper()} requires target_id")
                is_valid = False
            else:
                # Log if AI selected something not in list (warning, not error)
                if intent.target_id.lower() not in object_names:
                    logger.info(
                        f"AI selected target '{intent.target_id}' - "
                        f"will attempt semantic match in patch builder"
                    )

        # Check relative_to is reasonable (optional, just warn)
        if intent.relative_to:
            ref_lower = intent.relative_to.lower()
            if ref_lower not in object_names and ref_lower not in ("spawn", "exit", "center"):
                logger.info(f"Reference '{intent.relative_to}' not directly found - AI may have semantic match")

        if is_valid:
            valid.append(intent)
            if intent_warnings:
                warnings.extend(intent_warnings)
        else:
            warnings.extend(intent_warnings)
            logger.warning(f"Intent rejected: {intent_warnings}")

    logger.info(f"Validation: {len(valid)}/{len(intents)} intents valid, {len(warnings)} warnings")
    return valid, warnings


# ═══════════════════════════════════════════════════════════════════════════════
#  DETERMINISTIC FALLBACK
# ═══════════════════════════════════════════════════════════════════════════════

# Patterns: (regex, action, target_type)
FALLBACK_PATTERNS = [
    # ── ADD patterns with quantity ──────────────────────────────
    # "add {N} {asset}s" or "add {word} {asset}s"  
    (r"(?:add|place|put|create)\s+(\d+|two|three|four|five|six|seven|eight|nine|ten)\s+(?:more\s+)?(.+?)(?:\s+(?:in|to|on|at)\s+|\s*$)",
     "add", "object"),
    # "add {N} more {asset}"
    (r"(?:add|place|put|create)\s+(\d+|two|three|four|five|six|seven|eight|nine|ten)\s+more\s+(.+?)(?:\s+(?:in|to|on|at)\s+|\s*$)",
     "add", "object"),
    # "add {asset} near/next to/beside {reference}"
    (r"(?:add|place|put|create)\s+(?:a\s+|an\s+)?(.+?)\s+(?:near|next to|beside|by|close to)\s+(?:the\s+)?(.+?)(?:\s+in\s+|\s*$)",
     "add", "object"),
    # "add {npc_type} npc/character to scene"
    (r"(?:add|create)\s+(?:a\s+|an\s+)?(.+?)\s+(?:npc|character)\s",
     "add", "npc"),
    # "add {challenge_type} challenge/quest/puzzle"
    (r"(?:add|create)\s+(?:a\s+|an\s+)?(.+?)\s+(?:challenge|quest|puzzle|task)\s",
     "add", "challenge"),
    # "add {asset} to {scene/location}"
    (r"(?:add|place|put|create)\s+(?:a\s+|an\s+)?(.+?)\s+(?:to|in|at)\s+(.+)",
     "add", "object"),
    # "add {asset}" (bare)
    (r"(?:add|place|put|create)\s+(?:a\s+|an\s+)?(.+)",
     "add", "object"),

    # ── REMOVE patterns ─────────────────────────────────────────
    # "remove all {asset}s"
    (r"(?:remove|delete|destroy|clear)\s+all\s+(?:the\s+)?(.+?)(?:s)?(?:\s+(?:from|in)\s+|\s*$)",
     "remove_all", "object"),
    # "remove {N} {asset}s"
    (r"(?:remove|delete|destroy|clear)\s+(\d+|two|three|four|five)\s+(.+?)(?:\s+(?:from|in)\s+|\s*$)",
     "remove", "object"),
    # "remove/delete the/a/an {name}"
    (r"(?:remove|delete|destroy|clear)\s+(?:the\s+|a\s+|an\s+)?(.+?)(?:\s+from\s+|\s+in\s+|\s*$)",
     "remove", "object"),

    # ── MOVE patterns ───────────────────────────────────────────
    # "move {name} to/near {reference}"
    (r"(?:move|shift|relocate)\s+(?:the\s+|a\s+|an\s+)?(.+?)\s+(?:to|near|next to|toward|towards|closer to)\s+(?:the\s+|a\s+|an\s+)?(.+)",
     "move", "object"),
    # "move {name} left/right/up/down"
    (r"(?:move|shift)\s+(?:the\s+|a\s+|an\s+)?(.+?)\s+(left|right|up|down|north|south|east|west)",
     "move", "object"),

    # ── UPDATE patterns ─────────────────────────────────────────
    # "make {name} bigger/smaller/friendlier"
    (r"(?:make|set)\s+(?:the\s+|a\s+|an\s+)?(.+?)\s+(bigger|smaller|larger|friendlier|angrier|faster|slower)",
     "update", "object"),
    # "change {name} to {value}"
    (r"(?:change|update|modify|edit)\s+(?:the\s+|a\s+|an\s+)?(.+?)\s+(?:to|into)\s+(.+)",
     "update", "object"),
]

FALLBACK_RE = [(re.compile(p, re.IGNORECASE), a, t) for p, a, t in FALLBACK_PATTERNS]

# Word to number mapping
WORD_TO_NUM = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
}


def _parse_quantity(text: str) -> int:
    """Parse a quantity from text (number or word)."""
    text = text.strip().lower()
    if text.isdigit():
        return int(text)
    return WORD_TO_NUM.get(text, 1)


def _deterministic_intent(
    instruction: str,
    context: ExtractedContext,
) -> Optional[EditIntent]:
    """Try to parse intent from regex patterns. No LLM needed.

    Covers: add, add N items, add near, add npc, add challenge, 
    remove, remove all, move to, move direction, make bigger/smaller, change to.
    
    Returns a single intent. For quantities > 1, the caller should
    duplicate the intent.
    """
    # Store quantity for the caller
    _deterministic_intent.quantity = 1

    for pattern, action, target_type in FALLBACK_RE:
        match = pattern.search(instruction)
        if not match:
            continue

        groups = [g.strip() for g in match.groups() if g]
        intent = EditIntent(
            action=action if action != "remove_all" else "remove",
            target_type=target_type,
            target_scene=context.scene_name,
        )

        if action == "add":
            # Check if first group is a quantity
            if groups and (groups[0].isdigit() or groups[0].lower() in WORD_TO_NUM):
                _deterministic_intent.quantity = _parse_quantity(groups[0])
                # Asset name is the second group
                if len(groups) > 1:
                    asset_name = groups[1].rstrip('s')  # Remove trailing 's' (plural)
                    intent.asset_name = _find_best_asset_match(asset_name, context)
            else:
                intent.asset_name = _find_best_asset_match(groups[0], context) if groups else None
                if len(groups) > 1:
                    # Check if second group is a scene name or a reference object
                    second = groups[1].lower()
                    scene_names = {s.get("scene_name", "").lower()
                                   for s in (context.scene_data.get("scenes", [])
                                             if "scenes" in context.scene_data else [])}
                    if second in scene_names or second.startswith("scene"):
                        pass  # Scene targeting — position computed from center
                    else:
                        intent.relative_to = groups[1]

        elif action == "remove_all":
            # Remove all objects matching the asset name
            intent.target_id = groups[0].rstrip('s') if groups else None
            intent.properties["remove_all"] = True

        elif action == "remove":
            # Check if first group is a quantity
            if groups and (groups[0].isdigit() or groups[0].lower() in WORD_TO_NUM):
                _deterministic_intent.quantity = _parse_quantity(groups[0])
                intent.target_id = groups[1].rstrip('s') if len(groups) > 1 else None
            else:
                intent.target_id = groups[0] if groups else None

        elif action == "move":
            intent.target_id = groups[0] if groups else None
            if len(groups) > 1:
                ref = groups[1].lower()
                if ref in ("left", "right", "up", "down", "north", "south", "east", "west"):
                    intent.direction = ref
                else:
                    intent.relative_to = groups[1]

        elif action == "update":
            intent.target_id = groups[0] if groups else None
            if len(groups) > 1:
                intent.properties = {"update_value": groups[1]}

        return intent

    return None


def _find_best_asset_match(name: str, context: ExtractedContext) -> str:
    """
    Find the best matching asset name from available assets using semantic matching.
    
    Matching strategies (in order of priority):
    1. Exact match
    2. Normalized match (ignore spaces/underscores)
    3. Substring match
    4. Word-based match (all words in search found in asset name)
    """
    import re
    
    if not name:
        return name
    
    name_lower = name.lower().strip()
    name_norm = name_lower.replace(" ", "").replace("_", "").replace("-", "")
    name_words = set(w for w in re.split(r'[\s_\-]+', name_lower) if w)
    
    def get_words(text: str) -> set:
        return set(w for w in re.split(r'[\s_\-]+', text.lower()) if w)
    
    def word_match(search_words: set, target: str) -> bool:
        """Check if all search words are found in target."""
        target_words = get_words(target)
        return all(
            any(sw in tw or tw.startswith(sw) for tw in target_words)
            for sw in search_words
        )
    
    # 1. Exact match
    for asset in context.available_assets:
        asset_name = asset.get("name", "")
        if asset_name.lower() == name_lower:
            return asset_name
    
    # 2. Normalized match (e.g., "stone well" == "stone_well")
    for asset in context.available_assets:
        asset_name = asset.get("name", "")
        asset_norm = asset_name.lower().replace(" ", "").replace("_", "").replace("-", "")
        if asset_norm == name_norm:
            return asset_name
    
    # 3. Substring match (asset name contains the search term)
    for asset in context.available_assets:
        asset_name = asset.get("name", "")
        if name_lower in asset_name.lower() or name_norm in asset_name.lower().replace("_", ""):
            return asset_name
    
    # 4. Word-based match (e.g., "red mushroom" matches "red_spotted_mushrooms")
    for asset in context.available_assets:
        asset_name = asset.get("name", "")
        if word_match(name_words, asset_name):
            return asset_name
    
    # Also check existing objects in scene (for remove operations)
    for obj in context.scene_data.get("actors", []) + context.scene_data.get("objects", []):
        if isinstance(obj, dict):
            obj_name = obj.get("asset_name", obj.get("name", ""))
            if not obj_name:
                continue
            obj_norm = obj_name.lower().replace(" ", "").replace("_", "").replace("-", "")
            # Normalized match
            if obj_norm == name_norm:
                return obj_name
            # Substring match
            if name_lower in obj_name.lower() or name_norm in obj_norm:
                return obj_name
            # Word-based match
            if word_match(name_words, obj_name):
                return obj_name
    
    return name  # Return original if no match found