"""
LangGraph Dynamic Workflow Agent

Complete implementation with:
1. History Management - Conversation persistence in MongoDB
2. State Management - LangGraph state with PostgreSQL checkpoints
3. Dynamic Goal Nodes - Each checkpoint becomes a workflow node
4. LangSmith Integration - Full observability

Author: Your Team
Version: 2.0.0
"""

import os
import asyncio
from concurrent.futures import ThreadPoolExecutor
import logging
import json
from typing import (
    Dict,
    Any,
    List,
    Optional,
    Tuple,
    Literal,
    Annotated,
    Sequence,
    TypedDict,
    Union,
)
from datetime import datetime, timezone
from dotenv import load_dotenv
from bson import ObjectId

# LangGraph imports
from langgraph.graph import StateGraph, END, START
from langgraph.graph.message import add_messages
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import ToolNode

# LangChain imports
from langchain_core.messages import (
    BaseMessage,
    SystemMessage,
    HumanMessage,
    AIMessage,
    ToolMessage,
    AIMessageChunk,
)
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_mcp_adapters.client import MultiServerMCPClient

# LangSmith imports - for tracing
from langsmith import traceable
from langchain_core.callbacks import CallbackManagerForLLMRun

# FastAPI
from fastapi import HTTPException

# Local imports
from config import MCP_SERVERS
from models import QueryRequest, ChatMessage

load_dotenv()
logger = logging.getLogger(__name__)


# ==================== LANGSMITH SETUP ====================

LANGSMITH_ENABLED = os.getenv("LANGCHAIN_TRACING_V2", "false").lower() == "true"
LANGSMITH_PROJECT = os.getenv("LANGCHAIN_PROJECT", "langgraph-dynamic-agent")

# Create tracer for LangSmith
langsmith_tracer = None

if LANGSMITH_ENABLED:
    logger.info(f"✅ LangSmith enabled - Project: {LANGSMITH_PROJECT}")
    logger.info(
        f"📊 View traces at: https://smith.langchain.com/o/your-org/projects/{LANGSMITH_PROJECT}"
    )
else:
    logger.warning("⚠️ LangSmith disabled - Set LANGCHAIN_TRACING_V2=true to enable")


# ==================== STATE DEFINITION ====================


class AgentState(TypedDict):
    """
    Complete state for the dynamic workflow agent.

    This state is:
    - Persisted via checkpoints (PostgreSQL/Memory)
    - Passed between nodes
    - Traceable in LangSmith
    """

    # Messages with automatic accumulation
    messages: Annotated[Sequence[BaseMessage], add_messages]

    # User & Session Context
    user_id: str
    agent_id: str  # The AI agent identifier
    session_token: Optional[str]
    wallet: Optional[str]

    # Goal/Checkpoint State
    current_goal_id: Optional[str]
    current_goal_name: Optional[str]
    current_goal_instructions: Optional[str]
    goals_completed: List[str]
    goals_pending: List[Dict[str, Any]]
    all_goals_done: bool

    # Attribute Collection State
    current_attribute: Optional[Dict[str, Any]]
    collected_attributes: Dict[str, Any]
    uncollected_attributes: List[Dict[str, Any]]

    # Workflow Control
    workflow_phase: Literal[
        "init", "routing", "goal_active", "collecting", "tool_call", "completed"
    ]
    next_action: Optional[str]
    should_continue: bool

    # Request Context
    namespaces: List[str]
    system_prompt: str
    original_query: str
    ai_model: str

    # Results
    final_response: Optional[str]
    tool_outputs: List[Dict[str, Any]]
    tools_used: List[str]

    # Metadata
    thread_id: str
    execution_start: float
    turn_count: int


# ==================== MONGODB CONNECTION ====================

_mongo_client = None
_mongo_db = None


def get_mongo_db():
    """Get MongoDB database connection."""
    global _mongo_client, _mongo_db

    if _mongo_db is None:
        from pymongo import MongoClient

        mongo_uri = os.getenv("MONGO_URI")
        mongo_db_name = os.getenv("MONGO_DB_NAME")

        if not mongo_uri or not mongo_db_name:
            raise ValueError("MONGO_URI and MONGO_DB_NAME required")

        _mongo_client = MongoClient(mongo_uri)
        _mongo_db = _mongo_client[mongo_db_name]
        logger.info(f"✅ MongoDB connected: {mongo_db_name}")

    return _mongo_db


# ==================== HISTORY MANAGEMENT ====================


class ConversationHistoryManager:
    """
    Manages conversation history in MongoDB.

    Features:
    - Save/load chat history
    - Track message metadata
    - Support for multiple sessions
    """

    def __init__(self):
        self.db = None

    def _get_db(self):
        if self.db is None:
            self.db = get_mongo_db()
        return self.db

    @traceable(run_type="retriever", name="load_chat_history")
    def load_history(
        self,
        user_id: str,
        agent_id: str,
        chat_id: Optional[str] = None,
        limit: int = 50,
    ) -> List[BaseMessage]:
        """
        Load conversation history from MongoDB.

        Args:
            user_id: User identifier
            agent_id: Agent identifier
            chat_id: Specific chat ID (optional)
            limit: Maximum messages to load

        Returns:
            List of LangChain messages
        """
        try:
            db = self._get_db()

            # Build query
            query = {}
            if chat_id:
                query["_id"] = ObjectId(chat_id)
            else:
                # Find chat by user and agent
                query["owner"] = (
                    ObjectId(user_id) if ObjectId.is_valid(user_id) else user_id
                )
                if agent_id:
                    query["chatAgent._id"] = (
                        ObjectId(agent_id) if ObjectId.is_valid(agent_id) else agent_id
                    )

            chat_doc = db.chats.find_one(query)

            if not chat_doc:
                logger.info(f"📝 No existing chat found for user {user_id}")
                return []

            # Extract messages
            messages_data = chat_doc.get("messages", [])

            # Sort by created_at and limit
            messages_data = sorted(
                messages_data,
                key=lambda x: x.get("created_at", datetime.min),
                reverse=True,
            )[:limit]

            # Reverse to get chronological order
            messages_data = list(reversed(messages_data))

            # Convert to LangChain messages
            messages = []
            for msg in messages_data:
                content = msg.get("content", "")
                msg_type = msg.get("type", "user")

                if msg_type == "user":
                    messages.append(HumanMessage(content=content))
                elif msg_type in ("bot", "assistant"):
                    messages.append(AIMessage(content=content))

            logger.info(f"📚 Loaded {len(messages)} messages from history")
            return messages

        except Exception as e:
            logger.error(f"❌ Error loading history: {e}")
            return []

    @traceable(run_type="chain", name="save_message")
    def save_message(
        self,
        chat_id: str,
        content: str,
        msg_type: Literal["user", "bot"],
        agent_id: str,
        sender_id: str,
        system_prompt: str = "",
        namespaces: List[str] = None,
    ) -> Optional[str]:
        """
        Save a message to MongoDB.

        Returns:
            Message ID if successful
        """
        try:
            db = self._get_db()

            message_id = ObjectId()
            message_doc = {
                "_id": message_id,
                "content": content,
                "type": msg_type,
                "created_at": datetime.now(timezone.utc),
                "sender": (
                    ObjectId(sender_id) if ObjectId.is_valid(sender_id) else sender_id
                ),
                "isloading": False,
                "systemprompt": system_prompt if msg_type == "user" else "",
                "namespaces": namespaces if msg_type == "user" else None,
                "agentid": (
                    ObjectId(agent_id) if ObjectId.is_valid(agent_id) else agent_id
                ),
                "chatid": ObjectId(chat_id) if ObjectId.is_valid(chat_id) else chat_id,
            }

            # Update chat document
            result = db.chats.update_one(
                {"_id": ObjectId(chat_id)},
                {
                    "$push": {"messages": message_doc},
                    "$set": {"lastMessage": message_doc},
                },
            )

            if result.modified_count > 0:
                logger.info(f"✅ Saved {msg_type} message to chat {chat_id}")
                return str(message_id)

            return None

        except Exception as e:
            logger.error(f"❌ Error saving message: {e}")
            return None

    def create_chat_if_not_exists(
        self, user_id: str, agent_id: str, agent_doc: Dict = None
    ) -> str:
        """Create a new chat document if one doesn't exist."""
        try:
            db = self._get_db()

            # Check if chat exists
            query = {
                "owner": ObjectId(user_id) if ObjectId.is_valid(user_id) else user_id,
                "chatAgent._id": (
                    ObjectId(agent_id) if ObjectId.is_valid(agent_id) else agent_id
                ),
            }

            existing = db.chats.find_one(query)
            if existing:
                return str(existing["_id"])

            # Create new chat
            chat_agent = {
                "_id": ObjectId(agent_id) if ObjectId.is_valid(agent_id) else agent_id,
                "name": agent_doc.get("name", "Agent") if agent_doc else "Agent",
                "desc": agent_doc.get("desc", "") if agent_doc else "",
                "image": "",
                "type": "bot",
            }

            chat_doc = {
                "owner": ObjectId(user_id) if ObjectId.is_valid(user_id) else user_id,
                "chatAgent": chat_agent,
                "messages": [],
                "created_at": datetime.now(timezone.utc),
                "lastMessage": None,
                "deactivated": False,
            }

            result = db.chats.insert_one(chat_doc)
            logger.info(f"✅ Created new chat: {result.inserted_id}")
            return str(result.inserted_id)

        except Exception as e:
            logger.error(f"❌ Error creating chat: {e}")
            return None


# Global history manager
history_manager = ConversationHistoryManager()


# ==================== GOAL/CHECKPOINT MANAGEMENT ====================


class GoalManager:
    """
    Manages goals/checkpoints from MongoDB.

    Handles:
    - Loading user's goals
    - Tracking progress
    - Attribute collection
    """

    def __init__(self):
        self.db = None

    def _get_db(self):
        if self.db is None:
            self.db = get_mongo_db()
        return self.db

    @traceable(run_type="retriever", name="get_user_goals")
    def get_user_goals(self, user_id: str, agent_id: str) -> List[Dict[str, Any]]:
        """
        Get all incomplete user-specific checkpoints.
        If missing, create them from template checkpoints.

        Args:
            user_id: The user's identifier
            agent_id: The AI agent's identifier

        Returns goals sorted by order/priority.
        """
        try:
            db = self._get_db()

            progress_docs = list(
                db.checkpoint_progress.find(
                    {
                        "user_id": user_id,
                        "agent_id": agent_id,
                        "is_complete": {"$ne": True},
                    }
                ).sort("order", 1)
            )

            if not progress_docs:
                template_docs = list(
                    db.checkpoints.find({"bot_id": agent_id}).sort("execution_order", 1)
                )

                for template in template_docs:
                    checkpoint_id_str = str(template["_id"])

                    existing = db.checkpoint_progress.find_one(
                        {
                            "checkpoint_id": checkpoint_id_str,
                            "user_id": user_id,
                            "agent_id": agent_id,
                        }
                    )
                    if existing:
                        continue

                    attrs = []
                    for attr in template.get("attributes", []):
                        attrs.append(
                            {
                                "label": attr["label"],
                                "instructions": attr.get("instructions", ""),
                                "required": attr.get("required", False),
                                "value": None,
                                "collected": False,
                            }
                        )

                    doc = {
                        "checkpoint_id": checkpoint_id_str,
                        "checkpoint_name": template.get("checkpoint_name"),
                        "agent_id": agent_id,
                        "user_id": user_id,
                        "attributes": attrs,
                        "is_complete": False,
                        "order": template.get("execution_order", 0),
                        "created_at": datetime.now(timezone.utc),
                    }

                    db.checkpoint_progress.insert_one(doc)

                progress_docs = list(
                    db.checkpoint_progress.find(
                        {
                            "user_id": user_id,
                            "agent_id": agent_id,
                            "is_complete": {"$ne": True},
                        }
                    ).sort("order", 1)
                )

            for goal in progress_docs:
                goal["_id"] = str(goal["_id"])

            return progress_docs

        except Exception as e:
            logger.error(f"❌ Error getting goals: {e}")
            return []

    @traceable(run_type="retriever", name="get_next_goal")
    def get_next_incomplete_goal(
        self, user_id: str, agent_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get the next incomplete goal for the user."""
        goals = self.get_user_goals(user_id, agent_id)
        return goals[0] if goals else None

    def get_uncollected_attributes(self, goal: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Get attributes that haven't been collected yet."""
        if not goal:
            return []

        attributes = goal.get("attributes", [])
        uncollected = [attr for attr in attributes if not attr.get("collected", False)]

        return uncollected

    @traceable(run_type="chain", name="save_attribute")
    def save_attribute(
        self,
        checkpoint_id: str,
        attribute_label: str,
        value: str,
        user_id: str,
        agent_id: str,
    ) -> Dict[str, Any]:
        """
        Save an attribute value and return next action.

        Args:
            checkpoint_id: The checkpoint/goal ID
            attribute_label: Label of the attribute to save
            value: The value to save
            user_id: User identifier
            agent_id: Agent identifier

        Returns dict with:
        - success: bool
        - all_collected: bool
        - next_attribute: dict or None
        - next_action: str
        """
        try:
            db = self._get_db()

            # Update the attribute
            result = db.checkpoint_progress.update_one(
                {
                    "checkpoint_id": checkpoint_id,
                    "user_id": user_id,
                    "attributes.label": attribute_label,
                },
                {
                    "$set": {
                        "attributes.$.value": value,
                        "attributes.$.collected": True,
                        "updated_at": datetime.now(timezone.utc),
                    }
                },
            )

            if result.modified_count == 0:
                # Try with _id instead
                result = db.checkpoint_progress.update_one(
                    {
                        "_id": ObjectId(checkpoint_id),
                        "attributes.label": attribute_label,
                    },
                    {
                        "$set": {
                            "attributes.$.value": value,
                            "attributes.$.collected": True,
                            "updated_at": datetime.now(timezone.utc),
                        }
                    },
                )

            # Check remaining attributes
            goal = db.checkpoint_progress.find_one(
                {
                    "$or": [
                        {"checkpoint_id": checkpoint_id, "user_id": user_id},
                        {"_id": ObjectId(checkpoint_id)},
                    ]
                }
            )

            if not goal:
                return {
                    "success": False,
                    "error": "Goal not found",
                    "next_action": "error",
                }

            uncollected = self.get_uncollected_attributes(goal)

            if not uncollected:
                return {
                    "success": True,
                    "all_collected": True,
                    "next_attribute": None,
                    "next_action": "mark_checkpoint_complete",
                }

            return {
                "success": True,
                "all_collected": False,
                "next_attribute": uncollected[0],
                "next_action": f"ask_for_{uncollected[0]['label']}",
            }

        except Exception as e:
            logger.error(f"❌ Error saving attribute: {e}")
            return {"success": False, "error": str(e), "next_action": "error"}

    @traceable(run_type="chain", name="mark_goal_complete")
    def mark_goal_complete(
        self, checkpoint_id: str, user_id: str, agent_id: str
    ) -> Dict[str, Any]:
        """Mark a goal as complete and return next goal info."""
        try:
            db = self._get_db()

            # Mark complete
            db.checkpoint_progress.update_one(
                {
                    "$or": [
                        {"checkpoint_id": checkpoint_id, "user_id": user_id},
                        {"_id": ObjectId(checkpoint_id)},
                    ]
                },
                {
                    "$set": {
                        "is_complete": True,
                        "completed_at": datetime.now(timezone.utc),
                    }
                },
            )

            # Get next goal
            next_goal = self.get_next_incomplete_goal(user_id, agent_id)

            if next_goal:
                return {
                    "success": True,
                    "all_goals_done": False,
                    "next_goal": next_goal,
                    "next_action": "start_next_goal",
                }

            return {
                "success": True,
                "all_goals_done": True,
                "next_goal": None,
                "next_action": "all_complete",
            }

        except Exception as e:
            logger.error(f"❌ Error marking complete: {e}")
            return {"success": False, "error": str(e)}


# Global goal manager
goal_manager = GoalManager()


# ==================== MCP TOOLS ====================

_mcp_tools_cache: Dict[str, Any] = {}
_mcp_client_cache: Dict[str, Any] = {}


async def get_mcp_tools(session_token: Optional[str] = None) -> Tuple[List, Dict, Any]:
    """
    Get MCP tools with caching.

    Returns:
        Tuple of (tools_list, successful_servers, mcp_client)
    """
    cache_key = "4NF2tmINbc1yJYRXqNL6a8cLtGQhXxrR" or "default"

    # Check cache
    if cache_key in _mcp_tools_cache:
        cached = _mcp_tools_cache[cache_key]
        if (datetime.now().timestamp() - cached["timestamp"]) < 300:
            return cached["tools"], cached["servers"], _mcp_client_cache.get(cache_key)

    # Build server configs
    server_configs = {}
    for name, config in MCP_SERVERS.items():
        cfg = config.copy()
        if session_token:
            cfg["headers"] = {"Authorization": session_token}
        server_configs[name] = cfg

    # Test connections in parallel
    successful_servers = {}
    all_tools = []

    async def test_server(name: str, cfg: dict):
        try:
            client = MultiServerMCPClient({name: cfg})
            tools = await asyncio.wait_for(client.get_tools(), timeout=3.0)
            return name, cfg, tools
        except Exception as e:
            logger.warning(f"⚠️ {name} connection failed: {e}")
            return name, None, []

    tasks = [test_server(name, cfg) for name, cfg in server_configs.items()]
    results = await asyncio.gather(*tasks)

    for name, cfg, tools in results:
        if cfg and tools:
            successful_servers[name] = cfg
            all_tools.extend(tools)
            logger.info(f"✅ {name}: {len(tools)} tools")

    # Create MCP client with successful servers
    mcp_client = None
    if successful_servers:
        mcp_client = MultiServerMCPClient(successful_servers)
        _mcp_client_cache[cache_key] = mcp_client

    # Cache results
    _mcp_tools_cache[cache_key] = {
        "tools": all_tools,
        "servers": successful_servers,
        "timestamp": datetime.now().timestamp(),
    }

    logger.info("🔧 MCP TOOLS AVAILABLE:")
    for t in all_tools:
        logger.info(f" - {t.name}")

    return all_tools, successful_servers, mcp_client


# ==================== CUSTOM TOOLS ====================


@tool
def save_checkpoint_attribute(
    checkpoint_id: str, attribute_label: str, value: str, user_id: str, agent_id: str
) -> str:
    """
    Save a collected attribute value for a checkpoint.

    Args:
        checkpoint_id: The checkpoint/goal ID
        attribute_label: The exact label of the attribute being saved
        value: The user's response/value
        user_id: The user's ID
        agent_id: The agent's ID

    Returns:
        JSON string with success status and next_action
    """
    result = goal_manager.save_attribute(
        checkpoint_id=checkpoint_id,
        attribute_label=attribute_label,
        value=value,
        user_id=user_id,
        agent_id=agent_id,
    )
    return json.dumps(result)


@tool
def mark_checkpoint_complete(checkpoint_id: str, user_id: str, agent_id: str) -> str:
    """
    Mark a checkpoint/goal as complete.

    Args:
        checkpoint_id: The checkpoint/goal ID to mark complete
        user_id: The user's ID
        agent_id: The agent's ID

    Returns:
        JSON string with success status and next goal info
    """
    result = goal_manager.mark_goal_complete(
        checkpoint_id=checkpoint_id, user_id=user_id, agent_id=agent_id
    )
    return json.dumps(result)


@tool
def get_next_checkpoint(user_id: str, agent_id: str) -> str:
    """
    Get the next incomplete checkpoint for the user.

    Args:
        user_id: The user's ID
        agent_id: The agent's ID

    Returns:
        JSON string with next checkpoint info or null
    """
    goal = goal_manager.get_next_incomplete_goal(user_id, agent_id)
    if goal:
        # Don't return full goal object, just essential info
        return json.dumps(
            {
                "checkpoint_id": goal.get("checkpoint_id", str(goal.get("_id"))),
                "checkpoint_name": goal.get("checkpoint_name"),
                "has_goal": True,
            }
        )
    return json.dumps({"has_goal": False})


# Built-in tools list
BUILTIN_TOOLS = [
    save_checkpoint_attribute,
    mark_checkpoint_complete,
    get_next_checkpoint,
]


# ==================== LLM FACTORY ====================


def create_llm(model_name: str, streaming: bool = True, temperature: float = 0.7):
    """Create LLM instance based on model name."""
    callbacks = [langsmith_tracer] if langsmith_tracer else []

    if model_name.startswith("gpt-"):
        return ChatOpenAI(
            model=model_name,
            temperature=temperature,
            streaming=streaming,
            callbacks=callbacks,
        )
    elif model_name.startswith("gemini-"):
        return ChatGoogleGenerativeAI(
            model=model_name,
            temperature=temperature,
            streaming=streaming,
            callbacks=callbacks,
        )
    else:
        return ChatOpenAI(
            model="gpt-4o",
            temperature=temperature,
            streaming=streaming,
            callbacks=callbacks,
        )


# ==================== WORKFLOW NODES ====================


@traceable(run_type="chain", name="initialize_workflow")
async def initialize_node(state: AgentState) -> Dict[str, Any]:
    """
    Initialize the workflow state.

    This node:
    1. Loads user's goals
    2. Sets up initial state
    3. Determines first goal to work on
    """
    logger.info("🚀 Initializing workflow...")

    user_id = state.get("user_id")
    agent_id = state.get("agent_id")

    # Load pending goals
    goals = goal_manager.get_user_goals(user_id, agent_id)

    if not goals:
        logger.info("✅ No pending goals - entering free chat mode")
        return {
            "workflow_phase": "completed",
            "all_goals_done": True,
            "goals_pending": [],
            "should_continue": True,
        }

    # Set first goal
    first_goal = goals[0]
    uncollected = goal_manager.get_uncollected_attributes(first_goal)

    logger.info(f"🎯 Starting goal: {first_goal.get('checkpoint_name')}")
    logger.info(f"📝 Uncollected attributes: {len(uncollected)}")

    return {
        "workflow_phase": "goal_active",
        "current_goal_id": first_goal.get("checkpoint_id", str(first_goal.get("_id"))),
        "current_goal_name": first_goal.get("checkpoint_name"),
        "current_goal_instructions": first_goal.get("additional_instructions", ""),
        "goals_pending": goals,
        "uncollected_attributes": uncollected,
        "current_attribute": uncollected[0] if uncollected else None,
        "all_goals_done": False,
        "should_continue": True,
        "turn_count": state.get("turn_count", 0),
    }


@traceable(run_type="chain", name="route_workflow")
async def router_node(state: AgentState) -> Dict[str, Any]:
    """
    Route to the appropriate workflow based on state.

    Determines whether to:
    - Continue with current goal
    - Move to next goal
    - Enter free chat mode
    """
    logger.info("🔄 Router evaluating state...")

    # Check if all goals complete
    if state.get("all_goals_done"):
        return {"workflow_phase": "completed", "should_continue": True}

    # Check if we need to load next goal
    user_id = state.get("user_id")
    agent_id = state.get("agent_id")

    # Refresh goals from DB
    goals = goal_manager.get_user_goals(user_id, agent_id)

    if not goals:
        return {
            "workflow_phase": "completed",
            "all_goals_done": True,
            "should_continue": True,
        }

    current_goal = goals[0]
    uncollected = goal_manager.get_uncollected_attributes(current_goal)

    return {
        "workflow_phase": "goal_active",
        "current_goal_id": current_goal.get(
            "checkpoint_id", str(current_goal.get("_id"))
        ),
        "current_goal_name": current_goal.get("checkpoint_name"),
        "current_goal_instructions": current_goal.get("additional_instructions", ""),
        "uncollected_attributes": uncollected,
        "current_attribute": uncollected[0] if uncollected else None,
        "goals_pending": goals,
        "should_continue": True,
    }


@traceable(run_type="llm", name="goal_execution")
async def goal_node(state: AgentState) -> Dict[str, Any]:
    """
    Execute the current goal's interaction.

    This node:
    1. Builds goal-specific prompt
    2. Gets LLM response with tools
    3. Handles attribute collection
    """
    logger.info(f"🎯 Executing goal: {state.get('current_goal_name')}")

    # Build goal-specific system prompt
    base_prompt = state.get("system_prompt", "")
    goal_name = state.get("current_goal_name", "")
    goal_instructions = state.get("current_goal_instructions", "")
    uncollected = state.get("uncollected_attributes", [])
    current_attr = state.get("current_attribute")
    user_id = state.get("user_id")
    agent_id = state.get("agent_id")
    checkpoint_id = state.get("current_goal_id")
    namespaces = state.get("namespaces", [])

    # Build comprehensive prompt
    goal_prompt = f"""{base_prompt}

CURRENT GOAL: {goal_name}
{f"CONTEXT: {goal_instructions}" if goal_instructions else ""}

NAMESPACES FOR SEARCH: {", ".join(namespaces)}
"""

    if uncollected:
        goal_prompt += f"""
ATTRIBUTES TO COLLECT (ONE AT A TIME):
"""
        for i, attr in enumerate(uncollected):
            status = "REQUIRED" if attr.get("required") else "OPTIONAL - can be skipped"
            goal_prompt += f"{i+1}. {attr['label']} ({status}): {attr.get('instructions', 'Ask for this information')}\n"

        goal_prompt += f"""
WORKFLOW INSTRUCTIONS:
1. Focus on collecting the FIRST uncollected attribute: "{uncollected[0]['label']}"

2.After the user provides information:

    1) Check whether previous goals are completed.

        If any previous required attribute is incomplete, retrieve it first.

        If an optional attribute was previously skipped, do not check it again.

    2) If the user wants to skip:

        If the attribute is optional (required = false) → skip and move to next

        If the attribute is required (required = true) → inform the user it cannot be skipped

    3) If the user provides information:

        Validate the data type

        If valid → call save_checkpoint_attribute

        If invalid → return a data-type error

    4) A required attribute must be completed with valid data before proceeding.

3. Check the tool response for 'next_action' and follow it
4. If all_collected is true, call mark_checkpoint_complete

TOOL PARAMETERS:
- save_checkpoint_attribute: checkpoint_id='{checkpoint_id}', attribute_label=<label>, value=<user's answer>, user_id='{user_id}', agent_id='{agent_id}'
- mark_checkpoint_complete: checkpoint_id='{checkpoint_id}', user_id='{user_id}', agent_id='{agent_id}'
"""
    else:
        goal_prompt += f"""
✅ All attributes collected for this goal!
Call mark_checkpoint_complete with: checkpoint_id='{checkpoint_id}', user_id='{user_id}', agent_id='{agent_id}'
"""

    # Get tools
    session_token = state.get("session_token")
    mcp_tools, _, _ = await get_mcp_tools(session_token)
    all_tools = BUILTIN_TOOLS + mcp_tools

    # Create LLM with tools
    model_name = state.get("ai_model", "gpt-4o")
    llm = create_llm(
        model_name=model_name,
        streaming=True,
        # temperature=0.0
    )
    llm_with_tools = llm.bind_tools(all_tools, tool_choice="auto")

    # Build messages with ROBUST cleaning
    messages = list(state.get("messages", []))
    cleaned_messages = clean_message_sequence(messages)

    full_messages = [SystemMessage(content=goal_prompt)] + cleaned_messages

    # Debug logging before LLM call
    logger.info("=== MESSAGE SEQUENCE CHECK (BEFORE LLM) ===")
    for i, msg in enumerate(full_messages):
        if isinstance(msg, AIMessage) and hasattr(msg, "tool_calls") and msg.tool_calls:
            logger.info(f"Message {i}: AIMessage with {len(msg.tool_calls)} tool_calls")
            for tc in msg.tool_calls:
                logger.info(f"  - tool_call_id: {tc['id']}")
        elif isinstance(msg, ToolMessage):
            logger.info(f"Message {i}: ToolMessage for tool_call_id={msg.tool_call_id}")
        else:
            msg_type = type(msg).__name__
            logger.info(f"Message {i}: {msg_type}")
    logger.info("=== END MESSAGE SEQUENCE ===")

    # Get response
    response = await llm_with_tools.ainvoke(full_messages)

    # Check for tool calls
    tools_used = state.get("tools_used", [])
    tool_outputs = state.get("tool_outputs", [])
    new_messages = []

    if response.tool_calls:
        logger.info(
            f"🔧 Tool calls detected: {[tc['name'] for tc in response.tool_calls]}"
        )

        # Add the AI response with tool calls to messages
        new_messages.append(response)

        # Execute tool calls and create ToolMessages
        for tool_call in response.tool_calls:
            tool_name = tool_call["name"]
            tool_args = tool_call["args"]
            tool_call_id = tool_call["id"]

            tools_used.append(tool_name)

            # Find and execute the tool
            tool_result = None
            for t in all_tools:
                if t.name == tool_name:
                    try:
                        # Check if tool supports async invocation
                        if hasattr(t, "ainvoke"):
                            tool_result = await t.ainvoke(tool_args)
                        else:
                            # Fallback to sync invoke wrapped in executor
                            import asyncio

                            loop = asyncio.get_event_loop()
                            tool_result = await loop.run_in_executor(
                                None, t.invoke, tool_args
                            )
                    except Exception as e:
                        logger.error(f"Tool {tool_name} error: {e}")
                        tool_result = json.dumps({"error": str(e)})
                    break

            if tool_result is None:
                tool_result = json.dumps({"error": f"Tool {tool_name} not found"})

            # Create ToolMessage with the result
            tool_message = ToolMessage(
                content=tool_result, tool_call_id=tool_call_id, name=tool_name
            )
            new_messages.append(tool_message)

            tool_outputs.append(
                {"tool": tool_name, "args": tool_args, "result": tool_result}
            )

        # Parse results to determine next action
        for tool_output in tool_outputs:
            try:
                result_data = json.loads(tool_output["result"])
                tool_name = tool_output["tool"]
                # Handle both save and skip operations
                if tool_name in [
                    "save_checkpoint_attribute",
                    "skip_checkpoint_attribute",
                ]:
                    if result_data.get("all_collected"):
                        action = (
                            "saved"
                            if tool_name == "save_checkpoint_attribute"
                            else "skipped"
                        )
                        completion_msg = AIMessage(
                            content=f"Great! I've {action} that. Finalizing this part..."
                        )
                        new_messages.append(completion_msg)
                        # Need to mark complete
                        return {
                            "messages": new_messages,
                            "tools_used": tools_used,
                            "tool_outputs": tool_outputs,
                            "next_action": "mark_complete",
                            "workflow_phase": "tool_call",
                            "should_continue": True,
                        }
                    elif result_data.get("next_attribute"):
                        # More attributes to collect
                        next_attr = result_data["next_attribute"]
                        action = (
                            "saved"
                            if tool_name == "save_checkpoint_attribute"
                            else "skipped"
                        )
                        status = "required" if next_attr.get("required") else "optional"
                        continue_msg = AIMessage(
                            content=f"Got it! I've {action} that information. "
                            f"Next, I need to ask about: {next_attr['label']} ({status})"
                        )
                        new_messages.append(continue_msg)
                        return {
                            "messages": new_messages,
                            "tools_used": tools_used,
                            "tool_outputs": tool_outputs,
                            "current_attribute": next_attr,
                            "uncollected_attributes": result_data.get(
                                "remaining_attributes", []
                            ),
                            "workflow_phase": "goal_active",
                            "should_continue": True,
                        }

                elif tool_name == "mark_checkpoint_complete":
                    if result_data.get("all_goals_done"):
                        done_msg = AIMessage(
                            content="🎉 All goals are complete! Let me know if you want to start something new."
                        )
                        new_messages.append(done_msg)
                        return {
                            "messages": new_messages,
                            "tools_used": tools_used,
                            "tool_outputs": tool_outputs,
                            "all_goals_done": True,
                            "workflow_phase": "completed",
                            "should_continue": True,
                        }
                    elif result_data.get("next_goal"):
                        # Move to next goal
                        next_goal = result_data["next_goal"]
                        uncollected = goal_manager.get_uncollected_attributes(next_goal)
                        next_msg = AIMessage(
                            content=f"Great! Moving on to the next step: {next_goal.get('checkpoint_name')}."
                        )
                        new_messages.append(next_msg)
                        return {
                            "messages": new_messages,
                            "tools_used": tools_used,
                            "tool_outputs": tool_outputs,
                            "current_goal_id": next_goal.get("checkpoint_id"),
                            "current_goal_name": next_goal.get("checkpoint_name"),
                            "current_goal_instructions": next_goal.get(
                                "additional_instructions", ""
                            ),
                            "uncollected_attributes": uncollected,
                            "current_attribute": (
                                uncollected[0] if uncollected else None
                            ),
                            "workflow_phase": "goal_active",
                            "should_continue": True,
                        }

            except json.JSONDecodeError:
                pass

        # If we get here, tool calls were executed but no special handling needed
        return {
            "messages": new_messages,
            "tools_used": tools_used,
            "tool_outputs": tool_outputs,
            "workflow_phase": "goal_active",
            "should_continue": True,
            "turn_count": state.get("turn_count", 0) + 1,
        }

    # No tool calls - just a regular response
    return {
        "messages": [response],
        "final_response": response.content,
        "tools_used": tools_used,
        "tool_outputs": tool_outputs,
        "workflow_phase": "goal_active",
        "should_continue": True,
        "turn_count": state.get("turn_count", 0) + 1,
    }


def clean_message_sequence(messages: List[BaseMessage]) -> List[BaseMessage]:
    """
    Robustly clean message sequence to ensure OpenAI API compatibility.

    Rules:
    1. Every AIMessage with tool_calls MUST be followed by ToolMessage(s)
    2. Every ToolMessage must reference a valid tool_call_id from a previous AIMessage
    3. Remove orphaned AIMessages with tool_calls
    4. Remove orphaned ToolMessages
    5. Maintain conversation flow

    Args:
        messages: Raw message list

    Returns:
        Cleaned message list safe for OpenAI API
    """
    if not messages:
        return []

    cleaned = []
    pending_tool_calls = {}  # Map tool_call_id -> AIMessage index

    for i, msg in enumerate(messages):
        if isinstance(msg, AIMessage):
            if msg.tool_calls:
                # This AIMessage expects tool responses
                # Track all tool_call_ids
                expected_ids = {tc["id"] for tc in msg.tool_calls}

                # Look ahead to find corresponding ToolMessages
                found_ids = set()
                j = i + 1
                while j < len(messages):
                    next_msg = messages[j]
                    if isinstance(next_msg, ToolMessage):
                        if next_msg.tool_call_id in expected_ids:
                            found_ids.add(next_msg.tool_call_id)
                        j += 1
                    elif isinstance(next_msg, (AIMessage, HumanMessage)):
                        # Stop looking when we hit another conversational message
                        break
                    else:
                        j += 1

                # Only include this AIMessage if ALL tool calls have responses
                if found_ids == expected_ids:
                    cleaned.append(msg)
                    # Track these tool_call_ids as valid
                    for tool_call_id in expected_ids:
                        pending_tool_calls[tool_call_id] = len(cleaned) - 1
                else:
                    logger.warning(
                        f"⚠️ Removing AIMessage with incomplete tool calls. "
                        f"Expected: {expected_ids}, Found: {found_ids}"
                    )
            else:
                # Regular AIMessage without tool calls - always include
                cleaned.append(msg)

        elif isinstance(msg, ToolMessage):
            # Only include ToolMessage if it references a valid tool_call_id
            if msg.tool_call_id in pending_tool_calls:
                cleaned.append(msg)
                # Remove from pending after use
                del pending_tool_calls[msg.tool_call_id]
            else:
                logger.warning(
                    f"⚠️ Removing orphaned ToolMessage with tool_call_id: {msg.tool_call_id}"
                )

        else:
            # HumanMessage, SystemMessage, etc. - always include
            cleaned.append(msg)

    # Final validation: check for any remaining pending tool calls
    if pending_tool_calls:
        logger.warning(
            f"⚠️ Cleaning pass left {len(pending_tool_calls)} unresolved tool calls"
        )
        # Remove AIMessages that still have unresolved tool calls
        final_cleaned = []
        for msg in cleaned:
            if isinstance(msg, AIMessage) and msg.tool_calls:
                # Check if any tool_call_id is still pending
                has_unresolved = any(
                    tc["id"] in pending_tool_calls for tc in msg.tool_calls
                )
                if not has_unresolved:
                    final_cleaned.append(msg)
                else:
                    logger.warning("⚠️ Removing AIMessage in final cleanup pass")
            else:
                final_cleaned.append(msg)

        return final_cleaned

    return cleaned


# def is_followup(chat_history: List, current: str) -> bool:
#     """
#     Determine if the current query requires previous conversation history
#     by comparing meaningful word overlap.

#     Args:
#         chat_history: List of previous messages (HumanMessage, AIMessage)
#         current: Current user query

#     Returns:
#         bool: True if history needed, False for new independent query
#     """
#     if not current or not chat_history:
#         return False

#     curr_lower = current.lower().strip()

#     # Words to exclude from comparison
#     stop_words = {
#         "a",
#         "an",
#         "the",
#         "is",
#         "are",
#         "was",
#         "were",
#         "be",
#         "been",
#         "being",
#         "am",
#         "i",
#         "you",
#         "he",
#         "she",
#         "it",
#         "we",
#         "they",
#         "me",
#         "him",
#         "her",
#         "us",
#         "them",
#         "my",
#         "your",
#         "his",
#         "her",
#         "its",
#         "our",
#         "their",
#         "can",
#         "could",
#         "would",
#         "will",
#         "shall",
#         "should",
#         "may",
#         "might",
#         "must",
#         "do",
#         "does",
#         "did",
#         "have",
#         "has",
#         "had",
#         "having",
#         "in",
#         "on",
#         "at",
#         "to",
#         "for",
#         "of",
#         "with",
#         "about",
#         "from",
#         "by",
#         "as",
#         "into",
#         "through",
#         "during",
#         "before",
#         "after",
#         "above",
#         "below",
#         "between",
#         "under",
#         "again",
#         "further",
#         "then",
#         "once",
#         "please",
#         "help",
#         "tell",
#         "give",
#         "show",
#         "explain",
#         "describe",
#         "make",
#         "know",
#         "think",
#         "see",
#         "want",
#         "use",
#         "find",
#         "get",
#         "go",
#         "come",
#         "take",
#         "bring",
#         "put",
#         "look",
#         "feel",
#         "seem",
#         "become",
#         "and",
#         "or",
#         "but",
#         "if",
#         "so",
#         "than",
#         "such",
#         "both",
#         "either",
#         "neither",
#         "because",
#         "while",
#         "where",
#         "when",
#         "why",
#         "how",
#         "what",
#         "which",
#         "who",
#         "whom",
#         "whose",
#         "that",
#         "this",
#         "these",
#         "those",
#     }

#     # Extract meaningful words from current query
#     curr_words = {
#         w.strip(".,!?;:")
#         for w in curr_lower.split()
#         if w not in stop_words and len(w) > 2
#     }

#     if not curr_words:
#         return False

#     # Extract meaningful words from entire history
#     history_words = set()
#     for msg in chat_history:
#         content = msg.content.lower() if hasattr(msg, "content") else str(msg).lower()
#         words = {
#             w.strip(".,!?;:")
#             for w in content.split()
#             if w not in stop_words and len(w) > 2
#         }
#         history_words.update(words)

#     if not history_words:
#         return False

#     overlap = curr_words.intersection(history_words)
#     overlap_ratio = len(overlap) / len(curr_words)

#     # Decision: Use history if 50%+ overlap OR 3+ matching words
#     return overlap_ratio >= 0.5 or len(overlap) >= 3


def is_followup(chat_history: List, current: str) -> bool:
    """
    Determine if the current query requires previous conversation history
    by checking for explicit references and context dependencies.

    Args:
        chat_history: List of previous messages (HumanMessage, AIMessage)
        current: Current user query

    Returns:
        bool: True if history needed, False for new independent query
    """
    if not current or not chat_history:
        return False

    curr_lower = current.lower().strip()

    # Explicit reference words that indicate follow-up
    reference_patterns = [
        r"\bit\b",
        r"\bthat\b",
        r"\bthis\b",
        r"\bthose\b",
        r"\bthese\b",
        r"\bthem\b",
        r"\btheir\b",
        r"\bthey\b",
        r"\bprevious\b",
        r"\bbefore\b",
        r"\bearlier\b",
        r"\babove\b",
        r"\blast\b",
        r"\bfirst\b",
        r"\bsecond\b",
        r"\bmore\b",
        r"\balso\b",
        r"\badditionally\b",
        r"\bfurther\b",
        r"\bwhat about\b",
        r"\bhow about\b",
        r"\bcan you also\b",
        r"\bopen it\b",
        r"\bshow me\b",
        r"\btell me more\b",
        r"\byes\b",
        r"\bno\b",
        r"\bokay\b",
        r"\bsure\b",
        r"\bcontinue\b",
        r"\bgo on\b",
        r"\bkeep going\b",
    ]

    # Check for explicit reference patterns
    import re

    for pattern in reference_patterns:
        if re.search(pattern, curr_lower):
            return True

    # Check if query is very short (likely a follow-up response)
    words = curr_lower.split()
    if len(words) <= 3 and any(
        w in ["yes", "no", "okay", "sure", "please", "thanks"] for w in words
    ):
        return True

    # If query contains a clear action verb + complete object, it's likely independent
    # Examples: "draft an email", "search for", "create a", "send to"
    action_patterns = [
        r"\bdraft\s+\w+",
        r"\bsearch\s+\w+",
        r"\bcreate\s+\w+",
        r"\bsend\s+to\b",
        r"\bwrite\s+\w+",
        r"\bfind\s+\w+",
        r"\bget\s+\w+",
        r"\bshow\s+me\b",
        r"\blist\s+\w+",
    ]

    for pattern in action_patterns:
        if re.search(pattern, curr_lower):
            # This is a complete command - likely independent
            # Only use history if there are also reference words
            has_reference = any(
                re.search(ref, curr_lower) for ref in reference_patterns[:8]
            )
            return has_reference

    # Default to independent for queries with specific subjects/objects
    # (e.g., contains email addresses, specific names, clear instructions)
    if "@" in current or len(words) > 8:
        return False

    return False


@traceable(run_type="llm", name="free_chat")
async def chat_node(state: AgentState) -> Dict[str, Any]:
    """
    Handle free chat when no goals are active.
    """

    logger.info("💬 Entering free chat mode")

    # Extract state
    system_prompt = state.get("system_prompt", "You are a helpful assistant.")
    namespaces = state.get("namespaces", [])
    session_token = state.get("session_token")
    model_name = state.get("ai_model", "gpt-4o")

    if namespaces:
        system_prompt += f"\n\nAvailable namespaces for search: {', '.join(namespaces)}"

    logger.info(f"🤖 Using model: {model_name}")

    # Get tools
    mcp_tools, _, _ = await get_mcp_tools(session_token)
    all_tools = BUILTIN_TOOLS + mcp_tools
    logger.info(f"🔧 Available tools: {len(all_tools)}")

    # Create LLM with streaming enabled
    llm = create_llm(model_name, streaming=True)

    if all_tools:
        llm = llm.bind_tools(all_tools, tool_choice="auto")

    # Build and clean messages
    messages = list(state.get("messages", []))
    cleaned_messages = clean_message_sequence(messages)
    full_messages = [SystemMessage(content=system_prompt)] + cleaned_messages

    logger.info(f"📨 Processing {len(full_messages)} messages")

    # Debug logging before LLM call
    logger.info("=== MESSAGE SEQUENCE CHECK (CHAT NODE) ===")
    for i, msg in enumerate(full_messages):
        if isinstance(msg, AIMessage) and hasattr(msg, "tool_calls") and msg.tool_calls:
            logger.info(f"Message {i}: AIMessage with {len(msg.tool_calls)} tool_calls")
            for tc in msg.tool_calls:
                logger.info(f"  - tool_call_id: {tc['id']}")
        elif isinstance(msg, ToolMessage):
            logger.info(f"Message {i}: ToolMessage for tool_call_id={msg.tool_call_id}")
        else:
            msg_type = type(msg).__name__
            logger.info(f"Message {i}: {msg_type}")

    try:
        # Get LLM response
        response = await llm.ainvoke(full_messages)
        logger.info(
            f"✅ Response received: {len(response.content) if response.content else 0} chars"
        )

        new_messages = []
        tools_used = state.get("tools_used", [])
        tool_outputs = state.get("tool_outputs", [])

        # Handle tool calls
        if hasattr(response, "tool_calls") and response.tool_calls:
            logger.info(f"🔧 Processing {len(response.tool_calls)} tool calls")

            # CRITICAL: Add AI response with tool calls FIRST
            new_messages.append(response)

            # Execute tools
            for tool_call in response.tool_calls:
                tool_name = tool_call["name"]
                tool_args = tool_call["args"]
                tool_call_id = tool_call["id"]

                tools_used.append(tool_name)

                tool_result = None
                for t in all_tools:
                    if t.name == tool_name:
                        try:
                            # Check if tool supports async invocation
                            if hasattr(t, "ainvoke"):
                                tool_result = await t.ainvoke(tool_args)
                            else:
                                # Fallback to sync invoke wrapped in executor
                                import asyncio

                                loop = asyncio.get_event_loop()
                                tool_result = await loop.run_in_executor(
                                    None, t.invoke, tool_args
                                )
                        except Exception as e:
                            logger.error(f"❌ Tool {tool_name} error: {e}")
                            tool_result = json.dumps({"error": str(e)})
                        break

                if tool_result is None:
                    tool_result = json.dumps({"error": f"Tool {tool_name} not found"})

                # Create ToolMessage IMMEDIATELY
                tool_message = ToolMessage(
                    content=tool_result, tool_call_id=tool_call_id, name=tool_name
                )
                new_messages.append(tool_message)
                tool_outputs.append(
                    {"tool": tool_name, "args": tool_args, "result": tool_result}
                )

            # Get final response after tools
            logger.info("🔄 Getting final response after tools...")

            # CRITICAL: Clean the message sequence before making another LLM call
            full_messages_with_tools = full_messages + new_messages
            cleaned_full_messages = clean_message_sequence(full_messages_with_tools)

            # Debug logging before second LLM call
            logger.info("=== MESSAGE SEQUENCE CHECK (AFTER TOOLS) ===")
            for i, msg in enumerate(cleaned_full_messages):
                if (
                    isinstance(msg, AIMessage)
                    and hasattr(msg, "tool_calls")
                    and msg.tool_calls
                ):
                    logger.info(
                        f"Message {i}: AIMessage with {len(msg.tool_calls)} tool_calls"
                    )
                    for tc in msg.tool_calls:
                        logger.info(f"  - tool_call_id: {tc['id']}")
                elif isinstance(msg, ToolMessage):
                    logger.info(
                        f"Message {i}: ToolMessage for tool_call_id={msg.tool_call_id}"
                    )
                else:
                    msg_type = type(msg).__name__
                    logger.info(f"Message {i}: {msg_type}")
            logger.info("=== END MESSAGE SEQUENCE ===")

            final_response = await llm.ainvoke(cleaned_full_messages)
            new_messages.append(final_response)

            logger.info(f"✅ Final: {final_response.content[:100]}...")

            return {
                "messages": new_messages,
                "final_response": final_response.content,
                "tools_used": tools_used,
                "tool_outputs": tool_outputs,
                "workflow_phase": "completed",
                "should_continue": False,
                "turn_count": state.get("turn_count", 0) + 1,
            }

        # No tool calls
        logger.info(f"💬 Direct response: {response.content[:100]}...")

        return {
            "messages": [response],
            "final_response": response.content,
            "tools_used": tools_used,
            "tool_outputs": tool_outputs,
            "workflow_phase": "completed",
            "should_continue": False,
            "turn_count": state.get("turn_count", 0) + 1,
        }

    except Exception as e:
        logger.error(f"❌ Chat node error: {e}")
        import traceback

        traceback.print_exc()

        error_msg = AIMessage(
            content="I apologize, but I encountered an error. Please try again."
        )
        return {
            "messages": [error_msg],
            "final_response": error_msg.content,
            "workflow_phase": "completed",
            "should_continue": False,
            "turn_count": state.get("turn_count", 0) + 1,
        }


# ==================== ROUTING LOGIC ====================


def route_after_init(state: AgentState) -> str:
    """Route after initialization."""
    if state.get("all_goals_done"):
        return "chat"
    return "goal"


def route_after_goal(state: AgentState) -> str:
    """Route after goal execution."""
    if state.get("all_goals_done"):
        return "chat"

    # Check if we need to continue in goal or done for this turn
    phase = state.get("workflow_phase")

    if phase == "completed":
        return END

    if phase == "tool_call":
        return "router"

    return END


def should_continue(state: AgentState) -> str:
    """Determine if workflow should continue."""
    if not state.get("should_continue", True):
        return END

    phase = state.get("workflow_phase")

    if phase == "completed":
        return END

    return "router"


# ==================== GRAPH CONSTRUCTION ====================


def create_workflow_graph() -> StateGraph:
    """
    Create the main workflow graph.

    Graph Structure:

    START
      │
      ▼
    ┌─────────┐
    │  init   │
    └────┬────┘
         │
         ├──────────────┐
         ▼              ▼
    ┌─────────┐    ┌─────────┐
    │  goal   │    │  chat   │
    └────┬────┘    └────┬────┘
         │              │
         ▼              │
    ┌─────────┐         │
    │ router  │         │
    └────┬────┘         │
         │              │
         └──────────────┘
                │
                ▼
              END
    """

    workflow = StateGraph(AgentState)

    # Add nodes
    workflow.add_node("init", initialize_node)
    workflow.add_node("goal", goal_node)
    workflow.add_node("chat", chat_node)
    workflow.add_node("router", router_node)

    # Set entry point
    workflow.set_entry_point("init")

    # Add edges from init
    workflow.add_conditional_edges(
        "init", route_after_init, {"goal": "goal", "chat": "chat"}
    )

    # Add edges from goal
    workflow.add_conditional_edges(
        "goal", route_after_goal, {"router": "router", "chat": "chat", END: END}
    )

    # Add edges from router
    workflow.add_conditional_edges(
        "router", route_after_init, {"goal": "goal", "chat": "chat"}
    )

    # Chat always ends
    workflow.add_edge("chat", END)

    return workflow


# ==================== CHECKPOINTER ====================

_checkpointer = None


async def get_checkpointer():
    """Get or create the checkpoint saver."""
    global _checkpointer

    if _checkpointer is not None:
        return _checkpointer

    postgres_uri = os.getenv("CHECKPOINT_POSTGRES_URI")

    if postgres_uri:
        try:
            ctx = AsyncPostgresSaver.from_conn_string(postgres_uri)
            saver = await ctx.__aenter__()
            await saver.setup()
            _checkpointer = saver
            _checkpointer._ctx = ctx

            logger.info("✅ PostgreSQL checkpointer initialized")
        except Exception as e:
            logger.warning(f"⚠️ PostgreSQL failed: {e}, using memory")
            _checkpointer = MemorySaver()
    else:
        logger.info("📝 Using in-memory checkpointer")
        _checkpointer = MemorySaver()

    return _checkpointer


# ==================== COMPILED GRAPH CACHE ====================

_compiled_graph = None


async def get_compiled_graph():
    """Get or create compiled graph with checkpointer."""
    global _compiled_graph

    if _compiled_graph is not None:
        return _compiled_graph

    checkpointer = await get_checkpointer()
    workflow = create_workflow_graph()
    _compiled_graph = workflow.compile(checkpointer=checkpointer)

    logger.info("✅ Workflow graph compiled")
    return _compiled_graph


# ==================== CACHE INVALIDATION ====================


def invalidate_workflow_cache():
    """Invalidate the compiled graph cache."""
    global _compiled_graph
    _compiled_graph = None
    logger.info("🔄 Workflow cache invalidated")


def on_goals_changed(user_id: str, agent_id: str):
    """
    Call this when goals change.
    Currently invalidates global cache.

    Args:
        user_id: User identifier
        agent_id: Agent identifier

    For per-user caching, extend this function.
    """
    invalidate_workflow_cache()
    logger.info(f"🔄 Goals changed for user={user_id}, agent={agent_id}")


# ==================== MAIN EXECUTION ====================


@traceable(run_type="chain", name="run_agent")
async def run_agent(
    request: QueryRequest,
    user_id: str,
    agent_id: str,
    session_token: Optional[str] = None,
    wallet: Optional[str] = None,
    thread_id: Optional[str] = None,
    chat_history: List[ChatMessage] = None,
) -> Dict[str, Any]:
    """
    Execute the workflow agent.

    Args:
        request: Query request
        user_id: User ID
        agent_id: Agent ID (the AI bot identifier)
        session_token: Auth token
        wallet: User's wallet
        thread_id: Thread ID for checkpoint resumption
        chat_history: Previous chat messages

    Returns:
        Dict with response and metadata
    """
    start_time = datetime.now().timestamp()

    # Get compiled graph
    graph = await get_compiled_graph()

    # Build messages from history
    messages = []

    # Load from MongoDB if no history provided
    if not chat_history:
        messages = history_manager.load_history(user_id, agent_id)
    else:
        for msg in chat_history:
            if msg.role == "user":
                messages.append(HumanMessage(content=msg.content))
            elif msg.role == "assistant":
                messages.append(AIMessage(content=msg.content))

    # Add current query
    messages.append(HumanMessage(content=request.query))

    # Build initial state
    initial_state: AgentState = {
        "messages": messages,
        "user_id": user_id,
        "agent_id": agent_id,
        "session_token": session_token,
        "wallet": wallet,
        "current_goal_id": None,
        "current_goal_name": None,
        "current_goal_instructions": None,
        "goals_completed": [],
        "goals_pending": [],
        "all_goals_done": False,
        "current_attribute": None,
        "collected_attributes": {},
        "uncollected_attributes": [],
        "workflow_phase": "init",
        "next_action": None,
        "should_continue": True,
        "namespaces": request.namespaces or [],
        "system_prompt": request.instructions or request.system_prompt or "",
        "original_query": request.query,
        "ai_model": request.aiModel or "gpt-4o",
        "final_response": None,
        "tool_outputs": [],
        "tools_used": [],
        "thread_id": thread_id or f"{user_id}_{agent_id}_{int(start_time)}",
        "execution_start": start_time,
        "turn_count": 0,
    }

    # Generate thread_id if not provided
    if not thread_id:
        thread_id = f"{user_id}_{agent_id}_{int(start_time)}"

    config = {"configurable": {"thread_id": thread_id}}

    try:
        # Execute graph
        result = await graph.ainvoke(initial_state, config=config)

        execution_time = datetime.now().timestamp() - start_time

        return {
            "success": True,
            "response": result.get("final_response", ""),
            "current_goal": result.get("current_goal_name"),
            "all_goals_done": result.get("all_goals_done", False),
            "tools_used": result.get("tools_used", []),
            "thread_id": thread_id,
            "execution_time": execution_time,
            "turn_count": result.get("turn_count", 0),
        }

    except Exception as e:
        logger.error(f"❌ Agent execution failed: {e}")
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


async def run_agent_streaming(
    request: QueryRequest,
    user_id: str,
    agent_id: str,
    bot_id: str,
    session_token: Optional[str] = None,
    wallet: Optional[str] = None,
    thread_id: Optional[str] = None,
    chat_history: List[ChatMessage] = None,
):
    """
    You are an AI assistant that supports streaming responses, slot-filling workflows,and conversation checkpointing.

    Your primary responsibility is to accurately understand the user’s CURRENT intent
    and continue any ACTIVE task seamlessly, using prior conversation context silently
    when required.

    ================================
    CORE PRINCIPLE
    ================================

    Conversation history is SILENT CONTEXT.
    It exists ONLY to maintain task continuity and resolve intent.
    It must NEVER be narrated, summarized, or exposed.

    ================================
    TASK & SLOT CONTINUITY (CRITICAL)
    ================================

    If the user is in the middle of a multi-step task (e.g., event creation,
    form filling, configuration, setup):

    - Treat the task as ACTIVE until it is completed or explicitly canceled.
    - Persist previously provided fields (slots) internally.
    - NEVER discard already collected information unless the user corrects it.
    - NEVER re-ask for values that are already provided and valid.

    Example slots:
    - Event title
    - Date
    - Start time
    - End time
    - Timezone
    - Attendees
    - Location

    ================================
    SLOT-FILLING RULES
    ================================

    When the user provides partial input:

    - Map the input to the most relevant missing slot.
    - Acknowledge the value briefly (optional).
    - Continue by asking ONLY for the remaining missing slots.
    - Do NOT restart the task.
    - Do NOT question already stored values.

    If a slot is ambiguous:
    - Ask ONE precise clarification question.
    - Do not mention previous steps or failures.

    ================================
    INTENT RESOLUTION
    ================================

    Determine what the user wants to do NOW:

    - If input is short or fragmentary, treat it as a continuation.
    - If input matches a missing slot, fill it automatically.
    - If input modifies a previous value, update it silently.

    Do NOT assume the user wants a recap unless explicitly requested.

    ================================
    HISTORY LOADING POLICY
    ================================

    Use prior conversation context ONLY to:
    - Maintain active task continuity
    - Resolve references (e.g., “same”, “that one”, “use this”)
    - Infer missing parameters
    - Continue slot-filling workflows

    Do NOT use history to:
    - Explain how the system arrived here
    - Justify earlier actions
    - Describe previous turns
    - Output a timeline

    ================================
    OUTPUT ISOLATION RULE
    ================================

    Respond ONLY to the current task state.

    - One task → one step → one response
    - Do not mention retries, restarts, or earlier mistakes
    - Response must make sense in isolation

    ================================
    ERROR & INTERRUPTION HANDLING
    ================================

    If the task cannot proceed:
    - State the problem briefly
    - Ask ONE precise question

    If the user changes intent:
    - Gracefully abandon the previous task
    - Switch to the new intent without explanation

    ================================
    STREAMING BEHAVIOR
    ================================

    - Stream only information relevant to the current step
    - Stop streaming once the current requirement is satisfied

    ================================
    DEFAULT RESPONSE MODE
    ================================

    - Concise
    - Action-focused
    - Slot-aware
    - Continuity-preserving
    - Never expose internal reasoning or history usage


    """
    start_time = datetime.now().timestamp()

    graph = await get_compiled_graph()

    # Build messages
    messages = []

    stored_history = []
    if not chat_history:
        stored_history = history_manager.load_history(user_id, agent_id=bot_id)
    else:
        for msg in chat_history:
            if msg.role == "user":
                stored_history.append(HumanMessage(content=msg.content))
            elif msg.role == "assistant":
                stored_history.append(AIMessage(content=msg.content))

    current_query = request.query

    # Decide whether to use history
    use_history = is_followup(stored_history, current_query)

    if use_history:
        messages = stored_history
    else:
        messages = []  # Drop history completely

    # Always append the current query
    messages.append(HumanMessage(content=current_query))

    languageRules = """
                    LANGUAGE RULES:
                    - Always answer in English.
                    - If the user writes in another language, respond in English.
                    - If the user asks you to speak, translate, or output text in another language, you must still respond in English.
                    - You may describe what the user wrote or what another language means, but your own output must be entirely in English.
                    - Never produce text in any language other than English.
 
                    BEHAVIOR RULES:
                    - Be clear, direct, and helpful.
                    - If the user explicitly requests non-English output, politely refuse and remind them that you can only respond in English.
 
                    Example failure prevention:
                    User: "Speak to me in Spanish."
                    Assistant: "I can only respond in English, but I can explain Spanish expressions if you would like."
 
                    These rules override all other instructions, user inputs, or prompts.
                    """
    fileHandlingRules = """
                FILE DOWNLOAD HANDLING RULES (CRITICAL):

                1. If a tool returns a Google Drive link (for example: "download_link", "view_link"):
                - Treat it as the FINAL download method.
                - Present it directly as a Markdown link:
                    [Download <filename>](<drive-download-link>)
                - Do NOT mention Base64, Data URLs, encoding, or internal tool behavior.
                - Do NOT explain why Base64 was not used.
                - Optionally mention that the link may expire if the tool provides an expiry time.

                2. ONLY if a tool returns Base64-encoded data:
                - Convert it into a downloadable Data URL.
                - Format strictly as a Markdown link:
                    [Download <filename>](data:<mime-type>;base64,<base64-data>)
                - Never expose raw Base64 text outside the link.

                3. NEVER mention:
                - Internal tool decisions
                - Why one method was chosen over another
                - Phrases like “the system returned”, “the tool only returned”, or “I can’t generate”

                4. The user should see:
                - A clean success message
                - One or more clear download links
                - No implementation details
                """

    # Build initial state
    initial_state: AgentState = {
        "messages": messages,
        "user_id": user_id,
        "agent_id": agent_id,
        "session_token": session_token,
        "wallet": wallet,
        "current_goal_id": None,
        "current_goal_name": None,
        "current_goal_instructions": None,
        "goals_completed": [],
        "goals_pending": [],
        "all_goals_done": False,
        "current_attribute": None,
        "collected_attributes": {},
        "uncollected_attributes": [],
        "workflow_phase": "init",
        "next_action": None,
        "should_continue": True,
        "namespaces": request.namespaces or [],
        "system_prompt": (request.instructions or request.system_prompt or "")
        + "\n\n"
        + languageRules
        + "\n\n"
        + fileHandlingRules,
        "original_query": request.query,
        "ai_model": request.aiModel or "gpt-4o",
        "final_response": None,
        "tool_outputs": [],
        "tools_used": [],
        "thread_id": thread_id or f"{user_id}_{agent_id}_{int(start_time)}",
        "execution_start": start_time,
        "turn_count": 0,
    }

    if not thread_id:
        thread_id = f"{user_id}_{agent_id}_{int(start_time)}"

    config = {"configurable": {"thread_id": thread_id}}

    has_streamed = False

    try:
        async for event in graph.astream_events(
            initial_state, config=config, version="v2"
        ):
            event_type = event["event"]

            # Stream LLM tokens as they're generated
            if event_type == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                if hasattr(chunk, "content") and chunk.content:
                    has_streamed = True
                    yield chunk

            # Log tool events
            elif event_type == "on_tool_start":
                logger.info(f"🔧 Tool started: {event['name']}")
            elif event_type == "on_tool_end":
                logger.info(f"✅ Tool completed: {event['name']}")

        # If nothing was streamed (shouldn't happen, but safety check)
        if not has_streamed:
            logger.warning("⚠️ No content was streamed from LLM")
            # Execute the graph normally to get final state
            final_state = await graph.ainvoke(initial_state, config=config)
            response_content = final_state.get("final_response", "I'm ready to help!")
            yield AIMessageChunk(content=response_content)

    except Exception as e:
        logger.error(f"❌ Streaming error: {e}")
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ==================== BACKWARD COMPATIBILITY ====================


async def initialize_react_agent(*args, **kwargs):
    """Backward compatibility wrapper."""
    return await get_compiled_graph()


def construct_messages(request: QueryRequest) -> List[BaseMessage]:
    """Build messages from request."""
    messages = []

    system_prompt = request.instructions or request.system_prompt
    if system_prompt:
        messages.append(SystemMessage(content=system_prompt))

    chat_history = request.chatHistory or request.userHistory
    if chat_history:
        for msg in chat_history:
            if msg.role == "user":
                messages.append(HumanMessage(content=msg.content))
            elif msg.role == "assistant":
                messages.append(AIMessage(content=msg.content))

    messages.append(HumanMessage(content=request.query))
    return messages


def get_available_tools() -> List:
    """Get available tools."""
    for cache in _mcp_tools_cache.values():
        return cache.get("tools", []) + BUILTIN_TOOLS
    return BUILTIN_TOOLS


def is_agent_ready() -> bool:
    """Check if agent is ready."""
    return _compiled_graph is not None


async def health_check_servers() -> Dict[str, str]:
    """Check server health."""
    tools, servers, _ = await get_mcp_tools()
    return {name: "healthy" for name in servers.keys()}


def clear_agent_cache():
    """Clear all caches."""
    global _compiled_graph, _mcp_tools_cache, _mcp_client_cache
    _compiled_graph = None
    _mcp_tools_cache.clear()
    _mcp_client_cache.clear()
    logger.info("🗑️ All caches cleared")
