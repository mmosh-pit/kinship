"""
Kinship Agent - Worker Router

Conditional edge function that determines routing after intent analysis.
Routes to either worker_executor or supervisor_response based on intent analysis.
"""

from typing import Literal

from app.agents.types import AgentState


def route_after_intent(state: AgentState) -> Literal["worker_executor", "supervisor_response"]:
    """
    Determine routing after intent analysis.
    
    This is a pure function (no side effects) that examines the state
    and returns a routing decision.
    
    Routing logic:
    - If requires_delegation is True → worker_executor
    - Otherwise → supervisor_response
    
    requires_delegation is True when:
    - Intent is "task"
    - A worker has been selected
    - Confidence is above threshold
    
    Args:
        state: Current agent state (after intent analysis)
        
    Returns:
        "worker_executor" or "supervisor_response"
    """
    requires_delegation = state.get("requires_delegation", False)
    
    if requires_delegation:
        return "worker_executor"
    else:
        return "supervisor_response"


def get_routing_info(state: AgentState) -> dict:
    """
    Get detailed routing information for logging/streaming.
    
    Args:
        state: Current agent state
        
    Returns:
        Dict with routing details
    """
    route = route_after_intent(state)
    
    return {
        "route": route,
        "intent": state.get("intent"),
        "action": state.get("action"),
        "selected_worker_id": state.get("selected_worker_id"),
        "selected_worker_name": state.get("selected_worker_name"),
        "confidence": state.get("confidence", 0.0),
        "requires_delegation": state.get("requires_delegation", False),
        "reason": _get_routing_reason(state, route),
    }


def _get_routing_reason(state: AgentState, route: str) -> str:
    """Generate a human-readable reason for the routing decision."""
    intent = state.get("intent")
    confidence = state.get("confidence", 0.0)
    worker_name = state.get("selected_worker_name")
    action = state.get("action")
    
    if route == "worker_executor":
        return f"Delegating to {worker_name} for '{action}' (confidence: {confidence:.0%})"
    else:
        if intent == "task" and worker_name:
            return f"Confidence too low ({confidence:.0%}) to delegate '{action}'"
        elif intent == "task":
            return f"No suitable worker found for task"
        elif intent == "query":
            return "Handling query directly without delegation"
        elif intent == "help":
            return "Providing help information"
        else:
            return "Handling conversation directly"
