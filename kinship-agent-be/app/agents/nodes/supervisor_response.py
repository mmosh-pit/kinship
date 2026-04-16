"""
Kinship Agent - Supervisor Response Node

Generates responses directly from the Presence (Supervisor) agent.
Used when:
- No delegation is needed (conversation, simple queries)
- Confidence is too low to delegate
- No suitable worker is available
"""

from typing import Dict, Any

from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langsmith import traceable

from app.agents.types import AgentState
from app.core.llm import get_llm, normalize_content


SUPERVISOR_SYSTEM_PROMPT = """You are {presence_name}, an AI assistant.

{presence_description}

{presence_backstory}

## Your Personality
Your tone is {tone}. Maintain this personality throughout the conversation.

{custom_instructions}

## Available Capabilities
You have the following workers available to help with specific tasks:
{workers_info}

If the user asks about your capabilities, you can mention these workers.
However, for this particular response, you are handling the conversation directly.

## Knowledge Context
{knowledge_context}

Be helpful, engaging, and true to your personality.
"""


def format_workers_info_for_supervisor(workers: list) -> str:
    """Format worker information for supervisor awareness."""
    if not workers:
        return "No specialized workers available."
    
    lines = []
    for worker in workers:
        caps = worker.get("capabilities", [])
        caps_str = ", ".join(caps[:5])  # Limit to first 5 capabilities
        if len(caps) > 5:
            caps_str += f" (+{len(caps) - 5} more)"
        
        lines.append(f"- **{worker['name']}**: {caps_str or 'general assistance'}")
    
    return "\n".join(lines)


@traceable(name="supervisor_response", run_type="chain")
async def generate_supervisor_response(state: AgentState) -> Dict[str, Any]:
    """
    Generate a response directly from the Presence (Supervisor) agent.
    
    This node handles:
    - Conversational messages
    - Queries that don't need tools
    - Help requests
    - Cases where no worker is suitable
    
    Args:
        state: Current agent state
        
    Returns:
        State updates with final response
    """
    # Get presence information from state
    presence_name = state.get("presence_name", "Assistant")
    presence_tone = state.get("presence_tone", "neutral")
    presence_system_prompt = state.get("presence_system_prompt", "")
    presence_description = state.get("presence_description", "")
    presence_backstory = state.get("presence_backstory", "")
    available_workers = state.get("available_workers", [])
    knowledge_context = state.get("knowledge_context", "")
    
    # Build system prompt
    workers_info = format_workers_info_for_supervisor(available_workers)
    
    system_prompt = SUPERVISOR_SYSTEM_PROMPT.format(
        presence_name=presence_name,
        presence_description=presence_description,
        presence_backstory=presence_backstory,
        tone=presence_tone,
        custom_instructions=presence_system_prompt,
        workers_info=workers_info,
        knowledge_context=knowledge_context or "No specific knowledge context available.",
    )
    
    # Build messages for LLM
    messages_for_llm = [SystemMessage(content=system_prompt)]
    
    # Add message history
    state_messages = state.get("messages", [])
    for msg in state_messages:
        if isinstance(msg, (HumanMessage, AIMessage)):
            messages_for_llm.append(msg)
        elif hasattr(msg, "type"):
            if msg.type == "human":
                messages_for_llm.append(HumanMessage(content=msg.content))
            elif msg.type == "ai":
                messages_for_llm.append(AIMessage(content=msg.content))
    
    # Get LLM
    llm = get_llm(
        provider=state.get("llm_provider") or "anthropic",
        model=state.get("llm_model"),
        temperature=0.7,
    )
    
    # Generate response
    response = await llm.ainvoke(messages_for_llm)
    
    # Normalize content (Gemini may return list of parts)
    content = normalize_content(response.content)
    
    return {
        "final_response": content,
        "execution_status": "completed",
    }


@traceable(name="supervisor_response_streaming", run_type="chain")
async def generate_supervisor_response_streaming(state: AgentState):
    """
    Generate a streaming response from the Presence agent.
    
    Yields tokens for SSE streaming.
    
    Args:
        state: Current agent state
        
    Yields:
        String tokens
    """
    # Get presence information from state
    presence_name = state.get("presence_name", "Assistant")
    presence_tone = state.get("presence_tone", "neutral")
    presence_system_prompt = state.get("presence_system_prompt", "")
    presence_description = state.get("presence_description", "")
    presence_backstory = state.get("presence_backstory", "")
    available_workers = state.get("available_workers", [])
    knowledge_context = state.get("knowledge_context", "")
    
    # Build system prompt
    workers_info = format_workers_info_for_supervisor(available_workers)
    
    system_prompt = SUPERVISOR_SYSTEM_PROMPT.format(
        presence_name=presence_name,
        presence_description=presence_description,
        presence_backstory=presence_backstory,
        tone=presence_tone,
        custom_instructions=presence_system_prompt,
        workers_info=workers_info,
        knowledge_context=knowledge_context or "No specific knowledge context available.",
    )
    
    # Build messages for LLM
    messages_for_llm = [SystemMessage(content=system_prompt)]
    
    # Add message history
    state_messages = state.get("messages", [])
    for msg in state_messages:
        if isinstance(msg, (HumanMessage, AIMessage)):
            messages_for_llm.append(msg)
        elif hasattr(msg, "type"):
            if msg.type == "human":
                messages_for_llm.append(HumanMessage(content=msg.content))
            elif msg.type == "ai":
                messages_for_llm.append(AIMessage(content=msg.content))
    
    # Get LLM with streaming
    llm = get_llm(
        provider=state.get("llm_provider") or "anthropic",
        model=state.get("llm_model"),
        temperature=0.7,
        streaming=True,
    )
    
    # Stream response
    async for chunk in llm.astream(messages_for_llm):
        if hasattr(chunk, "content") and chunk.content:
            # Normalize content (Gemini returns list of parts)
            content = normalize_content(chunk.content)
            if content:
                yield content