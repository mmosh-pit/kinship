# Kinship Agent Backend

A LangGraph-powered agent orchestration system built with FastAPI, LangChain, and PostgreSQL.

## Architecture Overview

The system implements a **Supervisor-Worker** pattern where:

- **Supervisor Agent (Presence)**: The main interface for user interactions. Users only communicate with the Supervisor.
- **Worker Agents**: Specialized agents that execute specific tasks under the Supervisor's direction.

```
┌─────────────────────────────────────────────────────────────────┐
│                         User                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Supervisor Agent                              │
│                     (Presence)                                   │
│                                                                  │
│  • Analyzes user intent                                         │
│  • Routes to appropriate workers                                │
│  • Coordinates multi-step tasks                                 │
│  • Has its own system prompt & knowledge base                   │
│  • Supports configurable tones                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ Worker 1 │   │ Worker 2 │   │ Worker 3 │
        │ Twitter  │   │ Research │   │ Calendar │
        └──────────┘   └──────────┘   └──────────┘
```

## Features

- **LangGraph Orchestration**: Stateful agent workflows with conditional routing
- **Streaming Responses**: Server-Sent Events (SSE) for real-time chat
- **Knowledge Base Integration**: Embedding-based retrieval for context
- **Tool Execution**: Workers can execute external tools (Twitter, Telegram, etc.)
- **Approval Workflows**: Sensitive actions require user approval
- **Tone Support**: Supervisors can have different personalities (friendly, strict, cool, etc.)
- **LangSmith Integration**: Full tracing and observability

## Tech Stack

- **Python 3.11+**
- **FastAPI** - Web framework
- **LangGraph** - Agent orchestration
- **LangChain** - LLM abstraction
- **LangSmith** - Observability
- **PostgreSQL** - Database
- **SQLAlchemy 2.0** - Async ORM
- **Alembic** - Migrations

## Project Structure

```
kinship-agent/
├── app/
│   ├── agents/
│   │   ├── supervisor.py    # LangGraph supervisor agent
│   │   ├── worker.py        # Worker agent execution
│   │   └── knowledge.py     # Knowledge base service
│   ├── api/
│   │   ├── agents.py        # Agent CRUD endpoints
│   │   ├── chat.py          # Chat & streaming endpoints
│   │   └── knowledge.py     # Knowledge base endpoints
│   ├── core/
│   │   ├── config.py        # Settings & configuration
│   │   └── llm.py           # LLM provider abstraction
│   ├── db/
│   │   ├── database.py      # Database connection
│   │   └── models.py        # SQLAlchemy models
│   ├── schemas/
│   │   ├── agent.py         # Agent Pydantic schemas
│   │   └── chat.py          # Chat Pydantic schemas
│   └── main.py              # FastAPI application
├── alembic/
│   ├── versions/            # Migration files
│   └── env.py               # Alembic config
├── tests/
├── pyproject.toml
├── alembic.ini
└── README.md
```

## Installation

1. **Clone the repository**

```bash
git clone <repo-url>
cd kinship-agent
```

2. **Create virtual environment**

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. **Install dependencies**

```bash
pip install -e ".[dev]"
```

4. **Configure environment**

```bash
cp .env.example .env
# Edit .env with your configuration
```

5. **Setup database**

```bash
# Create PostgreSQL database
createdb kinship_agent

# Run migrations
alembic upgrade head
```

6. **Start the server**

```bash
python -m app.main
# Or with uvicorn directly:
uvicorn app.main:app --reload
```

## Configuration

Key environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql+asyncpg://...` |
| `LLM_PROVIDER` | LLM provider (`openai` or `anthropic`) | `openai` |
| `OPENAI_API_KEY` | OpenAI API key | - |
| `ANTHROPIC_API_KEY` | Anthropic API key | - |
| `LANGCHAIN_TRACING_V2` | Enable LangSmith tracing | `false` |
| `LANGCHAIN_API_KEY` | LangSmith API key | - |
| `CORS_ORIGINS` | Allowed CORS origins | `http://localhost:3000` |

## API Endpoints

### Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List agents |
| GET | `/api/agents/{id}` | Get agent |
| GET | `/api/agents/check-presence` | Check if wallet has presence |
| POST | `/api/agents/presence` | Create presence (supervisor) |
| POST | `/api/agents/worker` | Create worker |
| PATCH | `/api/agents/{id}` | Update agent |
| DELETE | `/api/agents/{id}` | Delete agent |

### Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat/sessions` | Create chat session |
| GET | `/api/chat/sessions` | List sessions |
| GET | `/api/chat/sessions/{id}` | Get session |
| DELETE | `/api/chat/sessions/{id}` | Archive session |
| GET | `/api/chat/messages` | Get messages |
| POST | `/api/chat/messages` | Send message |
| POST | `/api/chat/messages/stream` | Send with streaming |
| POST | `/api/chat/presence/{id}/process` | Direct process (no session) |

### Knowledge

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/knowledge` | List knowledge bases |
| POST | `/api/knowledge` | Create knowledge base |
| POST | `/api/knowledge/{id}/ingest` | Add content |
| DELETE | `/api/knowledge/{id}` | Delete knowledge base |

## Agent Tones

Presence agents support different tones:

- `neutral` - Balanced and helpful
- `friendly` - Warm and approachable
- `professional` - Formal and business-like
- `strict` - Direct and authoritative
- `cool` - Laid-back and casual
- `angry` - Assertive and intense
- `playful` - Fun and whimsical
- `wise` - Thoughtful and philosophical

## Worker Tools

Available tools for worker agents:

- `twitter` - Post tweets, reply, engage
- `telegram` - Send messages, manage groups
- `discord` - Manage channels, send messages
- `email` - Send and manage emails
- `calendar` - Schedule events
- `notion` - Create/update pages
- `slack` - Send to channels
- `github` - Manage repos/issues

## Example: Create a Presence Agent

```python
import httpx

# Create a presence (supervisor) agent
response = httpx.post("http://localhost:8000/api/agents/presence", json={
    "name": "Luna",
    "handle": "luna_ai",
    "briefDescription": "A helpful AI assistant",
    "wallet": "0x123...",
    "tone": "friendly",
    "knowledgeBaseIds": ["kb_abc123"]
})

presence = response.json()
```

## Example: Chat with Streaming

```python
import httpx

# Create session
session_resp = httpx.post("http://localhost:8000/api/chat/sessions", json={
    "presenceId": "agent_abc123",
    "userId": "user_1",
    "userWallet": "0x123...",
    "userRole": "member"
})
session = session_resp.json()["session"]

# Stream chat
with httpx.stream("POST", "http://localhost:8000/api/chat/messages/stream", json={
    "sessionId": session["id"],
    "content": "Hello, can you help me with something?",
    "userId": "user_1",
    "userRole": "member"
}) as response:
    for line in response.iter_lines():
        if line.startswith("data:"):
            data = json.loads(line[5:])
            if data["event"] == "token":
                print(data["token"], end="", flush=True)
```

## Development

```bash
# Run tests
pytest

# Format code
black app tests
ruff check app tests --fix

# Type checking
mypy app
```

## Integration with Kinship Studio

This backend is designed to work with the Kinship Studio frontend. Update the frontend's `.env`:

```env
NEXT_PUBLIC_CHAT_API_URL=http://localhost:8000
```

## License

MIT
