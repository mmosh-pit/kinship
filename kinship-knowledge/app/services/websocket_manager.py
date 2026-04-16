"""
Kinship Real-time WebSocket Manager

Manages WebSocket connections for real-time event streaming
between the Flutter game client and Studio dashboard.
"""

import asyncio
import json
import logging
from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional, Set, Any
from dataclasses import dataclass, field, asdict
from collections import defaultdict

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import BaseModel

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════
#  Event Types
# ═══════════════════════════════════════════════════════════════════


class RealtimeEventType(str, Enum):
    # Player events
    PLAYER_JOINED = "player_joined"
    PLAYER_LEFT = "player_left"
    PLAYER_SCENE_CHANGE = "player_scene_change"

    # Challenge events
    CHALLENGE_START = "challenge_start"
    CHALLENGE_COMPLETE = "challenge_complete"
    CHALLENGE_FAIL = "challenge_fail"

    # Quest events
    QUEST_START = "quest_start"
    QUEST_COMPLETE = "quest_complete"

    # HEARTS events
    HEARTS_CHANGE = "hearts_change"

    # Interaction events
    NPC_INTERACT = "npc_interact"
    COLLECTIBLE_PICKUP = "collectible_pickup"

    # Achievement events
    ACHIEVEMENT_UNLOCK = "achievement_unlock"

    # System events
    STATS_UPDATE = "stats_update"
    ACTIVE_PLAYERS_UPDATE = "active_players_update"

    # Custom
    CUSTOM = "custom"


# ═══════════════════════════════════════════════════════════════════
#  Data Models
# ═══════════════════════════════════════════════════════════════════


@dataclass
class RealtimeEvent:
    """A real-time event to broadcast"""

    event_type: str
    game_id: str
    data: Dict[str, Any]
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    player_id: Optional[str] = None
    session_id: Optional[str] = None
    scene_id: Optional[str] = None

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class ActivePlayer:
    """Represents an active player in a game"""

    player_id: str
    player_name: Optional[str]
    game_id: str
    session_id: str
    current_scene_id: Optional[str]
    joined_at: str
    last_activity: str
    hearts_scores: Dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class GameStats:
    """Real-time stats for a game"""

    game_id: str
    active_players: int = 0
    sessions_today: int = 0
    challenges_completed_today: int = 0
    avg_session_duration_minutes: float = 0
    events_per_minute: float = 0
    last_updated: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    def to_dict(self) -> Dict:
        return asdict(self)


# ═══════════════════════════════════════════════════════════════════
#  Connection Manager
# ═══════════════════════════════════════════════════════════════════


class ConnectionManager:
    """
    Manages WebSocket connections for real-time event streaming.

    Supports:
    - Game-specific channels (studio dashboard)
    - Player-specific connections (game client)
    - Broadcast to all connections for a game
    - Active player tracking
    - Real-time stats
    """

    def __init__(self):
        # Studio dashboard connections by game_id
        self._studio_connections: Dict[str, Set[WebSocket]] = defaultdict(set)

        # Player connections by (game_id, player_id)
        self._player_connections: Dict[tuple, WebSocket] = {}

        # Active players by game_id
        self._active_players: Dict[str, Dict[str, ActivePlayer]] = defaultdict(dict)

        # Real-time stats by game_id
        self._game_stats: Dict[str, GameStats] = {}

        # Event history for recent events (last 100 per game)
        self._event_history: Dict[str, List[RealtimeEvent]] = defaultdict(list)

        # Event counters for rate calculation
        self._event_counts: Dict[str, List[datetime]] = defaultdict(list)

        # Lock for thread safety
        self._lock = asyncio.Lock()

    # ─── Connection Management ─────────────────────────────────────

    async def connect_studio(self, websocket: WebSocket, game_id: str):
        """Connect a studio dashboard to a game channel"""
        await websocket.accept()
        async with self._lock:
            self._studio_connections[game_id].add(websocket)

        logger.info(f"Studio connected to game {game_id}")

        # Send initial state
        await self._send_initial_state(websocket, game_id)

    async def disconnect_studio(self, websocket: WebSocket, game_id: str):
        """Disconnect a studio dashboard"""
        async with self._lock:
            self._studio_connections[game_id].discard(websocket)
        logger.info(f"Studio disconnected from game {game_id}")

    async def connect_player(
        self,
        websocket: WebSocket,
        game_id: str,
        player_id: str,
        session_id: str,
        player_name: Optional[str] = None,
    ):
        """Connect a player's game client"""
        await websocket.accept()

        async with self._lock:
            key = (game_id, player_id)

            # Disconnect existing connection if any
            if key in self._player_connections:
                try:
                    await self._player_connections[key].close()
                except:
                    pass

            self._player_connections[key] = websocket

            # Track active player
            now = datetime.utcnow().isoformat()
            self._active_players[game_id][player_id] = ActivePlayer(
                player_id=player_id,
                player_name=player_name,
                game_id=game_id,
                session_id=session_id,
                current_scene_id=None,
                joined_at=now,
                last_activity=now,
            )

            # Update stats
            self._update_stats(game_id)

        logger.info(f"Player {player_id} connected to game {game_id}")

        # Broadcast player joined
        await self.broadcast_to_game(
            game_id,
            RealtimeEvent(
                event_type=RealtimeEventType.PLAYER_JOINED,
                game_id=game_id,
                player_id=player_id,
                data={
                    "player_id": player_id,
                    "player_name": player_name,
                    "session_id": session_id,
                },
            ),
        )

    async def disconnect_player(self, game_id: str, player_id: str):
        """Disconnect a player"""
        async with self._lock:
            key = (game_id, player_id)

            if key in self._player_connections:
                del self._player_connections[key]

            if player_id in self._active_players.get(game_id, {}):
                del self._active_players[game_id][player_id]

            self._update_stats(game_id)

        logger.info(f"Player {player_id} disconnected from game {game_id}")

        # Broadcast player left
        await self.broadcast_to_game(
            game_id,
            RealtimeEvent(
                event_type=RealtimeEventType.PLAYER_LEFT,
                game_id=game_id,
                player_id=player_id,
                data={"player_id": player_id},
            ),
        )

    # ─── Broadcasting ──────────────────────────────────────────────

    async def broadcast_to_game(self, game_id: str, event: RealtimeEvent):
        """Broadcast an event to all studio connections for a game"""
        # Store in history
        async with self._lock:
            history = self._event_history[game_id]
            history.append(event)
            if len(history) > 100:
                self._event_history[game_id] = history[-100:]

            # Track event rate
            self._event_counts[game_id].append(datetime.utcnow())
            # Keep only last 60 seconds
            cutoff = datetime.utcnow().timestamp() - 60
            self._event_counts[game_id] = [
                t for t in self._event_counts[game_id] if t.timestamp() > cutoff
            ]

        # Get connections
        connections = self._studio_connections.get(game_id, set()).copy()

        if not connections:
            return

        # Broadcast
        message = event.to_json()
        disconnected = []

        for websocket in connections:
            try:
                await websocket.send_text(message)
            except Exception as e:
                logger.warning(f"Failed to send to studio: {e}")
                disconnected.append(websocket)

        # Clean up disconnected
        if disconnected:
            async with self._lock:
                for ws in disconnected:
                    self._studio_connections[game_id].discard(ws)

    async def send_to_player(self, game_id: str, player_id: str, event: RealtimeEvent):
        """Send an event to a specific player"""
        key = (game_id, player_id)
        websocket = self._player_connections.get(key)

        if websocket:
            try:
                await websocket.send_text(event.to_json())
            except Exception as e:
                logger.warning(f"Failed to send to player {player_id}: {e}")

    # ─── Event Processing ──────────────────────────────────────────

    async def process_player_event(self, event_data: Dict[str, Any]):
        """Process an incoming event from a player and broadcast it"""
        game_id = event_data.get("game_id")
        player_id = event_data.get("player_id")
        event_type = event_data.get("event_type")

        if not game_id or not event_type:
            return

        # Update player activity
        async with self._lock:
            if player_id and player_id in self._active_players.get(game_id, {}):
                player = self._active_players[game_id][player_id]
                player.last_activity = datetime.utcnow().isoformat()

                # Update scene if scene event
                if event_type == "scene_enter":
                    player.current_scene_id = event_data.get("scene_id")

                # Update hearts if hearts event
                if event_type == "hearts_change":
                    facet = event_data.get("event_data", {}).get("facet")
                    new_value = event_data.get("event_data", {}).get("new_value")
                    if facet and new_value is not None:
                        player.hearts_scores[facet] = new_value

        # Create realtime event
        realtime_event = RealtimeEvent(
            event_type=event_type,
            game_id=game_id,
            player_id=player_id,
            session_id=event_data.get("session_id"),
            scene_id=event_data.get("scene_id"),
            data=event_data.get("event_data", {}),
        )

        # Broadcast to studio
        await self.broadcast_to_game(game_id, realtime_event)

        # Update stats for certain events
        if event_type in ["challenge_complete", "quest_complete"]:
            async with self._lock:
                self._update_stats(game_id)

    # ─── State Management ──────────────────────────────────────────

    async def _send_initial_state(self, websocket: WebSocket, game_id: str):
        """Send initial state when studio connects"""
        # Send active players
        players = list(self._active_players.get(game_id, {}).values())
        await websocket.send_text(
            json.dumps(
                {
                    "type": "initial_state",
                    "game_id": game_id,
                    "active_players": [p.to_dict() for p in players],
                    "stats": self._get_stats(game_id).to_dict(),
                    "recent_events": [
                        e.to_dict() for e in self._event_history.get(game_id, [])[-20:]
                    ],
                }
            )
        )

    def _update_stats(self, game_id: str):
        """Update real-time stats for a game"""
        active_count = len(self._active_players.get(game_id, {}))
        event_count = len(self._event_counts.get(game_id, []))

        if game_id not in self._game_stats:
            self._game_stats[game_id] = GameStats(game_id=game_id)

        stats = self._game_stats[game_id]
        stats.active_players = active_count
        stats.events_per_minute = event_count
        stats.last_updated = datetime.utcnow().isoformat()

    def _get_stats(self, game_id: str) -> GameStats:
        """Get current stats for a game"""
        if game_id not in self._game_stats:
            self._game_stats[game_id] = GameStats(game_id=game_id)
        return self._game_stats[game_id]

    # ─── Public Getters ────────────────────────────────────────────

    def get_active_players(self, game_id: str) -> List[ActivePlayer]:
        """Get list of active players for a game"""
        return list(self._active_players.get(game_id, {}).values())

    def get_active_player_count(self, game_id: str) -> int:
        """Get count of active players"""
        return len(self._active_players.get(game_id, {}))

    def get_recent_events(self, game_id: str, limit: int = 20) -> List[RealtimeEvent]:
        """Get recent events for a game"""
        events = self._event_history.get(game_id, [])
        return events[-limit:]

    def get_stats(self, game_id: str) -> GameStats:
        """Get real-time stats for a game"""
        return self._get_stats(game_id)


# ═══════════════════════════════════════════════════════════════════
#  Global Instance
# ═══════════════════════════════════════════════════════════════════

manager = ConnectionManager()


# ═══════════════════════════════════════════════════════════════════
#  Helper Functions
# ═══════════════════════════════════════════════════════════════════


async def broadcast_event(
    game_id: str,
    event_type: RealtimeEventType,
    data: Dict[str, Any],
    player_id: Optional[str] = None,
    session_id: Optional[str] = None,
    scene_id: Optional[str] = None,
):
    """Helper to broadcast an event"""
    event = RealtimeEvent(
        event_type=event_type.value,
        game_id=game_id,
        player_id=player_id,
        session_id=session_id,
        scene_id=scene_id,
        data=data,
    )
    await manager.broadcast_to_game(game_id, event)
