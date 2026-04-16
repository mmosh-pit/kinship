"""
Kinship Agent - Voice Chat Module

Real-time voice chat using Gemini 2.0 Flash Live API.

Components:
- gemini_live: WebSocket client for Gemini Live API
- session_manager: Manages voice sessions
- tool_bridge: Bridges Gemini function calls to MCP tools
"""

from app.agents.voice.session_manager import VoiceSessionManager
from app.agents.voice.gemini_live import GeminiLiveClient
from app.agents.voice.tool_bridge import ToolBridge

__all__ = [
    "VoiceSessionManager",
    "GeminiLiveClient", 
    "ToolBridge",
]
