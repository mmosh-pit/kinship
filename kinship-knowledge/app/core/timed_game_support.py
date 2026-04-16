"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    TIME-BASED GAME SUPPORT                                    ║
║                                                                               ║
║  Adds 4 pieces for time-based games (survive, defend, timed challenges):      ║
║                                                                               ║
║  1. GAMEPLAY LOOPS — survive_forest, defend_village, timed_escape             ║
║  2. CHALLENGE TEMPLATES — defend_position, attack_enemy, timed_collect        ║
║  3. TIMER IN MANIFEST — scene.timer field for Flutter countdown               ║
║  4. TIME-BASED ROUTE CONDITIONS — timer_expired, survive_complete             ║
║                                                                               ║
║  APPLY INSTRUCTIONS:                                                          ║
║  Each section below says exactly which file and where to add the code.        ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""


# ═══════════════════════════════════════════════════════════════════════════════
#  PART 1: GAMEPLAY LOOPS
#  FILE: app/core/gameplay_loop_planner.py
#  WHERE: Add to GAMEPLAY_LOOPS dict (after the last existing loop entry)
# ═══════════════════════════════════════════════════════════════════════════════

SURVIVE_LOOPS = {
    # ─── SURVIVE LOOPS ─────────────────────────────────────────────────
    "survive_forest": {
        "loop_id": "survive_forest",
        "goal_type": "survive",
        "goal_description": "Survive in the forest until rescue arrives",
        "steps": [
            {
                "step_id": "find_shelter",
                "description": "Find or build a safe shelter",
                "mechanic_options": ["build_shelter", "reach_destination"],
                "narrative_beat": "introduction",
            },
            {
                "step_id": "gather_resources",
                "description": "Gather food and supplies before nightfall",
                "mechanic_options": ["collect_items", "find_food"],
                "requires_npc": False,
                "narrative_beat": "rising_action",
            },
            {
                "step_id": "defend_camp",
                "description": "Defend your camp from threats",
                "mechanic_options": ["defend_position", "avoid_hazard"],
                "timed": True,
                "timer_seconds": 120,
                "narrative_beat": "climax",
            },
            {
                "step_id": "signal_rescue",
                "description": "Signal for rescue",
                "mechanic_options": ["reach_destination", "lever_activate"],
                "narrative_beat": "resolution",
            },
        ],
        "story_hook": "A storm has left you stranded in the wilderness...",
        "resolution": "A rescue team spots your signal!",
        "tags": ["survival", "nature", "timed"],
    },

    "survive_waves": {
        "loop_id": "survive_waves",
        "goal_type": "survive",
        "goal_description": "Survive waves of challenges",
        "steps": [
            {
                "step_id": "prepare",
                "description": "Prepare your defenses",
                "mechanic_options": ["collect_items", "push_to_target"],
                "narrative_beat": "introduction",
            },
            {
                "step_id": "wave_1",
                "description": "Survive the first wave",
                "mechanic_options": ["defend_position", "avoid_hazard"],
                "timed": True,
                "timer_seconds": 60,
                "narrative_beat": "rising_action",
            },
            {
                "step_id": "regroup",
                "description": "Collect supplies between waves",
                "mechanic_options": ["collect_items", "find_food"],
                "narrative_beat": "rising_action",
            },
            {
                "step_id": "wave_2",
                "description": "Survive the final wave",
                "mechanic_options": ["defend_position", "attack_enemy"],
                "timed": True,
                "timer_seconds": 90,
                "narrative_beat": "climax",
            },
        ],
        "story_hook": "Danger approaches from all sides...",
        "resolution": "The threat has passed. You survived!",
        "tags": ["survival", "combat", "timed", "waves"],
    },

    # ─── DEFEND LOOPS ──────────────────────────────────────────────────
    "defend_village": {
        "loop_id": "defend_village",
        "goal_type": "defend",
        "goal_description": "Protect the village from attack",
        "steps": [
            {
                "step_id": "talk_to_elder",
                "description": "Learn about the threat from the village elder",
                "mechanic_options": ["talk_to_npc"],
                "requires_npc": True,
                "npc_role": "quest_giver",
                "narrative_beat": "introduction",
            },
            {
                "step_id": "build_barricades",
                "description": "Build defenses around the village",
                "mechanic_options": ["push_to_target", "build_shelter"],
                "narrative_beat": "rising_action",
            },
            {
                "step_id": "arm_yourself",
                "description": "Find equipment for the battle",
                "mechanic_options": ["collect_items", "equip_item"],
                "narrative_beat": "rising_action",
            },
            {
                "step_id": "defend",
                "description": "Defend the village!",
                "mechanic_options": ["defend_position", "attack_enemy"],
                "timed": True,
                "timer_seconds": 120,
                "narrative_beat": "climax",
            },
        ],
        "story_hook": "The village elder warns of approaching danger...",
        "resolution": "The village is saved thanks to your bravery!",
        "tags": ["combat", "village", "timed", "defend"],
    },

    # ─── TIMED ESCAPE ──────────────────────────────────────────────────
    "timed_escape": {
        "loop_id": "timed_escape",
        "goal_type": "escape",
        "goal_description": "Escape before time runs out",
        "steps": [
            {
                "step_id": "discover_danger",
                "description": "Realize you need to escape quickly",
                "mechanic_options": ["talk_to_npc"],
                "requires_npc": True,
                "npc_role": "guide",
                "narrative_beat": "introduction",
            },
            {
                "step_id": "find_key",
                "description": "Find the key to unlock the exit",
                "mechanic_options": ["key_unlock", "collect_items"],
                "timed": True,
                "timer_seconds": 90,
                "narrative_beat": "rising_action",
            },
            {
                "step_id": "navigate_hazards",
                "description": "Navigate through hazards to the exit",
                "mechanic_options": ["avoid_hazard", "reach_destination"],
                "timed": True,
                "timer_seconds": 60,
                "narrative_beat": "climax",
            },
            {
                "step_id": "escape",
                "description": "Reach the exit before it's too late",
                "mechanic_options": ["reach_destination"],
                "narrative_beat": "resolution",
            },
        ],
        "story_hook": "The ground begins to shake... you must escape NOW!",
        "resolution": "You made it out just in time!",
        "tags": ["escape", "timed", "urgent"],
    },

    # ─── TIMED GATHER ──────────────────────────────────────────────────
    "timed_gather": {
        "loop_id": "timed_gather",
        "goal_type": "gather",
        "goal_description": "Collect everything before time runs out",
        "steps": [
            {
                "step_id": "get_list",
                "description": "Get the collection list from the quest giver",
                "mechanic_options": ["talk_to_npc"],
                "requires_npc": True,
                "npc_role": "quest_giver",
                "narrative_beat": "introduction",
            },
            {
                "step_id": "collect_fast",
                "description": "Race to collect all items",
                "mechanic_options": ["collect_items", "collect_all"],
                "timed": True,
                "timer_seconds": 120,
                "narrative_beat": "climax",
            },
            {
                "step_id": "deliver",
                "description": "Deliver the collection",
                "mechanic_options": ["deliver_item", "reach_destination"],
                "narrative_beat": "resolution",
            },
        ],
        "story_hook": "Quick! Gather everything before the storm hits!",
        "resolution": "You collected everything just in time!",
        "tags": ["gather", "timed", "race"],
    },
}


# ═══════════════════════════════════════════════════════════════════════════════
#  PART 2: CHALLENGE TEMPLATES
#  FILE: app/core/challenge_templates.py
#  WHERE: Add to CHALLENGE_TEMPLATES dict (after the last existing template)
# ═══════════════════════════════════════════════════════════════════════════════

# These are the Python objects to add. Import Constraint, ChallengeTemplate,
# Difficulty from the same file.

TIMED_TEMPLATES = {
    "defend_position": {
        "mechanic_id": "defend_position",
        "constraints": {
            "wave_count": {"min": 1, "max": 5, "default": 3},
            "wave_interval_seconds": {"min": 10, "max": 30, "default": 15},
            "timer_seconds": {"min": 30, "max": 180, "default": 90},
            "enemy_count_per_wave": {"min": 1, "max": 5, "default": 2},
        },
        "difficulty_range": (20, 80),
        "estimated_time_seconds": 90,
        "base_score": 100,
        "base_hearts": {"R": 10, "T": 5},
        "scaling": {
            "easy": {"wave_count": 2, "timer_seconds": 120, "enemy_count_per_wave": 1},
            "medium": {"wave_count": 3, "timer_seconds": 90, "enemy_count_per_wave": 2},
            "hard": {"wave_count": 5, "timer_seconds": 60, "enemy_count_per_wave": 3},
        },
    },

    "attack_enemy": {
        "mechanic_id": "attack_enemy",
        "constraints": {
            "enemy_count": {"min": 1, "max": 5, "default": 2},
            "timer_seconds": {"min": 30, "max": 120, "default": 60},
        },
        "difficulty_range": (30, 90),
        "estimated_time_seconds": 60,
        "base_score": 80,
        "base_hearts": {"E": 5, "T": 10},
        "scaling": {
            "easy": {"enemy_count": 1, "timer_seconds": 90},
            "medium": {"enemy_count": 2, "timer_seconds": 60},
            "hard": {"enemy_count": 4, "timer_seconds": 45},
        },
    },

    "find_food": {
        "mechanic_id": "find_food",
        "constraints": {
            "food_count": {"min": 1, "max": 6, "default": 3},
            "timer_seconds": {"min": 30, "max": 120, "default": 60},
        },
        "difficulty_range": (10, 60),
        "estimated_time_seconds": 60,
        "base_score": 60,
        "base_hearts": {"R": 5, "Si": 5},
        "scaling": {
            "easy": {"food_count": 2, "timer_seconds": 90},
            "medium": {"food_count": 3, "timer_seconds": 60},
            "hard": {"food_count": 5, "timer_seconds": 45},
        },
    },

    "build_shelter": {
        "mechanic_id": "build_shelter",
        "constraints": {
            "material_count": {"min": 2, "max": 8, "default": 4},
            "timer_seconds": {"min": 45, "max": 180, "default": 90},
        },
        "difficulty_range": (20, 70),
        "estimated_time_seconds": 90,
        "base_score": 80,
        "base_hearts": {"R": 10, "E": 5},
        "scaling": {
            "easy": {"material_count": 3, "timer_seconds": 120},
            "medium": {"material_count": 4, "timer_seconds": 90},
            "hard": {"material_count": 6, "timer_seconds": 60},
        },
    },

    "equip_item": {
        "mechanic_id": "equip_item",
        "constraints": {
            "equipment_count": {"min": 1, "max": 3, "default": 1},
        },
        "difficulty_range": (10, 40),
        "estimated_time_seconds": 30,
        "base_score": 40,
        "base_hearts": {"E": 10},
        "scaling": {
            "easy": {"equipment_count": 1},
            "medium": {"equipment_count": 2},
            "hard": {"equipment_count": 3},
        },
    },
}


# ═══════════════════════════════════════════════════════════════════════════════
#  PART 3: TIMER IN MANIFEST
#  FILE: app/pipeline/scene_materializer.py
#  WHERE: In MaterializedScene.to_manifest(), add timer field
#
#  Also: FILE: app/pipeline/manifest_assembler.py
#  WHERE: In _build_scenes(), add timer from challenge params
# ═══════════════════════════════════════════════════════════════════════════════

# Add this field to MaterializedScene dataclass:
#     timer: dict = field(default_factory=dict)  # {"duration_seconds": 120, "type": "countdown"}

# In to_manifest(), add:
#     "timer": self.timer if self.timer else None,

# The timer gets set from challenge params. In scene_materializer.py,
# materialize_scene(), after building materialized_challenges, add:

"""
# ── Extract timer from timed challenges ──
scene_timer = {}
for challenge in materialized_challenges:
    params = challenge.get("params", {})
    timer_seconds = params.get("timer_seconds", 0)
    if timer_seconds > 0 and not scene_timer:
        scene_timer = {
            "duration_seconds": timer_seconds,
            "type": "countdown",
            "mechanic_id": challenge.get("mechanic_id", ""),
            "label": f"Time remaining: {challenge.get('name', 'Challenge')}",
        }
"""


# ═══════════════════════════════════════════════════════════════════════════════
#  PART 4: TIME-BASED ROUTE CONDITIONS
#  FILE: app/pipeline/route_builder.py
#  WHERE: In _build_transition_conditions(), add timer condition
# ═══════════════════════════════════════════════════════════════════════════════

# Add this block after the existing challenge_complete condition check:

"""
        # Time-based challenges generate a survive condition
        if mechanic_id in ("defend_position", "attack_enemy"):
            timer_seconds = challenge.get("params", {}).get("timer_seconds", 0)
            if timer_seconds > 0:
                conditions.append({
                    "type": "survive_complete",
                    "challenge_id": challenge_id,
                    "timer_seconds": timer_seconds,
                    "description": f"Survive for {timer_seconds} seconds",
                })
"""


# ═══════════════════════════════════════════════════════════════════════════════
#  CONVENIENCE: Apply function (can run programmatically)
# ═══════════════════════════════════════════════════════════════════════════════

def get_survive_loops():
    """Returns the survive/defend/timed gameplay loops ready to merge."""
    return SURVIVE_LOOPS


def get_timed_templates():
    """Returns the timed challenge templates ready to merge."""
    return TIMED_TEMPLATES


def get_timed_goal_types():
    """Returns goal types that support timers."""
    return ["survive", "defend"]


def is_timed_mechanic(mechanic_id: str) -> bool:
    """Check if a mechanic supports timers."""
    return mechanic_id in (
        "defend_position", "attack_enemy", "avoid_hazard",
        "find_food", "build_shelter",
    )


def get_timer_for_challenge(challenge: dict) -> dict:
    """Extract timer config from a challenge dict."""
    params = challenge.get("params", {})
    timer_seconds = params.get("timer_seconds", 0)

    if timer_seconds <= 0:
        return {}

    return {
        "duration_seconds": timer_seconds,
        "type": "countdown",
        "mechanic_id": challenge.get("mechanic_id", ""),
        "label": f"Time remaining: {challenge.get('name', 'Challenge')}",
    }
