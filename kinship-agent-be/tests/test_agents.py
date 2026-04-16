"""
Kinship Agent - Tests

Basic tests for the agent system.
"""

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.database import Base, get_session
from app.db.models import Agent, AgentType, AgentStatus, AgentTone


# ─────────────────────────────────────────────────────────────────────────────
# Test Database Setup
# ─────────────────────────────────────────────────────────────────────────────


# Use in-memory SQLite for tests
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

TestSessionLocal = async_sessionmaker(
    test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def override_get_session():
    """Override database session for tests."""
    async with TestSessionLocal() as session:
        yield session


# Override the dependency
app.dependency_overrides[get_session] = override_get_session


@pytest.fixture(autouse=True)
async def setup_database():
    """Setup test database before each test."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client():
    """Create test client."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
async def db_session():
    """Create test database session."""
    async with TestSessionLocal() as session:
        yield session


# ─────────────────────────────────────────────────────────────────────────────
# Agent Tests
# ─────────────────────────────────────────────────────────────────────────────


class TestAgentEndpoints:
    """Tests for agent CRUD endpoints."""

    @pytest.mark.asyncio
    async def test_list_agents_empty(self, client: AsyncClient):
        """Test listing agents when none exist."""
        response = await client.get("/api/agents")
        assert response.status_code == 200
        data = response.json()
        assert data["agents"] == []
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_create_presence_agent(self, client: AsyncClient):
        """Test creating a presence (supervisor) agent."""
        response = await client.post(
            "/api/agents/presence",
            json={
                "name": "Test Presence",
                "handle": "test_presence",
                "briefDescription": "A test presence agent",
                "wallet": "0x1234567890abcdef",
                "tone": "friendly",
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Test Presence"
        assert data["handle"] == "test_presence"
        assert data["type"] == "presence"
        assert data["tone"] == "friendly"

    @pytest.mark.asyncio
    async def test_create_presence_duplicate_handle(self, client: AsyncClient):
        """Test that duplicate handles are rejected."""
        # Create first presence
        await client.post(
            "/api/agents/presence",
            json={
                "name": "First Presence",
                "handle": "duplicate_handle",
                "wallet": "0x1111111111111111",
            },
        )

        # Try to create second with same handle
        response = await client.post(
            "/api/agents/presence",
            json={
                "name": "Second Presence",
                "handle": "duplicate_handle",
                "wallet": "0x2222222222222222",
            },
        )
        assert response.status_code == 409

    @pytest.mark.asyncio
    async def test_create_presence_one_per_wallet(self, client: AsyncClient):
        """Test that only one presence is allowed per wallet."""
        wallet = "0x1234567890abcdef"

        # Create first presence
        response1 = await client.post(
            "/api/agents/presence",
            json={
                "name": "First Presence",
                "handle": "first_presence",
                "wallet": wallet,
            },
        )
        assert response1.status_code == 201

        # Try to create second presence with same wallet
        response2 = await client.post(
            "/api/agents/presence",
            json={
                "name": "Second Presence",
                "handle": "second_presence",
                "wallet": wallet,
            },
        )
        assert response2.status_code == 409
        assert "PRESENCE_LIMIT_REACHED" in str(response2.json())

    @pytest.mark.asyncio
    async def test_create_worker_requires_presence(self, client: AsyncClient):
        """Test that creating a worker requires a presence first."""
        response = await client.post(
            "/api/agents/worker",
            json={
                "name": "Test Worker",
                "wallet": "0x1234567890abcdef",
                "role": "Research",
            },
        )
        assert response.status_code == 400
        assert "PRESENCE_REQUIRED" in str(response.json())

    @pytest.mark.asyncio
    async def test_create_worker_after_presence(self, client: AsyncClient):
        """Test creating a worker after presence exists."""
        wallet = "0x1234567890abcdef"

        # Create presence first
        await client.post(
            "/api/agents/presence",
            json={
                "name": "Test Presence",
                "handle": "test_presence",
                "wallet": wallet,
            },
        )

        # Now create worker
        response = await client.post(
            "/api/agents/worker",
            json={
                "name": "Test Worker",
                "wallet": wallet,
                "role": "Research",
                "accessLevel": "private",
                "tools": ["twitter", "telegram"],
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Test Worker"
        assert data["type"] == "worker"
        assert data["role"] == "Research"

    @pytest.mark.asyncio
    async def test_check_presence(self, client: AsyncClient):
        """Test checking if wallet has presence."""
        wallet = "0x1234567890abcdef"

        # Check before creating
        response1 = await client.get(f"/api/agents/check-presence?wallet={wallet}")
        assert response1.status_code == 200
        assert response1.json()["has_presence"] is False

        # Create presence
        await client.post(
            "/api/agents/presence",
            json={
                "name": "Test Presence",
                "handle": "test_presence",
                "wallet": wallet,
            },
        )

        # Check after creating
        response2 = await client.get(f"/api/agents/check-presence?wallet={wallet}")
        assert response2.status_code == 200
        assert response2.json()["has_presence"] is True


# ─────────────────────────────────────────────────────────────────────────────
# Chat Tests
# ─────────────────────────────────────────────────────────────────────────────


class TestChatEndpoints:
    """Tests for chat endpoints."""

    @pytest.mark.asyncio
    async def test_create_session_invalid_presence(self, client: AsyncClient):
        """Test creating session with invalid presence ID."""
        response = await client.post(
            "/api/chat/sessions",
            json={
                "presenceId": "invalid_presence_id",
                "userId": "user_1",
                "userWallet": "0x1234",
                "userRole": "member",
            },
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_list_sessions_empty(self, client: AsyncClient):
        """Test listing sessions when none exist."""
        response = await client.get("/api/chat/sessions")
        assert response.status_code == 200
        data = response.json()
        assert data["sessions"] == []


# ─────────────────────────────────────────────────────────────────────────────
# Health Check Tests
# ─────────────────────────────────────────────────────────────────────────────


class TestHealthCheck:
    """Tests for health check endpoint."""

    @pytest.mark.asyncio
    async def test_health_check(self, client: AsyncClient):
        """Test health check returns healthy."""
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"

    @pytest.mark.asyncio
    async def test_root_endpoint(self, client: AsyncClient):
        """Test root endpoint returns API info."""
        response = await client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "name" in data
        assert "endpoints" in data
