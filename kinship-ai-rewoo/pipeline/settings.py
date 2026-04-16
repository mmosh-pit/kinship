from pathlib import Path
from dotenv import load_dotenv
import os

from pydantic import SecretStr, Field
from pydantic_settings import BaseSettings

# Absolute env path
ENV_PATH = Path(__file__).parent.parent / ".env"

# MUST load dotenv BEFORE Pydantic reads environment
load_dotenv(dotenv_path=ENV_PATH)



class Settings(BaseSettings):
    base_dir: Path = Field(default_factory=lambda: Path(__file__).parent.parent)

    debug: bool = False
    log_level: str = "INFO"
    allowed_origins: str = "*"

    google_api_key: SecretStr

    class Config:
        env_file = ENV_PATH
        extra = "allow"


settings = Settings()