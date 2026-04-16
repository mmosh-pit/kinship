"""WebSocket Connection Manager — manages scene rooms for multi-player."""

import json
import logging
from datetime import datetime, timezone

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class SceneRoom:
    """Manages all WebSocket connections for a single scene."""

    def __init__(self, scene_id: str):
        self.scene_id = scene_id
        self.players: dict[str, WebSocket] = {}  # player_id → WebSocket
        self.player_names: dict[str, str] = {}  # player_id → display_name
        self.npc_states: dict[str, dict] = {}  # npc_id → {state, occupied_by}

    async def join(self, player_id: str, ws: WebSocket, display_name: str = ""):
        """Player joins the scene room."""
        self.players[player_id] = ws
        self.player_names[player_id] = display_name

        # Notify others
        await self.broadcast({
            "type": "player_join",
            "player_id": player_id,
            "display_name": display_name,
            "x": 0, "y": 0,
        }, exclude=player_id)

        # Send current state to the joining player
        await self.send_to(player_id, {
            "type": "scene_state",
            "players": [
                {"player_id": pid, "display_name": self.player_names.get(pid, "")}
                for pid in self.players if pid != player_id
            ],
            "npc_states": self.npc_states,
        })

    async def leave(self, player_id: str):
        """Player leaves the scene room."""
        self.players.pop(player_id, None)
        self.player_names.pop(player_id, None)

        # Release any NPCs this player was talking to
        for npc_id, state in self.npc_states.items():
            if state.get("occupied_by") == player_id:
                self.npc_states[npc_id] = {"state": "idle", "occupied_by": None}
                await self.broadcast({
                    "type": "npc_state",
                    "npc_id": npc_id,
                    "state": "idle",
                    "occupied_by": None,
                })

        await self.broadcast({
            "type": "player_leave",
            "player_id": player_id,
        })

    def lock_npc(self, npc_id: str, player_id: str) -> bool:
        """Try to lock an NPC for a player. Returns False if busy."""
        current = self.npc_states.get(npc_id, {})
        if current.get("occupied_by") and current["occupied_by"] != player_id:
            return False
        self.npc_states[npc_id] = {"state": "in_dialogue", "occupied_by": player_id}
        return True

    def unlock_npc(self, npc_id: str, player_id: str):
        """Release NPC lock."""
        current = self.npc_states.get(npc_id, {})
        if current.get("occupied_by") == player_id:
            self.npc_states[npc_id] = {"state": "idle", "occupied_by": None}

    async def broadcast(self, message: dict, exclude: str | None = None):
        """Send message to all players in the room except excluded."""
        text = json.dumps(message)
        disconnected = []
        for pid, ws in self.players.items():
            if pid == exclude:
                continue
            try:
                await ws.send_text(text)
            except Exception:
                disconnected.append(pid)

        for pid in disconnected:
            await self.leave(pid)

    async def send_to(self, player_id: str, message: dict):
        """Send message to a specific player."""
        ws = self.players.get(player_id)
        if ws:
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                await self.leave(player_id)

    @property
    def is_empty(self) -> bool:
        return len(self.players) == 0


class ConnectionManager:
    """Global WebSocket connection manager — routes to scene rooms."""

    def __init__(self):
        self.rooms: dict[str, SceneRoom] = {}  # scene_id → SceneRoom

    def get_or_create_room(self, scene_id: str) -> SceneRoom:
        if scene_id not in self.rooms:
            self.rooms[scene_id] = SceneRoom(scene_id)
        return self.rooms[scene_id]

    async def connect(self, scene_id: str, player_id: str, ws: WebSocket, display_name: str = ""):
        room = self.get_or_create_room(scene_id)
        await room.join(player_id, ws, display_name)
        logger.info(f"Player {player_id} joined scene {scene_id} ({len(room.players)} players)")

    async def disconnect(self, scene_id: str, player_id: str):
        room = self.rooms.get(scene_id)
        if room:
            await room.leave(player_id)
            if room.is_empty:
                del self.rooms[scene_id]
                logger.info(f"Scene room {scene_id} closed (empty)")

    def get_room(self, scene_id: str) -> SceneRoom | None:
        return self.rooms.get(scene_id)

    @property
    def stats(self) -> dict:
        return {
            "active_rooms": len(self.rooms),
            "total_players": sum(len(r.players) for r in self.rooms.values()),
        }


# Singleton
manager = ConnectionManager()
