# Kinship Backend

AI-powered backend for the Kinship Intelligence platform — **FastAPI + LangGraph + LangSmith**.

## Architecture

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Studio UI    │  │ Flutter Web  │  │ Mobile App   │
│ (Next.js)    │  │ (iframe)     │  │ (Flutter +   │
│              │  │              │  │  Flame)      │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │ REST            │ REST           │ REST + WS
       ▼                 ▼                ▼
┌─────────────────────────────────────────────────┐
│         kinship-backend (this repo)             │
│                                                  │
│  Layer 1: REST API (FastAPI)                    │
│  ├── NPCs, Challenges, Quests, Routes           │
│  ├── Knowledge, Prompts, HEARTS, Players         │
│  └── Runtime: Dialogue, Scene Gen, Manifest      │
│                                                  │
│  Layer 2: LangGraph Workflows (6 Graphs)        │
│  ├── G1: Scene Generation (Studio)               │
│  ├── G2: Knowledge Ingestion (Studio)            │
│  ├── G3: Prompt Assembly (Subgraph)              │
│  ├── G4: NPC Dialogue (Runtime - Main)           │
│  ├── G5: HEARTS Scoring (Subgraph)               │
│  └── G6: Route Resolution (Subgraph)             │
│                                                  │
│  Layer 3: WebSocket (Multi-player)              │
│  └── Scene Rooms, Player Sync, NPC Locking       │
│                                                  │
│  PostgreSQL + LangGraph PostgresSaver            │
│  Pinecone (Vector DB) + Voyage AI (Embeddings)   │
│  Claude Haiku (runtime) + Sonnet (generation)    │
└─────────────────────────────────────────────────┘
```

## Quick Start

### 1. Start PostgreSQL
```bash
docker compose up postgres -d
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your API keys
```

### 3. Install Dependencies
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 4. Run Server
```bash
uvicorn app.main:app --reload --port 8000
```

### 5. Run with Docker
```bash
docker compose up --build
```

## API Endpoints

### CRUD (Studio UI)
| Resource | Endpoints |
|----------|-----------|
| NPCs | `GET/POST /api/npcs`, `GET/PUT/DELETE /api/npcs/{id}` |
| Challenges | `GET/POST /api/challenges`, `GET/PUT/DELETE /api/challenges/{id}` |
| Quests | `GET/POST /api/quests`, `GET/PUT/DELETE /api/quests/{id}` |
| Routes | `GET/POST /api/routes`, `GET/PUT/DELETE /api/routes/{id}` |
| Knowledge | `GET/POST /api/knowledge`, `GET/PUT/DELETE /api/knowledge/{id}` |
| Prompts | `GET/POST /api/prompts`, `GET/PUT/DELETE /api/prompts/{id}` |
| HEARTS | `GET/PUT /api/hearts/facets/{key}`, `GET/PUT /api/hearts/rubric` |
| Players | `POST /api/players`, `GET /api/players/{id}`, `GET /api/players/{id}/history` |

### AI-Powered
| Endpoint | Graph | Client |
|----------|-------|--------|
| `POST /api/scenes/generate` | G1: Scene Generation | Studio |
| `POST /api/knowledge/ingest` | G2: Knowledge Ingestion | Studio |
| `POST /api/runtime/dialogue` | G4: NPC Dialogue | Mobile |

### Runtime
| Endpoint | Purpose |
|----------|---------|
| `GET /api/runtime/scenes/{id}/manifest` | Flutter scene manifest |
| `GET /api/runtime/player/{id}` | Player state |
| `GET /play/{scene_id}` | Published scene (Flutter Web) |
| `ws://host/ws/scene/{id}` | Multi-player WebSocket |

### Utility
| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Health check + WS stats |
| `GET /api/stats` | Entity counts for Studio sidebar |

## WebSocket Protocol

### Connect
```
ws://localhost:8000/ws/scene/{scene_id}?player_id={id}&display_name={name}
```

### Client → Server
```json
{"type": "move", "x": 5.2, "y": 3.1, "facing": "right"}
{"type": "interact", "target_type": "npc", "target_id": "uuid"}
{"type": "dialogue", "npc_id": "uuid", "message": "Hello Coach!"}
{"type": "dialogue_end", "npc_id": "uuid"}
{"type": "emote", "emote": "wave"}
{"type": "heartbeat"}
```

### Server → Client (Broadcast)
```json
{"type": "player_join", "player_id": "...", "display_name": "..."}
{"type": "player_leave", "player_id": "..."}
{"type": "player_move", "player_id": "...", "x": 5.2, "y": 3.1}
{"type": "npc_state", "npc_id": "...", "state": "in_dialogue", "occupied_by": "..."}
```

### Server → Client (Direct)
```json
{"type": "dialogue_response", "npc_name": "Coach Ray", "dialogue": "...", "hearts_deltas": {...}}
{"type": "scene_transition", "to_scene_id": "...", "reason": "..."}
{"type": "error", "code": "npc_busy", "message": "..."}
```

## LangSmith Integration

All LangGraph executions are traced to LangSmith automatically:
- Set `LANGSMITH_API_KEY` and `LANGSMITH_PROJECT` in `.env`
- View traces at https://smith.langchain.com
- Each graph run (dialogue, scoring, ingestion) appears as a separate trace
- Subgraph calls are nested under the parent trace

## LangGraph Studio

This repo is compatible with LangGraph Studio/CLI:
```bash
pip install "langgraph-cli[inmem]"
langgraph dev
```
See `langgraph.json` for graph definitions.

## Flutter/Flame Integration

The backend serves scene manifests to Flutter:
1. **Mobile**: `GET /api/runtime/scenes/{id}/manifest` → JSON manifest
2. **Studio Preview**: Same manifest sent via `postMessage()` to iframe
3. **Published Scenes**: `GET /play/{scene_id}` → HTML with embedded Flutter Web

Scene manifests include: tile map, asset placements, NPC positions, spawn points, ambient config, and active player list for multi-player.

## Project Structure
```
kinship-backend/
├── app/
│   ├── main.py                 # FastAPI app, lifespan, router registration
│   ├── config.py               # Pydantic settings from .env
│   ├── api/                    # REST endpoints (CRUD + AI triggers)
│   ├── db/                     # SQLAlchemy models, migrations, seed data
│   ├── graphs/                 # LangGraph workflows (6 graphs)
│   ├── realtime/               # WebSocket multi-player layer
│   ├── services/               # Claude, Pinecone, Assets, Embedding clients
│   └── schemas/                # Pydantic request/response models
├── alembic/                    # Database migrations
├── docker-compose.yml          # Postgres + backend
├── langgraph.json              # LangGraph Studio config
└── requirements.txt            # Python dependencies
```

## Tech Stack

| Component | Version |
|-----------|---------|
| FastAPI | 0.115.7 |
| LangGraph | 1.0.7 |
| LangChain | 1.2.7 |
| LangSmith | 0.3.42 |
| LangGraph Checkpoint Postgres | 3.0.4 |
| SQLAlchemy | 2.0.37 (async) |
| PostgreSQL | 16 |
| Pinecone | 5.1.0 |
| Claude | Haiku (runtime) + Sonnet (generation) |
