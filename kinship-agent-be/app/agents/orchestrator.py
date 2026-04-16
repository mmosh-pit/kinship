"""
Kinship Agent - Orchestration Service

Main entry point for agent execution.
Coordinates:
- Cache loading (presence context, graph)
- Knowledge retrieval
- Graph execution
- Response streaming
- Auth token forwarding to MCP tools

Usage:
    orchestrator = AgentOrchestrator()
    
    # Non-streaming execution
    result = await orchestrator.run(
        presence_id="agent_123",
        message="Post a tweet about AI",
        message_history=[...],
        db_session=session,
    )
    
    # Streaming execution
    async for event in orchestrator.run_streaming(...):
        yield event
"""

import time
import json
from typing import Optional, List, Dict, Any, AsyncIterator, TYPE_CHECKING

from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langsmith import traceable

from app.agents.cache.manager import cache_manager, CacheManager
from app.agents.graph.builder import get_initial_state, get_compiled_graph
from app.agents.knowledge import get_relevant_knowledge
from app.agents.nodes.router import get_routing_info
from app.agents.nodes.supervisor_response import generate_supervisor_response_streaming
from app.agents.types import OrchestrationResult, PresenceContext
from app.core.config import settings

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


class AgentOrchestrator:
    """
    Main orchestration service for agent execution.
    
    Handles the complete flow:
    1. Load presence context from cache
    2. Retrieve relevant knowledge
    3. Build initial state
    4. Execute the orchestration graph
    5. Return results
    """
    
    def __init__(self, cache: Optional[CacheManager] = None):
        """
        Initialize the orchestrator.
        
        Args:
            cache: Cache manager (uses singleton if not provided)
        """
        self._cache = cache or cache_manager
    
    @traceable(name="orchestrator_run", run_type="chain")
    async def run(
        self,
        presence_id: str,
        message: str,
        db_session: "AsyncSession",
        message_history: Optional[List[Dict[str, str]]] = None,
        history_summary: Optional[str] = None,
        user_id: str = "",
        user_wallet: str = "",
        user_role: str = "member",
        llm_provider: Optional[str] = None,
        llm_model: Optional[str] = None,
        auth_token: Optional[str] = None,
        mcp_headers: Optional[Dict[str, str]] = None,
    ) -> OrchestrationResult:
        """
        Execute the orchestration graph (non-streaming).
        
        Args:
            presence_id: Presence agent ID
            message: User message
            db_session: Database session
            message_history: Previous conversation messages
            user_id: User ID
            user_wallet: User wallet address
            user_role: User role
            llm_provider: LLM provider override
            llm_model: LLM model override
            auth_token: Authorization token for MCP tools
            mcp_headers: Full headers dict for MCP tools
            
        Returns:
            OrchestrationResult with response and metadata
        """
        start_time = time.time()
        
        print(f"\n[ORCHESTRATOR] run() called")
        print(f"[ORCHESTRATOR] presence_id: {presence_id}")
        print(f"[ORCHESTRATOR] auth_token: {auth_token[:20] if auth_token else 'None'}...")
        print(f"[ORCHESTRATOR] mcp_headers: {list(mcp_headers.keys()) if mcp_headers else 'None'}")
        
        # Load presence context
        context = await self._cache.get_presence_context(presence_id, db_session)
        
        if not context:
            return OrchestrationResult(
                success=False,
                response="Presence agent not found.",
                intent=None,
                worker_used=None,
                worker_result=None,
                pending_approval=None,
                knowledge_sources=[],
                execution_time_ms=int((time.time() - start_time) * 1000),
            )
        
        # Retrieve knowledge
        knowledge_context = ""
        knowledge_sources = []
        
        if context.get("knowledge_base_ids"):
            try:
                knowledge_context = await get_relevant_knowledge(
                    knowledge_base_ids=context["knowledge_base_ids"],
                    query=message,
                    db_session=db_session,
                )
                if knowledge_context:
                    for line in knowledge_context.split("\n"):
                        if line.startswith("[Source:"):
                            source = line.replace("[Source:", "").replace("]", "").strip()
                            if source and source not in knowledge_sources:
                                knowledge_sources.append(source)
            except Exception as e:
                print(f"Warning: Failed to fetch knowledge: {e}")
        
        # Build messages
        messages = self._build_messages(message, message_history, history_summary)
        
        # Build initial state with auth token
        initial_state = get_initial_state(
            messages=messages,
            presence_id=context["presence_id"],
            presence_name=context["presence_name"],
            presence_tone=context["presence_tone"],
            presence_system_prompt=context["presence_system_prompt"] or "",
            presence_description=context.get("presence_description") or "",
            presence_backstory=context.get("presence_backstory") or "",
            available_workers=context["workers"],
            capability_index=context["capability_index"],
            db_session=db_session,
            knowledge_context=knowledge_context,
            knowledge_sources=knowledge_sources,
            user_id=user_id,
            user_wallet=user_wallet,
            user_role=user_role,
            llm_provider=llm_provider or "openai",  # Default to ChatGPT
            llm_model=llm_model,  # Let get_llm() choose default model for provider
            auth_token=auth_token,  # Pass auth token
            mcp_headers=mcp_headers,  # Pass MCP headers
        )
        
        # Get compiled graph
        graph = get_compiled_graph()
        
        # Execute graph
        final_state = await graph.ainvoke(initial_state)
        
        # Build result
        execution_time_ms = int((time.time() - start_time) * 1000)
        
        return OrchestrationResult(
            success=True,
            response=final_state.get("final_response", ""),
            intent={
                "intent": final_state.get("intent"),
                "action": final_state.get("action"),
                "selected_worker_id": final_state.get("selected_worker_id"),
                "selected_worker_name": final_state.get("selected_worker_name"),
                "confidence": final_state.get("confidence", 0.0),
                "reasoning": None,
            } if final_state.get("intent") else None,
            worker_used=final_state.get("selected_worker_name"),
            worker_result=final_state.get("worker_result"),
            pending_approval=final_state.get("pending_approval"),
            knowledge_sources=knowledge_sources,
            execution_time_ms=execution_time_ms,
        )
    
    @traceable(name="orchestrator_run_streaming", run_type="chain")
    async def run_streaming(
        self,
        presence_id: str,
        message: str,
        db_session: "AsyncSession",
        message_history: Optional[List[Dict[str, str]]] = None,
        history_summary: Optional[str] = None,
        user_id: str = "",
        user_wallet: str = "",
        user_role: str = "member",
        llm_provider: Optional[str] = None,
        llm_model: Optional[str] = None,
        auth_token: Optional[str] = None,
        mcp_headers: Optional[Dict[str, str]] = None,
    ) -> AsyncIterator[Dict[str, Any]]:
        """
        Execute the orchestration with streaming SSE events.
        
        Yields SSE events:
        - start: Initial metadata
        - intent: Intent analysis result
        - routing: Routing decision
        - executing: Worker execution started
        - tool_call: Tool being called
        - tool_result: Tool result
        - token: Response token
        - done: Completion
        - error: Error occurred
        
        Args:
            Same as run() plus:
            auth_token: Authorization token for MCP tools
            mcp_headers: Full headers dict for MCP tools
            
        Yields:
            Dict events for SSE streaming
        """
        start_time = time.time()
        
        print(f"\n[ORCHESTRATOR] run_streaming() called")
        print(f"[ORCHESTRATOR] presence_id: {presence_id}")
        print(f"[ORCHESTRATOR] auth_token: {auth_token[:20] if auth_token else 'None'}...")
        print(f"[ORCHESTRATOR] mcp_headers: {list(mcp_headers.keys()) if mcp_headers else 'None'}")
        
        # Load presence context
        context = await self._cache.get_presence_context(presence_id, db_session)
        
        if not context:
            yield {"event": "error", "error": "Presence agent not found", "code": "NOT_FOUND"}
            return
        
        # Emit start event
        yield {
            "event": "start",
            "presenceId": context["presence_id"],
            "presenceName": context["presence_name"],
            "workerCount": len(context["workers"]),
        }
        
        # Retrieve knowledge
        knowledge_context = ""
        knowledge_sources = []
        
        if context.get("knowledge_base_ids"):
            try:
                knowledge_context = await get_relevant_knowledge(
                    knowledge_base_ids=context["knowledge_base_ids"],
                    query=message,
                    db_session=db_session,
                )
                if knowledge_context:
                    for line in knowledge_context.split("\n"):
                        if line.startswith("[Source:"):
                            source = line.replace("[Source:", "").replace("]", "").strip()
                            if source and source not in knowledge_sources:
                                knowledge_sources.append(source)
            except Exception as e:
                print(f"Warning: Failed to fetch knowledge: {e}")
        
        # Build messages
        messages = self._build_messages(message, message_history, history_summary)
        
        # Build initial state with auth token
        initial_state = get_initial_state(
            messages=messages,
            presence_id=context["presence_id"],
            presence_name=context["presence_name"],
            presence_tone=context["presence_tone"],
            presence_system_prompt=context["presence_system_prompt"] or "",
            presence_description=context.get("presence_description") or "",
            presence_backstory=context.get("presence_backstory") or "",
            available_workers=context["workers"],
            capability_index=context["capability_index"],
            db_session=db_session,
            knowledge_context=knowledge_context,
            knowledge_sources=knowledge_sources,
            user_id=user_id,
            user_wallet=user_wallet,
            user_role=user_role,
            llm_provider=llm_provider or "openai",  # Default to ChatGPT
            llm_model=llm_model,  # Let get_llm() choose default model for provider
            auth_token=auth_token,  # Pass auth token
            mcp_headers=mcp_headers,  # Pass MCP headers
        )
        
        # For streaming, we run nodes manually to emit intermediate events
        accumulated_response = ""
        
        try:
            # Run intent analysis
            from app.agents.nodes import analyze_intent
            intent_result = await analyze_intent(initial_state)
            
            # Update state with intent result
            current_state = {**initial_state, **intent_result}
            
            # Emit intent event
            yield {
                "event": "intent",
                "intent": intent_result.get("intent"),
                "action": intent_result.get("action"),
                "confidence": intent_result.get("confidence", 0.0),
            }
            
            # Get routing info and emit
            routing_info = get_routing_info(current_state)
            yield {
                "event": "routing",
                "route": routing_info["route"],
                "workerId": routing_info.get("selected_worker_id"),
                "workerName": routing_info.get("selected_worker_name"),
                "reason": routing_info.get("reason"),
            }
            
            # Route based on intent
            if intent_result.get("requires_delegation"):
                # Worker execution path
                yield {
                    "event": "executing",
                    "workerId": intent_result.get("selected_worker_id"),
                    "workerName": intent_result.get("selected_worker_name"),
                    "action": intent_result.get("action"),
                }
                
                # Execute worker with streaming events
                from app.agents.nodes import execute_worker_streaming
                
                worker_result_data = None
                async for event in execute_worker_streaming(current_state):
                    event_type = event.get("event")
                    
                    if event_type == "tool_loading":
                        yield {
                            "event": "toolLoading",
                            "tools": event.get("tools", []),
                            "workerId": event.get("worker_id"),
                        }
                    
                    elif event_type == "tool_call":
                        yield {
                            "event": "toolCall",
                            "toolName": event.get("tool_name"),
                            "arguments": event.get("arguments", {}),
                        }
                    
                    elif event_type == "tool_result":
                        yield {
                            "event": "toolResult",
                            "toolName": event.get("tool_name"),
                            "success": event.get("success", False),
                            "durationMs": event.get("duration_ms", 0),
                            "error": event.get("error"),
                        }
                    
                    elif event_type == "worker_complete":
                        worker_result_data = event.get("worker_result", {})
                    
                    elif event_type == "error":
                        yield {
                            "event": "workerError",
                            "error": event.get("error"),
                        }
                
                # Update state with worker result
                if worker_result_data:
                    current_state = {**current_state, "worker_result": worker_result_data}
                    
                    # Emit worker result summary
                    yield {
                        "event": "workerResult",
                        "success": worker_result_data.get("success", False),
                        "toolCallsCount": len(worker_result_data.get("tool_calls", [])),
                    }
                    
                    # Stream the response
                    response = worker_result_data.get("output", "")
                    for char in response:
                        accumulated_response += char
                        yield {"event": "token", "token": char}
            else:
                # Supervisor response path - stream directly
                async for token in generate_supervisor_response_streaming(current_state):
                    accumulated_response += token
                    yield {"event": "token", "token": token}
            
            # Done event
            yield {
                "event": "done",
                "fullResponse": accumulated_response,
                "presenceId": context["presence_id"],
                "presenceName": context["presence_name"],
                "knowledgeSources": knowledge_sources,
                "executionTimeMs": int((time.time() - start_time) * 1000),
            }
            
        except Exception as e:
            print(f"[ORCHESTRATOR] ❌ Error: {e}")
            import traceback
            traceback.print_exc()
            yield {"event": "error", "error": str(e), "code": "EXECUTION_ERROR"}
    
    def _build_messages(
        self,
        current_message: str,
        history: Optional[List[Dict[str, str]]] = None,
        history_summary: Optional[str] = None,
    ) -> List:
        """Build LangChain messages from history, summary, and current message.
        
        If a history_summary is provided, it's prepended as a SystemMessage
        to provide context from older summarized messages.
        """
        print(f"\n[ORCHESTRATOR] ========== BUILDING MESSAGES ==========")
        print(f"[ORCHESTRATOR] Current message: {current_message[:50]}...")
        print(f"[ORCHESTRATOR] Recent history: {len(history or [])} messages")
        print(f"[ORCHESTRATOR] Has summary: {'YES' if history_summary else 'NO'}")
        
        messages = []
        
        # Add summary of older messages if present
        if history_summary:
            summary_content = f"Previous Conversation Summary:\n{history_summary}"
            messages.append(SystemMessage(content=summary_content))
            print(f"[ORCHESTRATOR] ✅ Added SystemMessage with summary ({len(history_summary)} chars)")
            print(f"[ORCHESTRATOR]    Summary preview: {history_summary[:80]}...")
        
        # Add recent history
        if history:
            print(f"[ORCHESTRATOR] Adding {len(history)} recent history messages:")
            for i, msg in enumerate(history or []):
                role = msg.get("role", "user")
                content = msg.get("content", "")
                msg_type = "HumanMessage" if role == "user" else "AIMessage"
                print(f"[ORCHESTRATOR]    [{i}] {msg_type}: {content[:40]}...")
                
                if role == "user":
                    messages.append(HumanMessage(content=content))
                elif role == "assistant":
                    messages.append(AIMessage(content=content))
        
        # Add current message
        messages.append(HumanMessage(content=current_message))
        print(f"[ORCHESTRATOR] ✅ Added current message as HumanMessage")
        
        print(f"[ORCHESTRATOR] Total messages built: {len(messages)}")
        print(f"[ORCHESTRATOR] ===========================================\n")
        return messages


# Singleton instance
agent_orchestrator = AgentOrchestrator()