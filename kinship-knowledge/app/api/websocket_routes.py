"""
Kinship Real-time WebSocket Routes

FastAPI routes for WebSocket connections from Studio dashboard
and Flutter game clients.
"""

import json
import logging
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, HTTPException
from fastapi.responses import JSONResponse

from app.realtime import (
    manager,
    RealtimeEvent,
    RealtimeEventType,
    broadcast_event,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/realtime", tags=["realtime"])


# ═══════════════════════════════════════════════════════════════════
#  Studio Dashboard WebSocket
# ═══════════════════════════════════════════════════════════════════


@router.websocket("/studio/{game_id}")
async def studio_websocket(
    websocket: WebSocket,
    game_id: str,
):
    """
    WebSocket endpoint for Studio dashboard to receive real-time events.

    Connect to: ws://localhost:8000/api/realtime/studio/{game_id}

    Receives:
    - initial_state: Active players, stats, recent events
    - player_joined: When a player connects
    - player_left: When a player disconnects
    - player_scene_change: Scene transitions
    - challenge_complete/fail: Challenge events
    - hearts_change: HEARTS score changes
    - stats_update: Periodic stats updates
    """
    await manager.connect_studio(websocket, game_id)

    try:
        while True:
            # Studio mostly receives, but can send commands
            data = await websocket.receive_text()

            try:
                message = json.loads(data)
                msg_type = message.get("type")

                # Handle ping/pong for keepalive
                if msg_type == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))

                # Request fresh stats
                elif msg_type == "request_stats":
                    stats = manager.get_stats(game_id)
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "stats_update",
                                "stats": stats.to_dict(),
                            }
                        )
                    )

                # Request active players list
                elif msg_type == "request_players":
                    players = manager.get_active_players(game_id)
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "active_players_update",
                                "players": [p.to_dict() for p in players],
                            }
                        )
                    )

            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON from studio: {data}")

    except WebSocketDisconnect:
        await manager.disconnect_studio(websocket, game_id)
    except Exception as e:
        logger.error(f"Studio WebSocket error: {e}")
        await manager.disconnect_studio(websocket, game_id)


# ═══════════════════════════════════════════════════════════════════
#  Player Game Client WebSocket
# ═══════════════════════════════════════════════════════════════════


@router.websocket("/player/{game_id}/{player_id}")
async def player_websocket(
    websocket: WebSocket,
    game_id: str,
    player_id: str,
    session_id: str = Query(...),
    player_name: Optional[str] = Query(None),
):
    """
    WebSocket endpoint for Flutter game client to send real-time events.

    Connect to: ws://localhost:8000/api/realtime/player/{game_id}/{player_id}?session_id=xxx

    Send events as JSON:
    {
        "event_type": "scene_enter",
        "scene_id": "forest-clearing",
        "event_data": {...}
    }
    """
    await manager.connect_player(
        websocket=websocket,
        game_id=game_id,
        player_id=player_id,
        session_id=session_id,
        player_name=player_name,
    )

    try:
        while True:
            data = await websocket.receive_text()

            try:
                message = json.loads(data)

                # Handle ping/pong
                if message.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
                    continue

                # Process player event
                event_data = {
                    "game_id": game_id,
                    "player_id": player_id,
                    "session_id": session_id,
                    **message,
                }

                await manager.process_player_event(event_data)

                # Acknowledge receipt
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "ack",
                            "event_type": message.get("event_type"),
                        }
                    )
                )

            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON from player {player_id}: {data}")
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "error",
                            "message": "Invalid JSON",
                        }
                    )
                )

    except WebSocketDisconnect:
        await manager.disconnect_player(game_id, player_id)
    except Exception as e:
        logger.error(f"Player WebSocket error: {e}")
        await manager.disconnect_player(game_id, player_id)


# ═══════════════════════════════════════════════════════════════════
#  REST Endpoints for Real-time Data
# ═══════════════════════════════════════════════════════════════════


@router.get("/games/{game_id}/active-players")
async def get_active_players(game_id: str):
    """Get list of currently active players for a game"""
    players = manager.get_active_players(game_id)
    return {
        "game_id": game_id,
        "count": len(players),
        "players": [p.to_dict() for p in players],
    }


@router.get("/games/{game_id}/stats")
async def get_realtime_stats(game_id: str):
    """Get real-time stats for a game"""
    stats = manager.get_stats(game_id)
    return stats.to_dict()


@router.get("/games/{game_id}/recent-events")
async def get_recent_events(game_id: str, limit: int = 20):
    """Get recent events for a game"""
    events = manager.get_recent_events(game_id, limit=min(limit, 100))
    return {
        "game_id": game_id,
        "count": len(events),
        "events": [e.to_dict() for e in events],
    }


@router.post("/games/{game_id}/broadcast")
async def broadcast_custom_event(
    game_id: str,
    event_type: str,
    data: dict,
):
    """Broadcast a custom event to all studio connections for a game"""
    await broadcast_event(
        game_id=game_id,
        event_type=RealtimeEventType.CUSTOM,
        data={
            "custom_type": event_type,
            **data,
        },
    )
    return {"status": "broadcasted"}


# ═══════════════════════════════════════════════════════════════════
#  Integration Helper - Call from Event Batch Endpoint
# ═══════════════════════════════════════════════════════════════════


async def process_event_for_realtime(event_dict: dict):
    """
    Call this from your /api/player/events/batch endpoint
    to forward events to the real-time system.

    Usage in your existing endpoint:

    @router.post("/api/player/events/batch")
    async def batch_events(events: List[dict]):
        # Save to database...

        # Forward to real-time
        for event in events:
            await process_event_for_realtime(event)

        return {"status": "ok"}
    """
    await manager.process_player_event(event_dict)
