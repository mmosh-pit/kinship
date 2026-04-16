"""
Kinship Agent - Worker Agent System

This module implements Worker Agents that execute specific tasks
under the direction of Supervisor (Presence) agents.

Workers can:
- Connect to external tools (Twitter, Telegram, etc.)
- Execute specific actions
- Return structured results
"""

from typing import Optional, List, Dict, Any
from datetime import datetime

from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.tools import Tool

from app.core.llm import get_llm, normalize_content
from app.db.models import Agent, AgentType


# ─────────────────────────────────────────────────────────────────────────────
# Tool Definitions
# ─────────────────────────────────────────────────────────────────────────────


# Registry of available tools
TOOL_REGISTRY: Dict[str, Dict[str, Any]] = {
    "twitter": {
        "id": "twitter",
        "name": "X (Twitter)",
        "description": "Post tweets, reply, and engage on X/Twitter",
        "actions": ["post_tweet", "reply_tweet", "like_tweet", "search_tweets"],
        "requires_approval": ["post_tweet", "reply_tweet"],
    },
    "telegram": {
        "id": "telegram",
        "name": "Telegram",
        "description": "Send messages and manage Telegram groups",
        "actions": ["send_message", "create_group", "manage_members"],
        "requires_approval": ["create_group", "manage_members"],
    },
    "discord": {
        "id": "discord",
        "name": "Discord",
        "description": "Manage Discord channels and send messages",
        "actions": ["send_message", "create_channel", "manage_roles"],
        "requires_approval": ["create_channel", "manage_roles"],
    },
    "email": {
        "id": "email",
        "name": "Email",
        "description": "Send and manage emails",
        "actions": ["send_email", "draft_email", "search_emails"],
        "requires_approval": ["send_email"],
    },
    "calendar": {
        "id": "calendar",
        "name": "Calendar",
        "description": "Schedule and manage calendar events",
        "actions": ["create_event", "update_event", "list_events"],
        "requires_approval": ["create_event", "update_event"],
    },
    "notion": {
        "id": "notion",
        "name": "Notion",
        "description": "Create and update Notion pages",
        "actions": ["create_page", "update_page", "search_pages"],
        "requires_approval": [],
    },
    "slack": {
        "id": "slack",
        "name": "Slack",
        "description": "Send messages to Slack channels",
        "actions": ["send_message", "create_channel", "invite_user"],
        "requires_approval": ["create_channel", "invite_user"],
    },
    "github": {
        "id": "github",
        "name": "GitHub",
        "description": "Manage GitHub repos and issues",
        "actions": ["create_issue", "comment_issue", "create_pr", "merge_pr"],
        "requires_approval": ["merge_pr"],
    },
}


def get_tool_info(tool_id: str) -> Optional[Dict[str, Any]]:
    """Get information about a specific tool."""
    return TOOL_REGISTRY.get(tool_id)


def check_requires_approval(tool_id: str, action: str) -> bool:
    """Check if an action requires approval."""
    tool = TOOL_REGISTRY.get(tool_id)
    if not tool:
        return True  # Unknown tools require approval by default
    return action in tool.get("requires_approval", [])


# ─────────────────────────────────────────────────────────────────────────────
# Worker Execution
# ─────────────────────────────────────────────────────────────────────────────


async def execute_worker_task(
    worker: Agent,
    task: str,
    action: Optional[str] = None,
    params: Optional[Dict[str, Any]] = None,
    knowledge_context: str = "",
) -> Dict[str, Any]:
    """
    Execute a task using a worker agent.

    Args:
        worker: The worker agent to use
        task: Description of the task to execute
        action: Specific action to perform (optional)
        params: Action parameters (optional)
        knowledge_context: Relevant knowledge base content

    Returns:
        Execution result with status and data
    """
    llm = get_llm(temperature=0.3)

    # Get worker's tools
    tools = worker.config.get("tools", []) if worker.config else []

    # Check if action requires approval
    requires_approval = False
    if action:
        for tool_id in tools:
            if check_requires_approval(tool_id, action):
                requires_approval = True
                break

    if requires_approval:
        return {
            "status": "requires_approval",
            "action": action,
            "params": params,
            "reason": f"Action '{action}' requires user approval before execution.",
        }

    # Build worker prompt
    system_prompt = f"""You are {worker.name}, a specialized worker agent.
Role: {worker.role or "General assistant"}
{f"Description: {worker.description or worker.brief_description}" if worker.description or worker.brief_description else ""}

Available tools: {", ".join(tools) if tools else "None"}

{f"Knowledge context:{chr(10)}{knowledge_context}" if knowledge_context else ""}

Execute the assigned task and return a structured result.
If you cannot complete the task, explain why.

{f"Custom instructions:{chr(10)}{worker.system_prompt}" if worker.system_prompt else ""}
"""

    # Execute task
    task_message = f"""Task: {task}
{f"Action: {action}" if action else ""}
{f"Parameters: {params}" if params else ""}

Execute this task and return a JSON result with:
- status: "success" or "failed"
- result: The outcome or data
- message: Human-readable summary
"""

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=task_message),
    ]

    try:
        response = await llm.ainvoke(messages)

        # For now, return the LLM response as the result
        # In production, this would actually execute tool actions
        return {
            "status": "success",
            "result": normalize_content(response.content),
            "action": action,
            "worker_id": worker.id,
            "worker_name": worker.name,
            "executed_at": datetime.utcnow().isoformat(),
        }

    except Exception as e:
        return {
            "status": "failed",
            "error": str(e),
            "action": action,
            "worker_id": worker.id,
            "worker_name": worker.name,
        }


async def select_worker_for_task(
    workers: List[Agent],
    task: str,
    action: Optional[str] = None,
) -> Optional[Agent]:
    """
    Select the most appropriate worker for a task.

    Args:
        workers: List of available workers
        task: Task description
        action: Specific action required (optional)

    Returns:
        Selected worker or None if no suitable worker found
    """
    if not workers:
        return None

    # Simple selection logic - can be enhanced with LLM-based routing
    if action:
        # Find worker with matching tool capability
        for worker in workers:
            tools = worker.config.get("tools", []) if worker.config else []
            for tool_id in tools:
                tool_info = get_tool_info(tool_id)
                if tool_info and action in tool_info.get("actions", []):
                    return worker

    # Fallback to first available worker
    return workers[0] if workers else None


# ─────────────────────────────────────────────────────────────────────────────
# Worker Response Generation
# ─────────────────────────────────────────────────────────────────────────────


async def generate_worker_response(
    worker: Agent,
    query: str,
    context: str = "",
    knowledge_context: str = "",
) -> str:
    """
    Generate a response from a worker agent (non-action query).

    Args:
        worker: The worker agent
        query: User query
        context: Conversation context
        knowledge_context: Relevant knowledge base content

    Returns:
        Worker's response
    """
    llm = get_llm(temperature=0.7)

    system_prompt = f"""You are {worker.name}, a specialized worker agent.
Role: {worker.role or "General assistant"}

{f"Knowledge context:{chr(10)}{knowledge_context}" if knowledge_context else ""}

Respond helpfully to queries within your area of expertise.

{f"Custom instructions:{chr(10)}{worker.system_prompt}" if worker.system_prompt else ""}
"""

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=query),
    ]

    response = await llm.ainvoke(messages)
    return normalize_content(response.content)