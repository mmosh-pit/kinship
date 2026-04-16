"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    THEME GENERATOR                                            ║
║                                                                               ║
║  Generates narrative context and themes for scenes.                           ║
║                                                                               ║
║  PROVIDES:                                                                    ║
║  • Scene themes (forest village, abandoned mine, etc.)                        ║
║  • Narrative hooks                                                            ║
║  • NPC dialogue context                                                       ║
║  • Environmental storytelling hints                                           ║
║                                                                               ║
║  Used by AI agents to generate consistent, themed content.                    ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from dataclasses import dataclass, field
from typing import Optional
from enum import Enum
import random


# ═══════════════════════════════════════════════════════════════════════════════
#  THEME CATEGORIES
# ═══════════════════════════════════════════════════════════════════════════════


class ThemeCategory(str, Enum):
    """Categories of themes."""

    NATURE = "nature"  # Forests, meadows, beaches
    SETTLEMENT = "settlement"  # Villages, towns, cities
    DUNGEON = "dungeon"  # Caves, ruins, temples
    MYSTICAL = "mystical"  # Magical places
    INDUSTRIAL = "industrial"  # Factories, mines
    DOMESTIC = "domestic"  # Houses, farms


class Mood(str, Enum):
    """Scene mood/atmosphere."""

    PEACEFUL = "peaceful"
    MYSTERIOUS = "mysterious"
    DANGEROUS = "dangerous"
    CHEERFUL = "cheerful"
    MELANCHOLIC = "melancholic"
    ADVENTUROUS = "adventurous"
    COZY = "cozy"


class TimeOfDay(str, Enum):
    """Time of day setting."""

    DAWN = "dawn"
    MORNING = "morning"
    NOON = "noon"
    AFTERNOON = "afternoon"
    DUSK = "dusk"
    NIGHT = "night"


class Season(str, Enum):
    """Season setting."""

    SPRING = "spring"
    SUMMER = "summer"
    AUTUMN = "autumn"
    WINTER = "winter"


# ═══════════════════════════════════════════════════════════════════════════════
#  THEME DEFINITION
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class ThemeDefinition:
    """Complete theme definition for a scene."""

    theme_id: str
    name: str
    category: ThemeCategory

    # Atmosphere
    moods: list[Mood] = field(default_factory=list)

    # Visual style
    color_palette: list[str] = field(default_factory=list)
    weather_options: list[str] = field(default_factory=list)

    # Assets
    recommended_terrain: list[str] = field(default_factory=list)
    recommended_objects: list[str] = field(default_factory=list)
    recommended_npcs: list[str] = field(default_factory=list)

    # Narrative
    narrative_hooks: list[str] = field(default_factory=list)
    environmental_details: list[str] = field(default_factory=list)

    # Sound
    ambient_sounds: list[str] = field(default_factory=list)
    music_style: str = ""

    # Compatible mechanics
    recommended_mechanics: list[str] = field(default_factory=list)


@dataclass
class NarrativeContext:
    """Narrative context for AI content generation."""

    theme: ThemeDefinition

    # Current scene settings
    time_of_day: TimeOfDay = TimeOfDay.MORNING
    season: Season = Season.SUMMER
    mood: Mood = Mood.PEACEFUL

    # Story elements
    story_hook: str = ""
    objective_description: str = ""
    conflict: str = ""
    resolution_hint: str = ""

    # NPC context
    npc_motivations: dict[str, str] = field(default_factory=dict)
    dialogue_style: str = "friendly"

    # Environmental details
    active_details: list[str] = field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════════
#  PREDEFINED THEMES
# ═══════════════════════════════════════════════════════════════════════════════

THEMES: dict[str, ThemeDefinition] = {
    # ─── NATURE THEMES ─────────────────────────────────────────────────────────
    "forest_village": ThemeDefinition(
        theme_id="forest_village",
        name="Forest Village",
        category=ThemeCategory.NATURE,
        moods=[Mood.PEACEFUL, Mood.COZY, Mood.ADVENTUROUS],
        color_palette=["#228B22", "#8B4513", "#87CEEB", "#F5DEB3"],
        weather_options=["clear", "light_rain", "misty"],
        recommended_terrain=["grass", "dirt_path", "forest_floor"],
        recommended_objects=["tree", "bush", "flower", "log", "mushroom", "cottage"],
        recommended_npcs=["villager", "woodcutter", "herbalist", "hunter"],
        narrative_hooks=[
            "The village elder needs help gathering herbs from the forest.",
            "Strange noises have been heard in the woods at night.",
            "A traveling merchant has arrived with mysterious goods.",
        ],
        environmental_details=[
            "Birds chirp in the canopy above.",
            "The smell of pine fills the air.",
            "Sunlight filters through the leaves.",
        ],
        ambient_sounds=["birds", "wind_leaves", "distant_water"],
        music_style="pastoral",
        recommended_mechanics=["collect_items", "talk_to_npc", "deliver_item"],
    ),
    "meadow": ThemeDefinition(
        theme_id="meadow",
        name="Sunny Meadow",
        category=ThemeCategory.NATURE,
        moods=[Mood.PEACEFUL, Mood.CHEERFUL],
        color_palette=["#90EE90", "#FFD700", "#87CEEB", "#FFEFD5"],
        weather_options=["clear", "partly_cloudy"],
        recommended_terrain=["grass", "wildflowers", "stone_path"],
        recommended_objects=["flower", "butterfly", "beehive", "well", "fence"],
        recommended_npcs=["farmer", "child", "shepherd"],
        narrative_hooks=[
            "The butterflies seem to be gathering around something special.",
            "A farmer's sheep have wandered into the meadow.",
        ],
        environmental_details=[
            "Wildflowers sway in the gentle breeze.",
            "Butterflies dance between the blossoms.",
            "The grass is soft underfoot.",
        ],
        ambient_sounds=["wind_grass", "bees", "birds"],
        music_style="light_pastoral",
        recommended_mechanics=["collect_items", "escort_npc"],
    ),
    "beach": ThemeDefinition(
        theme_id="beach",
        name="Sandy Beach",
        category=ThemeCategory.NATURE,
        moods=[Mood.PEACEFUL, Mood.ADVENTUROUS],
        color_palette=["#F5DEB3", "#00CED1", "#87CEEB", "#FFE4B5"],
        weather_options=["clear", "cloudy"],
        recommended_terrain=["sand", "shallow_water", "rocks"],
        recommended_objects=["palm_tree", "shell", "crab", "treasure_chest", "boat"],
        recommended_npcs=["fisherman", "sailor", "beachcomber"],
        narrative_hooks=[
            "A bottle with a message has washed ashore.",
            "The old fisherman knows where the treasure is buried.",
        ],
        environmental_details=[
            "Waves lap gently at the shore.",
            "Seagulls cry overhead.",
            "Shells glitter in the wet sand.",
        ],
        ambient_sounds=["waves", "seagulls", "wind"],
        music_style="tropical",
        recommended_mechanics=["collect_items", "push_to_target"],
    ),
    # ─── SETTLEMENT THEMES ─────────────────────────────────────────────────────
    "market_town": ThemeDefinition(
        theme_id="market_town",
        name="Busy Market Town",
        category=ThemeCategory.SETTLEMENT,
        moods=[Mood.CHEERFUL, Mood.ADVENTUROUS],
        color_palette=["#D2691E", "#8B4513", "#FFE4B5", "#CD853F"],
        weather_options=["clear", "overcast"],
        recommended_terrain=["cobblestone", "wooden_floor", "market_stall"],
        recommended_objects=["stall", "barrel", "crate", "cart", "lantern", "sign"],
        recommended_npcs=["merchant", "baker", "blacksmith", "guard", "traveler"],
        narrative_hooks=[
            "The merchant's prized goods have been stolen!",
            "A festival is being prepared, but supplies are missing.",
            "A mysterious stranger is asking questions about ancient relics.",
        ],
        environmental_details=[
            "Vendors call out their wares.",
            "The smell of fresh bread wafts from the bakery.",
            "Colorful banners flutter in the breeze.",
        ],
        ambient_sounds=["crowd_chatter", "merchant_calls", "cart_wheels"],
        music_style="medieval_festive",
        recommended_mechanics=[
            "trade_items",
            "talk_to_npc",
            "deliver_item",
            "collect_items",
        ],
    ),
    "quiet_village": ThemeDefinition(
        theme_id="quiet_village",
        name="Quiet Village",
        category=ThemeCategory.SETTLEMENT,
        moods=[Mood.PEACEFUL, Mood.COZY, Mood.MELANCHOLIC],
        color_palette=["#DEB887", "#8B4513", "#90EE90", "#F5F5DC"],
        weather_options=["clear", "light_rain", "misty"],
        recommended_terrain=["dirt_path", "grass", "cobblestone"],
        recommended_objects=["cottage", "well", "fence", "hay_bale", "windmill"],
        recommended_npcs=["elder", "villager", "child", "farmer"],
        narrative_hooks=[
            "The village has a problem they need an outsider to solve.",
            "Something is wrong with the crops this year.",
            "The children speak of a friendly spirit in the woods.",
        ],
        environmental_details=[
            "Smoke rises from cottage chimneys.",
            "A dog barks in the distance.",
            "Laundry dries on lines between houses.",
        ],
        ambient_sounds=["wind", "distant_dog", "chickens"],
        music_style="folk",
        recommended_mechanics=["talk_to_npc", "collect_items", "deliver_item"],
    ),
    # ─── DUNGEON THEMES ────────────────────────────────────────────────────────
    "ancient_ruins": ThemeDefinition(
        theme_id="ancient_ruins",
        name="Ancient Ruins",
        category=ThemeCategory.DUNGEON,
        moods=[Mood.MYSTERIOUS, Mood.DANGEROUS, Mood.ADVENTUROUS],
        color_palette=["#696969", "#8B8B83", "#DEB887", "#483D8B"],
        weather_options=["clear", "misty", "overcast"],
        recommended_terrain=["stone", "rubble", "cracked_floor", "overgrown"],
        recommended_objects=["pillar", "statue", "chest", "torch", "cobweb", "debris"],
        recommended_npcs=["explorer", "ghost", "guardian"],
        narrative_hooks=[
            "These ruins hold secrets of an ancient civilization.",
            "A treasure lies within, but so does danger.",
            "The statues seem to watch your every move.",
        ],
        environmental_details=[
            "Dust motes float in shafts of light.",
            "Ancient symbols cover the walls.",
            "The air smells of age and mystery.",
        ],
        ambient_sounds=["wind_hollow", "dripping_water", "distant_rumble"],
        music_style="mysterious_orchestral",
        recommended_mechanics=[
            "push_to_target",
            "sequence_activate",
            "key_unlock",
            "avoid_hazard",
        ],
    ),
    "dark_cave": ThemeDefinition(
        theme_id="dark_cave",
        name="Dark Cave",
        category=ThemeCategory.DUNGEON,
        moods=[Mood.DANGEROUS, Mood.MYSTERIOUS],
        color_palette=["#2F4F4F", "#3D3D3D", "#483D8B", "#8B4513"],
        weather_options=["none"],  # Indoor
        recommended_terrain=["stone", "cave_floor", "underground_water"],
        recommended_objects=["stalactite", "crystal", "torch", "rock", "mushroom"],
        recommended_npcs=["miner", "bat", "slime"],
        narrative_hooks=[
            "Strange lights glow deep in the cave.",
            "A miner went in and never came out.",
            "Legends speak of crystals with magical properties.",
        ],
        environmental_details=[
            "Water drips from the ceiling.",
            "Your footsteps echo in the darkness.",
            "Crystals glimmer in the torchlight.",
        ],
        ambient_sounds=["dripping_water", "bat_wings", "echoes"],
        music_style="ambient_dark",
        recommended_mechanics=[
            "avoid_hazard",
            "collect_items",
            "push_to_target",
            "stack_climb",
        ],
    ),
    "temple": ThemeDefinition(
        theme_id="temple",
        name="Ancient Temple",
        category=ThemeCategory.DUNGEON,
        moods=[Mood.MYSTERIOUS, Mood.ADVENTUROUS],
        color_palette=["#D4AF37", "#8B4513", "#483D8B", "#FFE4B5"],
        weather_options=["none"],  # Indoor
        recommended_terrain=["ornate_floor", "sacred_ground", "altar_area"],
        recommended_objects=["altar", "statue", "torch", "pillar", "treasure", "trap"],
        recommended_npcs=["priest", "guardian_spirit", "trapped_soul"],
        narrative_hooks=[
            "The temple tests those who seek its treasures.",
            "Ancient guardians protect what lies within.",
            "To proceed, you must prove your worth.",
        ],
        environmental_details=[
            "Torchlight flickers on golden walls.",
            "Incense smoke drifts through the air.",
            "Ancient murals depict forgotten gods.",
        ],
        ambient_sounds=["torch_crackle", "distant_chanting", "stone_grinding"],
        music_style="epic_mysterious",
        recommended_mechanics=[
            "sequence_activate",
            "pressure_plate",
            "push_to_target",
            "bridge_gap",
        ],
    ),
    # ─── MYSTICAL THEMES ───────────────────────────────────────────────────────
    "enchanted_forest": ThemeDefinition(
        theme_id="enchanted_forest",
        name="Enchanted Forest",
        category=ThemeCategory.MYSTICAL,
        moods=[Mood.MYSTERIOUS, Mood.PEACEFUL, Mood.ADVENTUROUS],
        color_palette=["#9370DB", "#00FA9A", "#4169E1", "#FFD700"],
        weather_options=["misty", "clear", "magical_sparkles"],
        recommended_terrain=["magic_grass", "glowing_path", "fairy_ring"],
        recommended_objects=[
            "magic_tree",
            "glowing_flower",
            "fairy",
            "crystal",
            "portal",
        ],
        recommended_npcs=["fairy", "wizard", "spirit", "talking_animal"],
        narrative_hooks=[
            "The forest has chosen you for a quest.",
            "A magical creature needs your help.",
            "The fairy queen wishes to speak with you.",
        ],
        environmental_details=[
            "Fireflies dance between the trees.",
            "The flowers seem to glow from within.",
            "A gentle hum of magic fills the air.",
        ],
        ambient_sounds=["magical_chimes", "gentle_wind", "fairy_giggles"],
        music_style="whimsical_orchestral",
        recommended_mechanics=["collect_items", "talk_to_npc", "sequence_activate"],
    ),
    # ─── DOMESTIC THEMES ───────────────────────────────────────────────────────
    "cozy_farm": ThemeDefinition(
        theme_id="cozy_farm",
        name="Cozy Farm",
        category=ThemeCategory.DOMESTIC,
        moods=[Mood.COZY, Mood.PEACEFUL, Mood.CHEERFUL],
        color_palette=["#8B4513", "#90EE90", "#FFD700", "#F5DEB3"],
        weather_options=["clear", "light_rain"],
        recommended_terrain=["dirt", "grass", "crop_field", "wooden_floor"],
        recommended_objects=["barn", "tractor", "hay", "crops", "chicken", "pig"],
        recommended_npcs=["farmer", "farm_hand", "child"],
        narrative_hooks=[
            "The farm needs help bringing in the harvest.",
            "The animals have escaped their pens!",
            "Something has been eating the crops at night.",
        ],
        environmental_details=[
            "Chickens peck at the ground.",
            "The smell of fresh hay fills the air.",
            "A tractor sits ready for work.",
        ],
        ambient_sounds=["chickens", "cow_moo", "wind_grass"],
        music_style="country_folk",
        recommended_mechanics=["collect_items", "deliver_item", "escort_npc"],
    ),
}


# ═══════════════════════════════════════════════════════════════════════════════
#  THEME FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════


def get_theme(theme_id: str) -> Optional[ThemeDefinition]:
    """Get a theme by ID."""
    return THEMES.get(theme_id)


def get_all_themes() -> dict[str, ThemeDefinition]:
    """Get all themes."""
    return THEMES


def get_themes_by_category(category: ThemeCategory) -> list[ThemeDefinition]:
    """Get all themes in a category."""
    return [t for t in THEMES.values() if t.category == category]


def suggest_theme(
    mechanics: list[str],
    mood: Mood = None,
) -> Optional[ThemeDefinition]:
    """
    Suggest a theme based on mechanics and mood.

    Args:
        mechanics: Planned mechanics for scene
        mood: Desired mood

    Returns:
        Best matching theme
    """
    best = None
    best_score = -1

    for theme in THEMES.values():
        score = 0

        # Score by mechanic match
        for mech in mechanics:
            if mech in theme.recommended_mechanics:
                score += 2

        # Score by mood match
        if mood and mood in theme.moods:
            score += 3

        if score > best_score:
            best_score = score
            best = theme

    return best


def generate_narrative_context(
    theme: ThemeDefinition,
    mechanics: list[str],
    time_of_day: TimeOfDay = None,
    season: Season = None,
) -> NarrativeContext:
    """
    Generate full narrative context for a scene.

    Args:
        theme: Scene theme
        mechanics: Planned mechanics
        time_of_day: Optional time setting
        season: Optional season

    Returns:
        NarrativeContext with all details
    """
    # Choose random options if not specified
    mood = random.choice(theme.moods) if theme.moods else Mood.PEACEFUL
    time = time_of_day or random.choice(list(TimeOfDay))
    seas = season or random.choice(list(Season))

    # Pick narrative hook
    hook = random.choice(theme.narrative_hooks) if theme.narrative_hooks else ""

    # Pick environmental details
    details = (
        random.sample(
            theme.environmental_details, min(3, len(theme.environmental_details))
        )
        if theme.environmental_details
        else []
    )

    # Generate objective from mechanics
    objective = _generate_objective(mechanics)

    return NarrativeContext(
        theme=theme,
        time_of_day=time,
        season=seas,
        mood=mood,
        story_hook=hook,
        objective_description=objective,
        active_details=details,
        dialogue_style=_get_dialogue_style(mood),
    )


def _generate_objective(mechanics: list[str]) -> str:
    """Generate an objective description from mechanics."""

    objectives = {
        "collect_items": "Gather the items needed for the quest.",
        "deliver_item": "Bring the package to its destination.",
        "talk_to_npc": "Speak with the locals to learn more.",
        "push_to_target": "Move the objects to unlock the path.",
        "key_unlock": "Find the key and unlock the passage.",
        "reach_destination": "Make your way to the goal.",
        "avoid_hazard": "Navigate carefully through the dangers.",
        "sequence_activate": "Solve the puzzle to proceed.",
        "trade_items": "Trade with the merchant for what you need.",
        "escort_npc": "Guide the traveler safely to their destination.",
    }

    if not mechanics:
        return "Explore and discover what awaits."

    primary = mechanics[0]
    return objectives.get(primary, "Complete the challenges ahead.")


def _get_dialogue_style(mood: Mood) -> str:
    """Get dialogue style based on mood."""

    styles = {
        Mood.PEACEFUL: "friendly",
        Mood.MYSTERIOUS: "cryptic",
        Mood.DANGEROUS: "urgent",
        Mood.CHEERFUL: "enthusiastic",
        Mood.MELANCHOLIC: "wistful",
        Mood.ADVENTUROUS: "encouraging",
        Mood.COZY: "warm",
    }

    return styles.get(mood, "neutral")


def get_ai_prompt_context(context: NarrativeContext) -> str:
    """
    Generate context string for AI content generation.

    Returns a prompt-ready string describing the scene context.
    """

    theme = context.theme

    prompt = f"""
SCENE CONTEXT:
- Theme: {theme.name}
- Category: {theme.category.value}
- Mood: {context.mood.value}
- Time: {context.time_of_day.value}
- Season: {context.season.value}

STORY HOOK:
{context.story_hook}

OBJECTIVE:
{context.objective_description}

ENVIRONMENTAL DETAILS:
{chr(10).join('- ' + d for d in context.active_details)}

DIALOGUE STYLE: {context.dialogue_style}

RECOMMENDED ELEMENTS:
- Objects: {', '.join(theme.recommended_objects[:5])}
- NPCs: {', '.join(theme.recommended_npcs[:3])}
- Sounds: {', '.join(theme.ambient_sounds[:3])}
"""

    return prompt.strip()
