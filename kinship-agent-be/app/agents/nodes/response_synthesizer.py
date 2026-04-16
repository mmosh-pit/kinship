"""
Kinship Agent - Response Synthesizer Node

Final node that synthesizes the response based on:
- Worker execution results (if delegated)
- Supervisor response (if direct)
- Error handling
- Response formatting

This node ensures consistent output format regardless of the execution path.
"""

from typing import Dict, Any, Optional

from langsmith import traceable

from app.agents.types import AgentState, WorkerResult


@traceable(name="response_synthesizer", run_type="chain")
async def synthesize_response(state: AgentState) -> Dict[str, Any]:
    """
    Synthesize the final response from execution results.
    
    This node:
    1. Checks if there's a worker result or supervisor response
    2. Formats the response appropriately
    3. Handles errors
    4. Prepares metadata
    
    Args:
        state: Current agent state
        
    Returns:
        State updates with final_response and response_metadata
    """
    # Check for existing final response (from supervisor_response node)
    final_response = state.get("final_response")
    
    if final_response:
        # Already have a response from supervisor
        return {
            "final_response": final_response,
            "response_metadata": _build_metadata(state, source="supervisor"),
        }
    
    # Check for worker result
    worker_result: Optional[WorkerResult] = state.get("worker_result")
    
    if worker_result:
        if worker_result.get("success"):
            # Successful worker execution
            output = worker_result.get("output", "Task completed successfully.")
            
            return {
                "final_response": output,
                "response_metadata": _build_metadata(state, source="worker"),
            }
        else:
            # Worker execution failed
            error = worker_result.get("error", "Unknown error occurred")
            
            # Generate error response
            error_response = _format_error_response(
                error=error,
                worker_name=state.get("selected_worker_name"),
                action=state.get("action"),
            )
            
            return {
                "final_response": error_response,
                "response_metadata": _build_metadata(state, source="worker_error"),
            }
    
    # Check for pending approval
    if state.get("requires_approval"):
        pending = state.get("pending_approval")
        if pending:
            approval_response = _format_approval_response(pending)
            return {
                "final_response": approval_response,
                "response_metadata": _build_metadata(state, source="approval_required"),
            }
    
    # Fallback - no response generated
    return {
        "final_response": "I apologize, but I wasn't able to process your request. Could you please try again?",
        "response_metadata": _build_metadata(state, source="fallback"),
    }


def _build_metadata(state: AgentState, source: str) -> Dict[str, Any]:
    """Build response metadata."""
    worker_result = state.get("worker_result")
    
    metadata = {
        "source": source,
        "intent": state.get("intent"),
        "action": state.get("action"),
        "confidence": state.get("confidence", 0.0),
    }
    
    if state.get("selected_worker_id"):
        metadata["worker"] = {
            "id": state.get("selected_worker_id"),
            "name": state.get("selected_worker_name"),
        }
    
    if worker_result:
        metadata["execution"] = {
            "success": worker_result.get("success"),
            "tool_calls_count": len(worker_result.get("tool_calls", [])),
            "execution_time_ms": worker_result.get("execution_time_ms", 0),
        }
        
        # Include tool call summary
        tool_calls = worker_result.get("tool_calls", [])
        if tool_calls:
            metadata["tools_used"] = [
                {
                    "name": tc.get("tool_name"),
                    "success": tc.get("success"),
                }
                for tc in tool_calls
            ]
    
    return metadata


def _format_error_response(
    error: str,
    worker_name: Optional[str],
    action: Optional[str],
) -> str:
    """Format an error response for the user."""
    if worker_name and action:
        return (
            f"I encountered an issue while trying to {action.replace('_', ' ')} "
            f"using {worker_name}. The error was: {error}\n\n"
            "Would you like me to try a different approach, or is there anything else I can help with?"
        )
    elif worker_name:
        return (
            f"I encountered an issue while {worker_name} was working on your request. "
            f"The error was: {error}\n\n"
            "Would you like me to try a different approach?"
        )
    else:
        return (
            f"I encountered an issue processing your request: {error}\n\n"
            "Could you please try again or rephrase your request?"
        )


def _format_approval_response(pending_approval: Dict[str, Any]) -> str:
    """Format a response for pending approval."""
    action = pending_approval.get("action", "action")
    tool_name = pending_approval.get("tool_name", "tool")
    reason = pending_approval.get("reason", "This action requires approval")
    approval_id = pending_approval.get("approval_id", "")
    
    return (
        f"**Approval Required**\n\n"
        f"I need your approval to proceed with the following action:\n\n"
        f"- **Action**: {action.replace('_', ' ').title()}\n"
        f"- **Tool**: {tool_name}\n"
        f"- **Reason**: {reason}\n\n"
        f"Please confirm if you'd like me to proceed with this action.\n\n"
        f"(Approval ID: {approval_id})"
    )


async def format_streaming_response(
    state: AgentState,
    token_stream,
) -> Dict[str, Any]:
    """
    Format a streaming response by collecting all tokens.
    
    This is used when we need to convert a streaming response
    to a complete state update.
    
    Args:
        state: Current agent state
        token_stream: Async iterator of tokens
        
    Returns:
        State updates with accumulated response
    """
    accumulated = []
    
    async for token in token_stream:
        accumulated.append(token)
    
    final_response = "".join(accumulated)
    
    return {
        "final_response": final_response,
        "response_metadata": _build_metadata(state, source="streaming"),
    }
