"""
Kinship Agent - Graph Nodes

LangGraph nodes for agent orchestration:
- Intent Analyzer: Analyzes user messages and determines routing
- Router: Conditional edge function for routing decisions
- Worker Executor: Generic worker execution with MCP tools
- Supervisor Response: Direct response from Presence agent
- Response Synthesizer: Final response formatting
"""

from app.agents.nodes.intent_analyzer import analyze_intent
from app.agents.nodes.router import route_after_intent, get_routing_info
from app.agents.nodes.worker_executor import execute_worker, execute_worker_streaming
from app.agents.nodes.supervisor_response import (
    generate_supervisor_response,
    generate_supervisor_response_streaming,
)
from app.agents.nodes.response_synthesizer import (
    synthesize_response,
    format_streaming_response,
)

__all__ = [
    # Intent Analysis
    "analyze_intent",
    
    # Routing
    "route_after_intent",
    "get_routing_info",
    
    # Worker Execution
    "execute_worker",
    "execute_worker_streaming",
    
    # Supervisor Response
    "generate_supervisor_response",
    "generate_supervisor_response_streaming",
    
    # Response Synthesis
    "synthesize_response",
    "format_streaming_response",
]
