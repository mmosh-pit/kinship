"""
Kinship Agent - Gemini Live API Client

WebSocket client for Google's Gemini 2.0 Flash Live API.
Handles bidirectional audio streaming and function calling.

API Reference: https://ai.google.dev/api/multimodal-live
"""

import asyncio
import base64
import json
import logging
from typing import Optional, Dict, Any, List, Callable, Awaitable
from dataclasses import dataclass, field
from enum import Enum

import websockets
from websockets.client import WebSocketClientProtocol

from app.core.config import settings, voice_config

logger = logging.getLogger(__name__)


class GeminiLiveState(str, Enum):
    """Connection state for Gemini Live session."""
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    SETUP_SENT = "setup_sent"
    READY = "ready"
    ERROR = "error"


@dataclass
class GeminiLiveConfig:
    """Configuration for Gemini Live session."""
    
    # Model and voice settings from config.yaml (no hardcoding)
    model: str = field(default_factory=lambda: voice_config.gemini.model)
    system_instruction: str = ""
    tools: List[Dict[str, Any]] = field(default_factory=list)
    
    # Voice settings from config.yaml
    voice_name: str = field(default_factory=lambda: voice_config.gemini.default_voice)
    
    # Audio settings from config.yaml
    input_sample_rate: int = field(default_factory=lambda: voice_config.audio.input_sample_rate)
    output_sample_rate: int = field(default_factory=lambda: voice_config.audio.output_sample_rate)
    
    # Generation settings
    temperature: float = 0.7
    max_output_tokens: int = 4096
    
    # Response modalities
    response_modalities: List[str] = field(default_factory=lambda: ["AUDIO"])


@dataclass
class AudioChunk:
    """Audio data chunk."""
    data: bytes
    sample_rate: int = 16000
    encoding: str = "LINEAR16"


class GeminiLiveClient:
    """
    WebSocket client for Gemini Live API.
    
    Handles:
    - Connection management
    - Audio streaming (input/output)
    - Function calling
    - Session lifecycle
    - Barge-in (interruption) detection
    
    Usage:
        client = GeminiLiveClient(config)
        await client.connect()
        await client.send_audio(audio_chunk)
        # Receive events via callbacks
        await client.disconnect()
    """
    
    # Gemini Live API endpoint
    API_BASE = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent"
    
    def __init__(
        self,
        config: GeminiLiveConfig,
        on_audio: Optional[Callable[[bytes], Awaitable[None]]] = None,
        on_transcript: Optional[Callable[[str, bool], Awaitable[None]]] = None,
        on_function_call: Optional[Callable[[str, Dict[str, Any]], Awaitable[Any]]] = None,
        on_error: Optional[Callable[[str], Awaitable[None]]] = None,
        on_state_change: Optional[Callable[[GeminiLiveState], Awaitable[None]]] = None,
        on_interrupted: Optional[Callable[[], Awaitable[None]]] = None,
    ):
        """
        Initialize Gemini Live client.
        
        Args:
            config: Session configuration
            on_audio: Callback for audio output chunks
            on_transcript: Callback for transcription (text, is_final)
            on_function_call: Callback for function calls, returns result
            on_error: Callback for errors
            on_state_change: Callback for state changes
            on_interrupted: Callback when AI generation is interrupted by user (barge-in).
                           Gemini automatically detects user speech and stops generation.
                           Frontend should clear audio buffer when this is called.
        """
        self.config = config
        self.on_audio = on_audio
        self.on_transcript = on_transcript
        self.on_function_call = on_function_call
        self.on_error = on_error
        self.on_state_change = on_state_change
        self.on_interrupted = on_interrupted
        
        self._ws: Optional[WebSocketClientProtocol] = None
        self._state = GeminiLiveState.DISCONNECTED
        self._receive_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()
        
    @property
    def state(self) -> GeminiLiveState:
        """Current connection state."""
        return self._state
    
    @property
    def is_connected(self) -> bool:
        """Whether client is connected and ready."""
        return self._state == GeminiLiveState.READY
    
    async def _set_state(self, state: GeminiLiveState):
        """Update state and notify callback."""
        old_state = self._state
        self._state = state
        logger.debug(f"State change: {old_state} -> {state}")
        if self.on_state_change:
            try:
                await self.on_state_change(state)
            except Exception as e:
                logger.error(f"Error in state change callback: {e}")
    
    def _build_ws_url(self) -> str:
        """Build WebSocket URL with API key."""
        api_key = settings.google_api_key
        if not api_key:
            raise ValueError("GOOGLE_API_KEY not configured")
        return f"{self.API_BASE}?key={api_key}"
    
    def _build_setup_message(self) -> Dict[str, Any]:
        """Build the initial setup message for Gemini Live."""
        setup = {
            "setup": {
                "model": f"models/{self.config.model}",
                "generation_config": {
                    "response_modalities": self.config.response_modalities,
                    "speech_config": {
                        "voice_config": {
                            "prebuilt_voice_config": {
                                "voice_name": self.config.voice_name
                            }
                        }
                    },
                    "temperature": self.config.temperature,
                    "max_output_tokens": self.config.max_output_tokens,
                }
            }
        }
        
        # Add system instruction if provided
        if self.config.system_instruction:
            setup["setup"]["system_instruction"] = {
                "parts": [{"text": self.config.system_instruction}]
            }
        
        # Add tools if provided
        if self.config.tools:
            setup["setup"]["tools"] = self.config.tools
        
        return setup
    
    async def connect(self) -> bool:
        """
        Connect to Gemini Live API.
        
        Returns:
            True if connection successful
        """
        async with self._lock:
            if self._state not in [GeminiLiveState.DISCONNECTED, GeminiLiveState.ERROR]:
                logger.warning(f"Cannot connect: current state is {self._state}")
                return False
            
            await self._set_state(GeminiLiveState.CONNECTING)
        
        try:
            # Build WebSocket URL
            try:
                ws_url = self._build_ws_url()
            except ValueError as e:
                logger.error(f"Failed to build WebSocket URL: {e}")
                await self._set_state(GeminiLiveState.ERROR)
                if self.on_error:
                    await self.on_error(str(e))
                return False
            
            logger.info(f"Connecting to Gemini Live API...")
            
            # Connect to WebSocket
            self._ws = await asyncio.wait_for(
                websockets.connect(
                    ws_url,
                    additional_headers={
                        "Content-Type": "application/json",
                    },
                    max_size=10 * 1024 * 1024,  # 10MB max message size
                    ping_interval=20,
                    ping_timeout=10,
                ),
                timeout=15.0
            )
            
            await self._set_state(GeminiLiveState.CONNECTED)
            logger.info("WebSocket connected")
            
            # Start receive loop
            self._receive_task = asyncio.create_task(self._receive_loop())
            
            # Send setup message
            setup_message = self._build_setup_message()
            logger.debug(f"Sending setup message")
            await self._ws.send(json.dumps(setup_message))
            await self._set_state(GeminiLiveState.SETUP_SENT)
            
            # Wait for setup complete
            await self._wait_for_ready()
            
            logger.info("Gemini Live session ready")
            return True
            
        except asyncio.TimeoutError:
            logger.error("Connection timeout")
            await self._set_state(GeminiLiveState.ERROR)
            if self.on_error:
                await self.on_error("Connection timeout")
            return False
            
        except Exception as e:
            logger.error(f"Connection error: {e}")
            await self._set_state(GeminiLiveState.ERROR)
            if self.on_error:
                await self.on_error(str(e))
            return False
    
    async def _wait_for_ready(self, timeout: float = 10.0):
        """Wait for setup complete message."""
        start = asyncio.get_event_loop().time()
        while self._state == GeminiLiveState.SETUP_SENT:
            if asyncio.get_event_loop().time() - start > timeout:
                raise asyncio.TimeoutError("Timeout waiting for setup complete")
            await asyncio.sleep(0.1)
        
        # Check if we actually reached READY state
        if self._state != GeminiLiveState.READY:
            raise Exception(f"Setup failed: ended in state {self._state}")
    
    async def disconnect(self):
        """Disconnect from Gemini Live API."""
        async with self._lock:
            if self._receive_task:
                self._receive_task.cancel()
                try:
                    await self._receive_task
                except asyncio.CancelledError:
                    pass
                self._receive_task = None
            
            if self._ws:
                await self._ws.close()
                self._ws = None
            
            await self._set_state(GeminiLiveState.DISCONNECTED)
            logger.info("Disconnected from Gemini Live")
    
    async def send_audio(self, audio: AudioChunk) -> bool:
        """
        Send audio chunk to Gemini.
        
        Args:
            audio: Audio chunk with PCM data
            
        Returns:
            True if sent successfully
        """
        if not self.is_connected or not self._ws:
            logger.warning("Cannot send audio: not connected")
            return False
        
        try:
            # Encode audio as base64
            audio_b64 = base64.b64encode(audio.data).decode("utf-8")
            
            # Use the new realtimeInput.audio format (not deprecated media_chunks)
            message = {
                "realtimeInput": {
                    "audio": {
                        "data": audio_b64,
                        "mimeType": f"audio/pcm;rate={audio.sample_rate}"
                    }
                }
            }
            
            await self._ws.send(json.dumps(message))
            return True
            
        except Exception as e:
            logger.error(f"Error sending audio: {e}")
            return False
    
    async def send_text(self, text: str) -> bool:
        """
        Send text input to Gemini (for text injection during voice session).
        
        Args:
            text: Text message
            
        Returns:
            True if sent successfully
        """
        if not self.is_connected or not self._ws:
            logger.warning("Cannot send text: not connected")
            return False
        
        try:
            message = {
                "client_content": {
                    "turns": [
                        {
                            "role": "user",
                            "parts": [{"text": text}]
                        }
                    ],
                    "turn_complete": True
                }
            }
            
            await self._ws.send(json.dumps(message))
            return True
            
        except Exception as e:
            logger.error(f"Error sending text: {e}")
            return False
    
    async def send_function_response(self, function_call_id: str, result: Any) -> bool:
        """
        Send function call response back to Gemini.
        
        Args:
            function_call_id: ID of the function call
            result: Result to send back
            
        Returns:
            True if sent successfully
        """
        if not self.is_connected or not self._ws:
            logger.warning("Cannot send function response: not connected")
            return False
        
        try:
            message = {
                "tool_response": {
                    "function_responses": [
                        {
                            "id": function_call_id,
                            "response": {"result": result}
                        }
                    ]
                }
            }
            
            await self._ws.send(json.dumps(message))
            return True
            
        except Exception as e:
            logger.error(f"Error sending function response: {e}")
            return False
    
    async def interrupt(self) -> bool:
        """
        Manually interrupt the current AI generation.
        
        Note: Gemini Live API handles barge-in automatically when it detects
        user speech. This method is for manual interruption (e.g., stop button).
        
        Returns:
            True if interrupt signal sent successfully
        """
        if not self.is_connected or not self._ws:
            logger.warning("Cannot interrupt: not connected")
            return False
        
        try:
            # Send an empty client content with turn_complete to signal interruption
            message = {
                "clientContent": {
                    "turns": [
                        {
                            "role": "user",
                            "parts": [{"text": ""}]
                        }
                    ],
                    "turnComplete": True
                }
            }
            
            await self._ws.send(json.dumps(message))
            logger.info("Sent interrupt signal to Gemini")
            return True
            
        except Exception as e:
            logger.error(f"Error sending interrupt: {e}")
            return False
    
    async def _receive_loop(self):
        """Main receive loop for WebSocket messages."""
        if not self._ws:
            return
        
        try:
            async for message in self._ws:
                await self._handle_message(message)
                
        except websockets.exceptions.ConnectionClosed as e:
            logger.info(f"WebSocket connection closed: code={e.code}, reason={e.reason}")
            await self._set_state(GeminiLiveState.DISCONNECTED)
            if self.on_error and e.reason:
                await self.on_error(f"Connection closed: {e.reason}")
            
        except asyncio.CancelledError:
            logger.info("Receive loop cancelled")
            raise
            
        except Exception as e:
            logger.error(f"Error in receive loop: {e}")
            await self._set_state(GeminiLiveState.ERROR)
            if self.on_error:
                await self.on_error(str(e))
    
    async def _handle_message(self, raw_message: str):
        """Handle incoming WebSocket message."""
        try:
            message = json.loads(raw_message)
            
            # Setup complete
            if "setupComplete" in message:
                await self._set_state(GeminiLiveState.READY)
                return
            
            # Server content (audio, text, function calls, interruption)
            if "serverContent" in message:
                await self._handle_server_content(message["serverContent"])
                return
            
            # Tool call
            if "toolCall" in message:
                await self._handle_tool_call(message["toolCall"])
                return
            
            # Other message types
            logger.debug(f"Unhandled message type: {list(message.keys())}")
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse message: {e}")
        except Exception as e:
            logger.error(f"Error handling message: {e}")
    
    async def _handle_server_content(self, content: Dict[str, Any]):
        """Handle server content message (audio, transcript, interruption)."""
        
        # Check if this is an interruption notification (barge-in)
        # Gemini sends this when it detects user speech while generating
        if content.get("interrupted", False):
            logger.info("AI generation was interrupted by user (barge-in)")
            if self.on_interrupted:
                await self.on_interrupted()
            return
        
        model_turn = content.get("modelTurn", {})
        parts = model_turn.get("parts", [])
        
        for part in parts:
            # Audio response
            if "inlineData" in part:
                inline_data = part["inlineData"]
                mime_type = inline_data.get("mimeType", "")
                
                if "audio" in mime_type:
                    audio_data = base64.b64decode(inline_data["data"])
                    if self.on_audio:
                        await self.on_audio(audio_data)
            
            # Text response (transcript)
            if "text" in part:
                text = part["text"]
                is_final = content.get("turnComplete", False)
                if self.on_transcript:
                    await self.on_transcript(text, is_final)
        
        # Check if turn is complete
        if content.get("turnComplete", False):
            logger.debug("AI turn complete")
    
    async def _handle_tool_call(self, tool_call: Dict[str, Any]):
        """Handle function/tool call from Gemini."""
        function_calls = tool_call.get("functionCalls", [])
        
        for fc in function_calls:
            name = fc.get("name", "")
            args = fc.get("args", {})
            call_id = fc.get("id", "")
            
            logger.info(f"Function call: {name}({args})")
            
            if self.on_function_call:
                try:
                    result = await self.on_function_call(name, args)
                    await self.send_function_response(call_id, result)
                except Exception as e:
                    logger.error(f"Error executing function {name}: {e}")
                    await self.send_function_response(call_id, {"error": str(e)})


def build_gemini_tools_config(function_declarations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Build tools configuration for Gemini Live setup message.
    
    Args:
        function_declarations: List of function declarations from MCP tools
        
    Returns:
        Tools config for Gemini setup message
    """
    if not function_declarations:
        return []
    
    return [
        {
            "function_declarations": function_declarations
        }
    ]