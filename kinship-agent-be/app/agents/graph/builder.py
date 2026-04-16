"""
Kinship Agent - Graph Builder

Builds the STATIC orchestration graph with 5 nodes.
This graph structure is the same for ALL Presences - what changes
is the execution state, not the graph structure.

Graph Structure:
    START → intent_analyzer → [conditional] → worker_executor → response_synthesizer → END
                                           ↘ supervisor_response ↗
"""

from typing import Dict, Any, Sequence, Annotated, Optional
import operator

from langgraph.graph import StateGraph, END

# Handle different LangGraph versions for CompiledGraph type
try:
    from langgraph.graph import CompiledGraph
except ImportError:
    try:
        from langgraph.graph.state import CompiledStateGraph as CompiledGraph
    except ImportError:
        CompiledGraph = Any

from app.agents.nodes import (
    analyze_intent,
    route_after_intent,
    execute_worker,
    generate_supervisor_response,
    synthesize_response,
)


# Define the state schema for the graph
class OrchestrationState(Dict):
    """
    State for the orchestration graph.
    
    This is a simplified state dict for LangGraph compatibility.
    """
    pass


def build_orchestration_graph() -> CompiledGraph:
    """
    Build the static orchestration graph.
    
    This graph has 5 nodes:
    1. intent_analyzer - Analyzes user intent and determines routing
    2. worker_executor - Executes tasks using selected worker's tools
    3. supervisor_response - Generates direct response from Presence
    4. response_synthesizer - Formats final response
    
    The graph structure is:
    
    START
      │
      ▼
    intent_analyzer
      │
      ├──── [requires_delegation=True] ──► worker_executor
      │                                         │
      └──── [requires_delegation=False] ─► supervisor_response
                                               │
                                               ▼
                                        response_synthesizer
                                               │
                                               ▼
                                              END
    
    Returns:
        Compiled StateGraph ready for execution
    """
    # Create the graph with dict state
    workflow = StateGraph(dict)
    
    # Add nodes
    workflow.add_node("intent_analyzer", analyze_intent)
    workflow.add_node("worker_executor", execute_worker)
    workflow.add_node("supervisor_response", generate_supervisor_response)
    workflow.add_node("response_synthesizer", synthesize_response)
    
    # Set entry point
    workflow.set_entry_point("intent_analyzer")
    
    # Add conditional edge after intent analysis
    workflow.add_conditional_edges(
        "intent_analyzer",
        route_after_intent,
        {
            "worker_executor": "worker_executor",
            "supervisor_response": "supervisor_response",
        }
    )
    
    # Worker executor goes to response synthesizer
    workflow.add_edge("worker_executor", "response_synthesizer")
    
    # Supervisor response goes to response synthesizer
    workflow.add_edge("supervisor_response", "response_synthesizer")
    
    # Response synthesizer is the end
    workflow.add_edge("response_synthesizer", END)
    
    # Compile the graph
    return workflow.compile()


def get_initial_state(
    messages: list,
    presence_id: str,
    presence_name: str,
    presence_tone: str,
    presence_system_prompt: str,
    presence_description: str,
    presence_backstory: str,
    available_workers: list,
    capability_index: dict,
    db_session = None,
    knowledge_context: str = "",
    knowledge_sources: list = None,
    user_id: str = "",
    user_wallet: str = "",
    user_role: str = "member",
    llm_provider: str = None,
    llm_model: str = None,
    auth_token: Optional[str] = None,
    mcp_headers: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """
    Create the initial state for graph execution.
    
    Args:
        messages: Conversation messages
        presence_id: Presence agent ID
        presence_name: Presence agent name
        presence_tone: Presence tone setting
        presence_system_prompt: Custom system prompt
        presence_description: Presence description
        presence_backstory: Presence backstory
        available_workers: List of worker summaries
        capability_index: Capability → worker_id mapping
        db_session: Database session for worker execution
        knowledge_context: Retrieved knowledge
        knowledge_sources: Names of knowledge bases
        user_id: User ID
        user_wallet: User wallet address
        user_role: User role
        llm_provider: LLM provider override
        llm_model: LLM model override
        auth_token: Authorization token for MCP tools
        mcp_headers: Full headers dict for MCP tools
        
    Returns:
        Initial state dict for graph execution
    """
    return {
        # Conversation
        "messages": messages,
        
        # User Context
        "user_id": user_id,
        "user_wallet": user_wallet,
        "user_role": user_role,
        
        # Presence Context
        "presence_id": presence_id,
        "presence_name": presence_name,
        "presence_tone": presence_tone,
        "presence_system_prompt": presence_system_prompt,
        "presence_description": presence_description,
        "presence_backstory": presence_backstory,
        "available_workers": available_workers,
        "capability_index": capability_index,
        
        # Database session for worker execution
        "db_session": db_session,
        
        # Knowledge
        "knowledge_context": knowledge_context,
        "knowledge_sources": knowledge_sources or [],
        
        # LLM Config
        "llm_provider": llm_provider,
        "llm_model": llm_model,
        
        # Auth token for MCP tools (e.g., Solana transactions)
        "auth_token": auth_token,
        "mcp_headers": mcp_headers or {},
        
        # Intent Analysis (to be filled)
        "intent": None,
        "action": None,
        "selected_worker_id": None,
        "selected_worker_name": None,
        "confidence": 0.0,
        "requires_delegation": False,
        
        # Worker Execution (to be filled)
        "worker_config": None,
        "worker_result": None,
        "execution_status": None,
        "tool_calls_made": [],
        
        # Approval
        "requires_approval": False,
        "pending_approval": None,
        
        # Output
        "final_response": None,
        "response_metadata": None,
    }


# Pre-compiled graph singleton
_compiled_graph = None


def get_compiled_graph() -> CompiledGraph:
    """
    Get the compiled orchestration graph.
    
    Uses a singleton pattern since the graph is static.
    
    Returns:
        Compiled graph
    """
    global _compiled_graph
    
    if _compiled_graph is None:
        _compiled_graph = build_orchestration_graph()
    
    return _compiled_graph