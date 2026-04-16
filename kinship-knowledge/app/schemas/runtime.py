"""Pydantic schemas for Runtime — dialogue requests/responses + WebSocket messages."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


# ── Dialogue (REST + WS) ──

class DialogueRequest(BaseModel):
    player_id: UUID
    scene_id: str
    npc_id: UUID
    input: str
    input_type: str = "text"  # text only for MVP


class HeartsDeltas(BaseModel):
    H: float = 0
    E: float = 0
    A: float = 0
    R: float = 0
    T: float = 0
    Si: float = 0
    So: float = 0


class TriggerEvent(BaseModel):
    type: str  # scene_transition, quest_complete, challenge_complete
    target_id: str | None = None
    target_name: str | None = None


class DialogueResponse(BaseModel):
    npc_id: UUID
    npc_name: str
    dialogue: str
    detected_moves: list[str] = []
    intent: str | None = None
    hearts_deltas: HeartsDeltas = HeartsDeltas()
    hearts_current: dict[str, float] = {}
    pattern_alerts: list[dict] = []
    triggers: list[TriggerEvent] = []
    scene_transition: dict | None = None
    animations: list[dict] = []


# ── WebSocket Protocol ──

class WSMoveMessage(BaseModel):
    type: str = "move"
    x: float
    y: float
    facing: str = "down"


class WSInteractMessage(BaseModel):
    type: str = "interact"
    target_type: str  # npc, asset
    target_id: str


class WSDialogueMessage(BaseModel):
    type: str = "dialogue"
    npc_id: str
    message: str


class WSEmoteMessage(BaseModel):
    type: str = "emote"
    emote: str


class WSHeartbeatMessage(BaseModel):
    type: str = "heartbeat"


# Server → Client

class WSPlayerJoin(BaseModel):
    type: str = "player_join"
    player_id: str
    display_name: str | None = None
    x: float = 0
    y: float = 0


class WSPlayerLeave(BaseModel):
    type: str = "player_leave"
    player_id: str


class WSPlayerMove(BaseModel):
    type: str = "player_move"
    player_id: str
    x: float
    y: float
    facing: str = "down"


class WSNPCState(BaseModel):
    type: str = "npc_state"
    npc_id: str
    state: str  # idle, in_dialogue
    occupied_by: str | None = None


class WSError(BaseModel):
    type: str = "error"
    code: str
    message: str
