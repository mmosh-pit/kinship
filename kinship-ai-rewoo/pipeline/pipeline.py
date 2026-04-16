import asyncio
import struct
import base64
import json
from typing import Any, Dict
from datetime import datetime
from enum import Enum
from loguru import logger
from fastapi import WebSocket, WebSocketException


from pipeline.protocols import STT, TTS, Agent
from pipeline.typing import AudioChunk, PipelineConfig
from pipeline.vad import VADProcessor


class ResponseEventType(str, Enum):
    TRANSCRIPTION_START = "user.transcript.start"
    TRANSCRIPTION_TEXT = "user.transcript.text"
    TRANSCRIPTION_TEXT_DELTA = "user.transcript.text.delta"
    TRANSCRIPTION_END = "user.transcript.end"
    AI_RESPONSE_TEXT_START = "ai.response.text.start"
    AI_RESPONSE_TEXT_DELTA = "ai.response.text.delta"
    AI_RESPONSE_TEXT_END = "ai.response.text.end"
    AI_RESPONSE_SPEECH_START = "ai.response.speech.start"
    AI_RESPONSE_SPEECH_DELTA = "ai.response.speech.delta"
    AI_RESPONSE_SPEECH_END = "ai.response.speech.end"


class VoicePipeline:
    """
    VoicePipeline manages the end-to-end processing of audio data
    from a WebSocket connection, including speech-to-text (STT),
    text-to-speech (TTS), and language model (LLM) interactions.

    Args:
        websocket (WebSocket): The websocket connection.
        config (PipelineConfig): The pipeline-specific configuration.
        stt (STT): The speech-to-text model.
        tts (TTS): The text-to-speech model.
        agent (Agent): The agent to manage interactions.
    """

    _MAX_QUEUE_SIZE = 20

    def __init__(
        self,
        *,
        websocket: WebSocket,
        config: PipelineConfig,
        stt: STT,
        tts: TTS,
        agent: Agent,
        session_token: str,
        agent_id: str,
        bot_id: str,
        user_id: str,
        wallet=str,
        aiModel: str,
    ):
        self.websocket = websocket
        self.config = config
        self.stt = stt
        self.tts = tts
        self.agent = agent
        self.session_token = session_token
        self.system_prompt = "Please respond in a concise way and be helpful"
        self.agent_id = agent_id
        self.bot_id = bot_id
        self.user_id = user_id
        self.wallet = wallet
        self.aiModel = aiModel

        # Creating queue for holding data
        self.incoming_queue = asyncio.Queue(maxsize=self._MAX_QUEUE_SIZE)
        self.processed_audio_queue = asyncio.Queue(maxsize=self._MAX_QUEUE_SIZE)
        self.transcription_queue = asyncio.Queue(maxsize=self._MAX_QUEUE_SIZE)
        self.response_queue = asyncio.Queue(maxsize=self._MAX_QUEUE_SIZE)

        # Audio Processor that process Audio and detect speech
        self.vad_processor = VADProcessor(
            original_audio_sample_rate=self.config.received_audio_sample_rate,
            audio_sample_rate=self.config.audio_sample_rate,
            max_continuous_speech_s=self.config.max_continuous_speech_s,
            min_continuous_speech_s=self.config.min_continuous_speech_s,
            min_silence_duration_ms=self.config.min_silence_duration_ms,
            speech_pad_samples_ms=self.config.speech_pad_samples_ms,
        )

        # Tasks and state management
        self.tasks = []
        self.shutdown_event = asyncio.Event()
        self.is_running = False

        # TTS cancellation flag
        self.tts_cancelled = asyncio.Event()

        # Add heartbeat/keepalive mechanism
        self.last_activity = datetime.now()
        self.keepalive_interval = 30  # Send keepalive every 30 seconds

    async def start(self):
        """Start the voice processing pipeline"""
        logger.info("Starting Voice Processing Pipeline")
        self.is_running = True

        try:
            self.tasks = [
                asyncio.create_task(self.process_incoming_data(), name="incoming_data"),
                asyncio.create_task(
                    self.process_audio_chunk(), name="audio_processing"
                ),
                asyncio.create_task(
                    self.transcribe_audio_chunk(), name="transcription"
                ),
                asyncio.create_task(
                    self.generate_agent_response(), name="generate_agent_response"
                ),
                asyncio.create_task(
                    self.send_json_response(), name="send_json_response"
                ),
                asyncio.create_task(self.keepalive_handler(), name="keepalive"),
            ]

            # For testing: Start conversation with a prompt
            self._add_queue_no_wait(
                self.transcription_queue,
                AudioChunk(
                    flag=0,
                    timestamp=datetime.now().timestamp(),
                    audio=b"",
                    transcript="",
                ),
            )

            # Wait for shutdown signal only - don't stop on task completion
            await self.shutdown_event.wait()
            logger.info("🛑 Shutdown signal received")

        except Exception as e:
            logger.exception(f"🖥️ 💥 Error in Audio Processing Pipeline: {repr(e)}")
        finally:
            await self._cleanup()

    async def keepalive_handler(self):
        """Send periodic keepalive messages to prevent connection timeout"""
        try:
            logger.debug("keepalive_handler task started")
            while not self.shutdown_event.is_set():
                await asyncio.sleep(self.keepalive_interval)

                # Check if we should send a keepalive
                time_since_activity = (
                    datetime.now() - self.last_activity
                ).total_seconds()

                if time_since_activity >= self.keepalive_interval:
                    try:
                        # Send a ping to keep connection alive
                        await self.websocket.send_json(
                            {
                                "type": "keepalive",
                                "timestamp": datetime.now().timestamp(),
                            }
                        )
                        logger.debug("Keepalive sent")
                    except Exception as e:
                        logger.warning(f"Failed to send keepalive: {e}")
                        # Connection might be dead, trigger shutdown
                        await self.stop()
                        break

        except asyncio.CancelledError:
            logger.debug("keepalive_handler task cancelled")
            raise
        except Exception as e:
            logger.exception(f"Exception at keepalive_handler: {repr(e)}")

    async def stop(self):
        """Gracefully stop the pipeline"""
        if self.shutdown_event.is_set():
            return  # Already stopping
        logger.info("Stopping pipeline...")
        self.shutdown_event.set()

    async def _cleanup(self):
        """Clean up resources and cancel tasks"""
        logger.info("🧹 Cleaning up pipeline resources...")
        self.is_running = False

        # Cancel all running tasks
        for task in self.tasks:
            if not task.done():
                task.cancel()
                logger.debug(f"Cancelled task: {getattr(task, '_name', 'unknown')}")

        # Wait for tasks to complete cancellation with timeout
        if self.tasks:
            try:
                await asyncio.wait_for(
                    asyncio.gather(*self.tasks, return_exceptions=True), timeout=5.0
                )
            except asyncio.TimeoutError:
                logger.warning("Task cancellation timed out")

        # Clear queues and extract items for cleanup
        await self._clear_queues()

        # Clear VAD processor audio buffer
        if hasattr(self, "vad_processor") and self.vad_processor:
            self.vad_processor.clear_buffer()
            logger.debug("VAD audio buffer cleared")

        # Force garbage collection of audio data
        self.incoming_queue = None
        self.processed_audio_queue = None
        self.transcription_queue = None
        self.response_queue = None

        # Clear references to models to free memory
        self.stt = None
        self.tts = None
        self.agent = None
        self.vad_processor = None

        # Force Python garbage collection
        import gc

        gc.collect()

        logger.info("✅ Pipeline cleanup completed")

    async def _clear_queues(self):
        """Clear all queues to free memory"""
        queues = [
            ("incoming_queue", self.incoming_queue),
            ("processed_audio_queue", self.processed_audio_queue),
            ("transcription_queue", self.transcription_queue),
            ("response_queue", self.response_queue),
        ]

        for queue_name, queue in queues:
            if queue is None:
                continue

            count = 0
            while not queue.empty():
                try:
                    item = queue.get_nowait()
                    # Explicitly clear audio data if it's an AudioChunk
                    if hasattr(item, "audio"):
                        item.audio = b""
                    # Clear the item reference
                    del item
                    count += 1
                except asyncio.QueueEmpty:
                    break

            if count > 0:
                logger.debug(f"Cleared {count} items from {queue_name}")

    def _add_queue_no_wait(self, queue: asyncio.Queue, item: Any):
        """Add item to queue without waiting. If the queue is full, log a warning."""
        if queue is None:
            logger.warning("Attempted to add to None queue")
            return

        try:
            queue.put_nowait(item)
        except asyncio.QueueFull:
            logger.warning("Queue is full, dropping audio chunk")

    def _create_event_message(
        self,
        type: str,
        content: str = None,
        timestamp: float = None,
    ) -> Dict[str, Any]:
        """
        Create a structured event message.

        Args:
            type (str): The type of the event.
            content (str, optional): The content of the event. Defaults to None.
            timestamp (float, optional): The timestamp of the event. If not provided, current time is used.
        """
        message = {
            "type": type,
            "timestamp": timestamp if timestamp else datetime.now().timestamp(),
        }

        if content:
            message["content"] = content

        return message

    def _add_event_message(
        self,
        event_type: ResponseEventType,
        content: str = None,
        timestamp: float = None,
    ):
        """Add an event message to the response queue."""
        message = self._create_event_message(event_type.value, content, timestamp)
        self._add_queue_no_wait(self.response_queue, message)

    def _handle_control_message(self, message: dict) -> bool:
        """
        Handle control messages from the client.

        Args:
            message: The parsed JSON message

        Returns:
            bool: True if message was handled, False otherwise
        """
        msg_type = message.get("type")

        if msg_type == "set_voice":
            # Change TTS voice
            voice = message.get("voice")
            if voice and hasattr(self.tts, "set_voice"):
                try:
                    self.tts.set_voice(voice)
                    logger.info(f"🔊 Voice changed to: {voice}")
                    # Send confirmation to client
                    self._add_queue_no_wait(
                        self.response_queue, {"type": "voice_changed", "voice": voice}
                    )
                except ValueError as e:
                    logger.warning(f"Invalid voice: {e}")
                    self._add_queue_no_wait(
                        self.response_queue, {"type": "error", "message": str(e)}
                    )
            return True

        elif msg_type == "set_instructions":
            # Change TTS instructions/style
            instructions = message.get("instructions")
            if instructions and hasattr(self.tts, "set_instructions"):
                self.tts.set_instructions(instructions)
                logger.info(f"🎭 TTS instructions changed")
                self._add_queue_no_wait(
                    self.response_queue, {"type": "instructions_changed"}
                )
            return True

        elif msg_type == "get_voices":
            # Return available voices
            if hasattr(self.tts, "list_voices"):
                voices = self.tts.list_voices()
            elif hasattr(self.tts, "AVAILABLE_VOICES"):
                voices = self.tts.AVAILABLE_VOICES
            else:
                voices = []

            current_voice = getattr(self.tts, "voice", None)
            self._add_queue_no_wait(
                self.response_queue,
                {
                    "type": "available_voices",
                    "voices": voices,
                    "current": current_voice,
                },
            )
            return True

        elif msg_type == "tts_cancel":
            # Cancel ongoing TTS
            self.tts_cancelled.set()
            logger.info("TTS cancelled by client")
            return True

        elif msg_type == "tts_start":
            # Client started playing TTS
            logger.debug("Client TTS playback started")
            return True

        elif msg_type == "tts_stop":
            # Client stopped playing TTS
            logger.debug("Client TTS playback stopped")
            return True

        elif msg_type == "system_prompt":
            content = message.get("content")
            if content is not None:
                self.system_prompt = content
            return True

        elif msg_type == "ping":
            # Respond to client ping
            self._add_queue_no_wait(
                self.response_queue,
                {"type": "pong", "timestamp": datetime.now().timestamp()},
            )
            return True

        elif msg_type == "disconnect":
            logger.info("Client requested disconnect")
            asyncio.create_task(self.stop())
            return True

        return False

    async def process_incoming_data(self):
        """
        This task will run in the background and will consume
        data from the websocket and process it.
        """
        try:
            logger.debug("process_incoming_data task started")
            while not self.shutdown_event.is_set():
                try:
                    # Add timeout to prevent hanging
                    message = await asyncio.wait_for(
                        self.websocket.receive(), timeout=60.0  # 60 second timeout
                    )

                    # Update last activity
                    self.last_activity = datetime.now()

                    if message.get("type") == "websocket.disconnect":
                        logger.info("WebSocket disconnect message received")
                        await self.stop()
                        break

                    # Handle text messages (JSON control messages)
                    if "text" in message:
                        try:
                            data = json.loads(message["text"])
                            if self._handle_control_message(data):
                                continue
                        except json.JSONDecodeError:
                            logger.warning(f"Invalid JSON received: {message['text']}")
                        continue

                    # Handle binary messages (audio data)
                    if "bytes" not in message:
                        continue

                    raw_bytes = message["bytes"]

                    # Process as audio data
                    if len(raw_bytes) > self.config.header_bytes:
                        # Extracting header bytes
                        header = raw_bytes[: self.config.header_bytes]
                        flag = struct.unpack(">H", header[:2])[0]
                        timestamp_ms = struct.unpack(">Q", header[2:10])[0]
                        pcm = raw_bytes[10:]

                        dt = datetime.fromtimestamp(timestamp_ms // 1_000)
                        ts = dt.timestamp()

                        # Create a audio chunk to hold the data
                        audio_chunk = AudioChunk(flag=flag, timestamp=ts, audio=pcm)
                        self._add_queue_no_wait(self.incoming_queue, audio_chunk)

                except asyncio.TimeoutError:
                    logger.warning(
                        "WebSocket receive timeout - connection may be stale"
                    )
                    # Don't break - just continue, keepalive will handle it
                    continue

                except RuntimeError as e:
                    # Handle "Cannot call receive once disconnect message received"
                    if "disconnect" in str(e).lower():
                        logger.info("WebSocket already disconnected")
                        await self.stop()
                        break
                    raise

        except asyncio.CancelledError:
            logger.debug("process_incoming_data task cancelled")
            raise
        except WebSocketException as e:
            logger.exception(f"Websocket Exception at process_incoming_data: {repr(e)}")
            # Don't call stop() here - let the handler in app.py manage it
        except Exception as e:
            logger.exception(f"Exception at process_incoming_data: {repr(e)}")
            # Don't call stop() here - let the handler in app.py manage it

    async def process_audio_chunk(self):
        try:
            logger.debug("process_audio_chunk task started")
            while not self.shutdown_event.is_set():
                try:
                    audio_chunk: AudioChunk = await asyncio.wait_for(
                        self.incoming_queue.get(), timeout=1.0
                    )
                except asyncio.TimeoutError:
                    continue

                processed_audio_chunk = await self.vad_processor.process_audio_chunk(
                    audio_chunk
                )

                if processed_audio_chunk:
                    self._add_queue_no_wait(
                        self.processed_audio_queue, processed_audio_chunk
                    )

                # Clear the original chunk to free memory
                del audio_chunk

        except asyncio.CancelledError:
            logger.debug("process_audio_chunk task cancelled")
            raise
        except Exception as e:
            logger.exception(f"Exception at process_audio_chunk: {repr(e)}")

    async def transcribe_audio_chunk(self):
        try:
            logger.debug("transcribe_audio_chunk task started")
            while not self.shutdown_event.is_set():
                try:
                    audio_chunk: AudioChunk = await asyncio.wait_for(
                        self.processed_audio_queue.get(), timeout=1.0
                    )
                except asyncio.TimeoutError:
                    continue

                audio_int16 = audio_chunk.audio
                logger.debug(
                    f"Transcribing ({len(audio_int16) * 2}) bytes of detected speech"
                )

                """
                Stream transcription results and send deltas to client
                """
                transcript = ""
                self._add_event_message(
                    ResponseEventType.TRANSCRIPTION_START,
                    timestamp=audio_chunk.timestamp,
                )

                try:
                    async for chunk in self.stt.stt_stream(
                        audio_int16, config=self.config
                    ):
                        self._add_event_message(
                            ResponseEventType.TRANSCRIPTION_TEXT_DELTA, chunk
                        )
                        transcript += chunk
                except Exception as e:
                    logger.error(f"STT error: {e}")
                    # Continue processing even if STT fails
                    transcript = ""

                self._add_event_message(ResponseEventType.TRANSCRIPTION_END)

                # Clear audio to free memory and add transcript
                audio_chunk.audio = b""
                audio_chunk.transcript = transcript
                self._add_queue_no_wait(self.transcription_queue, audio_chunk)

        except asyncio.CancelledError:
            logger.debug("transcribe_audio_chunk task cancelled")
            raise
        except Exception as e:
            logger.exception(f"Exception at transcribe_audio_chunk: {repr(e)}")

    async def generate_agent_response(self):
        """
        This task will run in the background and will consume
        data from the queue, and process it.
        """
        try:
            logger.debug("send_llm_response task started")
            while not self.shutdown_event.is_set():
                try:
                    audio_chunk: AudioChunk = await asyncio.wait_for(
                        self.transcription_queue.get(), timeout=1.0
                    )
                except asyncio.TimeoutError:
                    continue

                # Reset TTS cancelled flag for new response
                self.tts_cancelled.clear()

                transcript = audio_chunk.transcript
                logger.info(f"Processing transcript: {transcript}")

                # Send full transcription text to client
                self._add_event_message(
                    ResponseEventType.TRANSCRIPTION_TEXT,
                    transcript,
                    audio_chunk.timestamp,
                )

                # Clear the audio chunk after extracting transcript
                del audio_chunk

                text_buffer = ""
                sentence_endings = {".", "!", "?", "\n"}
                first_response_chunk = True
                first_speech_chunk = True

                if transcript == "":
                    continue

                try:
                    async for chunk in self.agent.generate_stream(
                        transcript,
                        session_token=self.session_token,
                        system_prompt=self.system_prompt,
                        agent_id=self.agent_id,
                        bot_id=self.bot_id,
                        user_id=self.user_id,
                        wallet=self.wallet,
                        aiModel=self.aiModel,
                    ):
                        if self.tts_cancelled.is_set():
                            logger.info("TTS generation cancelled, stopping response")
                            break

                        text_buffer += chunk

                        if first_response_chunk:
                            self._add_event_message(
                                ResponseEventType.AI_RESPONSE_TEXT_START
                            )
                            first_response_chunk = False

                        if any(ending in text_buffer for ending in sentence_endings):
                            last_ending_idx = max(
                                text_buffer.rfind(ending)
                                for ending in sentence_endings
                                if ending in text_buffer
                            )

                            complete_text = text_buffer[: last_ending_idx + 1]
                            text_buffer = text_buffer[last_ending_idx + 1 :]

                            if complete_text:
                                if first_speech_chunk:
                                    self._add_event_message(
                                        ResponseEventType.AI_RESPONSE_SPEECH_START
                                    )
                                    first_speech_chunk = False

                                self._add_event_message(
                                    ResponseEventType.AI_RESPONSE_TEXT_DELTA,
                                    complete_text,
                                )

                                try:
                                    async for tts_chunk in self.tts.tts_stream(
                                        complete_text
                                    ):
                                        if self.tts_cancelled.is_set():
                                            logger.info("TTS streaming cancelled")
                                            break

                                        array_bytes = tts_chunk.tobytes()
                                        base64_string = base64.b64encode(
                                            array_bytes
                                        ).decode("utf-8")

                                        self._add_event_message(
                                            ResponseEventType.AI_RESPONSE_SPEECH_DELTA,
                                            base64_string,
                                        )
                                except Exception as e:
                                    logger.error(f"TTS error: {e}")
                                    # Continue even if TTS fails

                    if text_buffer.strip() and not self.tts_cancelled.is_set():
                        self._add_event_message(
                            ResponseEventType.AI_RESPONSE_TEXT_DELTA, text_buffer
                        )
                        try:
                            async for tts_chunk in self.tts.tts_stream(text_buffer):
                                if self.tts_cancelled.is_set():
                                    logger.info("TTS streaming cancelled")
                                    break

                                array_bytes = tts_chunk.tobytes()
                                base64_string = base64.b64encode(array_bytes).decode(
                                    "utf-8"
                                )

                                self._add_event_message(
                                    ResponseEventType.AI_RESPONSE_SPEECH_DELTA,
                                    base64_string,
                                )
                        except Exception as e:
                            logger.error(f"TTS error: {e}")

                except Exception as e:
                    logger.error(f"Agent generation error: {e}")
                    # Send error to client but continue processing
                    self._add_queue_no_wait(
                        self.response_queue,
                        {"type": "error", "message": "Failed to generate response"},
                    )

                self._add_event_message(ResponseEventType.AI_RESPONSE_TEXT_END)
                self._add_event_message(ResponseEventType.AI_RESPONSE_SPEECH_END)

        except asyncio.CancelledError:
            logger.info("send_llm_response task cancelled")
            raise
        except Exception as e:
            logger.exception(f"💥 Exception at send_llm_response: {repr(e)}")

    async def send_json_response(self):
        """
        This task will run in the background and will consume
        data (final response) from the queue, and send to the client.
        """
        try:
            logger.debug("send_json_response task started")
            while not self.shutdown_event.is_set():
                try:
                    response = await asyncio.wait_for(
                        self.response_queue.get(), timeout=1.0
                    )
                except asyncio.TimeoutError:
                    continue

                try:
                    await self.websocket.send_json(response)
                    # Update last activity on successful send
                    self.last_activity = datetime.now()
                except Exception as e:
                    logger.error(f"Failed to send response: {e}")
                    # Connection might be broken
                    await self.stop()
                    break

        except asyncio.CancelledError:
            logger.info("send_json_response task cancelled")
            raise
        except Exception as e:
            logger.exception(f"Exception at send_json_response: {repr(e)}")
