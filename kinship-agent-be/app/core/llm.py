"""
Kinship Agent - LLM Provider

Provides a unified interface for LLM interactions using LangChain.
Supports OpenAI (ChatGPT), Anthropic (Claude), and Google (Gemini) models.
Allows dynamic provider switching via API parameters.
"""

from typing import Optional, List, Dict, Any, Literal
from enum import Enum

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import (
    BaseMessage,
    HumanMessage,
    AIMessage,
    SystemMessage,
)
from langchain_core.callbacks import AsyncCallbackHandler

from app.core.config import settings


# ─────────────────────────────────────────────────────────────────────────────
# LLM Provider Enum
# ─────────────────────────────────────────────────────────────────────────────


class LLMProvider(str, Enum):
    """Supported LLM providers."""
    
    OPENAI = "openai"      # ChatGPT
    ANTHROPIC = "anthropic" # Claude
    GEMINI = "gemini"       # Google Gemini
    
    @classmethod
    def from_string(cls, value: str) -> "LLMProvider":
        """Convert string to LLMProvider, with aliases."""
        aliases = {
            "chatgpt": cls.OPENAI,
            "gpt": cls.OPENAI,
            "gpt-4": cls.OPENAI,
            "gpt-4o": cls.OPENAI,
            "claude": cls.ANTHROPIC,
            "google": cls.GEMINI,
        }
        normalized = value.lower().strip()
        if normalized in aliases:
            return aliases[normalized]
        try:
            return cls(normalized)
        except ValueError:
            return cls.OPENAI  # Default fallback


# ─────────────────────────────────────────────────────────────────────────────
# Default Models per Provider
# ─────────────────────────────────────────────────────────────────────────────


DEFAULT_MODELS = {
    LLMProvider.OPENAI: "gpt-4o",
    LLMProvider.ANTHROPIC: "claude-3-5-sonnet-20241022",
    LLMProvider.GEMINI: "gemini-3.1-pro-preview-customtools",
}


# ─────────────────────────────────────────────────────────────────────────────
# LLM Factory
# ─────────────────────────────────────────────────────────────────────────────


def get_llm(
    provider: Optional[str] = None,
    model: Optional[str] = None,
    temperature: float = 0.7,
    streaming: bool = False,
    callbacks: Optional[List[AsyncCallbackHandler]] = None,
) -> BaseChatModel:
    """
    Get an LLM instance based on provider and model.
    
    Supports dynamic switching between providers:
    - OpenAI (ChatGPT): gpt-4o, gpt-4-turbo, gpt-3.5-turbo
    - Anthropic (Claude): claude-3-5-sonnet, claude-3-opus, claude-3-haiku
    - Google (Gemini): gemini-3.1-pro-preview-customtools, gemini-1.5-flash

    Args:
        provider: LLM provider ("openai", "anthropic", "gemini", "chatgpt", "claude")
        model: Specific model name (optional, uses default for provider)
        temperature: Sampling temperature (0.0 - 1.0)
        streaming: Enable streaming mode
        callbacks: Optional async callback handlers

    Returns:
        Configured LLM instance
    """
    # Determine provider
    if provider:
        llm_provider = LLMProvider.from_string(provider)
    else:
        llm_provider = LLMProvider.from_string(settings.llm_provider)
    
    # Determine model
    model_name = model or DEFAULT_MODELS.get(llm_provider) or settings.openai_model
    
    # Create LLM based on provider
    if llm_provider == LLMProvider.ANTHROPIC:
        return _get_anthropic_llm(model_name, temperature, streaming, callbacks)
    elif llm_provider == LLMProvider.GEMINI:
        return _get_gemini_llm(model_name, temperature, streaming, callbacks)
    else:
        return _get_openai_llm(model_name, temperature, streaming, callbacks)


def _get_openai_llm(
    model: str,
    temperature: float,
    streaming: bool,
    callbacks: Optional[List[AsyncCallbackHandler]],
) -> BaseChatModel:
    """Get OpenAI (ChatGPT) LLM instance."""
    from langchain_openai import ChatOpenAI
    
    return ChatOpenAI(
        api_key=settings.openai_api_key,
        model=model,
        temperature=temperature,
        streaming=streaming,
        callbacks=callbacks,
    )


def _get_anthropic_llm(
    model: str,
    temperature: float,
    streaming: bool,
    callbacks: Optional[List[AsyncCallbackHandler]],
) -> BaseChatModel:
    """Get Anthropic (Claude) LLM instance."""
    from langchain_anthropic import ChatAnthropic
    
    return ChatAnthropic(
        api_key=settings.anthropic_api_key,
        model=model,
        temperature=temperature,
        streaming=streaming,
        callbacks=callbacks,
    )


def _get_gemini_llm(
    model: str,
    temperature: float,
    streaming: bool,
    callbacks: Optional[List[AsyncCallbackHandler]],
) -> BaseChatModel:
    """Get Google (Gemini) LLM instance."""
    from langchain_google_genai import ChatGoogleGenerativeAI
    
    return ChatGoogleGenerativeAI(
        google_api_key=settings.google_api_key,
        model=model,
        temperature=temperature,
        streaming=streaming,
        callbacks=callbacks,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Embedding Model
# ─────────────────────────────────────────────────────────────────────────────


def get_embedding_model(provider: Optional[str] = None):
    """
    Get the embedding model for knowledge base operations.
    
    Currently uses OpenAI embeddings as they provide the best quality.
    Can be extended to support other providers.

    Args:
        provider: Optional provider override (currently ignored)

    Returns:
        Configured embedding model
    """
    from langchain_openai import OpenAIEmbeddings

    return OpenAIEmbeddings(
        api_key=settings.openai_api_key,
        model=settings.embedding_model,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Message Utilities
# ─────────────────────────────────────────────────────────────────────────────


def create_messages(
    system_prompt: str,
    message_history: List[Dict[str, str]],
    user_message: str,
) -> List[BaseMessage]:
    """
    Create a list of LangChain messages from history and user input.

    Args:
        system_prompt: The system prompt for the agent
        message_history: Previous conversation messages
        user_message: Current user message

    Returns:
        List of LangChain message objects
    """
    messages: List[BaseMessage] = [SystemMessage(content=system_prompt)]

    for msg in message_history:
        role = msg.get("role", "user")
        content = msg.get("content", "")

        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))
        elif role == "system":
            messages.append(SystemMessage(content=content))

    messages.append(HumanMessage(content=user_message))

    return messages


# ─────────────────────────────────────────────────────────────────────────────
# Streaming Handler
# ─────────────────────────────────────────────────────────────────────────────


class StreamingCallbackHandler(AsyncCallbackHandler):
    """
    Async callback handler for streaming LLM responses.
    """

    def __init__(self):
        self.tokens: List[str] = []
        self.accumulated: str = ""

    async def on_llm_new_token(self, token: str, **kwargs: Any) -> None:
        """Handle new token from LLM."""
        self.tokens.append(token)
        self.accumulated += token

    def get_accumulated(self) -> str:
        """Get accumulated response text."""
        return self.accumulated

    def reset(self) -> None:
        """Reset the handler state."""
        self.tokens = []
        self.accumulated = ""


# ─────────────────────────────────────────────────────────────────────────────
# Provider Info (for API responses)
# ─────────────────────────────────────────────────────────────────────────────


def get_available_providers() -> List[Dict[str, Any]]:
    """
    Get list of available LLM providers with their models.
    
    Returns:
        List of provider info dicts
    """
    return [
        {
            "id": "openai",
            "name": "ChatGPT (OpenAI)",
            "models": [
                {"id": "gpt-4o", "name": "GPT-4o", "default": True},
                {"id": "gpt-4-turbo", "name": "GPT-4 Turbo"},
                {"id": "gpt-4", "name": "GPT-4"},
                {"id": "gpt-3.5-turbo", "name": "GPT-3.5 Turbo"},
            ],
            "available": bool(settings.openai_api_key),
        },
        {
            "id": "anthropic",
            "name": "Claude (Anthropic)",
            "models": [
                {"id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet", "default": True},
                {"id": "claude-3-opus-20240229", "name": "Claude 3 Opus"},
                {"id": "claude-3-haiku-20240307", "name": "Claude 3 Haiku"},
            ],
            "available": bool(settings.anthropic_api_key),
        },
        {
            "id": "gemini",
            "name": "Gemini (Google)",
            "models": [
                {"id": "gemini-3.1-pro-preview-customtools", "name": "Gemini 3.1 Pro", "default": True},
                {"id": "gemini-1.5-flash", "name": "Gemini 1.5 Flash"},
                {"id": "gemini-pro", "name": "Gemini Pro"},
            ],
            "available": bool(settings.google_api_key),
        },
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Content Normalization (Gemini Compatibility)
# ─────────────────────────────────────────────────────────────────────────────


def normalize_content(content: Any) -> str:
    """
    Normalize LLM response content to a string.
    
    Gemini models return content as a list of parts, while OpenAI/Anthropic
    return content as a string. This function handles both cases.
    
    Args:
        content: Response content (str or list)
        
    Returns:
        Normalized string content
    """
    if content is None:
        return ""
    
    if isinstance(content, str):
        return content
    
    if isinstance(content, list):
        text_parts = []
        for part in content:
            if isinstance(part, str):
                text_parts.append(part)
            elif isinstance(part, dict) and "text" in part:
                text_parts.append(part["text"])
            elif hasattr(part, "text"):
                text_parts.append(part.text)
        return "".join(text_parts)
    
    # Fallback: convert to string
    return str(content)