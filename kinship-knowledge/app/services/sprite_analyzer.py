"""AI Sprite Sheet Analyzer â€” uses Claude Vision to auto-detect metadata.

Called by kinship-studio when artist uploads a new asset image.
Returns suggested metadata: sprite_sheet config, type, personality, etc.

Flow:
  1. Studio uploads image file to this endpoint
  2. Claude Vision analyzes the image
  3. Returns structured metadata to pre-fill the Studio form
  4. Artist reviews/adjusts and saves
"""

import base64
import json
import logging
from anthropic import AsyncAnthropic
from app.config import get_settings

settings = get_settings()

logger = logging.getLogger(__name__)


ANALYZE_SYSTEM_PROMPT = """You are an expert game asset analyst. You analyze sprite sheet images 
and detect their technical properties and behavioral characteristics.

You MUST respond with ONLY a valid JSON object â€” no markdown, no backticks, no explanation.

Analyze the image and return:

{
  "asset_type": "sprite|animation|tile|object|npc|avatar|ui|audio|tilemap",
  
  "sprite_sheet": {
    "is_sprite_sheet": true/false,
    "columns": <int>,
    "rows": <int>,
    "frame_width": <int>,
    "frame_height": <int>,
    "padding": 0,
    "anchor_x": 0.5,
    "anchor_y": 0.95,
    "direction_map": null or {"down": 0, "left": 1, "right": 2, "up": 3},
    "states": {
      "idle": {"row": 0, "start_col": 0, "end_col": 0, "fps": 1, "loop": true},
      "walk": {"row": 0, "start_col": 0, "end_col": 2, "fps": 6, "loop": true}
    }
  },
  
  "movement": {
    "type": "static|wander",
    "speed": 0.4,
    "wander_radius": 2.5,
    "personality": "calm|energetic|nervous|lazy|curious|guard|ambient|playful|shy|aggressive|graceful|erratic|social|patrol"
  },
  
  "tile_config": {
    "walkable": "walkable|blocked|slow|hazard",
    "terrain_cost": 1.0,
    "terrain_type": ""
  },

  "hitbox": {
    "width": 1,
    "height": 1,
    "offset_x": 0,
    "offset_y": 0
  },

  "spawn_config": {
    "default_position": {"x": 0, "y": 0},
    "layer": "objects",
    "z_index": 1,
    "facing": "south"
  },

  "hearts_mapping": {
    "primary_facet": "H|E|A|R|T|Si|So|null",
    "secondary_facet": "H|E|A|R|T|Si|So|null",
    "base_delta": 5,
    "description": "Brief explanation of how this asset supports emotional wellbeing"
  },

  "rules": {
    "requires_item": null,
    "max_users": 1,
    "description": "Brief description of usage rules",
    "is_movable": false,
    "is_destructible": false,
    "level_required": 0
  },

  "interaction": {
    "type": "none|tap|proximity"
  },

  "display_name": "Human-readable name",
  "description": "Brief description of what this asset is",
  "tags": ["tag1", "tag2"],
  "scene_roles": ["vegetation", "prop", "character"],
  
  "personality_reason": "Brief explanation of why this personality was chosen"
}

Key detection rules:

SPRITE SHEET DETECTION:
- If the image shows a grid of similar frames â†’ it's a sprite sheet
- Count columns and rows by looking at repeated poses/frames
- Calculate frame_width = image_width / columns, frame_height = image_height / rows
- Look for animation rows: idle (single or few frames), walk (3-4 frames of movement), sit, emote, attack, run, etc.
- If frames face different directions across rows â†’ add direction_map
- If no grid/frames visible â†’ is_sprite_sheet: false, it's a single image

ASSET TYPE DETECTION:
- Living creature with walk frames â†’ "sprite"
- Character with talk/emote â†’ "npc" 
- Fire, water, sparkle (looping effect) â†’ "animation"
- Ground texture, flat surface â†’ "tile"
- Tree, rock, building (static object) â†’ "object"
- Player character with multiple directions â†’ "avatar"

PERSONALITY DETECTION:
- Small prey animal (rabbit, mouse, small bird) â†’ "nervous" or "shy"
- Large predator (wolf, bear, dragon) â†’ "aggressive"  
- Gentle creature (deer, fish, turtle) â†’ "calm"
- Quick creature (squirrel, hummingbird, cat) â†’ "energetic"
- Insect, bat, firefly â†’ "erratic"
- Butterfly, jellyfish, ghost â†’ "graceful"
- Dog, kitten, baby animal â†’ "playful"
- NPC with talk animation â†’ "guard" or "social"
- Fire, torch, waterfall â†’ "ambient"
- Robot, soldier â†’ "patrol"

FPS SUGGESTIONS:
- idle: 1-2 fps (slow or static)
- walk: 4-8 fps
- run: 8-12 fps
- attack: 6-10 fps
- emote/talk: 3-6 fps
- fire/sparkle loops: 6-10 fps

HITBOX DETECTION:
- Static objects (trees, rocks, buildings): width=1, height=1, offset_x=0, offset_y=0
- Large structures (houses, barns): width=2, height=2, offset_x=0, offset_y=0
- Characters/NPCs: width=1, height=1, offset_x=0, offset_y=0
- Small items/decorations: width=1, height=1, offset_x=0, offset_y=0
- Wide objects (fences, walls): width=2, height=1, offset_x=0, offset_y=0

SPAWN CONFIG DETECTION:
- layer: "ground" for tiles/flat objects, "objects" for props/furniture/trees, "characters" for NPCs/sprites, "effects" for animations/particles
- z_index: 0 for ground tiles, 1 for objects/props, 2 for characters/NPCs, 3 for effects/UI
- facing: "south" for most assets, "north"/"east"/"west" only if the sprite clearly faces that direction
- default_position: always {x: 0, y: 0} (placed by the scene generator)

HEARTS MAPPING DETECTION:
- H (Harmony): Calm nature assets (water, flowers, peaceful scenes), furniture, cozy items
- E (Empowerment): Equipment, tools, workout gear, trophies, vehicles, weapons, building materials
- A (Awareness): Books, puzzles, telescopes, maps, clocks, observation items
- R (Resilience): Weather elements, repair items, medical/healing items, damaged-and-restored objects
- T (Tenacity): Challenge-related items, obstacles, scoreboards, competitive equipment
- Si (Self-insight): Mirrors, journals, candles, meditation items, personal reflection objects
- So (Social): Tables, benches, social gathering spots, NPCs, community items
- base_delta: 5 for small decorative items, 10 for interactive objects, 15 for major interactive elements
- Set primary_facet based on the strongest match above, secondary_facet if a second facet applies, null if none fits

RULES DETECTION:
- is_movable: true for items that could be repositioned (furniture, small props), false for permanent fixtures (trees, buildings, walls)
- is_destructible: true for breakable objects (barrels, crates, small props), false for permanent structures
- max_users: 1 for personal items, 2-4 for benches/tables where multiple players can interact
- level_required: 0 for basic items always available, 1-3 for items requiring progression
- requires_item: null unless the asset is clearly a locked/gated object"""


ANALYZE_USER_PROMPT = """Analyze this game asset image.

Image dimensions: {width}x{height} pixels
File name: {filename}

Detect if this is a sprite sheet or single image. If it's a sprite sheet, identify:
1. Grid layout (columns Ã— rows)
2. Frame dimensions
3. Animation states (which rows are idle, walk, sit, attack, etc.)
4. Direction map (if rows represent different facing directions)
5. FPS suggestions per state

Also fill ALL of the following metadata sections:
- asset_type, display_name, description, tags, scene_roles
- sprite_sheet (if applicable)
- movement (type, speed, wander_radius, personality)
- tile_config (walkable, terrain_cost, terrain_type)
- hitbox (width, height, offset_x, offset_y)
- spawn_config (default_position, layer, z_index, facing)
- hearts_mapping (primary_facet, secondary_facet, base_delta, description)
- rules (requires_item, max_users, description, is_movable, is_destructible, level_required)
- interaction (type)

Respond with ONLY the JSON object."""


async def analyze_sprite_image(
    image_data: bytes,
    filename: str = "sprite.png",
    width: int = 0,
    height: int = 0,
    media_type: str = "image/png",
) -> dict:
    """Analyze a sprite sheet image with Claude Vision and return metadata suggestions."""

    try:
        b64 = base64.b64encode(image_data).decode("utf-8")

        client = AsyncAnthropic(api_key=settings.anthropic_api_key)

        response = await client.messages.create(
            model=settings.claude_sonnet_model,
            max_tokens=2000,
            system=ANALYZE_SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": b64,
                            },
                        },
                        {
                            "type": "text",
                            "text": ANALYZE_USER_PROMPT.format(
                                width=width,
                                height=height,
                                filename=filename,
                            ),
                        },
                    ],
                }
            ],
        )

        raw = response.content[0].text.strip()

        # Strip markdown backticks if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

        result = json.loads(raw)

        logger.info(
            f"âœ… Analyzed sprite: {filename} â†’ type={result.get('asset_type')}, "
            f"personality={result.get('movement', {}).get('personality', 'N/A')}"
        )

        return {
            "status": "ok",
            "analysis": result,
            "model": settings.claude_sonnet_model,
        }

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Claude response as JSON: {e}\nRaw: {raw[:500]}")
        return {
            "status": "error",
            "message": f"Invalid JSON from AI: {e}",
            "raw": raw[:500],
        }
    except Exception as e:
        logger.error(f"Sprite analysis failed: {e}")
        return {"status": "error", "message": str(e)}
