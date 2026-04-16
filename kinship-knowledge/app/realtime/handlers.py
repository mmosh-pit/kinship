"""WebSocket endpoint — handles player connections and message routing."""

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy import update as sa_update, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import async_session
from app.db.models import ScenePresence
from app.realtime.manager import manager

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/scene/{scene_id}")
async def scene_websocket(websocket: WebSocket, scene_id: str):
    """
    WebSocket endpoint for multi-player scene rooms.

    Connect: ws://host/ws/scene/{scene_id}?player_id={id}&display_name={name}
    """
    await websocket.accept()

    # Extract player info from query params
    player_id = websocket.query_params.get("player_id", "")
    display_name = websocket.query_params.get("display_name", "Player")

    if not player_id:
        await websocket.send_text(json.dumps({
            "type": "error", "code": "missing_player_id", "message": "player_id required"
        }))
        await websocket.close()
        return

    # Register in room
    await manager.connect(scene_id, player_id, websocket, display_name)

    # Track presence in DB
    async with async_session() as db:
        # Remove any stale presence for this player
        await db.execute(sa_delete(ScenePresence).where(ScenePresence.player_id == player_id))

        # Insert new presence
        db.add(ScenePresence(
            player_id=player_id,
            scene_id=scene_id,
            position_x=0,
            position_y=0,
        ))
        await db.commit()

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await manager.get_room(scene_id).send_to(player_id, {
                    "type": "error", "code": "invalid_json", "message": "Invalid JSON"
                })
                continue

            msg_type = message.get("type", "")
            room = manager.get_room(scene_id)
            if not room:
                break

            # ── Handle message types ──

            if msg_type == "move":
                x = message.get("x", 0)
                y = message.get("y", 0)
                facing = message.get("facing", "down")

                # Update DB presence
                async with async_session() as db:
                    await db.execute(
                        sa_update(ScenePresence)
                        .where(
                            ScenePresence.player_id == player_id,
                            ScenePresence.scene_id == scene_id,
                        )
                        .values(position_x=x, position_y=y, facing=facing, last_heartbeat=datetime.now(timezone.utc))
                    )
                    await db.commit()

                # Broadcast to others
                await room.broadcast({
                    "type": "player_move",
                    "player_id": player_id,
                    "x": x, "y": y, "facing": facing,
                }, exclude=player_id)

            elif msg_type == "interact":
                target_type = message.get("target_type", "")
                target_id = message.get("target_id", "")

                if target_type == "npc":
                    if room.lock_npc(target_id, player_id):
                        await room.broadcast({
                            "type": "npc_state",
                            "npc_id": target_id,
                            "state": "in_dialogue",
                            "occupied_by": player_id,
                        })
                    else:
                        await room.send_to(player_id, {
                            "type": "error",
                            "code": "npc_busy",
                            "message": "This NPC is talking to another player",
                        })

            elif msg_type == "dialogue":
                npc_id = message.get("npc_id", "")
                text = message.get("message", "")

                if not text:
                    continue

                # Run dialogue graph
                async with async_session() as db:
                    from app.graphs.npc_dialogue import run_dialogue
                    result = await run_dialogue(
                        player_id=player_id,
                        scene_id=scene_id,
                        npc_id=npc_id,
                        player_input=text,
                        db=db,
                    )
                    await db.commit()

                # Send dialogue response to sender only
                await room.send_to(player_id, {
                    "type": "dialogue_response",
                    **result,
                })

                # If scene transition triggered
                if result.get("scene_transition"):
                    await room.send_to(player_id, {
                        "type": "scene_transition",
                        "to_scene_id": result["scene_transition"].get("to_scene"),
                        "reason": result["scene_transition"].get("name", ""),
                    })

            elif msg_type == "dialogue_end":
                # Player finished talking to NPC — unlock
                npc_id = message.get("npc_id", "")
                room.unlock_npc(npc_id, player_id)
                await room.broadcast({
                    "type": "npc_state",
                    "npc_id": npc_id,
                    "state": "idle",
                    "occupied_by": None,
                })

            elif msg_type == "emote":
                await room.broadcast({
                    "type": "player_emote",
                    "player_id": player_id,
                    "emote": message.get("emote", "wave"),
                }, exclude=player_id)

            elif msg_type == "heartbeat":
                async with async_session() as db:
                    await db.execute(
                        sa_update(ScenePresence)
                        .where(
                            ScenePresence.player_id == player_id,
                            ScenePresence.scene_id == scene_id,
                        )
                        .values(last_heartbeat=datetime.now(timezone.utc))
                    )
                    await db.commit()

    except WebSocketDisconnect:
        logger.info(f"Player {player_id} disconnected from scene {scene_id}")
    except Exception as e:
        logger.error(f"WebSocket error for {player_id}: {e}")
    finally:
        await manager.disconnect(scene_id, player_id)

        # Clean up DB presence
        async with async_session() as db:
            await db.execute(
                sa_delete(ScenePresence).where(
                    ScenePresence.player_id == player_id,
                    ScenePresence.scene_id == scene_id,
                )
            )
            await db.commit()
