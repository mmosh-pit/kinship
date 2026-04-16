"""
Kinship Agent - Supervisor Agent System

This module implements the Supervisor (Presence) Agent using LangGraph.
The Supervisor coordinates Worker Agents to handle user requests.

Architecture:
- Supervisor Agent: Main interface for user interactions
- Worker Agents: Handle specific tasks assigned by Supervisor
- Users only interact with Supervisor, never directly with Workers
"""

from typing import Optional, List, Dict, Any, Annotated, TypedDict, Sequence, Literal
from datetime import datetime
import json
import operator

from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode

from app.core.llm import get_llm, create_messages, normalize_content
from app.db.models import Agent, AgentType, AgentTone


# ─────────────────────────────────────────────────────────────────────────────
# Agent State Definition
# ─────────────────────────────────────────────────────────────────────────────


class AgentState(TypedDict):
    """State shared across the agent graph."""

    # Core conversation
    messages: Annotated[Sequence[BaseMessage], operator.add]
    
    # User context
    user_id: str
    user_wallet: str
    user_role: str
    
    # Agent context
    presence_id: str
    presence_name: str
    presence_tone: str
    
    # LLM configuration
    llm_provider: Optional[str]
    llm_model: Optional[str]
    
    # Knowledge base content
    knowledge_context: str
    
    # Orchestration state
    current_worker_id: Optional[str]
    current_worker_name: Optional[str]
    intent: Optional[str]
    action: Optional[str]
    
    # Execution results
    worker_result: Optional[Dict[str, Any]]
    requires_approval: bool
    approval_reason: Optional[str]
    
    # Final response
    final_response: Optional[str]


# ─────────────────────────────────────────────────────────────────────────────
# System Prompt Templates
# ─────────────────────────────────────────────────────────────────────────────


TONE_MODIFIERS = {
    AgentTone.NEUTRAL: "",
    AgentTone.FRIENDLY: "Be warm, friendly, and approachable. Use casual language and show genuine interest in the user.",
    AgentTone.PROFESSIONAL: "Maintain a professional and formal tone. Be clear, concise, and business-like.",
    AgentTone.STRICT: "Be direct and authoritative. Set clear boundaries and expectations. Don't tolerate ambiguity.",
    AgentTone.COOL: "Be laid-back and casual. Use relaxed language. Don't stress about formalities.",
    AgentTone.ANGRY: "Be assertive and intense. Show frustration when appropriate. Push back on nonsense.",
    AgentTone.PLAYFUL: "Be fun and whimsical. Use humor and creativity. Make interactions enjoyable.",
    AgentTone.WISE: "Be thoughtful and philosophical. Share insights and guidance. Help users think deeper.",
}


def get_supervisor_system_prompt(
    agent: Agent,
    workers: List[Agent],
    knowledge_context: str = "",
) -> str:
    """
    Generate the system prompt for a Supervisor (Presence) agent.

    Args:
        agent: The Presence agent
        workers: List of available Worker agents
        knowledge_context: Relevant knowledge base content

    Returns:
        Formatted system prompt
    """
    # Base identity
    name = agent.name
    handle = f"@{agent.handle}" if agent.handle else ""
    description = agent.description or "An AI assistant"
    backstory = agent.backstory or ""

    # Get tone modifier
    tone = agent.tone or AgentTone.NEUTRAL
    tone_modifier = TONE_MODIFIERS.get(tone, "")

    # Custom system prompt override
    custom_prompt = agent.system_prompt or ""

    # Format worker capabilities
    worker_descriptions = []
    for w in workers:
        tools = w.tools or []
        tools_str = ", ".join(tools) if tools else "general assistance"
        worker_desc = w.description or "General worker"
        worker_descriptions.append(
            f"- {w.name} (ID: {w.id}): {worker_desc}. Tools: {tools_str}"
        )
    workers_section = "\n".join(worker_descriptions) if worker_descriptions else "No workers available."

    # Knowledge context section
    knowledge_section = ""
    if knowledge_context:
        knowledge_section = f"""
## Knowledge Base Context
The following information is relevant to this conversation:
{knowledge_context}
"""

    prompt = f"""# Identity
You are {name} {handle}.
{description}

{f"## Backstory{chr(10)}{backstory}" if backstory else ""}

## Tone & Personality
{tone_modifier if tone_modifier else "Maintain a balanced and helpful tone."}

## Your Role
You are a Supervisor agent (Presence). Users interact with you directly.
You coordinate Worker agents to accomplish tasks when needed.
Never expose internal orchestration details to the user.

## Available Workers
{workers_section}

## Instructions
1. Understand the user's intent
2. If a task requires a Worker, delegate appropriately
3. Provide helpful, contextual responses
4. When delegating, describe what you're doing in natural language
5. Always maintain your personality and tone

{knowledge_section}

{f"## Additional Instructions{chr(10)}{custom_prompt}" if custom_prompt else ""}

Remember: You are the primary interface. Be helpful, be yourself, and coordinate effectively.
"""
    return prompt.strip()


def get_worker_system_prompt(
    worker: Agent,
    task_context: str = "",
    knowledge_context: str = "",
) -> str:
    """
    Generate the system prompt for a Worker agent.

    Args:
        worker: The Worker agent
        task_context: Context about the current task
        knowledge_context: Relevant knowledge base content

    Returns:
        Formatted system prompt
    """
    name = worker.name
    description = worker.description or ""
    custom_prompt = worker.system_prompt or ""

    # Get tools
    tools = worker.tools or []
    tools_section = ", ".join(tools) if tools else "No specific tools"

    prompt = f"""# Identity
You are {name}, a Worker agent.
{f"Description: {description}" if description else ""}

## Capabilities
Tools available: {tools_section}

## Task Context
{task_context if task_context else "No specific task context provided."}

{f"## Knowledge Context{chr(10)}{knowledge_context}" if knowledge_context else ""}

## Instructions
1. Execute the assigned task efficiently
2. Return clear, actionable results
3. Report any errors or blockers clearly
4. Stay focused on your specific role

{f"## Additional Instructions{chr(10)}{custom_prompt}" if custom_prompt else ""}

Execute the task and return structured results.
"""
    return prompt.strip()


# ─────────────────────────────────────────────────────────────────────────────
# Graph Nodes
# ─────────────────────────────────────────────────────────────────────────────


async def analyze_intent(state: AgentState) -> Dict[str, Any]:
    """
    Analyze user intent to determine if worker delegation is needed.

    Returns updated state with intent classification.
    """
    # Use LLM provider from state if specified
    llm = get_llm(
        provider=state.get("llm_provider"),
        model=state.get("llm_model"),
        temperature=0.1
    )

    # Get the last user message
    user_messages = [m for m in state["messages"] if isinstance(m, HumanMessage)]
    if not user_messages:
        return {"intent": "conversation", "action": None}

    last_message = user_messages[-1].content

    # Intent classification prompt
    classification_prompt = f"""Analyze this user message and classify the intent:

Message: "{last_message}"

Classify as one of:
- conversation: General chat, questions, or discussion
- task: Requires executing an action (posting, sending, creating, etc.)
- query: Information lookup or search
- help: Asking for assistance or guidance

Also identify if a specific action is mentioned (e.g., "post_tweet", "send_email", etc.)

Respond in JSON format:
{{"intent": "...", "action": "..." or null}}
"""

    response = await llm.ainvoke([HumanMessage(content=classification_prompt)])
    
    try:
        # Normalize content (Gemini may return list of parts)
        content = normalize_content(response.content)
        result = json.loads(content)
        return {
            "intent": result.get("intent", "conversation"),
            "action": result.get("action"),
        }
    except json.JSONDecodeError:
        return {"intent": "conversation", "action": None}


async def route_to_worker(state: AgentState) -> Dict[str, Any]:
    """
    Route task to appropriate worker based on intent and action.

    Returns updated state with worker selection.
    """
    # This would normally query the database for available workers
    # For now, we'll set placeholder values
    
    intent = state.get("intent", "conversation")
    action = state.get("action")

    if intent == "conversation" or not action:
        return {
            "current_worker_id": None,
            "current_worker_name": None,
        }

    # In real implementation, select worker based on action and tools
    # For now, return placeholder
    return {
        "current_worker_id": None,  # Would be actual worker ID
        "current_worker_name": None,  # Would be worker name
    }


async def supervisor_respond(state: AgentState) -> Dict[str, Any]:
    """
    Generate supervisor response to user.

    This is the main response generation node.
    """
    # Use LLM provider from state if specified
    llm = get_llm(
        provider=state.get("llm_provider"),
        model=state.get("llm_model"),
        temperature=0.7
    )

    # Build system prompt (simplified - in real use, would have full agent context)
    system_content = f"""You are {state.get('presence_name', 'an AI assistant')}.
Tone: {state.get('presence_tone', 'neutral')}

{state.get('knowledge_context', '')}

Respond helpfully to the user's message.
"""

    messages = [SystemMessage(content=system_content)] + list(state["messages"])
    
    response = await llm.ainvoke(messages)
    
    # Normalize content (Gemini may return list of parts)
    content = normalize_content(response.content)
    
    return {
        "messages": [AIMessage(content=content)],
        "final_response": content,
    }


async def execute_worker_task(state: AgentState) -> Dict[str, Any]:
    """
    Execute task through selected worker.

    Returns execution result or approval requirement.
    """
    worker_id = state.get("current_worker_id")
    
    if not worker_id:
        return {
            "worker_result": None,
            "requires_approval": False,
        }

    # In real implementation:
    # 1. Load worker configuration
    # 2. Generate worker prompt
    # 3. Execute with worker's tools
    # 4. Check if approval needed
    # 5. Return results

    # Placeholder for now
    return {
        "worker_result": {"status": "no_worker_selected"},
        "requires_approval": False,
    }


def should_delegate(state: AgentState) -> Literal["delegate", "respond"]:
    """
    Determine if task should be delegated to a worker.
    """
    intent = state.get("intent", "conversation")
    action = state.get("action")

    if intent in ["task", "query"] and action:
        return "delegate"
    return "respond"


# ─────────────────────────────────────────────────────────────────────────────
# Graph Construction
# ─────────────────────────────────────────────────────────────────────────────


def create_supervisor_graph() -> StateGraph:
    """
    Create the LangGraph workflow for supervisor agent orchestration.

    Graph Flow:
    1. analyze_intent -> Classify user intent
    2. Conditional: delegate or respond
    3a. If delegate: route_to_worker -> execute_worker_task -> supervisor_respond
    3b. If respond: supervisor_respond
    4. END

    Returns:
        Compiled StateGraph
    """
    # Initialize the graph with our state type
    workflow = StateGraph(AgentState)

    # Add nodes
    workflow.add_node("analyze_intent", analyze_intent)
    workflow.add_node("route_to_worker", route_to_worker)
    workflow.add_node("execute_worker_task", execute_worker_task)
    workflow.add_node("supervisor_respond", supervisor_respond)

    # Set entry point
    workflow.set_entry_point("analyze_intent")

    # Add conditional edge after intent analysis
    workflow.add_conditional_edges(
        "analyze_intent",
        should_delegate,
        {
            "delegate": "route_to_worker",
            "respond": "supervisor_respond",
        },
    )

    # Add edges for delegation flow
    workflow.add_edge("route_to_worker", "execute_worker_task")
    workflow.add_edge("execute_worker_task", "supervisor_respond")

    # Add end edge
    workflow.add_edge("supervisor_respond", END)

    return workflow.compile()


# ─────────────────────────────────────────────────────────────────────────────
# Main Agent Interface
# ─────────────────────────────────────────────────────────────────────────────


async def run_supervisor_agent(
    presence: Agent,
    workers: List[Agent],
    message: str,
    message_history: List[Dict[str, str]],
    user_id: str,
    user_wallet: str,
    user_role: str,
    knowledge_context: str = "",
    llm_provider: Optional[str] = None,
    llm_model: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Run the supervisor agent to process a user message.

    Args:
        presence: The Presence (supervisor) agent
        workers: List of available worker agents
        message: User's message
        message_history: Previous conversation history
        user_id: User identifier
        user_wallet: User's wallet address
        user_role: User's role (creator, member, guest)
        knowledge_context: Relevant knowledge base content
        llm_provider: LLM provider to use (openai, anthropic, gemini)
        llm_model: Specific model name (optional)

    Returns:
        Dict containing response and orchestration details
    """
    # Create the graph
    graph = create_supervisor_graph()

    # Build initial messages
    messages: List[BaseMessage] = []
    for msg in message_history:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))

    # Add current message
    messages.append(HumanMessage(content=message))

    # Build initial state
    initial_state: AgentState = {
        "messages": messages,
        "user_id": user_id,
        "user_wallet": user_wallet,
        "user_role": user_role,
        "presence_id": presence.id,
        "presence_name": presence.name,
        "presence_tone": presence.tone.value if presence.tone else "neutral",
        "llm_provider": llm_provider,
        "llm_model": llm_model,
        "knowledge_context": knowledge_context,
        "current_worker_id": None,
        "current_worker_name": None,
        "intent": None,
        "action": None,
        "worker_result": None,
        "requires_approval": False,
        "approval_reason": None,
        "final_response": None,
    }

    # Run the graph
    final_state = await graph.ainvoke(initial_state)

    # Extract results
    return {
        "success": True,
        "response": final_state.get("final_response", ""),
        "intent": {
            "classified": final_state.get("intent", "conversation"),
            "action": final_state.get("action"),
            "confidence": 0.9,  # Placeholder
        },
        "execution": {
            "worker_id": final_state.get("current_worker_id"),
            "worker_name": final_state.get("current_worker_name"),
            "status": "completed" if final_state.get("worker_result") else None,
            "result": final_state.get("worker_result"),
        } if final_state.get("current_worker_id") else None,
        "pending_approval": {
            "id": None,  # Would be actual approval ID
            "reason": final_state.get("approval_reason"),
        } if final_state.get("requires_approval") else None,
    }