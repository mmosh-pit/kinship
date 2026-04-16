"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    GAMEPLAY LOOP PLANNER                                      ║
║                                                                               ║
║  Goal-driven generation instead of mechanic-driven.                           ║
║                                                                               ║
║  FLOW:                                                                        ║
║  1. Start with player GOAL (escape forest, rescue villager)                   ║
║  2. Expand goal into gameplay steps                                           ║
║  3. Assign mechanics to each step                                             ║
║  4. Build coherent challenges                                                 ║
║                                                                               ║
║  Without goals: random but valid gameplay                                     ║
║  With goals: structured, meaningful gameplay                                  ║
║                                                                               ║
║  EXAMPLE:                                                                     ║
║  Goal: "Rescue trapped villager"                                              ║
║    → Find key                                                                 ║
║    → Unlock cave                                                              ║
║    → Escort villager                                                          ║
║    → Reach exit                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


# ═══════════════════════════════════════════════════════════════════════════════
#  GOAL TYPES
# ═══════════════════════════════════════════════════════════════════════════════


class GoalType(str, Enum):
    """High-level player goal types."""

    # Exploration
    ESCAPE = "escape"  # Get out of somewhere
    EXPLORE = "explore"  # Discover an area
    REACH = "reach"  # Get to a destination

    # Quest
    RESCUE = "rescue"  # Save someone
    DELIVER = "deliver"  # Bring item to destination
    FETCH = "fetch"  # Get something and return
    GATHER = "gather"  # Collect multiple items

    # Combat
    DEFEAT = "defeat"  # Beat enemies
    DEFEND = "defend"  # Protect something
    SURVIVE = "survive"  # Stay alive

    # Puzzle
    UNLOCK = "unlock"  # Open a path
    SOLVE = "solve"  # Figure something out
    ACTIVATE = "activate"  # Turn something on

    # Social
    BEFRIEND = "befriend"  # Make an ally
    TRADE = "trade"  # Exchange items
    LEARN = "learn"  # Gain knowledge

    # Building
    BUILD = "build"  # Construct something
    REPAIR = "repair"  # Fix something
    CRAFT = "craft"  # Make an item


# ═══════════════════════════════════════════════════════════════════════════════
#  GAMEPLAY STEP
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class GameplayStep:
    """A single step in the gameplay loop."""

    step_id: str
    description: str

    # Possible mechanics for this step
    mechanic_options: list[str] = field(default_factory=list)

    # Assigned mechanic (filled during planning)
    assigned_mechanic: Optional[str] = None

    # NPC involvement
    requires_npc: bool = False
    npc_role: Optional[str] = None

    # Is this step required or optional?
    required: bool = True

    # Narrative beat
    narrative_beat: str = ""  # "introduction", "rising_action", "climax", "resolution"


# ═══════════════════════════════════════════════════════════════════════════════
#  GAMEPLAY LOOP
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class GameplayLoop:
    """A complete gameplay loop for a goal."""

    loop_id: str
    goal_type: GoalType
    goal_description: str

    # Steps in order
    steps: list[GameplayStep] = field(default_factory=list)

    # Narrative
    story_hook: str = ""
    resolution: str = ""

    # Requirements
    min_scenes: int = 1
    max_scenes: int = 1

    # Tags for matching
    tags: list[str] = field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════════
#  PREDEFINED GAMEPLAY LOOPS
# ═══════════════════════════════════════════════════════════════════════════════

GAMEPLAY_LOOPS: dict[str, GameplayLoop] = {
    # ─── ESCAPE LOOPS ──────────────────────────────────────────────────────────
    "escape_forest": GameplayLoop(
        loop_id="escape_forest",
        goal_type=GoalType.ESCAPE,
        goal_description="Find your way out of the forest",
        steps=[
            GameplayStep(
                step_id="meet_guide",
                description="Meet a guide who knows the way",
                mechanic_options=["talk_to_npc"],
                requires_npc=True,
                npc_role="guide",
                narrative_beat="introduction",
            ),
            GameplayStep(
                step_id="gather_supplies",
                description="Collect supplies for the journey",
                mechanic_options=["collect_items", "collect_all"],
                narrative_beat="rising_action",
            ),
            GameplayStep(
                step_id="unlock_path",
                description="Open the blocked path",
                mechanic_options=["key_unlock", "lever_activate", "push_to_target"],
                narrative_beat="climax",
            ),
            GameplayStep(
                step_id="reach_exit",
                description="Make it to the forest exit",
                mechanic_options=["reach_destination", "avoid_hazard"],
                narrative_beat="resolution",
            ),
        ],
        story_hook="You find yourself lost in a dense forest...",
        resolution="You emerge from the forest into sunlight!",
        tags=["nature", "exploration", "beginner"],
    ),
    "escape_dungeon": GameplayLoop(
        loop_id="escape_dungeon",
        goal_type=GoalType.ESCAPE,
        goal_description="Escape from the dungeon",
        steps=[
            GameplayStep(
                step_id="find_key",
                description="Find the key to your cell",
                mechanic_options=["collect_items", "push_to_target"],
                narrative_beat="introduction",
            ),
            GameplayStep(
                step_id="unlock_cell",
                description="Unlock your cell door",
                mechanic_options=["key_unlock"],
                narrative_beat="rising_action",
            ),
            GameplayStep(
                step_id="avoid_guards",
                description="Sneak past the guards",
                mechanic_options=["avoid_hazard", "reach_destination"],
                narrative_beat="climax",
            ),
            GameplayStep(
                step_id="escape",
                description="Reach the exit",
                mechanic_options=["reach_destination"],
                narrative_beat="resolution",
            ),
        ],
        story_hook="You wake up in a cold dungeon cell...",
        resolution="Freedom! You escape into the night!",
        tags=["dungeon", "stealth", "intermediate"],
    ),
    # ─── RESCUE LOOPS ──────────────────────────────────────────────────────────
    "rescue_villager": GameplayLoop(
        loop_id="rescue_villager",
        goal_type=GoalType.RESCUE,
        goal_description="Rescue a trapped villager",
        steps=[
            GameplayStep(
                step_id="learn_situation",
                description="Talk to someone who knows what happened",
                mechanic_options=["talk_to_npc"],
                requires_npc=True,
                npc_role="quest_giver",
                narrative_beat="introduction",
            ),
            GameplayStep(
                step_id="find_key",
                description="Find the key to free them",
                mechanic_options=[
                    "collect_items",
                    "push_to_target",
                    "sequence_activate",
                ],
                narrative_beat="rising_action",
            ),
            GameplayStep(
                step_id="unlock_prison",
                description="Unlock where they're trapped",
                mechanic_options=["key_unlock", "lever_activate"],
                narrative_beat="climax",
            ),
            GameplayStep(
                step_id="escort_home",
                description="Guide them to safety",
                mechanic_options=["escort_npc", "reach_destination"],
                requires_npc=True,
                npc_role="escort_target",
                narrative_beat="resolution",
            ),
        ],
        story_hook="A villager has been trapped and needs your help!",
        resolution="The villager is safe thanks to you!",
        tags=["rescue", "quest", "social"],
    ),
    "rescue_animal": GameplayLoop(
        loop_id="rescue_animal",
        goal_type=GoalType.RESCUE,
        goal_description="Save a trapped animal",
        steps=[
            GameplayStep(
                step_id="find_animal",
                description="Locate the trapped animal",
                mechanic_options=["reach_destination", "collect_items"],
                narrative_beat="introduction",
            ),
            GameplayStep(
                step_id="free_animal",
                description="Free the animal from the trap",
                mechanic_options=["push_to_target", "lever_activate", "key_unlock"],
                narrative_beat="climax",
            ),
            GameplayStep(
                step_id="report_back",
                description="Tell the owner the good news",
                mechanic_options=["talk_to_npc"],
                requires_npc=True,
                npc_role="quest_giver",
                narrative_beat="resolution",
            ),
        ],
        story_hook="A beloved pet has gone missing and may be in danger!",
        resolution="The animal is free and safe!",
        tags=["rescue", "animals", "beginner"],
    ),
    # ─── FETCH/DELIVERY LOOPS ──────────────────────────────────────────────────
    "fetch_quest": GameplayLoop(
        loop_id="fetch_quest",
        goal_type=GoalType.FETCH,
        goal_description="Retrieve an item and return it",
        steps=[
            GameplayStep(
                step_id="get_quest",
                description="Learn what needs to be fetched",
                mechanic_options=["talk_to_npc"],
                requires_npc=True,
                npc_role="quest_giver",
                narrative_beat="introduction",
            ),
            GameplayStep(
                step_id="find_item",
                description="Find the requested item",
                mechanic_options=["collect_items", "push_to_target"],
                narrative_beat="rising_action",
            ),
            GameplayStep(
                step_id="return_item",
                description="Bring the item back",
                mechanic_options=["deliver_item"],
                requires_npc=True,
                npc_role="quest_giver",
                narrative_beat="resolution",
            ),
        ],
        story_hook="Someone needs you to retrieve something important...",
        resolution="Quest complete! You delivered the item!",
        tags=["fetch", "quest", "beginner"],
    ),
    "delivery_quest": GameplayLoop(
        loop_id="delivery_quest",
        goal_type=GoalType.DELIVER,
        goal_description="Deliver a package safely",
        steps=[
            GameplayStep(
                step_id="receive_package",
                description="Get the package to deliver",
                mechanic_options=["talk_to_npc", "collect_items"],
                requires_npc=True,
                npc_role="quest_giver",
                narrative_beat="introduction",
            ),
            GameplayStep(
                step_id="travel",
                description="Travel to the destination",
                mechanic_options=["reach_destination", "avoid_hazard"],
                narrative_beat="rising_action",
            ),
            GameplayStep(
                step_id="deliver",
                description="Hand over the package",
                mechanic_options=["deliver_item", "talk_to_npc"],
                requires_npc=True,
                npc_role="villager",
                narrative_beat="resolution",
            ),
        ],
        story_hook="An important package needs to reach its destination...",
        resolution="The package was delivered safely!",
        tags=["delivery", "travel", "beginner"],
    ),
    # ─── GATHER/COLLECTION LOOPS ───────────────────────────────────────────────
    "gather_coins": GameplayLoop(
        loop_id="gather_coins",
        goal_type=GoalType.GATHER,
        goal_description="Collect all the coins scattered around",
        steps=[
            GameplayStep(
                step_id="start_collecting",
                description="Begin gathering items",
                mechanic_options=["collect_items", "collect_all"],
                narrative_beat="introduction",
            ),
            GameplayStep(
                step_id="explore_area",
                description="Search the area for more items",
                mechanic_options=["collect_items", "reach_destination"],
                narrative_beat="rising_action",
            ),
            GameplayStep(
                step_id="complete_collection",
                description="Gather the final items",
                mechanic_options=["collect_items", "collect_all"],
                narrative_beat="resolution",
            ),
        ],
        story_hook="Valuable items are scattered throughout the area...",
        resolution="You collected everything! Great job!",
        tags=["collect", "gather", "beginner", "coins"],
    ),
    "treasure_hunt": GameplayLoop(
        loop_id="treasure_hunt",
        goal_type=GoalType.GATHER,
        goal_description="Find hidden treasures",
        steps=[
            GameplayStep(
                step_id="get_clue",
                description="Learn about the hidden treasure",
                mechanic_options=["talk_to_npc", "collect_items"],
                requires_npc=True,
                npc_role="guide",
                narrative_beat="introduction",
            ),
            GameplayStep(
                step_id="search_area",
                description="Search for treasure",
                mechanic_options=["collect_items", "reach_destination"],
                narrative_beat="rising_action",
            ),
            GameplayStep(
                step_id="find_treasure",
                description="Collect the treasure",
                mechanic_options=["collect_items", "collect_all"],
                narrative_beat="climax",
            ),
        ],
        story_hook="Legends speak of treasure hidden in this area...",
        resolution="You found all the treasure!",
        tags=["treasure", "collect", "adventure"],
    ),
    "scavenger_hunt": GameplayLoop(
        loop_id="scavenger_hunt",
        goal_type=GoalType.GATHER,
        goal_description="Find all the items on the list",
        steps=[
            GameplayStep(
                step_id="get_list",
                description="Get the list of items to find",
                mechanic_options=["talk_to_npc"],
                requires_npc=True,
                npc_role="quest_giver",
                narrative_beat="introduction",
            ),
            GameplayStep(
                step_id="collect_items",
                description="Collect items from the list",
                mechanic_options=["collect_items", "collect_all"],
                narrative_beat="rising_action",
            ),
            GameplayStep(
                step_id="return_items",
                description="Return with all the items",
                mechanic_options=["deliver_item", "talk_to_npc"],
                requires_npc=True,
                npc_role="quest_giver",
                narrative_beat="resolution",
            ),
        ],
        story_hook="A scavenger hunt has been organized...",
        resolution="You found everything on the list!",
        tags=["scavenger", "collect", "quest"],
    ),
    # ─── PUZZLE LOOPS ──────────────────────────────────────────────────────────
    "unlock_temple": GameplayLoop(
        loop_id="unlock_temple",
        goal_type=GoalType.UNLOCK,
        goal_description="Open the sealed temple",
        steps=[
            GameplayStep(
                step_id="examine_door",
                description="Examine the sealed door",
                mechanic_options=["talk_to_npc", "reach_destination"],
                narrative_beat="introduction",
            ),
            GameplayStep(
                step_id="solve_puzzle_1",
                description="Solve the first puzzle",
                mechanic_options=[
                    "push_to_target",
                    "sequence_activate",
                    "pressure_plate",
                ],
                narrative_beat="rising_action",
            ),
            GameplayStep(
                step_id="solve_puzzle_2",
                description="Solve the second puzzle",
                mechanic_options=["sequence_activate", "bridge_gap", "stack_climb"],
                narrative_beat="climax",
            ),
            GameplayStep(
                step_id="enter_temple",
                description="Enter the now-open temple",
                mechanic_options=["reach_destination"],
                narrative_beat="resolution",
            ),
        ],
        story_hook="An ancient temple holds secrets behind its sealed doors...",
        resolution="The temple doors swing open before you!",
        tags=["puzzle", "temple", "intermediate"],
    ),
    "bridge_crossing": GameplayLoop(
        loop_id="bridge_crossing",
        goal_type=GoalType.SOLVE,
        goal_description="Build a way across the gap",
        steps=[
            GameplayStep(
                step_id="assess_gap",
                description="Examine the obstacle",
                mechanic_options=["reach_destination"],
                narrative_beat="introduction",
            ),
            GameplayStep(
                step_id="gather_materials",
                description="Find materials to build with",
                mechanic_options=["collect_items", "push_to_target"],
                narrative_beat="rising_action",
            ),
            GameplayStep(
                step_id="build_bridge",
                description="Construct the bridge",
                mechanic_options=["bridge_gap", "stack_climb"],
                narrative_beat="climax",
            ),
            GameplayStep(
                step_id="cross",
                description="Cross to the other side",
                mechanic_options=["reach_destination"],
                narrative_beat="resolution",
            ),
        ],
        story_hook="A wide gap blocks your path forward...",
        resolution="You successfully crossed the gap!",
        tags=["puzzle", "construction", "intermediate"],
    ),
    # ─── COMBAT LOOPS ──────────────────────────────────────────────────────────
    "defeat_boss": GameplayLoop(
        loop_id="defeat_boss",
        goal_type=GoalType.DEFEAT,
        goal_description="Defeat the area boss",
        steps=[
            GameplayStep(
                step_id="prepare",
                description="Gather supplies for the fight",
                mechanic_options=["collect_items", "talk_to_npc"],
                narrative_beat="introduction",
            ),
            GameplayStep(
                step_id="reach_boss",
                description="Find the boss location",
                mechanic_options=["reach_destination", "avoid_hazard"],
                narrative_beat="rising_action",
            ),
            GameplayStep(
                step_id="fight",
                description="Battle the boss",
                mechanic_options=["attack_enemy"],
                narrative_beat="climax",
            ),
            GameplayStep(
                step_id="victory",
                description="Claim your reward",
                mechanic_options=["collect_items", "talk_to_npc"],
                narrative_beat="resolution",
            ),
        ],
        story_hook="A dangerous creature threatens the land...",
        resolution="The beast is defeated! You are victorious!",
        tags=["combat", "boss", "advanced"],
    ),
    "defend_village": GameplayLoop(
        loop_id="defend_village",
        goal_type=GoalType.DEFEND,
        goal_description="Protect the village from attack",
        steps=[
            GameplayStep(
                step_id="warning",
                description="Receive warning of the attack",
                mechanic_options=["talk_to_npc"],
                requires_npc=True,
                npc_role="guard",
                narrative_beat="introduction",
            ),
            GameplayStep(
                step_id="prepare_defenses",
                description="Set up defenses",
                mechanic_options=["push_to_target", "collect_items"],
                narrative_beat="rising_action",
            ),
            GameplayStep(
                step_id="defend",
                description="Defend against the attackers",
                mechanic_options=["defend_position", "attack_enemy"],
                narrative_beat="climax",
            ),
            GameplayStep(
                step_id="celebrate",
                description="Celebrate the victory",
                mechanic_options=["talk_to_npc"],
                requires_npc=True,
                npc_role="villager",
                narrative_beat="resolution",
            ),
        ],
        story_hook="Enemies are approaching! The village needs you!",
        resolution="The village is safe! You're a hero!",
        tags=["combat", "defense", "intermediate"],
    ),
    # ─── SOCIAL LOOPS ──────────────────────────────────────────────────────────
    "make_friend": GameplayLoop(
        loop_id="make_friend",
        goal_type=GoalType.BEFRIEND,
        goal_description="Befriend a lonely creature",
        steps=[
            GameplayStep(
                step_id="find_creature",
                description="Find the shy creature",
                mechanic_options=["reach_destination", "collect_items"],
                narrative_beat="introduction",
            ),
            GameplayStep(
                step_id="bring_gift",
                description="Bring something it likes",
                mechanic_options=["collect_items", "deliver_item"],
                narrative_beat="rising_action",
            ),
            GameplayStep(
                step_id="befriend",
                description="Earn its trust",
                mechanic_options=["befriend_npc", "talk_to_npc"],
                requires_npc=True,
                npc_role="villager",
                narrative_beat="resolution",
            ),
        ],
        story_hook="A lonely creature hides in the shadows...",
        resolution="You made a new friend!",
        tags=["social", "friendship", "beginner"],
    ),
    "trading_journey": GameplayLoop(
        loop_id="trading_journey",
        goal_type=GoalType.TRADE,
        goal_description="Complete a trading sequence",
        steps=[
            GameplayStep(
                step_id="get_item_1",
                description="Acquire the first trade item",
                mechanic_options=["collect_items", "talk_to_npc"],
                narrative_beat="introduction",
            ),
            GameplayStep(
                step_id="trade_1",
                description="Trade for something better",
                mechanic_options=["trade_items"],
                requires_npc=True,
                npc_role="merchant",
                narrative_beat="rising_action",
            ),
            GameplayStep(
                step_id="trade_2",
                description="Make the final trade",
                mechanic_options=["trade_items"],
                requires_npc=True,
                npc_role="merchant",
                narrative_beat="climax",
            ),
            GameplayStep(
                step_id="profit",
                description="Enjoy your reward",
                mechanic_options=["talk_to_npc"],
                narrative_beat="resolution",
            ),
        ],
        story_hook="With clever trading, a small item becomes treasure...",
        resolution="Through smart trades, you came out ahead!",
        tags=["trading", "social", "intermediate"],
    ),
    # ─── LEARNING LOOPS ────────────────────────────────────────────────────────
    "learn_skill": GameplayLoop(
        loop_id="learn_skill",
        goal_type=GoalType.LEARN,
        goal_description="Learn a new skill from a master",
        steps=[
            GameplayStep(
                step_id="find_teacher",
                description="Find someone to teach you",
                mechanic_options=["talk_to_npc", "reach_destination"],
                requires_npc=True,
                npc_role="trainer",
                narrative_beat="introduction",
            ),
            GameplayStep(
                step_id="practice",
                description="Practice the skill",
                mechanic_options=[
                    "push_to_target",
                    "sequence_activate",
                    "collect_items",
                ],
                narrative_beat="rising_action",
            ),
            GameplayStep(
                step_id="master",
                description="Demonstrate mastery",
                mechanic_options=[
                    "push_to_target",
                    "sequence_activate",
                    "pressure_plate",
                ],
                narrative_beat="climax",
            ),
            GameplayStep(
                step_id="graduate",
                description="Receive recognition",
                mechanic_options=["talk_to_npc"],
                requires_npc=True,
                npc_role="trainer",
                narrative_beat="resolution",
            ),
        ],
        story_hook="A wise teacher offers to share their knowledge...",
        resolution="You have mastered a new skill!",
        tags=["tutorial", "learning", "beginner"],
    ),
    # ─── SURVIVE LOOPS ─────────────────────────────────────────────────────────
    "survive_forest": GameplayLoop(
        loop_id="survive_forest",
        goal_type=GoalType.SURVIVE,
        goal_description="Survive in the forest until rescue arrives",
        steps=[
            GameplayStep(
                step_id="find_shelter",
                description="Find or build a safe shelter",
                mechanic_options=["build_shelter", "reach_destination"],
                narrative_beat="introduction",
            ),
            GameplayStep(
                step_id="gather_resources",
                description="Gather food and supplies before nightfall",
                mechanic_options=["collect_items", "find_food"],
                narrative_beat="rising_action",
            ),
            GameplayStep(
                step_id="defend_camp",
                description="Defend your camp from threats",
                mechanic_options=["defend_position", "avoid_hazard"],
                narrative_beat="climax",
            ),
            GameplayStep(
                step_id="signal_rescue",
                description="Signal for rescue",
                mechanic_options=["reach_destination", "lever_activate"],
                narrative_beat="resolution",
            ),
        ],
        story_hook="A storm has left you stranded in the wilderness...",
        resolution="A rescue team spots your signal!",
        tags=["survival", "nature", "timed"],
    ),
    "survive_waves": GameplayLoop(
        loop_id="survive_waves",
        goal_type=GoalType.SURVIVE,
        goal_description="Survive waves of challenges",
        steps=[
            GameplayStep(
                step_id="prepare",
                description="Prepare your defenses",
                mechanic_options=["collect_items", "push_to_target"],
                narrative_beat="introduction",
            ),
            GameplayStep(
                step_id="wave_1",
                description="Survive the first wave",
                mechanic_options=["defend_position", "avoid_hazard"],
                narrative_beat="rising_action",
            ),
            GameplayStep(
                step_id="regroup",
                description="Collect supplies between waves",
                mechanic_options=["collect_items", "find_food"],
                narrative_beat="rising_action",
            ),
            GameplayStep(
                step_id="wave_2",
                description="Survive the final wave",
                mechanic_options=["defend_position", "attack_enemy"],
                narrative_beat="climax",
            ),
        ],
        story_hook="Danger approaches from all sides...",
        resolution="The threat has passed. You survived!",
        tags=["survival", "combat", "timed", "waves"],
    ),
    # ─── DEFEND LOOPS ──────────────────────────────────────────────────────────
    "defend_village": GameplayLoop(
        loop_id="defend_village",
        goal_type=GoalType.DEFEND,
        goal_description="Protect the village from attack",
        steps=[
            GameplayStep(
                step_id="talk_to_elder",
                description="Learn about the threat from the village elder",
                mechanic_options=["talk_to_npc"],
                requires_npc=True,
                npc_role="quest_giver",
                narrative_beat="introduction",
            ),
            GameplayStep(
                step_id="build_barricades",
                description="Build defenses around the village",
                mechanic_options=["push_to_target", "build_shelter"],
                narrative_beat="rising_action",
            ),
            GameplayStep(
                step_id="arm_yourself",
                description="Find equipment for the battle",
                mechanic_options=["collect_items", "equip_item"],
                narrative_beat="rising_action",
            ),
            GameplayStep(
                step_id="defend",
                description="Defend the village!",
                mechanic_options=["defend_position", "attack_enemy"],
                narrative_beat="climax",
            ),
        ],
        story_hook="The village elder warns of approaching danger...",
        resolution="The village is saved thanks to your bravery!",
        tags=["combat", "village", "timed", "defend"],
    ),
    # ─── TIMED ESCAPE ──────────────────────────────────────────────────────────
    "timed_escape": GameplayLoop(
        loop_id="timed_escape",
        goal_type=GoalType.ESCAPE,
        goal_description="Escape before time runs out",
        steps=[
            GameplayStep(
                step_id="discover_danger",
                description="Realize you need to escape quickly",
                mechanic_options=["talk_to_npc"],
                requires_npc=True,
                npc_role="guide",
                narrative_beat="introduction",
            ),
            GameplayStep(
                step_id="find_key",
                description="Find the key to unlock the exit",
                mechanic_options=["key_unlock", "collect_items"],
                narrative_beat="rising_action",
            ),
            GameplayStep(
                step_id="navigate_hazards",
                description="Navigate through hazards to the exit",
                mechanic_options=["avoid_hazard", "reach_destination"],
                narrative_beat="climax",
            ),
            GameplayStep(
                step_id="escape",
                description="Reach the exit before it's too late",
                mechanic_options=["reach_destination"],
                narrative_beat="resolution",
            ),
        ],
        story_hook="The ground begins to shake... you must escape NOW!",
        resolution="You made it out just in time!",
        tags=["escape", "timed", "urgent"],
    ),
    # ─── TIMED GATHER ──────────────────────────────────────────────────────────
    "timed_gather": GameplayLoop(
        loop_id="timed_gather",
        goal_type=GoalType.GATHER,
        goal_description="Collect everything before time runs out",
        steps=[
            GameplayStep(
                step_id="get_list",
                description="Get the collection list from the quest giver",
                mechanic_options=["talk_to_npc"],
                requires_npc=True,
                npc_role="quest_giver",
                narrative_beat="introduction",
            ),
            GameplayStep(
                step_id="collect_fast",
                description="Race to collect all items",
                mechanic_options=["collect_items", "collect_all"],
                narrative_beat="climax",
            ),
            GameplayStep(
                step_id="deliver",
                description="Deliver the collection",
                mechanic_options=["deliver_item", "reach_destination"],
                narrative_beat="resolution",
            ),
        ],
        story_hook="Quick! Gather everything before the storm hits!",
        resolution="You collected everything just in time!",
        tags=["gather", "timed", "race"],
    ),
}


# ═══════════════════════════════════════════════════════════════════════════════
#  PLANNER RESULT
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class PlannedLoop:
    """Result of planning a gameplay loop."""

    loop: GameplayLoop

    # Assigned mechanics for each step
    mechanics: list[str] = field(default_factory=list)

    # Required NPCs
    required_npcs: list[dict] = field(default_factory=list)

    # Validation
    is_valid: bool = True
    missing_mechanics: list[str] = field(default_factory=list)

    # Narrative context
    narrative: dict = field(default_factory=dict)


# ═══════════════════════════════════════════════════════════════════════════════
#  PLANNER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════


def get_loop(loop_id: str) -> Optional[GameplayLoop]:
    """Get a gameplay loop by ID."""
    return GAMEPLAY_LOOPS.get(loop_id)


def get_all_loops() -> dict[str, GameplayLoop]:
    """Get all gameplay loops."""
    return GAMEPLAY_LOOPS


def get_loops_by_goal(goal_type: GoalType) -> list[GameplayLoop]:
    """Get all loops for a goal type."""
    return [l for l in GAMEPLAY_LOOPS.values() if l.goal_type == goal_type]


def get_loops_by_tag(tag: str) -> list[GameplayLoop]:
    """Get all loops with a specific tag."""
    return [l for l in GAMEPLAY_LOOPS.values() if tag in l.tags]


def suggest_loop(
    available_mechanics: list[str],
    preferred_goal: GoalType = None,
    tags: list[str] = None,
) -> Optional[GameplayLoop]:
    """
    Suggest the best loop based on available mechanics.

    Args:
        available_mechanics: What mechanics are available
        preferred_goal: Optional preferred goal type
        tags: Optional tags to filter by

    Returns:
        Best matching loop
    """
    candidates = list(GAMEPLAY_LOOPS.values())

    # Filter by goal
    if preferred_goal:
        goal_candidates = [l for l in candidates if l.goal_type == preferred_goal]
        if goal_candidates:
            candidates = goal_candidates

    # Filter by tags
    if tags:
        tag_candidates = [l for l in candidates if any(t in l.tags for t in tags)]
        if tag_candidates:
            candidates = tag_candidates

    # Score by mechanic availability
    best = None
    best_score = -1

    for loop in candidates:
        score = 0
        total_steps = len(loop.steps)
        fulfillable_steps = 0

        for step in loop.steps:
            # Check if any mechanic option is available
            for mech in step.mechanic_options:
                if mech in available_mechanics:
                    fulfillable_steps += 1
                    break

        score = fulfillable_steps / max(1, total_steps)

        if score > best_score:
            best_score = score
            best = loop

    return best


def plan_loop(
    loop: GameplayLoop,
    available_mechanics: list[str],
) -> PlannedLoop:
    """
    Plan a gameplay loop by assigning mechanics to steps.

    Args:
        loop: The gameplay loop to plan
        available_mechanics: What mechanics are available

    Returns:
        PlannedLoop with assigned mechanics
    """
    result = PlannedLoop(loop=loop)
    used_mechanics = set()

    for step in loop.steps:
        assigned = None

        # Try to assign a mechanic
        for mech in step.mechanic_options:
            if mech in available_mechanics:
                # Prefer unused mechanics
                if mech not in used_mechanics:
                    assigned = mech
                    used_mechanics.add(mech)
                    break
                elif assigned is None:
                    assigned = mech  # Use even if already used

        if assigned:
            result.mechanics.append(assigned)
            step.assigned_mechanic = assigned
        else:
            result.mechanics.append(None)
            result.missing_mechanics.append(
                f"Step '{step.step_id}' needs one of: {step.mechanic_options}"
            )
            result.is_valid = False

        # Track required NPCs
        if step.requires_npc and step.npc_role:
            result.required_npcs.append(
                {
                    "step": step.step_id,
                    "role": step.npc_role,
                }
            )

    # Build narrative context
    result.narrative = {
        "goal": loop.goal_description,
        "hook": loop.story_hook,
        "resolution": loop.resolution,
        "beats": [
            {
                "step": step.step_id,
                "description": step.description,
                "beat": step.narrative_beat,
                "mechanic": step.assigned_mechanic,
            }
            for step in loop.steps
        ],
    }

    return result


def plan_from_goal(
    goal_type: GoalType,
    available_mechanics: list[str],
    tags: list[str] = None,
) -> Optional[PlannedLoop]:
    """
    Plan a gameplay loop starting from a goal.

    Args:
        goal_type: The player's goal
        available_mechanics: Available mechanics
        tags: Optional filter tags

    Returns:
        PlannedLoop or None if no suitable loop found
    """
    # Find matching loop
    loop = suggest_loop(available_mechanics, goal_type, tags)

    if not loop:
        return None

    # Plan it
    return plan_loop(loop, available_mechanics)


def expand_goal_to_mechanics(
    goal_type: GoalType,
    available_mechanics: list[str],
) -> list[str]:
    """
    Expand a goal into a sequence of mechanics.

    This is the core goal-driven generation function.

    Args:
        goal_type: What the player wants to achieve
        available_mechanics: What mechanics are available

    Returns:
        Ordered list of mechanics forming a coherent loop
    """
    planned = plan_from_goal(goal_type, available_mechanics)

    if not planned or not planned.is_valid:
        return []

    return [m for m in planned.mechanics if m is not None]


# ═══════════════════════════════════════════════════════════════════════════════
#  MULTI-SCENE PLANNING
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class GamePlan:
    """Plan for a complete game across multiple scenes."""

    game_goal: str
    scenes: list[PlannedLoop] = field(default_factory=list)

    # Overall narrative
    introduction: str = ""
    conclusion: str = ""

    # Validation
    is_valid: bool = True
    issues: list[str] = field(default_factory=list)


def plan_game(
    game_goal: str,
    num_scenes: int,
    available_mechanics: list[str],
    scene_goals: list = None,
) -> "GamePlan":
    """
    Plan a complete multi-scene game.

    Args:
        game_goal: Overall game objective description
        num_scenes: Number of scenes
        available_mechanics: Available mechanics
        scene_goals: Optional specific goals per scene

    Returns:
        GamePlan with scene-by-scene loops
    """
    from app.core.gameplay_loop_planner import (
        GamePlan,
        GoalType,
        plan_from_goal,
    )

    plan = GamePlan(game_goal=game_goal)

    # Default progression if no specific goals
    if not scene_goals:
        if num_scenes == 1:
            scene_goals = [GoalType.FETCH]
        elif num_scenes == 2:
            scene_goals = [GoalType.EXPLORE, GoalType.UNLOCK]
        elif num_scenes == 3:
            scene_goals = [GoalType.LEARN, GoalType.FETCH, GoalType.ESCAPE]
        else:
            base_goals = [
                GoalType.LEARN,
                GoalType.FETCH,
                GoalType.RESCUE,
                GoalType.UNLOCK,
                GoalType.ESCAPE,
            ]
            scene_goals = [base_goals[i % len(base_goals)] for i in range(num_scenes)]

    # ═══════════════════════════════════════════════════════════════════════
    # FIX: was set(), must be dict() for .get() and [key] = value
    # ═══════════════════════════════════════════════════════════════════════
    used_mechanics: dict[str, int] = {}

    for i, goal in enumerate(scene_goals[:num_scenes]):
        # Filter out overused mechanics
        remaining = [m for m in available_mechanics if used_mechanics.get(m, 0) < 3]

        planned = plan_from_goal(goal, remaining if remaining else available_mechanics)

        if planned:
            plan.scenes.append(planned)

            # Track usage
            for mech in planned.mechanics:
                if mech:
                    used_mechanics[mech] = used_mechanics.get(mech, 0) + 1
        else:
            plan.issues.append(f"Scene {i+1}: Could not find loop for goal '{goal}'")
            plan.is_valid = False

    # Generate narrative
    if plan.scenes:
        plan.introduction = plan.scenes[0].narrative.get(
            "hook", "Your adventure begins..."
        )
        plan.conclusion = plan.scenes[-1].narrative.get(
            "resolution", "Your adventure concludes!"
        )

    return plan


# ═══════════════════════════════════════════════════════════════════════════════
#  INTEGRATION HELPERS
# ═══════════════════════════════════════════════════════════════════════════════


def get_narrative_context(planned: PlannedLoop) -> dict:
    """Get narrative context for AI content generation."""
    return planned.narrative


def get_required_npc_roles(planned: PlannedLoop) -> list[str]:
    """Get list of NPC roles needed for this loop."""
    return list(set(npc["role"] for npc in planned.required_npcs))


def validate_loop_against_scene(
    planned: PlannedLoop,
    scene_type: str,
) -> dict:
    """Check if a planned loop fits a scene type."""
    loop = planned.loop

    # Check tag compatibility
    scene_compatible_tags = {
        "forest": ["nature", "exploration", "rescue"],
        "village": ["social", "trading", "beginner"],
        "dungeon": ["puzzle", "combat", "intermediate"],
        "temple": ["puzzle", "advanced"],
        "cave": ["exploration", "rescue"],
        "town": ["social", "trading"],
    }

    compatible_tags = scene_compatible_tags.get(scene_type, [])
    matching = [t for t in loop.tags if t in compatible_tags]

    return {
        "compatible": len(matching) > 0,
        "matching_tags": matching,
        "loop_tags": loop.tags,
    }
