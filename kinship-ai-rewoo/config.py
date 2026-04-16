"""
Configuration file for LangGraph Dynamic Workflow Agent

Contains:
- API configuration
- MCP server definitions
- Environment variable defaults
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ==================== API CONFIGURATION ====================

API_TITLE = "LangGraph Dynamic Workflow API"
API_DESCRIPTION = """
A dynamic workflow agent with:
- History Management (MongoDB)
- State Management (LangGraph + PostgreSQL Checkpoints)
- Dynamic Goal Nodes
- LangSmith Integration
"""
API_VERSION = "2.0.0"
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8001"))

# ==================== DATABASE CONFIGURATION ====================

MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME")
CHECKPOINT_POSTGRES_URI = os.getenv("CHECKPOINT_POSTGRES_URI")

# ==================== AI MODELS ====================

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

DEFAULT_AI_MODEL = os.getenv("DEFAULT_AI_MODEL", "gpt-4o")
DEFAULT_TEMPERATURE = float(os.getenv("DEFAULT_TEMPERATURE", "0.7"))

# ==================== LANGSMITH ====================

LANGCHAIN_TRACING_V2 = os.getenv("LANGCHAIN_TRACING_V2", "false").lower() == "true"
LANGCHAIN_API_KEY = os.getenv("LANGCHAIN_API_KEY")
LANGCHAIN_PROJECT = os.getenv("LANGCHAIN_PROJECT", "langgraph-dynamic-agent")

# ==================== HISTORY SETTINGS ====================

HISTORY_MAX_MESSAGES = int(os.getenv("HISTORY_MAX_MESSAGES", "20"))
CHECKPOINT_RETENTION_DAYS = int(os.getenv("CHECKPOINT_RETENTION_DAYS", "30"))

# ==================== MCP SERVERS ====================

MCP_SERVERS = {
    "unstructured_db": {
        "url": "http://10.128.15.239/mcp",
        "transport": "streamable_http",
    },
    "structured_db": {
        "url": "http://10.128.15.211/mcp",
        "transport": "streamable_http",
    },
    "solana_tool": {
        "url": "https://ai-solana.kinshipbots.com/mcp",
        "transport": "streamable_http"
    },
    "bluesky_tool": {
        "url": "http://10.128.15.247/mcp",
        "transport": "streamable_http"
    },
    "google_gmail_tool": {
        "url": "http://192.168.1.20:8000/mcp",
        "transport": "streamable_http"
    },
    "google_calendar_tool": {
        "url": "http://192.168.1.20:8002/mcp",
        "transport": "streamable_http"
    },
    "google_meet_tool": {
        "url": "http://192.168.1.20:8003/mcp",
        "transport": "streamable_http"
    }
}

# ==================== AUTH CONFIGURATION ====================

EXTERNAL_AUTH_URL = os.getenv("EXTERNAL_AUTH_URL", "https://api.kinship.codes/is-auth")

# ==================== FEATURE FLAGS ====================

ENABLE_STREAMING = os.getenv("ENABLE_STREAMING", "true").lower() == "true"
ENABLE_TOOL_CALLS = os.getenv("ENABLE_TOOL_CALLS", "true").lower() == "true"
ENABLE_GOAL_TRACKING = os.getenv("ENABLE_GOAL_TRACKING", "true").lower() == "true"
