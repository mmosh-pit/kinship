"""
Kinship Agent - Voice Session Manager

Manages voice chat sessions between users and Presence agents.
Coordinates:
- Gemini Live connection
- Audio streaming
- Tool execution
- Session lifecycle
- Knowledge retrieval (Pinecone RAG)
- Barge-in (interruption) handling
"""

import asyncio
import logging
from typing import Optional, Dict, Any, List, Callable, Awaitable, TYPE_CHECKING
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import uuid

from app.agents.voice.gemini_live import (
    GeminiLiveClient,
    GeminiLiveConfig,
    GeminiLiveState,
    AudioChunk,
)
from app.agents.voice.tool_bridge import ToolBridge, build_gemini_tools_config
from app.agents.cache.manager import cache_manager
from app.agents.knowledge import get_relevant_knowledge
from app.agents.types import PresenceContext
from app.core.config import settings
from app.services.conversation import conversation_service

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class VoiceSessionState(str, Enum):
    """Voice session state."""
    INITIALIZING = "initializing"
    CONNECTING = "connecting"
    READY = "ready"
    ACTIVE = "active"
    AI_SPEAKING = "ai_speaking"
    ENDING = "ending"
    ENDED = "ended"
    ERROR = "error"


@dataclass
class VoiceSessionConfig:
    """Configuration for a voice session."""
    
    presence_id: str
    user_id: str
    user_wallet: str = ""
    user_role: str = "member"
    
    # Voice settings (defaults from config.yaml, can be overridden per-session)
    voice_name: str = ""  # Will use config default if empty
    
    # Timeouts (defaults from config.yaml)
    max_duration_seconds: int = 0  # Will use config default if 0
    idle_timeout_seconds: int = 0  # Will use config default if 0
    
    # Auth for tool calls
    auth_token: Optional[str] = None
    mcp_headers: Optional[Dict[str, str]] = None
    
    def __post_init__(self):
        """Apply config defaults for empty values."""
        from app.core.config import voice_config
        
        if not self.voice_name:
            self.voice_name = voice_config.gemini.default_voice
        if self.max_duration_seconds == 0:
            self.max_duration_seconds = voice_config.session.max_duration_seconds
        if self.idle_timeout_seconds == 0:
            self.idle_timeout_seconds = voice_config.session.idle_timeout_seconds


@dataclass
class VoiceSessionStats:
    """Statistics for a voice session."""
    
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    
    audio_chunks_sent: int = 0
    audio_chunks_received: int = 0
    audio_bytes_sent: int = 0
    audio_bytes_received: int = 0
    
    tool_calls_made: int = 0
    tool_calls_succeeded: int = 0
    tool_calls_failed: int = 0
    
    # Barge-in statistics
    interruptions: int = 0


class VoiceSessionManager:
    """
    Manages a single voice chat session.
    
    Lifecycle:
    1. Initialize with presence context
    2. Connect to Gemini Live
    3. Stream audio bidirectionally
    4. Handle tool calls
    5. Handle barge-in (interruption)
    6. End session
    
    Barge-in (Interruption) Handling:
    - Gemini Live API automatically detects when user speaks during AI response
    - When detected, Gemini stops generating and sends an "interrupted" event
    - This manager forwards the event to the frontend via on_interrupted callback
    - Frontend must clear its audio playback buffer to stop the old response
    
    Usage:
        manager = VoiceSessionManager(config)
        await manager.initialize(db_session)
        await manager.start()
        
        # Stream audio
        await manager.send_audio(audio_data)
        
        # Receive events via callbacks
        manager.on_audio = async_callback
        manager.on_transcript = async_callback
        manager.on_interrupted = async_callback  # For barge-in
        
        await manager.end()
    """
    
    def __init__(
        self,
        config: VoiceSessionConfig,
        on_audio: Optional[Callable[[bytes], Awaitable[None]]] = None,
        on_transcript: Optional[Callable[[str, bool], Awaitable[None]]] = None,
        on_tool_call: Optional[Callable[[str, Dict[str, Any]], Awaitable[None]]] = None,
        on_tool_result: Optional[Callable[[str, Dict[str, Any]], Awaitable[None]]] = None,
        on_state_change: Optional[Callable[[VoiceSessionState], Awaitable[None]]] = None,
        on_error: Optional[Callable[[str], Awaitable[None]]] = None,
        on_interrupted: Optional[Callable[[], Awaitable[None]]] = None,
    ):
        """
        Initialize voice session manager.
        
        Args:
            config: Session configuration
            on_audio: Callback for audio output
            on_transcript: Callback for transcription
            on_tool_call: Callback when tool is called
            on_tool_result: Callback when tool returns result
            on_state_change: Callback for state changes
            on_error: Callback for errors
            on_interrupted: Callback when AI is interrupted by user (barge-in).
                           Frontend should clear audio buffer when this is called.
        """
        self.config = config
        self.session_id = f"voice_{uuid.uuid4().hex[:12]}"
        
        # Callbacks
        self.on_audio = on_audio
        self.on_transcript = on_transcript
        self.on_tool_call = on_tool_call
        self.on_tool_result = on_tool_result
        self.on_state_change = on_state_change
        self.on_error = on_error
        self.on_interrupted = on_interrupted
        
        # Internal state
        self._state = VoiceSessionState.INITIALIZING
        self._gemini_client: Optional[GeminiLiveClient] = None
        self._tool_bridge: Optional[ToolBridge] = None
        self._presence_context: Optional[PresenceContext] = None
        self._db_session: Optional["AsyncSession"] = None
        self._knowledge_context: str = ""
        self._knowledge_sources: List[str] = []
        self._chat_history: List[Dict[str, Any]] = []  # Recent conversation messages
        self._chat_history_summary: Optional[str] = None  # Summary of older messages
        self._stats = VoiceSessionStats()
        
        # Timeout tasks
        self._session_timeout_task: Optional[asyncio.Task] = None
        self._idle_timeout_task: Optional[asyncio.Task] = None
        self._last_activity: datetime = datetime.utcnow()
        
    @property
    def state(self) -> VoiceSessionState:
        """Current session state."""
        return self._state
    
    @property
    def stats(self) -> VoiceSessionStats:
        """Session statistics."""
        return self._stats
    
    @property
    def is_active(self) -> bool:
        """Whether session is active and ready for audio."""
        return self._state in [VoiceSessionState.READY, VoiceSessionState.ACTIVE, VoiceSessionState.AI_SPEAKING]
    
    async def _set_state(self, state: VoiceSessionState):
        """Update state and notify callback."""
        old_state = self._state
        self._state = state
        logger.info(f"[{self.session_id}] State: {old_state} -> {state}")
        
        if self.on_state_change:
            try:
                await self.on_state_change(state)
            except Exception as e:
                logger.error(f"Error in state change callback: {e}")
    
    async def initialize(self, db_session: "AsyncSession") -> bool:
        """
        Initialize the session with presence context, knowledge, and tools.
        
        Args:
            db_session: Database session
            
        Returns:
            True if initialization successful
        """
        try:
            logger.info(f"[{self.session_id}] Initializing voice session for presence {self.config.presence_id}")
            
            # Store db_session for later use
            self._db_session = db_session
            
            # Load presence context
            self._presence_context = await cache_manager.get_presence_context(
                self.config.presence_id,
                db_session,
            )
            
            if not self._presence_context:
                logger.error(f"Presence not found: {self.config.presence_id}")
                await self._set_state(VoiceSessionState.ERROR)
                return False
            
            # Retrieve knowledge from Pinecone (same as chat does)
            if self._presence_context.get("knowledge_base_ids"):
                try:
                    initial_query = self._presence_context.get("presence_description") or \
                                   f"About {self._presence_context['presence_name']}"
                    
                    self._knowledge_context = await get_relevant_knowledge(
                        knowledge_base_ids=self._presence_context["knowledge_base_ids"],
                        query=initial_query,
                        db_session=db_session,
                        top_k=5,
                    )
                    
                    if self._knowledge_context:
                        for line in self._knowledge_context.split("\n"):
                            if line.startswith("[Source:"):
                                source = line.replace("[Source:", "").replace("]", "").strip()
                                if source and source not in self._knowledge_sources:
                                    self._knowledge_sources.append(source)
                        
                        logger.info(f"[{self.session_id}] Loaded knowledge from {len(self._knowledge_sources)} sources")
                except Exception as e:
                    logger.warning(f"[{self.session_id}] Failed to fetch knowledge: {e}")
            
            # Load existing chat history for context continuity
            if self.config.user_wallet:
                try:
                    print(f"\n[VoiceSession:{self.session_id}] ========== LOADING HISTORY ==========")
                    print(f"[VoiceSession:{self.session_id}] User: {self.config.user_wallet[:20]}...")
                    print(f"[VoiceSession:{self.session_id}] Presence: {self.config.presence_id}")
                    
                    history_result = await conversation_service.get_history_with_token_budget(
                        db=db_session,
                        user_wallet=self.config.user_wallet,
                        presence_id=self.config.presence_id,
                    )
                    self._chat_history = history_result["messages"]
                    self._chat_history_summary = history_result["summary"]
                    
                    print(f"[VoiceSession:{self.session_id}] ✅ History loaded:")
                    print(f"[VoiceSession:{self.session_id}]    - Recent messages: {len(self._chat_history)}")
                    print(f"[VoiceSession:{self.session_id}]    - Summarized messages: {history_result['summarized_message_count']}")
                    print(f"[VoiceSession:{self.session_id}]    - Total tokens: {history_result['total_tokens']}")
                    print(f"[VoiceSession:{self.session_id}]    - Has summary: {'YES' if self._chat_history_summary else 'NO'}")
                    if self._chat_history_summary:
                        print(f"[VoiceSession:{self.session_id}]    - Summary preview: {self._chat_history_summary[:100]}...")
                    print(f"[VoiceSession:{self.session_id}] =======================================\n")
                    
                    if self._chat_history or self._chat_history_summary:
                        logger.info(
                            f"[{self.session_id}] Loaded history: {len(self._chat_history)} recent messages, "
                            f"{history_result['summarized_message_count']} summarized, "
                            f"{history_result['total_tokens']} tokens"
                        )
                except Exception as e:
                    print(f"[VoiceSession:{self.session_id}] ❌ Failed to fetch chat history: {e}")
                    logger.warning(f"[{self.session_id}] Failed to fetch chat history: {e}")
            
            # Get worker tools
            worker_tools = self._get_worker_tools()
            logger.info(f"[{self.session_id}] Worker tools to load: {worker_tools}")
            
            # Initialize tool bridge
            self._tool_bridge = ToolBridge(
                worker_tools=worker_tools,
                worker_id=self._get_primary_worker_id(),
                auth_token=self.config.auth_token,
                mcp_headers=self.config.mcp_headers,
            )
            
            logger.info(f"[{self.session_id}] ToolBridge created with auth_token={'YES' if self.config.auth_token else 'NO'}")
            
            await self._tool_bridge.initialize(db_session)
            
            if self._tool_bridge.has_tools():
                logger.info(f"[{self.session_id}] ToolBridge initialized with tools: {self._tool_bridge.get_tool_names()}")
            else:
                logger.warning(f"[{self.session_id}] ToolBridge has NO tools loaded")
            
            logger.info(f"[{self.session_id}] Initialized with {len(worker_tools)} tools, {len(self._knowledge_sources)} knowledge sources, {len(self._chat_history)} history messages")
            return True
            
        except Exception as e:
            logger.error(f"[{self.session_id}] Initialization failed: {e}")
            await self._set_state(VoiceSessionState.ERROR)
            if self.on_error:
                await self.on_error(str(e))
            return False
    
    def _get_worker_tools(self) -> List[str]:
        """Get combined tools from all workers."""
        if not self._presence_context:
            return []
        
        tools = set()
        for worker in self._presence_context["workers"]:
            for tool in worker.get("tools", []):
                tools.add(tool)
        
        return list(tools)
    
    def _get_primary_worker_id(self) -> Optional[str]:
        """Get the ID of the primary (first) worker."""
        if not self._presence_context:
            return None
        
        workers = self._presence_context["workers"]
        return workers[0]["id"] if workers else None
    
    def _build_system_instruction(self) -> str:
        """
        Build system instruction for Gemini from presence context, knowledge, and tools.
        Aligns with the chat flow to ensure consistent tool usage behavior.
        
        CRITICAL: Must include actual credential values (auth_token, worker_id) so
        Gemini knows to use them when calling tools. The chat flow does this via
        _build_worker_system_prompt in worker_executor.py.
        """
        if not self._presence_context:
            return "You are a helpful AI assistant."
        
        parts = []
        
        # Identity
        name = self._presence_context["presence_name"]
        parts.append(f"You are {name}.")
        
        # Description
        description = self._presence_context.get("presence_description")
        if description:
            parts.append(description)
        
        # Backstory
        backstory = self._presence_context.get("presence_backstory")
        if backstory:
            parts.append(f"Background: {backstory}")
        
        # Tone
        tone = self._presence_context.get("presence_tone", "neutral")
        tone_instructions = {
            "friendly": "Be warm, friendly, and approachable in your responses.",
            "professional": "Maintain a professional and formal tone.",
            "playful": "Be fun, playful, and use humor when appropriate.",
            "wise": "Be thoughtful and share insightful perspectives.",
            "cool": "Be relaxed and casual in your communication.",
        }
        if tone in tone_instructions:
            parts.append(tone_instructions[tone])
        
        # Custom system prompt
        custom_prompt = self._presence_context.get("presence_system_prompt")
        if custom_prompt:
            parts.append(custom_prompt)
        
        # Knowledge context from Pinecone
        if self._knowledge_context:
            parts.append("\n--- KNOWLEDGE BASE ---")
            parts.append("Use the following information to answer questions when relevant:")
            parts.append(self._knowledge_context)
            parts.append("--- END KNOWLEDGE BASE ---\n")
        
        # Previous conversation context for continuity
        if self._chat_history_summary or self._chat_history:
            parts.append("\n--- CONVERSATION CONTEXT ---")
            
            print(f"[VoiceSession:{self.session_id}] Building system instruction with conversation context:")
            
            # Include summary of older messages if present
            if self._chat_history_summary:
                parts.append("Summary of earlier conversation:")
                parts.append(self._chat_history_summary)
                parts.append("")
                print(f"[VoiceSession:{self.session_id}]    - Including summary: {len(self._chat_history_summary)} chars")
            
            # Include recent messages
            if self._chat_history:
                parts.append("Recent messages:")
                for msg in self._chat_history:
                    role = msg.get("role", "user")
                    content = msg.get("content", "")
                    # Truncate very long messages to save tokens
                    if len(content) > 300:
                        content = content[:300] + "..."
                    role_label = "User" if role == "user" else "You"
                    parts.append(f"{role_label}: {content}")
                print(f"[VoiceSession:{self.session_id}]    - Including {len(self._chat_history)} recent messages")
            
            parts.append("--- END CONVERSATION CONTEXT ---")
            parts.append("Use this context to maintain continuity, but don't explicitly reference it unless relevant.\n")
        
        # Get worker_id from first worker
        worker_id = self._get_primary_worker_id()
        
        # CRITICAL: Include actual credential values for tool calls
        # This mirrors the chat flow in worker_executor.py _build_worker_system_prompt
        if self._tool_bridge and self._tool_bridge.has_tools():
            tool_names = self._tool_bridge.get_tool_names()
            
            parts.append("\n=== TOOL EXECUTION CREDENTIALS ===")
            parts.append("When calling ANY tool, use these EXACT values for system parameters:")
            parts.append("")
            
            # Build credentials block with actual values
            if self.config.auth_token:
                parts.append(f"authorization: {self.config.auth_token}")
            if worker_id:
                parts.append(f"worker_id: {worker_id}")
            if self.config.presence_id:
                parts.append(f"presence_id: {self.config.presence_id}")
            if self.config.user_wallet:
                parts.append(f"wallet: {self.config.user_wallet}")
            if self.config.user_id:
                parts.append(f"user_id: {self.config.user_id}")
            
            parts.append("")
            parts.append("PARAMETER NAME MAPPING:")
            parts.append("- For 'authorization' parameter: use the authorization value above")
            parts.append("- For 'workerId' or 'worker_id' parameter: use the worker_id value above")
            parts.append("- For 'presenceId' or 'presence_id' parameter: use the presence_id value above")
            parts.append("- For 'wallet' parameter: use the wallet value above")
            parts.append("=== END CREDENTIALS ===\n")
            
            parts.append("\n--- AVAILABLE TOOLS ---")
            parts.append(f"You have access to the following tools: {', '.join(tool_names)}")
            parts.append("")
            parts.append("TOOL USAGE RULES:")
            parts.append("1. You are authorized to use these tools on behalf of the user")
            parts.append("2. ALWAYS use the credential values from TOOL EXECUTION CREDENTIALS above")
            parts.append("3. NEVER ask the user for authorization, worker_id, or presence_id")
            parts.append("4. If a tool needs content (text, message, etc.), ask the user for it")
            parts.append("5. When you have the content, call the tool with credentials + content")
            parts.append("")
            parts.append("EXAMPLE - User says 'post to Bluesky saying hello world':")
            parts.append("→ Call the tool with:")
            parts.append(f"  - authorization: {self.config.auth_token or '[auth_token]'}")
            parts.append(f"  - workerId: {worker_id or '[worker_id]'}")
            parts.append("  - text: 'hello world'")
            parts.append("--- END AVAILABLE TOOLS ---\n")
        
        # Voice-specific instructions
        parts.append("\n--- VOICE CONVERSATION GUIDELINES ---")
        parts.append("You are in a real-time voice conversation. Follow these guidelines:")
        parts.append("- Keep responses concise and conversational (2-3 sentences typically)")
        parts.append("- Speak naturally as if having a real-time conversation")
        parts.append("- Avoid long lists or complex formatting that doesn't translate well to speech")
        parts.append("- When using tools, briefly explain what you're doing")
        parts.append("- For actions needing user content, ask: 'What would you like me to post/send?'")
        parts.append("- After completing an action, confirm success briefly")
        
        return "\n\n".join(parts)
    
    async def start(self) -> bool:
        """
        Start the voice session by connecting to Gemini Live.
        
        Returns:
            True if started successfully
        """
        if self._state != VoiceSessionState.INITIALIZING:
            logger.warning(f"[{self.session_id}] Cannot start: state is {self._state}")
            return False
        
        await self._set_state(VoiceSessionState.CONNECTING)
        
        try:
            # Debug: Log auth and context info
            logger.info(f"[{self.session_id}] Starting voice session:")
            logger.info(f"[{self.session_id}]   - Presence ID: {self.config.presence_id}")
            logger.info(f"[{self.session_id}]   - User ID: {self.config.user_id}")
            logger.info(f"[{self.session_id}]   - Auth token: {'YES' if self.config.auth_token else 'NO'}")
            logger.info(f"[{self.session_id}]   - MCP headers: {list(self.config.mcp_headers.keys()) if self.config.mcp_headers else 'None'}")
            
            # Build Gemini config
            system_instruction = self._build_system_instruction()
            logger.info(f"[{self.session_id}] System instruction length: {len(system_instruction)}")
            
            # Debug: Log first part of system instruction
            logger.debug(f"[{self.session_id}] System instruction preview: {system_instruction[:500]}...")
            
            # Get tool declarations
            tools_config = []
            if self._tool_bridge and self._tool_bridge.has_tools():
                declarations = self._tool_bridge.get_function_declarations()
                tools_config = build_gemini_tools_config(declarations)
                tool_names = self._tool_bridge.get_tool_names()
                logger.info(f"[{self.session_id}] Tool declarations: {len(declarations)} tools: {tool_names}")
            else:
                logger.warning(f"[{self.session_id}] No tools available for this session")
            
            gemini_config = GeminiLiveConfig(
                system_instruction=system_instruction,
                tools=tools_config,
                voice_name=self.config.voice_name,
            )
            
            # Create Gemini client with all callbacks including on_interrupted
            self._gemini_client = GeminiLiveClient(
                config=gemini_config,
                on_audio=self._handle_gemini_audio,
                on_transcript=self._handle_gemini_transcript,
                on_function_call=self._handle_gemini_function_call,
                on_error=self._handle_gemini_error,
                on_state_change=self._handle_gemini_state_change,
                on_interrupted=self._handle_gemini_interrupted,
            )
            
            # Connect to Gemini
            success = await self._gemini_client.connect()
            
            if success:
                self._stats.started_at = datetime.utcnow()
                await self._set_state(VoiceSessionState.READY)
                self._start_timeout_tasks()
                logger.info(f"[{self.session_id}] Voice session started successfully")
                return True
            else:
                logger.error(f"[{self.session_id}] Gemini connection failed")
                await self._set_state(VoiceSessionState.ERROR)
                if self.on_error:
                    await self.on_error("Failed to connect to Gemini Live")
                return False
            
        except Exception as e:
            logger.error(f"[{self.session_id}] Failed to start: {e}")
            await self._set_state(VoiceSessionState.ERROR)
            if self.on_error:
                await self.on_error(str(e))
            return False
    
    def _start_timeout_tasks(self):
        """Start session timeout monitoring tasks."""
        self._session_timeout_task = asyncio.create_task(
            self._session_timeout_monitor()
        )
        self._idle_timeout_task = asyncio.create_task(
            self._idle_timeout_monitor()
        )
    
    async def _session_timeout_monitor(self):
        """Monitor session duration and end if exceeded."""
        try:
            await asyncio.sleep(self.config.max_duration_seconds)
            logger.info(f"[{self.session_id}] Session timeout reached")
            await self.end(reason="timeout")
        except asyncio.CancelledError:
            pass
    
    async def _idle_timeout_monitor(self):
        """Monitor for idle and end if no activity."""
        try:
            while True:
                await asyncio.sleep(5)
                idle_seconds = (datetime.utcnow() - self._last_activity).total_seconds()
                if idle_seconds > self.config.idle_timeout_seconds:
                    logger.info(f"[{self.session_id}] Idle timeout reached")
                    await self.end(reason="idle")
                    break
        except asyncio.CancelledError:
            pass
    
    def _update_activity(self):
        """Update last activity timestamp."""
        self._last_activity = datetime.utcnow()
    
    async def send_audio(self, audio_data: bytes, sample_rate: int = 16000) -> bool:
        """
        Send audio data to Gemini.
        
        Note: Gemini Live API handles barge-in (interruption) automatically.
        When user speaks while AI is responding, Gemini will:
        1. Detect user speech via built-in VAD
        2. Stop generating the current response
        3. Send an "interrupted" event
        4. Process the new user input
        
        The frontend must clear its audio buffer when receiving the
        "interrupted" event to stop playing the old response.
        
        Args:
            audio_data: Raw PCM audio bytes
            sample_rate: Audio sample rate (default 16kHz)
            
        Returns:
            True if sent successfully
        """
        if not self.is_active or not self._gemini_client:
            return False
        
        self._update_activity()
        
        # Update state to active if in ready
        if self._state == VoiceSessionState.READY:
            await self._set_state(VoiceSessionState.ACTIVE)
        
        chunk = AudioChunk(data=audio_data, sample_rate=sample_rate)
        success = await self._gemini_client.send_audio(chunk)
        
        if success:
            self._stats.audio_chunks_sent += 1
            self._stats.audio_bytes_sent += len(audio_data)
        
        return success
    
    async def send_text(self, text: str) -> bool:
        """
        Send text input during voice session.
        
        Args:
            text: Text to inject
            
        Returns:
            True if sent successfully
        """
        if not self.is_active or not self._gemini_client:
            return False
        
        self._update_activity()
        return await self._gemini_client.send_text(text)
    
    async def end(self, reason: str = "user_requested"):
        """
        End the voice session.
        
        Args:
            reason: Reason for ending (user_requested, timeout, idle, error)
        """
        if self._state in [VoiceSessionState.ENDING, VoiceSessionState.ENDED]:
            return
        
        await self._set_state(VoiceSessionState.ENDING)
        logger.info(f"[{self.session_id}] Ending session: {reason}")
        
        # Cancel timeout tasks
        if self._session_timeout_task:
            self._session_timeout_task.cancel()
        if self._idle_timeout_task:
            self._idle_timeout_task.cancel()
        
        # Disconnect from Gemini
        if self._gemini_client:
            await self._gemini_client.disconnect()
        
        self._stats.ended_at = datetime.utcnow()
        await self._set_state(VoiceSessionState.ENDED)
        
        logger.info(
            f"[{self.session_id}] Session ended. Stats: "
            f"sent={self._stats.audio_chunks_sent}, "
            f"received={self._stats.audio_chunks_received}, "
            f"tools={self._stats.tool_calls_made}, "
            f"interruptions={self._stats.interruptions}"
        )
    
    # ─────────────────────────────────────────────────────────────────────────
    # Gemini Event Handlers
    # ─────────────────────────────────────────────────────────────────────────
    
    async def _handle_gemini_audio(self, audio_data: bytes):
        """Handle audio output from Gemini."""
        self._stats.audio_chunks_received += 1
        self._stats.audio_bytes_received += len(audio_data)
        
        # Update state to AI speaking
        if self._state == VoiceSessionState.ACTIVE:
            await self._set_state(VoiceSessionState.AI_SPEAKING)
        
        if self.on_audio:
            await self.on_audio(audio_data)
    
    async def _handle_gemini_transcript(self, text: str, is_final: bool):
        """Handle transcription from Gemini."""
        self._update_activity()
        
        # Return to active state when turn complete
        if is_final and self._state == VoiceSessionState.AI_SPEAKING:
            await self._set_state(VoiceSessionState.ACTIVE)
        
        if self.on_transcript:
            await self.on_transcript(text, is_final)
    
    async def _handle_gemini_function_call(self, name: str, args: Dict[str, Any]) -> Any:
        """Handle function call from Gemini."""
        self._update_activity()
        self._stats.tool_calls_made += 1
        
        logger.info(f"[{self.session_id}] Tool call: {name}")
        
        # Notify callback
        if self.on_tool_call:
            await self.on_tool_call(name, args)
        
        # Execute via tool bridge
        if self._tool_bridge:
            result = await self._tool_bridge.execute_function(name, args)
            
            if result.get("success"):
                self._stats.tool_calls_succeeded += 1
            else:
                self._stats.tool_calls_failed += 1
            
            # Notify callback
            if self.on_tool_result:
                await self.on_tool_result(name, result)
            
            return result
        
        return {"error": "No tool bridge available"}
    
    async def _handle_gemini_error(self, error: str):
        """Handle error from Gemini."""
        logger.error(f"[{self.session_id}] Gemini error: {error}")
        
        if self.on_error:
            await self.on_error(error)
    
    async def _handle_gemini_interrupted(self):
        """
        Handle interruption event from Gemini (barge-in).
        
        This is called when Gemini detects user speech while generating
        a response. Gemini automatically stops generation - we just need
        to notify the frontend to clear its audio buffer.
        """
        logger.info(f"[{self.session_id}] AI interrupted by user (barge-in)")
        self._stats.interruptions += 1
        
        # Update state back to ACTIVE (user is now speaking)
        if self._state == VoiceSessionState.AI_SPEAKING:
            await self._set_state(VoiceSessionState.ACTIVE)
        
        # Notify frontend to clear audio buffer
        if self.on_interrupted:
            await self.on_interrupted()
    
    async def _handle_gemini_state_change(self, state: GeminiLiveState):
        """Handle Gemini client state change."""
        logger.debug(f"[{self.session_id}] Gemini state: {state}")
        
        if state == GeminiLiveState.ERROR:
            await self._set_state(VoiceSessionState.ERROR)
        elif state == GeminiLiveState.DISCONNECTED and self._state not in [VoiceSessionState.ENDING, VoiceSessionState.ENDED]:
            await self.end(reason="gemini_disconnected")