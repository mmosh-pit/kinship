"""Application configuration loaded from environment variables."""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Server
    app_env: str = "development"
    app_port: int = 8000
    app_host: str = "0.0.0.0"
    cors_origins: str = "http://localhost:3000,http://localhost:3001"

    # Database
    database_url: str = (
        "postgresql+asyncpg://kinship:kinship@localhost:5432/kinship_backend"
    )
    database_url_sync: str = (
        "postgresql://kinship:kinship@localhost:5432/kinship_backend"
    )
    postgres_url: str = "postgresql://kinship:kinship@localhost:5432/kinship_backend"

    # kinship-assets
    assets_service_url: str = "http://localhost:4000/api/v1"

    # ── AI Provider ──────────────────────────────────────────────────────
    # Set ONE provider + model. All AI calls route through this.
    ai_provider: str = "claude"  # claude | openai | gemini
    ai_model: str = "claude-sonnet-4-20250514"  # Any model string for the provider

    # Provider API keys (only the active provider's key is needed)
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    google_api_key: str = ""

    # Legacy (still used by vision pipeline + knowledge_generator)
    claude_haiku_model: str = "claude-3-haiku-20240307"
    claude_sonnet_model: str = "claude-sonnet-4-20250514"

    # LangSmith
    langsmith_api_key: str = ""
    langsmith_project: str = "kinship-backend"
    langsmith_tracing: bool = True
    langsmith_endpoint: str = "https://api.smith.langchain.com"

    # Pinecone
    pinecone_api_key: str = ""
    pinecone_index: str = "kinship-knowledge"
    pinecone_namespace: str = "kinship"

    # Voyage AI
    voyage_api_key: str = ""
    voyage_model: str = "voyage-3-lite"

    # Firebase
    firebase_project_id: str = "kinship-app"

    # Flutter
    flutter_web_build_path: str = "./flutter_web_build"
    manifest_base_url: str = "http://localhost:8000/play"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()
