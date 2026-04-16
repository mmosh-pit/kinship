from typing import AsyncGenerator, Literal

from config import OPENAI_API_KEY
import numpy as np
from numpy.typing import NDArray
from pipeline import settings
from pipeline.protocols import TTS


# Available OpenAI TTS voices
OpenAIVoice = Literal["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"]


class OpenAITTS(TTS):
    """OpenAI Text-to-Speech

    Args:
        voice (str): The voice to use for TTS.
        model (str): The model to use for TTS.
        instructions (str): The instructions for the TTS.

    Raises:
        ImportError: If openai SDK is not installed.

    Example:
        ```
        tts = OpenAITTS()
        audio = await tts.tts("Hello, world!")

        audio_chunks = []
        async for chunk in tts.tts_stream("Hello, world!"):
            audio_chunks.append(chunk)

        audio = np.concatenate(audio_chunks)
        
        # Switch voice
        tts.set_voice("nova")
        ```
    """

    AVAILABLE_VOICES: list[str] = [
        "alloy", "ash", "ballad", "coral", "echo", 
        "fable", "onyx", "nova", "sage", "shimmer"
    ]

    def __init__(
        self, 
        voice: OpenAIVoice = "nova", 
        model: str = "gpt-4o-mini-tts",
        instructions: str = "Speak in a calm, professional tone."
    ):
        """Initialize the TTS client."""
        self.voice = voice
        self.model = model
        self.instructions = instructions
        self.client = self._init_client()

    def _init_client(self):
        try:
            # Try to import openai sdk
            from openai import AsyncClient
        except Exception:
            raise ImportError("openai is not installed, install it.")

        # Create OpenAI AsyncClient
        return AsyncClient(api_key=OPENAI_API_KEY)

    def set_voice(self, voice: OpenAIVoice) -> None:
        """Change the TTS voice.
        
        Args:
            voice: One of: alloy, ash, ballad, coral, echo, fable, onyx, nova, sage, shimmer
        """
        if voice not in self.AVAILABLE_VOICES:
            raise ValueError(
                f"Invalid voice '{voice}'. Available voices: {', '.join(self.AVAILABLE_VOICES)}"
            )
        self.voice = voice

    def set_instructions(self, instructions: str) -> None:
        """Change the TTS instructions/style.
        
        Args:
            instructions: Instructions for how the TTS should speak.
                         e.g., "Speak in a calm and soothing tone."
        """
        self.instructions = instructions

    def get_voice(self) -> str:
        """Get the current voice."""
        return self.voice

    @classmethod
    def list_voices(cls) -> list[str]:
        """List all available voices."""
        return cls.AVAILABLE_VOICES.copy()

    async def tts(self, text: str) -> NDArray[np.int16]:
        """Convert text to speech."""
        response = await self.client.audio.speech.create(
            model=self.model,
            voice=self.voice,
            input=text,
            instructions=self.instructions,
            response_format="pcm",
        )

        audio_int16 = np.frombuffer(response.content, dtype=np.int16)
        return audio_int16

    async def tts_stream(self, text: str) -> AsyncGenerator[NDArray[np.int16], None]:
        """Stream text to speech."""
        buffer = b""
        async with self.client.audio.speech.with_streaming_response.create(
            model=self.model,
            voice=self.voice,
            input=text,
            instructions=self.instructions,
            response_format="pcm",
        ) as response:
            async for chunk in response.iter_bytes():
                buffer += chunk
                # Process complete int16 samples (2 bytes each)
                while len(buffer) >= 2:
                    # Calculate how many complete samples we can process
                    complete_samples = len(buffer) // 2
                    bytes_to_process = complete_samples * 2

                    # Extract complete samples
                    complete_data = buffer[:bytes_to_process]
                    buffer = buffer[bytes_to_process:]

                    if complete_data:
                        yield np.frombuffer(complete_data, dtype=np.int16)

            # Handle any remaining data (shouldn't happen with proper PCM, but just in case)
            if buffer:
                # Pad with zero if odd number of bytes
                if len(buffer) % 2 == 1:
                    buffer += b"\x00"
                yield np.frombuffer(buffer, dtype=np.int16)