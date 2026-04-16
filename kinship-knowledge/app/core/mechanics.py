"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    CORE MECHANICS LIBRARY                                     ║
║                                                                               ║
║  Defines all game mechanics for the isometric game builder.                   ║
║                                                                               ║
║  STRUCTURE:                                                                   ║
║  • BASE_MECHANICS (15) - Always available                                     ║
║  • MECHANIC_PACKS (7) - Creator enables, auto-disabled if no matching assets  ║
║                                                                               ║
║  Each mechanic defines:                                                       ║
║  • required_affordances - What asset affordances are needed                   ║
║  • object_slots - What objects are involved                                   ║
║  • success_condition - How to complete                                        ║
║  • difficulty_factors - What affects difficulty                               ║
║  • hearts_facets - Which HEARTS facets are rewarded                          ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


# ═══════════════════════════════════════════════════════════════════════════════
#  MECHANIC CATEGORIES
# ═══════════════════════════════════════════════════════════════════════════════

class MechanicCategory(str, Enum):
    ENVIRONMENT = "environment"
    INTERACTION = "interaction"
    PROGRESSION = "progression"
    COMBAT = "combat"
    FARMING = "farming"
    CRAFTING = "crafting"
    SOCIAL = "social"
    SURVIVAL = "survival"
    MANAGEMENT = "management"
    PUZZLE = "puzzle"


class MechanicPack(str, Enum):
    BASE = "base"           # Always available
    COMBAT = "combat"       # Combat mechanics
    FARMING = "farming"     # Farming mechanics
    CRAFTING = "crafting"   # Crafting mechanics
    SOCIAL = "social"       # Social mechanics
    SURVIVAL = "survival"   # Survival mechanics
    MANAGEMENT = "management"  # Management mechanics
    PUZZLE = "puzzle"       # Puzzle mechanics


# ═══════════════════════════════════════════════════════════════════════════════
#  MECHANIC DEFINITION
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class ObjectSlot:
    """Defines an object role in a mechanic."""
    name: str
    affordance: Optional[str] = None    # Required affordance (if any)
    capability: Optional[str] = None    # Required capability (if any)
    min_count: int = 1
    max_count: int = 10
    is_draggable: bool = False
    is_collectible: bool = False
    is_interactable: bool = False


@dataclass
class SuccessCondition:
    """Defines how a mechanic is completed."""
    condition_type: str
    # Types: objects_in_zone, collect_count, interact_sequence, 
    #        reach_zone, unlock_target, defeat_all, time_survive
    params: dict = field(default_factory=dict)


@dataclass
class Mechanic:
    """Complete mechanic definition."""
    id: str
    name: str
    description: str
    category: MechanicCategory
    pack: MechanicPack
    
    # Requirements
    required_affordances: list[str] = field(default_factory=list)
    required_capabilities: list[str] = field(default_factory=list)
    
    # Object slots
    object_slots: dict[str, ObjectSlot] = field(default_factory=dict)
    
    # Zone requirements
    requires_goal_zone: bool = False
    requires_start_zone: bool = False
    
    # Success
    success_condition: Optional[SuccessCondition] = None
    
    # Constraints
    min_objects: int = 1
    max_objects: int = 10
    min_time_seconds: int = 15
    max_time_seconds: int = 300
    
    # Difficulty
    difficulty_factors: list[str] = field(default_factory=list)
    base_difficulty: int = 50  # 1-100
    
    # Rewards
    hearts_facets: list[str] = field(default_factory=list)
    base_score: int = 100
    
    # Templates
    description_template: str = ""
    hint_templates: list[str] = field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════════
#  BASE MECHANICS (15) - Always Available
# ═══════════════════════════════════════════════════════════════════════════════

BASE_MECHANICS: dict[str, Mechanic] = {
    
    # ─── ENVIRONMENT MECHANICS ─────────────────────────────────────────────────
    
    "push_to_target": Mechanic(
        id="push_to_target",
        name="Push to Target",
        description="Push objects to goal zones",
        category=MechanicCategory.ENVIRONMENT,
        pack=MechanicPack.BASE,
        required_affordances=["push"],
        object_slots={
            "moveable": ObjectSlot(
                name="moveable",
                affordance="push",
                min_count=1,
                max_count=10,
                is_draggable=True,
            ),
            "goal": ObjectSlot(
                name="goal",
                min_count=1,
                max_count=5,
            ),
        },
        requires_goal_zone=True,
        success_condition=SuccessCondition(
            condition_type="objects_in_zone",
            params={"object_slot": "moveable", "zone_slot": "goal", "count": "all"}
        ),
        difficulty_factors=["count", "distance", "obstacles"],
        hearts_facets=["R", "A"],
        description_template="Push {count} {asset} to the {goal}",
        hint_templates=["Look for objects you can push", "The goal zone is highlighted"],
    ),
    
    "stack_climb": Mechanic(
        id="stack_climb",
        name="Stack to Climb",
        description="Stack objects to reach higher areas",
        category=MechanicCategory.ENVIRONMENT,
        pack=MechanicPack.BASE,
        required_affordances=["stack"],
        required_capabilities=["provide_support"],
        object_slots={
            "stackable": ObjectSlot(
                name="stackable",
                affordance="stack",
                min_count=2,
                max_count=6,
                is_draggable=True,
            ),
        },
        requires_goal_zone=True,
        success_condition=SuccessCondition(
            condition_type="reach_zone",
            params={"zone": "elevated_goal"}
        ),
        difficulty_factors=["height", "stability", "count"],
        hearts_facets=["R", "T"],
        description_template="Stack {count} {asset} to reach the {goal}",
    ),
    
    "bridge_gap": Mechanic(
        id="bridge_gap",
        name="Bridge the Gap",
        description="Create a bridge over obstacles",
        category=MechanicCategory.ENVIRONMENT,
        pack=MechanicPack.BASE,
        required_affordances=["push", "drag"],
        required_capabilities=["bridge_gap"],
        object_slots={
            "bridge_piece": ObjectSlot(
                name="bridge_piece",
                capability="bridge_gap",
                min_count=1,
                max_count=5,
                is_draggable=True,
            ),
        },
        requires_goal_zone=True,
        success_condition=SuccessCondition(
            condition_type="gap_bridged",
            params={"gap_zone": "water_gap"}
        ),
        difficulty_factors=["gap_width", "piece_count"],
        hearts_facets=["A", "T"],
        description_template="Create a bridge across the {gap} using {asset}",
    ),
    
    # ─── INTERACTION MECHANICS ─────────────────────────────────────────────────
    
    "collect_items": Mechanic(
        id="collect_items",
        name="Collect Items",
        description="Gather scattered collectibles",
        category=MechanicCategory.INTERACTION,
        pack=MechanicPack.BASE,
        required_affordances=["collect"],
        object_slots={
            "collectible": ObjectSlot(
                name="collectible",
                affordance="collect",
                min_count=3,
                max_count=15,
                is_collectible=True,
            ),
        },
        success_condition=SuccessCondition(
            condition_type="collect_count",
            params={"target_count": "all"}
        ),
        difficulty_factors=["count", "spread", "hazards"],
        hearts_facets=["E", "A"],
        description_template="Collect {count} {asset}",
    ),
    
    "collect_all": Mechanic(
        id="collect_all",
        name="Find All Items",
        description="Find every hidden collectible",
        category=MechanicCategory.INTERACTION,
        pack=MechanicPack.BASE,
        required_affordances=["collect"],
        object_slots={
            "hidden": ObjectSlot(
                name="hidden",
                affordance="collect",
                min_count=3,
                max_count=10,
                is_collectible=True,
            ),
        },
        success_condition=SuccessCondition(
            condition_type="collect_count",
            params={"target_count": "all", "hidden": True}
        ),
        difficulty_factors=["hidden_count", "scene_size"],
        hearts_facets=["A", "E"],
        description_template="Find all hidden {asset}",
    ),
    
    "lever_activate": Mechanic(
        id="lever_activate",
        name="Activate Lever",
        description="Pull a lever to trigger an effect",
        category=MechanicCategory.INTERACTION,
        pack=MechanicPack.BASE,
        required_affordances=["toggle", "activate"],
        required_capabilities=["trigger_event"],
        object_slots={
            "lever": ObjectSlot(
                name="lever",
                affordance="toggle",
                min_count=1,
                max_count=1,
                is_interactable=True,
            ),
        },
        success_condition=SuccessCondition(
            condition_type="interact_object",
            params={"object": "lever"}
        ),
        difficulty_factors=["puzzle_complexity"],
        hearts_facets=["A"],
        description_template="Pull the {asset} to open the way",
    ),
    
    "sequence_activate": Mechanic(
        id="sequence_activate",
        name="Activation Sequence",
        description="Activate objects in correct order",
        category=MechanicCategory.INTERACTION,
        pack=MechanicPack.BASE,
        required_affordances=["toggle", "activate"],
        object_slots={
            "activatable": ObjectSlot(
                name="activatable",
                affordance="toggle",
                min_count=2,
                max_count=6,
                is_interactable=True,
            ),
        },
        success_condition=SuccessCondition(
            condition_type="interact_sequence",
            params={"correct_order": True}
        ),
        difficulty_factors=["sequence_length", "hints_visible"],
        hearts_facets=["T", "A"],
        description_template="Activate the {asset} in the correct order",
    ),
    
    "key_unlock": Mechanic(
        id="key_unlock",
        name="Find Key and Unlock",
        description="Find a key to unlock something",
        category=MechanicCategory.INTERACTION,
        pack=MechanicPack.BASE,
        required_affordances=["collect", "unlock"],
        required_capabilities=["store_items"],
        object_slots={
            "key": ObjectSlot(
                name="key",
                affordance="collect",
                min_count=1,
                max_count=1,
                is_collectible=True,
            ),
            "locked": ObjectSlot(
                name="locked",
                affordance="unlock",
                min_count=1,
                max_count=1,
                is_interactable=True,
            ),
        },
        success_condition=SuccessCondition(
            condition_type="unlock_target",
            params={"key": "key", "target": "locked"}
        ),
        difficulty_factors=["key_hidden", "distance"],
        hearts_facets=["E", "R"],
        description_template="Find the {key} to unlock the {locked}",
    ),
    
    "pressure_plate": Mechanic(
        id="pressure_plate",
        name="Pressure Plate",
        description="Step on or push object onto pressure plate",
        category=MechanicCategory.INTERACTION,
        pack=MechanicPack.BASE,
        required_affordances=["trigger"],
        required_capabilities=["trigger_event", "apply_weight"],
        object_slots={
            "plate": ObjectSlot(
                name="plate",
                capability="trigger_event",
                min_count=1,
                max_count=3,
            ),
            "weight": ObjectSlot(
                name="weight",
                capability="apply_weight",
                min_count=0,
                max_count=3,
                is_draggable=True,
            ),
        },
        success_condition=SuccessCondition(
            condition_type="trigger_activated",
            params={"trigger": "plate"}
        ),
        difficulty_factors=["plate_count", "requires_object"],
        hearts_facets=["A", "T"],
        description_template="Activate the pressure plate",
    ),
    
    # ─── PROGRESSION MECHANICS ─────────────────────────────────────────────────
    
    "reach_destination": Mechanic(
        id="reach_destination",
        name="Reach Destination",
        description="Navigate to a goal location",
        category=MechanicCategory.PROGRESSION,
        pack=MechanicPack.BASE,
        required_affordances=[],  # No specific affordance needed
        requires_goal_zone=True,
        success_condition=SuccessCondition(
            condition_type="reach_zone",
            params={"zone": "destination"}
        ),
        difficulty_factors=["distance", "obstacles", "hazards"],
        hearts_facets=["R"],
        description_template="Reach the {destination}",
    ),
    
    "deliver_item": Mechanic(
        id="deliver_item",
        name="Deliver Item",
        description="Bring an item to an NPC or location",
        category=MechanicCategory.PROGRESSION,
        pack=MechanicPack.BASE,
        required_affordances=["collect"],
        object_slots={
            "item": ObjectSlot(
                name="item",
                affordance="collect",
                min_count=1,
                max_count=5,
                is_collectible=True,
            ),
        },
        requires_goal_zone=True,
        success_condition=SuccessCondition(
            condition_type="deliver_to",
            params={"item": "item", "destination": "goal"}
        ),
        difficulty_factors=["distance", "item_count"],
        hearts_facets=["H", "E"],
        description_template="Deliver {count} {item} to {destination}",
    ),
    
    "escort_npc": Mechanic(
        id="escort_npc",
        name="Escort NPC",
        description="Guide an NPC safely to destination",
        category=MechanicCategory.PROGRESSION,
        pack=MechanicPack.BASE,
        required_affordances=["talk"],
        object_slots={
            "npc": ObjectSlot(
                name="npc",
                affordance="talk",
                min_count=1,
                max_count=1,
            ),
        },
        requires_goal_zone=True,
        success_condition=SuccessCondition(
            condition_type="escort_complete",
            params={"npc": "npc", "destination": "goal"}
        ),
        difficulty_factors=["distance", "hazards", "npc_speed"],
        hearts_facets=["H", "R"],
        description_template="Guide {npc} safely to {destination}",
    ),
    
    "talk_to_npc": Mechanic(
        id="talk_to_npc",
        name="Talk to NPC",
        description="Have a conversation with an NPC",
        category=MechanicCategory.PROGRESSION,
        pack=MechanicPack.BASE,
        required_affordances=["talk"],
        object_slots={
            "npc": ObjectSlot(
                name="npc",
                affordance="talk",
                min_count=1,
                max_count=1,
                is_interactable=True,
            ),
        },
        success_condition=SuccessCondition(
            condition_type="dialogue_complete",
            params={"npc": "npc"}
        ),
        difficulty_factors=[],
        hearts_facets=["So", "E"],
        description_template="Talk to {npc}",
    ),
    
    "trade_items": Mechanic(
        id="trade_items",
        name="Trade Items",
        description="Exchange items with an NPC",
        category=MechanicCategory.PROGRESSION,
        pack=MechanicPack.BASE,
        required_affordances=["trade", "collect"],
        object_slots={
            "merchant": ObjectSlot(
                name="merchant",
                affordance="trade",
                min_count=1,
                max_count=1,
                is_interactable=True,
            ),
            "trade_item": ObjectSlot(
                name="trade_item",
                affordance="collect",
                min_count=1,
                max_count=10,
                is_collectible=True,
            ),
        },
        success_condition=SuccessCondition(
            condition_type="trade_complete",
            params={"merchant": "merchant", "required_items": "trade_item"}
        ),
        difficulty_factors=["item_count", "item_rarity"],
        hearts_facets=["So", "A"],
        description_template="Trade {count} {item} with {merchant}",
    ),
    
    "avoid_hazard": Mechanic(
        id="avoid_hazard",
        name="Avoid Hazards",
        description="Navigate through hazardous area safely",
        category=MechanicCategory.PROGRESSION,
        pack=MechanicPack.BASE,
        required_affordances=[],
        required_capabilities=["create_hazard"],
        requires_goal_zone=True,
        success_condition=SuccessCondition(
            condition_type="reach_zone",
            params={"zone": "safe_zone", "no_damage": True}
        ),
        difficulty_factors=["hazard_count", "hazard_type", "path_width"],
        hearts_facets=["R", "A"],
        description_template="Navigate through safely without touching hazards",
    ),
}


# ═══════════════════════════════════════════════════════════════════════════════
#  MECHANIC PACKS
# ═══════════════════════════════════════════════════════════════════════════════

COMBAT_MECHANICS: dict[str, Mechanic] = {
    "attack_enemy": Mechanic(
        id="attack_enemy",
        name="Defeat Enemy",
        description="Defeat enemies using attacks",
        category=MechanicCategory.COMBAT,
        pack=MechanicPack.COMBAT,
        required_affordances=["attack"],
        required_capabilities=["deal_damage"],
        object_slots={
            "weapon": ObjectSlot(name="weapon", affordance="attack", min_count=1, max_count=1),
            "enemy": ObjectSlot(name="enemy", min_count=1, max_count=10),
        },
        success_condition=SuccessCondition(condition_type="defeat_all", params={"target": "enemy"}),
        difficulty_factors=["enemy_count", "enemy_strength"],
        hearts_facets=["R"],
    ),
    "defend_position": Mechanic(
        id="defend_position",
        name="Defend Position",
        description="Protect an area or NPC from enemies",
        category=MechanicCategory.COMBAT,
        pack=MechanicPack.COMBAT,
        required_affordances=["defend"],
        object_slots={
            "protected": ObjectSlot(name="protected", min_count=1, max_count=1),
        },
        success_condition=SuccessCondition(condition_type="time_survive", params={"duration": 60}),
        difficulty_factors=["wave_count", "enemy_strength"],
        hearts_facets=["H", "R"],
    ),
    "equip_item": Mechanic(
        id="equip_item",
        name="Equip Item",
        description="Find and equip an item",
        category=MechanicCategory.COMBAT,
        pack=MechanicPack.COMBAT,
        required_affordances=["equip", "collect"],
        object_slots={
            "equipment": ObjectSlot(name="equipment", affordance="equip", min_count=1, is_collectible=True),
        },
        success_condition=SuccessCondition(condition_type="item_equipped", params={"item": "equipment"}),
        difficulty_factors=["item_hidden"],
        hearts_facets=["A"],
    ),
}

FARMING_MECHANICS: dict[str, Mechanic] = {
    "plant_seed": Mechanic(
        id="plant_seed",
        name="Plant Seeds",
        description="Plant seeds in soil",
        category=MechanicCategory.FARMING,
        pack=MechanicPack.FARMING,
        required_affordances=["plant"],
        required_capabilities=["grow"],
        object_slots={
            "seed": ObjectSlot(name="seed", affordance="plant", min_count=1, max_count=10, is_collectible=True),
            "soil": ObjectSlot(name="soil", min_count=1, max_count=10),
        },
        success_condition=SuccessCondition(condition_type="all_planted", params={}),
        difficulty_factors=["seed_count", "soil_locations"],
        hearts_facets=["A", "T"],
    ),
    "water_crop": Mechanic(
        id="water_crop",
        name="Water Crops",
        description="Water planted crops",
        category=MechanicCategory.FARMING,
        pack=MechanicPack.FARMING,
        required_affordances=["water"],
        object_slots={
            "water_tool": ObjectSlot(name="water_tool", affordance="water", min_count=1, max_count=1),
            "crop": ObjectSlot(name="crop", min_count=1, max_count=10),
        },
        success_condition=SuccessCondition(condition_type="all_watered", params={}),
        difficulty_factors=["crop_count", "water_source_distance"],
        hearts_facets=["A"],
    ),
    "harvest_crop": Mechanic(
        id="harvest_crop",
        name="Harvest Crops",
        description="Harvest grown crops",
        category=MechanicCategory.FARMING,
        pack=MechanicPack.FARMING,
        required_affordances=["harvest", "collect"],
        required_capabilities=["produce_resource"],
        object_slots={
            "crop": ObjectSlot(name="crop", affordance="harvest", min_count=1, max_count=20, is_collectible=True),
        },
        success_condition=SuccessCondition(condition_type="collect_count", params={"target_count": "all"}),
        difficulty_factors=["crop_count", "time_limit"],
        hearts_facets=["E", "A"],
    ),
}

CRAFTING_MECHANICS: dict[str, Mechanic] = {
    "combine_items": Mechanic(
        id="combine_items",
        name="Combine Items",
        description="Combine items to create something new",
        category=MechanicCategory.CRAFTING,
        pack=MechanicPack.CRAFTING,
        required_affordances=["combine", "collect"],
        required_capabilities=["transform"],
        object_slots={
            "ingredient": ObjectSlot(name="ingredient", affordance="collect", min_count=2, max_count=5, is_collectible=True),
            "station": ObjectSlot(name="station", capability="transform", min_count=1, max_count=1),
        },
        success_condition=SuccessCondition(condition_type="item_crafted", params={}),
        difficulty_factors=["ingredient_count", "recipe_complexity"],
        hearts_facets=["A", "T"],
    ),
    "cook_recipe": Mechanic(
        id="cook_recipe",
        name="Cook Recipe",
        description="Cook ingredients into food",
        category=MechanicCategory.CRAFTING,
        pack=MechanicPack.CRAFTING,
        required_affordances=["cook", "collect"],
        required_capabilities=["provide_heat"],
        object_slots={
            "ingredient": ObjectSlot(name="ingredient", affordance="collect", min_count=1, max_count=5, is_collectible=True),
            "cooking_station": ObjectSlot(name="cooking_station", capability="provide_heat", min_count=1, max_count=1),
        },
        success_condition=SuccessCondition(condition_type="item_crafted", params={"type": "food"}),
        difficulty_factors=["ingredient_count", "timing"],
        hearts_facets=["A", "H"],
    ),
}

SOCIAL_MECHANICS: dict[str, Mechanic] = {
    "befriend_npc": Mechanic(
        id="befriend_npc",
        name="Befriend NPC",
        description="Build friendship with an NPC",
        category=MechanicCategory.SOCIAL,
        pack=MechanicPack.SOCIAL,
        required_affordances=["befriend", "talk"],
        object_slots={
            "npc": ObjectSlot(name="npc", affordance="talk", min_count=1, max_count=1, is_interactable=True),
        },
        success_condition=SuccessCondition(condition_type="friendship_level", params={"level": 1}),
        difficulty_factors=["dialogue_choices", "gift_requirements"],
        hearts_facets=["So", "E"],
    ),
    "gift_giving": Mechanic(
        id="gift_giving",
        name="Give Gift",
        description="Give a gift to an NPC",
        category=MechanicCategory.SOCIAL,
        pack=MechanicPack.SOCIAL,
        required_affordances=["gift", "collect"],
        object_slots={
            "gift_item": ObjectSlot(name="gift_item", affordance="collect", min_count=1, max_count=1, is_collectible=True),
            "recipient": ObjectSlot(name="recipient", min_count=1, max_count=1, is_interactable=True),
        },
        success_condition=SuccessCondition(condition_type="gift_accepted", params={}),
        difficulty_factors=["gift_preference", "gift_rarity"],
        hearts_facets=["H", "So"],
    ),
    "convince_npc": Mechanic(
        id="convince_npc",
        name="Convince NPC",
        description="Persuade an NPC through dialogue",
        category=MechanicCategory.SOCIAL,
        pack=MechanicPack.SOCIAL,
        required_affordances=["convince", "talk"],
        object_slots={
            "npc": ObjectSlot(name="npc", affordance="talk", min_count=1, max_count=1, is_interactable=True),
        },
        success_condition=SuccessCondition(condition_type="dialogue_success", params={"choices": "correct"}),
        difficulty_factors=["dialogue_complexity", "choice_count"],
        hearts_facets=["So", "T"],
    ),
}

SURVIVAL_MECHANICS: dict[str, Mechanic] = {
    "find_food": Mechanic(
        id="find_food",
        name="Find Food",
        description="Find food to survive",
        category=MechanicCategory.SURVIVAL,
        pack=MechanicPack.SURVIVAL,
        required_affordances=["forage", "collect", "consume"],
        object_slots={
            "food": ObjectSlot(name="food", affordance="collect", min_count=1, max_count=10, is_collectible=True),
        },
        success_condition=SuccessCondition(condition_type="hunger_satisfied", params={}),
        difficulty_factors=["food_scarcity", "time_pressure"],
        hearts_facets=["R", "A"],
    ),
    "build_shelter": Mechanic(
        id="build_shelter",
        name="Build Shelter",
        description="Gather materials and build shelter",
        category=MechanicCategory.SURVIVAL,
        pack=MechanicPack.SURVIVAL,
        required_affordances=["collect"],
        required_capabilities=["provide_shelter"],
        object_slots={
            "material": ObjectSlot(name="material", affordance="collect", min_count=3, max_count=10, is_collectible=True),
            "build_site": ObjectSlot(name="build_site", min_count=1, max_count=1),
        },
        success_condition=SuccessCondition(condition_type="structure_complete", params={}),
        difficulty_factors=["material_count", "material_distance"],
        hearts_facets=["R", "T"],
    ),
}

PUZZLE_MECHANICS: dict[str, Mechanic] = {
    "pattern_match": Mechanic(
        id="pattern_match",
        name="Match Pattern",
        description="Arrange objects to match a pattern",
        category=MechanicCategory.PUZZLE,
        pack=MechanicPack.PUZZLE,
        required_affordances=["drag", "push"],
        object_slots={
            "piece": ObjectSlot(name="piece", affordance="drag", min_count=3, max_count=9, is_draggable=True),
        },
        success_condition=SuccessCondition(condition_type="pattern_matched", params={}),
        difficulty_factors=["pattern_complexity", "piece_count"],
        hearts_facets=["A", "T"],
    ),
    "light_reflect": Mechanic(
        id="light_reflect",
        name="Reflect Light",
        description="Direct light beam to target using mirrors",
        category=MechanicCategory.PUZZLE,
        pack=MechanicPack.PUZZLE,
        required_affordances=["drag"],
        required_capabilities=["emit_signal", "receive_signal"],
        object_slots={
            "mirror": ObjectSlot(name="mirror", affordance="drag", min_count=1, max_count=5, is_draggable=True),
            "light_source": ObjectSlot(name="light_source", capability="emit_signal", min_count=1, max_count=1),
            "target": ObjectSlot(name="target", capability="receive_signal", min_count=1, max_count=1),
        },
        success_condition=SuccessCondition(condition_type="light_reaches_target", params={}),
        difficulty_factors=["mirror_count", "angle_precision"],
        hearts_facets=["A", "T"],
    ),
    "weight_balance": Mechanic(
        id="weight_balance",
        name="Balance Weight",
        description="Balance weights on a scale",
        category=MechanicCategory.PUZZLE,
        pack=MechanicPack.PUZZLE,
        required_affordances=["drag"],
        required_capabilities=["apply_weight"],
        object_slots={
            "weight": ObjectSlot(name="weight", capability="apply_weight", min_count=2, max_count=6, is_draggable=True),
            "scale": ObjectSlot(name="scale", min_count=1, max_count=1),
        },
        success_condition=SuccessCondition(condition_type="balanced", params={}),
        difficulty_factors=["weight_variance", "precision_required"],
        hearts_facets=["T", "A"],
    ),
}

MANAGEMENT_MECHANICS: dict[str, Mechanic] = {
    "assign_worker": Mechanic(
        id="assign_worker",
        name="Assign Worker",
        description="Assign NPCs to tasks",
        category=MechanicCategory.MANAGEMENT,
        pack=MechanicPack.MANAGEMENT,
        required_affordances=["assign"],
        object_slots={
            "worker": ObjectSlot(name="worker", min_count=1, max_count=5, is_interactable=True),
            "task_location": ObjectSlot(name="task_location", min_count=1, max_count=5),
        },
        success_condition=SuccessCondition(condition_type="all_assigned", params={}),
        difficulty_factors=["worker_count", "task_matching"],
        hearts_facets=["T", "So"],
    ),
    "produce_goods": Mechanic(
        id="produce_goods",
        name="Produce Goods",
        description="Manage production of goods",
        category=MechanicCategory.MANAGEMENT,
        pack=MechanicPack.MANAGEMENT,
        required_affordances=["produce"],
        required_capabilities=["produce_resource"],
        object_slots={
            "production_building": ObjectSlot(name="production_building", capability="produce_resource", min_count=1),
            "resource": ObjectSlot(name="resource", is_collectible=True, min_count=1),
        },
        success_condition=SuccessCondition(condition_type="production_target", params={"count": 10}),
        difficulty_factors=["production_rate", "resource_management"],
        hearts_facets=["T", "A"],
    ),
}


# ═══════════════════════════════════════════════════════════════════════════════
#  ALL MECHANICS COMBINED
# ═══════════════════════════════════════════════════════════════════════════════

ALL_MECHANICS: dict[str, Mechanic] = {
    **BASE_MECHANICS,
    **COMBAT_MECHANICS,
    **FARMING_MECHANICS,
    **CRAFTING_MECHANICS,
    **SOCIAL_MECHANICS,
    **SURVIVAL_MECHANICS,
    **PUZZLE_MECHANICS,
    **MANAGEMENT_MECHANICS,
}

MECHANICS_BY_PACK: dict[MechanicPack, dict[str, Mechanic]] = {
    MechanicPack.BASE: BASE_MECHANICS,
    MechanicPack.COMBAT: COMBAT_MECHANICS,
    MechanicPack.FARMING: FARMING_MECHANICS,
    MechanicPack.CRAFTING: CRAFTING_MECHANICS,
    MechanicPack.SOCIAL: SOCIAL_MECHANICS,
    MechanicPack.SURVIVAL: SURVIVAL_MECHANICS,
    MechanicPack.PUZZLE: PUZZLE_MECHANICS,
    MechanicPack.MANAGEMENT: MANAGEMENT_MECHANICS,
}


# ═══════════════════════════════════════════════════════════════════════════════
#  HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def get_mechanic(mechanic_id: str) -> Optional[Mechanic]:
    """Get a mechanic by ID."""
    return ALL_MECHANICS.get(mechanic_id)


def get_mechanics_by_pack(pack: MechanicPack) -> dict[str, Mechanic]:
    """Get all mechanics in a pack."""
    return MECHANICS_BY_PACK.get(pack, {})


def get_mechanics_by_affordance(affordance: str) -> list[Mechanic]:
    """Get all mechanics that require a specific affordance."""
    return [
        m for m in ALL_MECHANICS.values()
        if affordance in m.required_affordances
    ]


def get_mechanics_by_capability(capability: str) -> list[Mechanic]:
    """Get all mechanics that require a specific capability."""
    return [
        m for m in ALL_MECHANICS.values()
        if capability in m.required_capabilities
    ]


def get_required_affordances_for_pack(pack: MechanicPack) -> set[str]:
    """Get all affordances required by any mechanic in a pack."""
    mechanics = get_mechanics_by_pack(pack)
    affordances = set()
    for m in mechanics.values():
        affordances.update(m.required_affordances)
    return affordances
