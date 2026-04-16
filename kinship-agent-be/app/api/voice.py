"""
Kinship Agent - Voice Chat API Routes

WebSocket endpoint for real-time voice chat using Gemini Live API.
Includes barge-in (interruption) support.
"""

import asyncio
import base64
import json
import logging
from typing import Optional, Dict, Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query, HTTPException
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_session
from app.db.models import Agent, AgentType, AgentStatus
from app.agents.voice.session_manager import (
    VoiceSessionManager,
    VoiceSessionConfig,
    VoiceSessionState,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/voice", tags=["voice"])


# ─────────────────────────────────────────────────────────────────────────────
# WebSocket Message Types
# ─────────────────────────────────────────────────────────────────────────────

# Client -> Server
MSG_AUDIO = "audio"  # Audio chunk from client mic
MSG_TEXT = "text"  # Text injection
MSG_CONTROL = "control"  # Control messages (mute, end)

# Server -> Client
MSG_AUDIO_OUT = "audio"  # Audio chunk to play
MSG_TRANSCRIPT = "transcript"  # Transcription text
MSG_TOOL_CALL = "tool_call"  # Tool being called
MSG_TOOL_RESULT = "tool_result"  # Tool result
MSG_STATE = "state"  # State change
MSG_ERROR = "error"  # Error message
MSG_READY = "ready"  # Session ready
MSG_INTERRUPTED = (
    "interrupted"  # AI was interrupted by user (barge-in) - frontend should clear audio buffer
)


# ─────────────────────────────────────────────────────────────────────────────
# Health Check
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/health")
async def voice_health():
    """Voice service health check."""
    return {
        "status": "ok",
        "service": "voice",
        "provider": "gemini_live",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Voice Capabilities
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/capabilities")
async def voice_capabilities():
    """Get voice chat capabilities and configuration."""
    from app.core.config import voice_config

    return {
        "enabled": voice_config.enabled,
        "provider": voice_config.provider,
        "model": voice_config.gemini.model,
        "audio": {
            "input_sample_rate": voice_config.audio.input_sample_rate,
            "output_sample_rate": voice_config.audio.output_sample_rate,
            "encoding": voice_config.audio.input_encoding,
            "channels": 1,
        },
        "voices": [
            {"id": "Aoede", "name": "Aoede", "gender": "female"},
            {"id": "Charon", "name": "Charon", "gender": "male"},
            {"id": "Fenrir", "name": "Fenrir", "gender": "male"},
            {"id": "Kore", "name": "Kore", "gender": "female"},
            {"id": "Puck", "name": "Puck", "gender": "male"},
        ],
        "default_voice": voice_config.gemini.default_voice,
        "limits": {
            "max_duration_seconds": voice_config.session.max_duration_seconds,
            "idle_timeout_seconds": voice_config.session.idle_timeout_seconds,
        },
        "features": {
            "barge_in": True,  # User can interrupt AI while speaking
            "tool_calling": voice_config.tools.enabled,
            "knowledge_base": True,
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# WebSocket Voice Session
# ─────────────────────────────────────────────────────────────────────────────


@router.websocket("/session")
async def voice_session_websocket(
    websocket: WebSocket,
    presence_id: str = Query(..., alias="presenceId"),
    user_id: str = Query("", alias="userId"),
    user_wallet: str = Query("", alias="userWallet"),
    user_role: str = Query("member", alias="userRole"),
    voice: str = Query("Aoede"),
    auth_token: Optional[str] = Query(None, alias="authToken"),
):
    """
    WebSocket endpoint for voice chat session.

    Query Parameters:
        presenceId: Presence agent ID (required)
        userId: User identifier
        userWallet: User wallet address
        userRole: User role (member, creator, admin)
        voice: Voice name (Aoede, Charon, Fenrir, Kore, Puck)

    Client -> Server Messages:
        {"type": "audio", "data": "<base64 PCM audio>"}
        {"type": "text", "text": "optional text input"}
        {"type": "control", "action": "mute|unmute|end"}

    Server -> Client Messages:
        {"type": "ready", "sessionId": "...", "presenceName": "..."}
        {"type": "audio", "data": "<base64 PCM audio>"}
        {"type": "transcript", "text": "...", "isFinal": true/false, "role": "user|assistant"}
        {"type": "tool_call", "name": "...", "arguments": {...}}
        {"type": "tool_result", "name": "...", "result": {...}}
        {"type": "state", "state": "ready|active|ai_speaking|..."}
        {"type": "interrupted"}  # Barge-in: AI was interrupted, clear audio buffer
        {"type": "error", "message": "..."}
    """
    # Accept WebSocket connection
    await websocket.accept()
    logger.info(f"Voice WebSocket connected: presence={presence_id}, user={user_id}")

    # Get database session
    from app.db.database import async_session_factory

    db = async_session_factory()

    session_manager: Optional[VoiceSessionManager] = None

    try:
        # Verify presence exists
        stmt = select(Agent).where(
            and_(
                Agent.id == presence_id,
                Agent.type == AgentType.PRESENCE,
                Agent.status != AgentStatus.ARCHIVED,
            )
        )
        result = await db.execute(stmt)
        presence = result.scalar_one_or_none()

        if not presence:
            await websocket.send_json(
                {
                    "type": MSG_ERROR,
                    "message": "Presence agent not found",
                    "code": "PRESENCE_NOT_FOUND",
                }
            )
            await websocket.close(code=4004, reason="Presence not found")
            return

        # Extract auth token from query param (primary) or header (fallback)
        # Note: Browsers cannot send custom headers on WebSocket connections,
        # so we receive the token via query param from the frontend
        effective_auth_token = auth_token  # From query param
        if not effective_auth_token:
            # Fallback to header (for non-browser clients)
            auth_header = websocket.headers.get("authorization")
            if auth_header and auth_header.startswith("Bearer "):
                effective_auth_token = auth_header[7:]
        
        if effective_auth_token:
            logger.info(f"[Voice] Auth token received: {effective_auth_token[:20]}...")
        else:
            logger.warning(f"[Voice] No auth token provided - tool calls requiring auth will fail")

        # Build MCP headers for tool calls (same format as chat flow)
        mcp_headers = {}
        if effective_auth_token:
            mcp_headers["authorization"] = effective_auth_token  # Raw token, no "Bearer " prefix

        # Create session config
        config = VoiceSessionConfig(
            presence_id=presence_id,
            user_id=user_id,
            user_wallet=user_wallet,
            user_role=user_role,
            voice_name=voice,
            auth_token=effective_auth_token,
            mcp_headers=mcp_headers,
        )

        # ─────────────────────────────────────────────────────────────────
        # Callbacks: Forward events from session manager to WebSocket
        # ─────────────────────────────────────────────────────────────────

        async def on_audio(audio_data: bytes):
            """Forward audio output to client."""
            audio_b64 = base64.b64encode(audio_data).decode("utf-8")
            await websocket.send_json(
                {
                    "type": MSG_AUDIO_OUT,
                    "data": audio_b64,
                }
            )

        async def on_transcript(text: str, is_final: bool):
            """Forward transcript to client."""
            await websocket.send_json(
                {
                    "type": MSG_TRANSCRIPT,
                    "text": text,
                    "isFinal": is_final,
                    "role": "assistant",
                }
            )

        async def on_tool_call(name: str, args: Dict[str, Any]):
            """Forward tool call notification to client."""
            await websocket.send_json(
                {
                    "type": MSG_TOOL_CALL,
                    "name": name,
                    "arguments": args,
                }
            )

        async def on_tool_result(name: str, result: Dict[str, Any]):
            """Forward tool result to client."""
            await websocket.send_json(
                {
                    "type": MSG_TOOL_RESULT,
                    "name": name,
                    "result": result,
                }
            )

        async def on_state_change(state: VoiceSessionState):
            """Forward state change to client."""
            await websocket.send_json(
                {
                    "type": MSG_STATE,
                    "state": state.value,
                }
            )

        async def on_error(error: str):
            """Forward error to client."""
            await websocket.send_json(
                {
                    "type": MSG_ERROR,
                    "message": error,
                }
            )

        async def on_interrupted():
            """
            Called when AI is interrupted by user (barge-in).

            Gemini detected user speech while generating a response and
            automatically stopped generation. Frontend must immediately
            clear its audio playback buffer to stop playing old audio.
            """
            await websocket.send_json(
                {
                    "type": MSG_INTERRUPTED,
                }
            )

        # Create session manager with all callbacks
        session_manager = VoiceSessionManager(
            config=config,
            on_audio=on_audio,
            on_transcript=on_transcript,
            on_tool_call=on_tool_call,
            on_tool_result=on_tool_result,
            on_state_change=on_state_change,
            on_error=on_error,
            on_interrupted=on_interrupted,
        )

        # Initialize session
        if not await session_manager.initialize(db):
            await websocket.send_json(
                {
                    "type": MSG_ERROR,
                    "message": "Failed to initialize voice session",
                    "code": "INIT_FAILED",
                }
            )
            await websocket.close(code=4001, reason="Initialization failed")
            return

        # Start session (connect to Gemini)
        if not await session_manager.start():
            await websocket.send_json(
                {
                    "type": MSG_ERROR,
                    "message": "Failed to connect to voice service",
                    "code": "CONNECTION_FAILED",
                }
            )
            await websocket.close(code=4002, reason="Connection failed")
            return

        # Send ready message
        await websocket.send_json(
            {
                "type": MSG_READY,
                "sessionId": session_manager.session_id,
                "presenceId": presence_id,
                "presenceName": presence.name,
                "voice": voice,
            }
        )

        # ─────────────────────────────────────────────────────────────────
        # Main message loop
        # ─────────────────────────────────────────────────────────────────

        while session_manager.is_active:
            try:
                # Receive message with timeout
                raw_message = await asyncio.wait_for(websocket.receive_text(), timeout=35.0)

                message = json.loads(raw_message)
                msg_type = message.get("type", "")

                if msg_type == MSG_AUDIO:
                    # Audio from client microphone
                    # Note: Gemini handles barge-in automatically via VAD
                    audio_b64 = message.get("data", "")
                    if audio_b64:
                        audio_data = base64.b64decode(audio_b64)
                        await session_manager.send_audio(audio_data)

                elif msg_type == MSG_TEXT:
                    # Text injection
                    text = message.get("text", "")
                    if text:
                        await session_manager.send_text(text)

                elif msg_type == MSG_CONTROL:
                    # Control message
                    action = message.get("action", "")

                    if action == "end":
                        logger.info(f"[{session_manager.session_id}] Client requested end")
                        break

                    elif action == "mute":
                        # Client muted - we just acknowledge, no server action needed
                        pass

                    elif action == "unmute":
                        # Client unmuted
                        pass

                else:
                    logger.warning(f"Unknown message type: {msg_type}")

            except asyncio.TimeoutError:
                # Send keepalive/check if client still connected
                try:
                    await websocket.send_json({"type": "ping"})
                except:
                    break

            except json.JSONDecodeError as e:
                logger.warning(f"Invalid JSON message: {e}")

            except WebSocketDisconnect:
                logger.info(f"[{session_manager.session_id}] WebSocket disconnected")
                break

    except WebSocketDisconnect:
        logger.info(f"Voice WebSocket disconnected: presence={presence_id}")

    except Exception as e:
        logger.error(f"Voice session error: {e}")
        try:
            await websocket.send_json(
                {
                    "type": MSG_ERROR,
                    "message": str(e),
                    "code": "SERVER_ERROR",
                }
            )
        except:
            pass

    finally:
        # Cleanup
        if session_manager:
            await session_manager.end(reason="websocket_closed")

        await db.close()

        try:
            await websocket.close()
        except:
            pass

        logger.info(f"Voice session cleanup complete: presence={presence_id}")


# ─────────────────────────────────────────────────────────────────────────────
# Session Info (for debugging/monitoring)
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/sessions/active")
async def list_active_sessions():
    """
    List currently active voice sessions.

    Note: This is a placeholder - in production, you'd track sessions
    in Redis or similar for multi-instance support.
    """
    return {
        "sessions": [],
        "count": 0,
        "note": "Session tracking not implemented yet",
    }
