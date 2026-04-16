"""
Kinship Agent - Core Settings & Configuration

Loads environment variables and provides typed configuration for the application.
Uses pydantic-settings for validation and type safety.

Also loads YAML configuration for:
- MCP tool registry
- Cache settings
- Orchestration settings
"""

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal, Dict, List, Optional, Any

import yaml
from pydantic import BaseModel, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# ─────────────────────────────────────────────────────────────────────────────
# YAML Configuration Models
# ─────────────────────────────────────────────────────────────────────────────


class MCPToolConfig(BaseModel):
    """Configuration for a single MCP tool."""

    url: str
    transport: str = "streamable_http"
    description: str = ""
    capabilities: List[str] = []


class CacheLayerConfig(BaseModel):
    """Configuration for a single cache layer."""

    max_size: int = 100
    ttl_seconds: int = 300


class CacheConfig(BaseModel):
    """Configuration for all cache layers."""

    graph: CacheLayerConfig = CacheLayerConfig(max_size=100, ttl_seconds=3600)
    worker: CacheLayerConfig = CacheLayerConfig(max_size=500, ttl_seconds=300)
    presence: CacheLayerConfig = CacheLayerConfig(max_size=200, ttl_seconds=300)
    mcp_tools: CacheLayerConfig = CacheLayerConfig(max_size=50, ttl_seconds=600)
    mcp_clients: CacheLayerConfig = CacheLayerConfig(max_size=20, ttl_seconds=1800)


class IntentConfig(BaseModel):
    """Intent analysis settings."""

    confidence_threshold: float = 0.7
    fallback_to_supervisor: bool = True


class WorkerConfig(BaseModel):
    """Worker execution settings."""

    max_tool_calls: int = 10
    timeout_seconds: int = 60
    tool_timeout_seconds: int = 30
    retry_on_failure: bool = True
    max_retries: int = 2


class StreamingConfig(BaseModel):
    """Streaming settings."""

    chunk_size: int = 1
    heartbeat_seconds: int = 15
    include_intermediate_events: bool = True
    max_buffer_size: int = 1000
    client_timeout_seconds: int = 30
    max_response_tokens: int = 4000


class ApprovalConfig(BaseModel):
    """Approval workflow settings."""

    enabled: bool = False
    sensitive_tools: List[str] = []
    timeout_seconds: int = 300


class VoiceGeminiConfig(BaseModel):
    """Gemini-specific voice settings."""
    
    model: str = "gemini-3.1-flash-live-preview"
    default_voice: str = "Aoede"


class VoiceAudioConfig(BaseModel):
    """Audio settings for voice chat."""
    
    input_sample_rate: int = 16000
    output_sample_rate: int = 24000
    input_encoding: str = "LINEAR16"
    output_encoding: str = "LINEAR16"
    chunk_duration_ms: int = 100


class VoiceSessionConfig(BaseModel):
    """Session settings for voice chat."""
    
    max_duration_seconds: int = 600
    idle_timeout_seconds: int = 30
    keepalive_interval_seconds: int = 15


class VoiceToolsConfig(BaseModel):
    """Tool settings for voice chat."""
    
    enabled: bool = True
    confirmation_required: List[str] = ["transfer", "send", "delete", "post"]


class VoiceConfig(BaseModel):
    """Voice chat configuration."""
    
    enabled: bool = True
    provider: str = "gemini_live"
    gemini: VoiceGeminiConfig = VoiceGeminiConfig()
    audio: VoiceAudioConfig = VoiceAudioConfig()
    session: VoiceSessionConfig = VoiceSessionConfig()
    tools: VoiceToolsConfig = VoiceToolsConfig()


class OrchestrationConfig(BaseModel):
    """Orchestration settings."""

    intent: IntentConfig = IntentConfig()
    worker: WorkerConfig = WorkerConfig()
    streaming: StreamingConfig = StreamingConfig()
    approval: ApprovalConfig = ApprovalConfig()
    max_workers_per_presence: int = 50


class YAMLConfig(BaseModel):
    """Full YAML configuration."""

    mcp_tools: Dict[str, MCPToolConfig] = {}
    cache: CacheConfig = CacheConfig()
    orchestration: OrchestrationConfig = OrchestrationConfig()
    voice: VoiceConfig = VoiceConfig()


def load_yaml_config() -> YAMLConfig:
    """Load configuration from config.yaml."""
    config_path = Path(__file__).parent.parent.parent / "config.yaml"

    if not config_path.exists():
        # Return defaults if config file doesn't exist
        return YAMLConfig()

    try:
        with open(config_path, "r") as f:
            raw_config = yaml.safe_load(f) or {}

        # Parse MCP tools
        mcp_tools = {}
        for name, tool_data in raw_config.get("mcp_tools", {}).items():
            mcp_tools[name] = MCPToolConfig(**tool_data)

        # Parse cache config
        cache_data = raw_config.get("cache", {})
        cache_config = CacheConfig(
            graph=CacheLayerConfig(**cache_data.get("graph", {})),
            worker=CacheLayerConfig(**cache_data.get("worker", {})),
            presence=CacheLayerConfig(**cache_data.get("presence", {})),
            mcp_tools=CacheLayerConfig(**cache_data.get("mcp_tools", {})),
            mcp_clients=CacheLayerConfig(**cache_data.get("mcp_clients", {})),
        )

        # Parse orchestration config
        orch_data = raw_config.get("orchestration", {})
        orchestration_config = OrchestrationConfig(
            intent=IntentConfig(**orch_data.get("intent", {})),
            worker=WorkerConfig(**orch_data.get("worker", {})),
            streaming=StreamingConfig(**orch_data.get("streaming", {})),
            approval=ApprovalConfig(**orch_data.get("approval", {})),
            max_workers_per_presence=orch_data.get("max_workers_per_presence", 50),
        )
        
        # Parse voice config
        voice_data = raw_config.get("voice", {})
        voice_config = VoiceConfig(
            enabled=voice_data.get("enabled", True),
            provider=voice_data.get("provider", "gemini_live"),
            gemini=VoiceGeminiConfig(**voice_data.get("gemini", {})),
            audio=VoiceAudioConfig(**voice_data.get("audio", {})),
            session=VoiceSessionConfig(**voice_data.get("session", {})),
            tools=VoiceToolsConfig(**voice_data.get("tools", {})),
        )

        return YAMLConfig(
            mcp_tools=mcp_tools,
            cache=cache_config,
            orchestration=orchestration_config,
            voice=voice_config,
        )
    except Exception as e:
        print(f"Warning: Failed to load config.yaml: {e}")
        return YAMLConfig()


# Load YAML config at module level
_yaml_config = load_yaml_config()

# Export individual configs for convenience
yaml_config = _yaml_config
mcp_tools_config = _yaml_config.mcp_tools
cache_config = _yaml_config.cache
orchestration_config = _yaml_config.orchestration
voice_config = _yaml_config.voice


# ─────────────────────────────────────────────────────────────────────────────
# Environment Settings
# ─────────────────────────────────────────────────────────────────────────────


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ─────────────────────────────────────────────────────────────────────────────
    # Application Settings
    # ─────────────────────────────────────────────────────────────────────────────
    app_name: str = Field(default="Kinship Agent", description="Application name")
    app_env: Literal["development", "staging", "production"] = Field(
        default="development", description="Application environment"
    )
    debug: bool = Field(default=False, description="Enable debug mode")

    # ─────────────────────────────────────────────────────────────────────────────
    # Server Configuration
    # ─────────────────────────────────────────────────────────────────────────────
    host: str = Field(default="0.0.0.0", description="Server host")
    port: int = Field(default=8000, description="Server port")

    # ─────────────────────────────────────────────────────────────────────────────
    # Database Configuration
    # ─────────────────────────────────────────────────────────────────────────────
    database_url: str = Field(
        default="postgresql+asyncpg://postgres:password@localhost:5432/kinship_agent",
        description="PostgreSQL connection string (async)",
    )

    # ─────────────────────────────────────────────────────────────────────────────
    # Chat History Configuration (Token-Based)
    # ─────────────────────────────────────────────────────────────────────────────
    chat_history_token_budget: int = Field(
        default=8000,
        description="Maximum tokens allocated for conversation history in LLM context"
    )
    chat_history_recent_messages_reserved: int = Field(
        default=10,
        description="Number of recent messages always kept unsummarized"
    )
    chat_history_summary_max_tokens: int = Field(
        default=500,
        description="Maximum tokens for the conversation summary"
    )
    chat_history_max_age_days: Optional[float] = Field(
        default=None,
        description="Maximum age of messages in days (supports decimals, e.g., 0.1 = ~2.4 hours). None = no limit"
    )

    @field_validator('chat_history_token_budget', mode='before')
    @classmethod
    def empty_string_to_default_token_budget(cls, v):
        """Convert empty string to default for token budget field."""
        if v == '':
            return 8000
        return v

    @field_validator('chat_history_recent_messages_reserved', mode='before')
    @classmethod
    def empty_string_to_default_recent_reserved(cls, v):
        """Convert empty string to default for recent messages reserved field."""
        if v == '':
            return 10
        return v

    @field_validator('chat_history_summary_max_tokens', mode='before')
    @classmethod
    def empty_string_to_default_summary_max_tokens(cls, v):
        """Convert empty string to default for summary max tokens field."""
        if v == '':
            return 500
        return v

    @field_validator('chat_history_max_age_days', mode='before')
    @classmethod
    def empty_string_to_none(cls, v):
        """Convert empty string to None for optional fields."""
        if v == '' or v is None:
            return None
        return v

    # ─────────────────────────────────────────────────────────────────────────────
    # Cleanup Scheduler Configuration
    # ─────────────────────────────────────────────────────────────────────────────
    cleanup_enabled: bool = Field(
        default=True,
        description="Enable background cleanup scheduler"
    )
    cleanup_schedule_hour: int = Field(
        default=3,
        description="Hour to run cleanup job (0-23, UTC)"
    )
    cleanup_schedule_minute: int = Field(
        default=0,
        description="Minute to run cleanup job (0-59)"
    )
    cleanup_batch_size: int = Field(
        default=100,
        description="Number of conversations to process per batch during cleanup"
    )

    @field_validator('cleanup_enabled', mode='before')
    @classmethod
    def empty_string_to_default_bool(cls, v):
        """Convert empty string to default for boolean fields."""
        if v == '':
            return True  # Return default value
        return v

    @field_validator('cleanup_schedule_hour', mode='before')
    @classmethod
    def empty_string_to_default_hour(cls, v):
        """Convert empty string to default for hour field."""
        if v == '':
            return 3  # Return default value
        return v

    @field_validator('cleanup_schedule_minute', mode='before')
    @classmethod
    def empty_string_to_default_minute(cls, v):
        """Convert empty string to default for minute field."""
        if v == '':
            return 0  # Return default value
        return v

    @field_validator('cleanup_batch_size', mode='before')
    @classmethod
    def empty_string_to_default_batch_size(cls, v):
        """Convert empty string to default for batch size field."""
        if v == '':
            return 100  # Return default value
        return v

    # ─────────────────────────────────────────────────────────────────────────────
    # LLM Provider Configuration
    # ─────────────────────────────────────────────────────────────────────────────
    llm_provider: Literal["openai", "anthropic", "gemini"] = Field(
        default="openai", description="Default LLM provider to use"
    )

    # OpenAI (ChatGPT)
    openai_api_key: str = Field(default="", description="OpenAI API key")
    openai_model: str = Field(default="gpt-4o", description="OpenAI model")

    # Anthropic (Claude)
    anthropic_api_key: str = Field(default="", description="Anthropic API key")
    anthropic_model: str = Field(
        default="claude-3-5-sonnet-20241022", description="Anthropic model"
    )

    # Google (Gemini)
    google_api_key: str = Field(default="", description="Google AI API key")
    gemini_model: str = Field(default="gemini-3.1-pro-preview-customtools", description="Gemini model")

    # ─────────────────────────────────────────────────────────────────────────────
    # LangSmith Configuration
    # ─────────────────────────────────────────────────────────────────────────────
    langsmith_tracing: bool = Field(default=False, description="Enable LangSmith tracing")
    langsmith_endpoint: str = Field(
        default="https://api.smith.langchain.com", description="LangSmith endpoint"
    )
    langsmith_api_key: str = Field(default="", description="LangSmith API key")
    langsmith_project: str = Field(default="kinship-agent", description="LangSmith project")

    # ─────────────────────────────────────────────────────────────────────────────
    # JWT Configuration
    # ─────────────────────────────────────────────────────────────────────────────
    jwt_secret: str = Field(
        default="change-me-in-production",
        description="JWT secret key",
    )
    jwt_algorithm: str = Field(default="HS256", description="JWT algorithm")
    jwt_expires_in: str = Field(default="7d", description="JWT expiration time")

    # ─────────────────────────────────────────────────────────────────────────────
    # CORS Configuration
    # ─────────────────────────────────────────────────────────────────────────────
    cors_origins: str = Field(
        default="http://localhost:3000,http://localhost:3001",
        description="Comma-separated list of allowed origins",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS origins as a list."""
        return [origin.strip() for origin in self.cors_origins.split(",")]

    # ─────────────────────────────────────────────────────────────────────────────
    # Knowledge Base Configuration
    # ─────────────────────────────────────────────────────────────────────────────
    embedding_provider: str = Field(
        default="openai", description="Embedding provider: 'openai' or 'voyage'"
    )
    embedding_model: str = Field(
        default="text-embedding-3-small", description="Embedding model for knowledge base"
    )
    chunk_size: int = Field(default=2000, description="Chunk size for text splitting")
    chunk_overlap: int = Field(default=200, description="Chunk overlap for text splitting")

    # ─────────────────────────────────────────────────────────────────────────────
    # Pinecone Vector Database
    # ─────────────────────────────────────────────────────────────────────────────
    pinecone_api_key: str = Field(default="", description="Pinecone API key")
    pinecone_index_host: str = Field(
        default="",
        description="Pinecone index host URL (e.g., https://your-index-xxx.svc.pinecone.io)",
    )
    pinecone_index: str = Field(default="", description="Pinecone index name")
    pinecone_namespace: str = Field(default="", description="Default Pinecone namespace")

    # ─────────────────────────────────────────────────────────────────────────────
    # Voyage AI Embeddings (optional - can use OpenAI instead)
    # ─────────────────────────────────────────────────────────────────────────────
    voyage_api_key: str = Field(default="", description="Voyage AI API key")
    voyage_model: str = Field(default="voyage-3", description="Voyage embedding model")

    # ─────────────────────────────────────────────────────────────────────────────
    # Rate Limiting
    # ─────────────────────────────────────────────────────────────────────────────
    rate_limit_per_minute: int = Field(default=60, description="Rate limit per minute")

    # ─────────────────────────────────────────────────────────────────────────────
    # OAuth Provider Credentials
    # ─────────────────────────────────────────────────────────────────────────────
    google_client_id: str = Field(default="", description="Google OAuth client ID")
    google_client_secret: str = Field(default="", description="Google OAuth client secret")
    linkedin_client_id: str = Field(default="", description="LinkedIn OAuth client ID")
    linkedin_client_secret: str = Field(default="", description="LinkedIn OAuth client secret")
    facebook_client_id: str = Field(default="", description="Facebook OAuth client ID")
    facebook_client_secret: str = Field(default="", description="Facebook OAuth client secret")

    # ─────────────────────────────────────────────────────────────────────────────
    # URL Configuration
    # ─────────────────────────────────────────────────────────────────────────────
    frontend_url: str = Field(default="http://localhost:3000", description="Frontend URL")
    backend_url: str = Field(default="http://localhost:8000", description="Backend URL")


@lru_cache
def get_settings() -> Settings:
    """
    Get cached settings instance.
    Using lru_cache ensures we only load settings once.
    """
    return Settings()


# Convenience export
settings = get_settings()