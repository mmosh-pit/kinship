"""Pydantic schemas for Actors (renamed from NPC).

actor_type determines behavior:
  character   → dialogue, greeting, personality
  creature    → movement_pattern, observe behavior
  collectible → pickup_effect, inventory_item
  obstacle    → removal_condition, blocking
  interactive → states, transitions (levers, chests, doors)
  ambient     → animation, decorative
  enemy       → patrol, detection, challenge trigger
  companion   → follows player, assists
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


ACTOR_TYPES = [
    "character",
    "creature",
    "collectible",
    "obstacle",
    "interactive",
    "ambient",
    "enemy",
    "companion",
]


class ActorBase(BaseModel):
    name: str = Field(..., max_length=255)
    actor_type: str = "character"
    role: str | None = None
    game_id: str | None = None
    scene_id: str | None = None
    facet: str | None = Field(None, pattern=r"^(H|E|A|R|T|Si|So)$")
    # Character fields
    personality: str | None = None
    background: str | None = None
    dialogue_style: str | None = None
    catchphrases: list[str] = []
    greeting: str | None = None
    dialogue_tree: list[dict[str, Any]] = []
    interaction_rules: dict[str, Any] = {}
    # Movement & behavior (all types)
    movement_pattern: dict[str, Any] = {}
    behavior_config: dict[str, Any] = {}
    states: list[dict[str, Any]] = []
    collision_effect: dict[str, Any] = {}
    spawn_config: dict[str, Any] = {}
    # Visual
    sprite_asset_id: str | None = None
    status: str = "draft"


class ActorCreate(ActorBase):
    pass


class ActorUpdate(BaseModel):
    name: str | None = None
    actor_type: str | None = None
    role: str | None = None
    game_id: str | None = None
    scene_id: str | None = None
    facet: str | None = None
    personality: str | None = None
    background: str | None = None
    dialogue_style: str | None = None
    catchphrases: list[str] | None = None
    greeting: str | None = None
    dialogue_tree: list[dict[str, Any]] | None = None
    interaction_rules: dict[str, Any] | None = None
    movement_pattern: dict[str, Any] | None = None
    behavior_config: dict[str, Any] | None = None
    states: list[dict[str, Any]] | None = None
    collision_effect: dict[str, Any] | None = None
    spawn_config: dict[str, Any] | None = None
    sprite_asset_id: str | None = None
    status: str | None = None


class ActorResponse(ActorBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Backward compatibility aliases ──
NPCBase = ActorBase
NPCCreate = ActorCreate
NPCUpdate = ActorUpdate
NPCResponse = ActorResponse
