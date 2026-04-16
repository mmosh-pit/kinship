"""Seed default HEARTS facets and sample rubric entries."""

from sqlalchemy import select

from app.db.database import async_session
from app.db.models import HeartsFacet, HeartsRubric


FACETS = [
    {"key": "H", "name": "Health", "description": "Physical wellbeing and body awareness",
     "definition": "Encompasses physical activity, nutrition awareness, body positivity, and healthy habits.",
     "under_pattern": "Sedentary behavior, avoidance of physical activities, low energy",
     "over_pattern": "Over-exercising, obsessive health focus, anxiety about physical state",
     "color": "#EF4444"},
    {"key": "E", "name": "Empathy", "description": "Understanding and sharing feelings of others",
     "definition": "Ability to recognize, understand, and share the feelings of others. Active listening and compassion.",
     "under_pattern": "Difficulty recognizing others' emotions, self-centered responses",
     "over_pattern": "Emotional exhaustion, boundary issues, taking on others' problems",
     "color": "#F97316"},
    {"key": "A", "name": "Aspiration", "description": "Goal-setting and future thinking",
     "definition": "Setting meaningful goals, planning for the future, dreaming big while staying grounded.",
     "under_pattern": "Lack of motivation, difficulty imagining the future, apathy",
     "over_pattern": "Perfectionism, unrealistic expectations, anxiety about achievement",
     "color": "#EAB308"},
    {"key": "R", "name": "Resilience", "description": "Bouncing back from challenges",
     "definition": "Ability to cope with setbacks, adapt to change, and persist through difficulties.",
     "under_pattern": "Giving up easily, catastrophizing, avoidance of challenges",
     "over_pattern": "Suppressing emotions, refusing help, toxic positivity",
     "color": "#22C55E"},
    {"key": "T", "name": "Thinking", "description": "Critical and creative reasoning",
     "definition": "Problem-solving, creative thinking, curiosity, and reflective reasoning.",
     "under_pattern": "Impulsive decisions, difficulty focusing, disengagement from learning",
     "over_pattern": "Overthinking, analysis paralysis, excessive self-criticism",
     "color": "#3B82F6"},
    {"key": "Si", "name": "Self-Identity", "description": "Understanding and accepting oneself",
     "definition": "Self-awareness, self-expression, understanding values, and building confidence.",
     "under_pattern": "Low self-esteem, difficulty expressing preferences, identity confusion",
     "over_pattern": "Narcissistic tendencies, rigid self-concept, inability to accept feedback",
     "color": "#8B5CF6"},
    {"key": "So", "name": "Social", "description": "Connecting and collaborating with others",
     "definition": "Building friendships, working in teams, communication skills, and social awareness.",
     "under_pattern": "Social withdrawal, difficulty making friends, loneliness",
     "over_pattern": "People-pleasing, codependency, loss of individual identity in groups",
     "color": "#EC4899"},
]


SAMPLE_RUBRIC = [
    {"move_type": "physical_activity", "facet_key": "H", "delta": 3.0},
    {"move_type": "emotional_expression", "facet_key": "E", "delta": 2.5},
    {"move_type": "showing_empathy", "facet_key": "E", "delta": 3.0},
    {"move_type": "goal_setting", "facet_key": "A", "delta": 2.5},
    {"move_type": "creative_thinking", "facet_key": "A", "delta": 2.0},
    {"move_type": "persistence", "facet_key": "R", "delta": 3.0},
    {"move_type": "managing_emotions", "facet_key": "R", "delta": 2.5},
    {"move_type": "problem_solving", "facet_key": "T", "delta": 3.0},
    {"move_type": "asking_questions", "facet_key": "T", "delta": 2.0},
    {"move_type": "self_reflection", "facet_key": "Si", "delta": 3.0},
    {"move_type": "sharing_feelings", "facet_key": "Si", "delta": 2.5},
    {"move_type": "taking_initiative", "facet_key": "Si", "delta": 2.0},
    {"move_type": "social_interaction", "facet_key": "So", "delta": 2.5},
    {"move_type": "helping_others", "facet_key": "So", "delta": 3.0},
    {"move_type": "team_work", "facet_key": "So", "delta": 3.0},
    {"move_type": "active_listening", "facet_key": "E", "delta": 2.0},
    {"move_type": "active_listening", "facet_key": "So", "delta": 1.5},
]


async def seed_hearts_facets():
    """Seed HEARTS facets and sample rubric if tables are empty."""
    async with async_session() as db:
        result = await db.execute(select(HeartsFacet))
        existing = result.scalars().all()

        if not existing:
            for f in FACETS:
                db.add(HeartsFacet(**f))
            await db.flush()

            for r in SAMPLE_RUBRIC:
                db.add(HeartsRubric(**r))

            await db.commit()
