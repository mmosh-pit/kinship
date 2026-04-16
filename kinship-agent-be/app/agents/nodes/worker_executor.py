"""
Kinship Agent - Enhanced Worker Executor Node

ADDRESSES CONCERNS:
- #8 MCP Tool Validation: Validates tools before execution
- #9 Graph Builder Work: Tools loaded once per worker execution, not per request
- #15 Failure Handling: Explicit error paths with fallback responses
- NEW: Workers can function WITHOUT tools using knowledge base + system prompt
- CRITICAL FIX: Forces tool usage for action verbs, prevents LLM hallucination

EXECUTION FLOW:
1. Load worker config (cached)
2. Retrieve knowledge context for worker (from Pinecone)
3. If tools configured: Validate and load MCP tools, run ReAct loop
4. If NO tools: Run simple LLM completion with knowledge context
5. Handle failures gracefully (#15)
6. Return structured result
"""

import asyncio
import logging
import time
from typing import Dict, Any, Optional, List, TYPE_CHECKING, AsyncIterator, Callable, Awaitable

from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langchain_core.tools import BaseTool
from langsmith import traceable

from app.agents.types import AgentState, WorkerResult, ToolCallInfo
from app.core.config import orchestration_config
from app.core.llm import get_llm, normalize_content

# NOTE: cache_manager, mcp_tool_registry, and load_and_convert_tools
# are imported inside functions to avoid circular imports

logger = logging.getLogger(__name__)

# Type alias for tool event callbacks
ToolEventCallback = Callable[[str, Dict[str, Any]], Awaitable[None]]


# ─────────────────────────────────────────────────────────────────────────────
# Action Verbs that REQUIRE Tool Execution
# These actions MUST call a tool - LLM cannot generate fake success responses
# ─────────────────────────────────────────────────────────────────────────────

TOOL_REQUIRED_ACTION_VERBS = {
    # Financial/Blockchain actions
    "transfer", "send", "swap", "stake", "unstake", "withdraw", "deposit",
    "mint", "burn", "approve", "buy", "sell", "trade", "pay", "tip",
    # Social actions
    "post", "tweet", "reply", "retweet", "like", "follow", "unfollow",
    "comment", "share", "publish", "message", "dm",
    # CRUD actions
    "create", "update", "delete", "remove", "add", "edit", "modify",
    # System actions
    "execute", "run", "call", "invoke", "trigger", "schedule",
}

# Confirmation words that indicate user wants to proceed
CONFIRMATION_WORDS = {
    "yes", "yeah", "yep", "yup", "sure", "ok", "okay", "confirm", "confirmed",
    "proceed", "go ahead", "do it", "go", "please", "approved", "approve",
    "affirmative", "correct", "right", "absolutely", "definitely", "y",
}


def _is_user_confirmation(message: str) -> bool:
    """Check if a user message is a confirmation to proceed with an action."""
    if not message:
        return False
    
    message_lower = message.lower().strip()
    
    # Check for exact matches or short confirmations
    if message_lower in CONFIRMATION_WORDS:
        return True
    
    # Check if message starts with confirmation word
    first_word = message_lower.split()[0] if message_lower else ""
    if first_word in CONFIRMATION_WORDS:
        return True
    
    # Check for common confirmation patterns
    confirmation_patterns = [
        "yes,", "yes.", "yes!", "ok,", "ok.", "sure,", "sure.",
        "go ahead", "do it", "proceed", "confirm", "approved",
        "sounds good", "let's do", "make it", "please do",
    ]
    for pattern in confirmation_patterns:
        if pattern in message_lower:
            return True
    
    return False


def _is_fabricated_success(response_text: str) -> bool:
    """Check if an LLM response appears to claim success without having called a tool."""
    if not response_text:
        return False
    
    response_lower = response_text.lower()
    
    # Generic patterns indicating claimed completion
    success_patterns = [
        "has been completed",
        "has been done",
        "successfully completed",
        "successfully done",
        "i've completed",
        "i have completed",
        "i've done",
        "i have done",
        "done!",
        "completed!",
        "finished!",
        "success!",
        "✅",
        "🎉",
    ]
    
    # Action-specific success claims
    action_success_patterns = [
        ("post", ["has been posted", "posted successfully", "i've posted", "i have posted", "post created"]),
        ("publish", ["has been published", "published successfully", "i've published", "i have published"]),
        ("create", ["has been created", "created successfully", "i've created", "i have created"]),
        ("send", ["has been sent", "sent successfully", "i've sent", "i have sent"]),
        ("transfer", ["has been transferred", "transferred successfully", "i've transferred", "transfer complete"]),
        ("delete", ["has been deleted", "deleted successfully", "i've deleted", "i have deleted"]),
        ("update", ["has been updated", "updated successfully", "i've updated", "i have updated"]),
    ]
    
    # Check generic patterns
    for pattern in success_patterns:
        if pattern in response_lower:
            return True
    
    # Check action-specific patterns
    for action_verb, patterns in action_success_patterns:
        for pattern in patterns:
            if pattern in response_lower:
                return True
    
    return False


def _is_asking_for_confirmation(response_text: str) -> bool:
    """Check if an LLM response is asking for user confirmation instead of executing."""
    if not response_text:
        return False
    
    response_lower = response_text.lower()
    
    confirmation_ask_patterns = [
        "would you like me to",
        "shall i proceed",
        "should i go ahead",
        "do you want me to",
        "can i proceed",
        "may i proceed",
        "would you like to proceed",
        "should i",
        "shall i",
        "is this correct",
        "does this look good",
        "ready to",
        "confirm?",
        "go ahead?",
        "proceed?",
    ]
    
    for pattern in confirmation_ask_patterns:
        if pattern in response_lower:
            return True
    
    return False


def _is_asking_for_missing_parameters(response_text: str) -> bool:
    """
    Check if an LLM response is asking for missing required parameters.
    
    This is CORRECT behavior - we should NOT retry when the LLM is asking
    for information it needs to complete the action.
    """
    if not response_text:
        return False
    
    response_lower = response_text.lower()
    
    # Patterns that indicate asking for missing information
    missing_info_patterns = [
        # Questions about content
        "what would you like",
        "what should",
        "what do you want",
        "what is the",
        "what are the",
        "what text",
        "what message",
        "what content",
        
        # Questions about specific fields
        "subject line",
        "email subject",
        "email body",
        "message body",
        "post content",
        "tweet content",
        "body of the email",
        "content of the",
        
        # Asking for details
        "could you provide",
        "could you please provide",
        "please provide",
        "can you provide",
        "need to know",
        "need the following",
        "need more information",
        "need some information",
        "missing information",
        "required information",
        
        # Asking about amounts/values
        "how much",
        "how many",
        "what amount",
        
        # Generic asking patterns
        "please specify",
        "please tell me",
        "let me know",
        "can you tell me",
        "could you tell me",
        "what would the",
        
        # Questions ending with ?
        "include in the email?",
        "include in the message?",
        "include in the post?",
        "say in the",
        "write in the",
    ]
    
    for pattern in missing_info_patterns:
        if pattern in response_lower:
            return True
    
    # Also check for question marks combined with keywords
    if "?" in response_text:
        question_keywords = [
            "subject", "body", "content", "message", "text", "amount",
            "recipient", "title", "description", "details"
        ]
        for keyword in question_keywords:
            if keyword in response_lower:
                return True
    
    return False


def _action_requires_tool(action: str) -> bool:
    """
    Check if an action REQUIRES a tool call to complete.
    
    These actions cannot be "completed" by the LLM generating text -
    they require actual tool execution.
    """
    if not action:
        return False
    
    action_lower = action.lower()
    
    # Check if any required verb is in the action
    for verb in TOOL_REQUIRED_ACTION_VERBS:
        if verb in action_lower:
            return True
    
    return False
    
    # Also check for common patterns
    if any(pattern in action_lower for pattern in [
        "sol_", "token_", "_sol", "_token",  # Solana patterns
        "nft_", "_nft",  # NFT patterns
        "tx_", "_tx", "transaction",  # Transaction patterns
        "bluesky", "bsky",  # Bluesky patterns
    ]):
        return True
    
    return False


# ─────────────────────────────────────────────────────────────────────────────
# Error Response Templates (#15)
# ─────────────────────────────────────────────────────────────────────────────

ERROR_RESPONSES = {
    "worker_not_found": "I couldn't find the worker configuration. This might be a temporary issue. Please try again.",
    "tool_validation_failed": "The required tools are not properly configured. Please contact support to resolve this issue.",
    "tool_load_failed": "I couldn't connect to the required services to complete this action. The transaction was NOT executed. Please try again in a moment or contact support if the issue persists.",
    "execution_timeout": "The operation took too long. Please try a simpler request or try again later.",
    "execution_error": "Something went wrong while executing the task. The transaction was NOT executed. Error: {error}",
    "max_iterations": "I've tried multiple approaches but couldn't complete the task. Let me summarize what I found.",
    "tool_not_called": "I was unable to execute the requested action. The tool was not called. Please try again or rephrase your request.",
}


@traceable(name="worker_executor", run_type="chain")
async def execute_worker(state: AgentState) -> Dict[str, Any]:
    """
    Execute the selected worker with proper error handling.

    This node:
    1. Loads worker config from cache
    2. Retrieves knowledge context for worker (NEW)
    3. If tools: Validates and loads MCP tools, runs ReAct loop
    4. If NO tools: Runs simple LLM completion with knowledge (NEW)
    5. Handles all failure modes (#15)

    Returns:
        State updates with worker_result
    """
    # Lazy imports to avoid circular dependency
    from app.agents.cache.manager import cache_manager
    from app.agents.mcp.registry import mcp_tool_registry
    from app.agents.mcp.langchain_adapter import load_and_convert_tools
    from app.agents.knowledge import get_relevant_knowledge

    start_time = time.time()
    worker_id = state.get("selected_worker_id")
    worker_name = state.get("selected_worker_name", "Worker")
    action = state.get("action", "task")

    logger.info(f"Worker execution started: {worker_name} ({worker_id}) for action: {action}")

    # ─────────────────────────────────────────────────────────────────────────
    # 1. LOAD WORKER CONFIG (with caching, #9)
    # ─────────────────────────────────────────────────────────────────────────
    db_session = state.get("db_session")
    if not db_session:
        return _error_result(
            "worker_not_found",
            worker_id=worker_id,
            worker_name=worker_name,
            start_time=start_time,
        )

    try:
        worker_config = await cache_manager.get_worker_config(worker_id, db_session)
    except Exception as e:
        logger.error(f"Failed to load worker config: {e}")
        return _error_result(
            "worker_not_found",
            worker_id=worker_id,
            worker_name=worker_name,
            start_time=start_time,
            error=str(e),
        )

    if not worker_config:
        logger.error(f"Worker config not found: {worker_id}")
        return _error_result(
            "worker_not_found",
            worker_id=worker_id,
            worker_name=worker_name,
            start_time=start_time,
        )

    # ─────────────────────────────────────────────────────────────────────────
    # 2. RETRIEVE KNOWLEDGE CONTEXT FOR WORKER (NEW)
    # ─────────────────────────────────────────────────────────────────────────
    knowledge_context = ""
    knowledge_base_ids = worker_config.get("knowledge_base_ids", [])

    if knowledge_base_ids:
        try:
            # Get the user message for query
            messages = state.get("messages", [])
            query = ""
            for msg in reversed(messages):
                if isinstance(msg, HumanMessage):
                    query = msg.content
                    break
                elif hasattr(msg, "type") and msg.type == "human":
                    query = msg.content
                    break

            if query:
                knowledge_context = await get_relevant_knowledge(
                    knowledge_base_ids=knowledge_base_ids,
                    query=query,
                    db_session=db_session,
                )
                if knowledge_context:
                    logger.info(f"Retrieved knowledge context for worker {worker_id}")
        except Exception as e:
            logger.warning(f"Failed to retrieve knowledge for worker {worker_id}: {e}")

    # ─────────────────────────────────────────────────────────────────────────
    # 3. CHECK IF TOOLS ARE CONFIGURED
    # ─────────────────────────────────────────────────────────────────────────
    tool_names = worker_config.get("tools", [])

    if not tool_names:
        # ─────────────────────────────────────────────────────────────────────
        # NO TOOLS: Run simple LLM completion with knowledge context (NEW)
        # ─────────────────────────────────────────────────────────────────────
        logger.info(f"Worker {worker_id} has no tools - running knowledge-based completion")

        try:
            result = await _run_knowledge_completion(
                state=state,
                worker_config=worker_config,
                knowledge_context=knowledge_context,
                action=action,
            )

            execution_time_ms = int((time.time() - start_time) * 1000)
            result["execution_time_ms"] = execution_time_ms

            logger.info(
                f"Worker knowledge-based completion finished: {worker_name}",
                extra={
                    "worker_id": worker_id,
                    "success": result.get("success"),
                    "has_knowledge": bool(knowledge_context),
                    "execution_time_ms": execution_time_ms,
                },
            )

            return {"worker_result": result}

        except asyncio.TimeoutError:
            logger.error(f"Worker execution timeout: {worker_id}")
            return _error_result(
                "execution_timeout",
                worker_id=worker_id,
                worker_name=worker_name,
                start_time=start_time,
            )
        except Exception as e:
            logger.error(f"Worker execution error: {e}")
            return _error_result(
                "execution_error",
                worker_id=worker_id,
                worker_name=worker_name,
                start_time=start_time,
                error=str(e),
            )

    # ─────────────────────────────────────────────────────────────────────────
    # 4. VALIDATE TOOLS (#8)
    # ─────────────────────────────────────────────────────────────────────────
    validation = mcp_tool_registry.validate_worker_tools(worker_id, tool_names)

    if not validation.is_valid:
        logger.warning(f"Tool validation failed for worker {worker_id}: {validation.errors}")
        # Continue with valid tools only
        tool_names = validation.valid_tools

        if not tool_names:
            # CRITICAL: Do NOT fall back to knowledge completion when tools are required!
            logger.error(
                f"❌ CRITICAL: No valid tools for worker {worker_id}. "
                f"Validation errors: {validation.errors}"
            )
            return _error_result(
                "tool_validation_failed",
                worker_id=worker_id,
                worker_name=worker_name,
                start_time=start_time,
                error=f"Tool validation failed: {'; '.join(validation.errors)}",
            )

    # ─────────────────────────────────────────────────────────────────────────
    # 5. LOAD MCP TOOLS (with caching, #9)
    # ─────────────────────────────────────────────────────────────────────────
    # Extract auth token from state
    auth_token = state.get("auth_token")
    mcp_headers = state.get("mcp_headers", {})
    
    try:
        langchain_tools = await load_and_convert_tools(
            tool_names,
            auth_token=auth_token,
            mcp_headers=mcp_headers,
        )
    except Exception as e:
        logger.error(f"❌ Failed to load MCP tools: {e}")
        import traceback
        traceback.print_exc()
        # CRITICAL: Do NOT fall back to knowledge completion when tools are required!
        return _error_result(
            "tool_load_failed",
            worker_id=worker_id,
            worker_name=worker_name,
            start_time=start_time,
            error=f"Failed to connect to MCP servers: {str(e)}",
        )

    if not langchain_tools:
        # CRITICAL: Do NOT fall back to knowledge completion when tools are required!
        # This prevents the LLM from fabricating tool execution results.
        logger.error(
            f"❌ CRITICAL: No tools loaded for worker {worker_id}. "
            f"Worker requires tools: {tool_names}. Cannot proceed without tools."
        )
        return _error_result(
            "tool_load_failed",
            worker_id=worker_id,
            worker_name=worker_name,
            start_time=start_time,
            error=f"Failed to load required tools: {tool_names}. MCP servers may be unavailable.",
        )

    logger.info(f"Loaded {len(langchain_tools)} tools for worker {worker_id}")

    # ─────────────────────────────────────────────────────────────────────────
    # 6. EXECUTE REACT LOOP WITH TOOLS
    # ─────────────────────────────────────────────────────────────────────────
    try:
        result = await _run_react_loop(
            state=state,
            worker_config=worker_config,
            tools=langchain_tools,
            knowledge_context=knowledge_context,
            action=action,
        )

        execution_time_ms = int((time.time() - start_time) * 1000)
        result["execution_time_ms"] = execution_time_ms

        logger.info(
            f"Worker execution completed: {worker_name}",
            extra={
                "worker_id": worker_id,
                "success": result.get("success"),
                "tool_calls": len(result.get("tool_calls", [])),
                "execution_time_ms": execution_time_ms,
            },
        )

        return {"worker_result": result}

    except asyncio.TimeoutError:
        logger.error(f"Worker execution timeout: {worker_id}")
        return _error_result(
            "execution_timeout",
            worker_id=worker_id,
            worker_name=worker_name,
            start_time=start_time,
        )
    except Exception as e:
        logger.error(f"Worker execution error: {e}")
        return _error_result(
            "execution_error",
            worker_id=worker_id,
            worker_name=worker_name,
            start_time=start_time,
            error=str(e),
        )


@traceable(name="worker_knowledge_completion", run_type="chain")
async def _run_knowledge_completion(
    state: AgentState,
    worker_config: Dict[str, Any],
    knowledge_context: str,
    action: str,
) -> WorkerResult:
    """
    Run simple LLM completion for workers WITHOUT tools.

    Uses system prompt + knowledge context to generate response.

    Returns:
        WorkerResult with output (no tool calls)
    """
    # Build system prompt with knowledge
    system_prompt = _build_worker_system_prompt(
        worker_config=worker_config,
        tools=[],
        knowledge_context=knowledge_context,
        action=action,
    )

    # Get messages from state
    messages = state.get("messages", [])

    # Get LLM (no tools bound)
    llm = get_llm(
        provider=state.get("llm_provider") or "anthropic",
        model=state.get("llm_model"),
        temperature=0.7,
    )

    # Build conversation
    conversation = [SystemMessage(content=system_prompt)]
    for msg in messages:
        if isinstance(msg, (HumanMessage, AIMessage)):
            conversation.append(msg)
        elif hasattr(msg, "type"):
            if msg.type == "human":
                conversation.append(HumanMessage(content=msg.content))
            elif msg.type == "ai":
                conversation.append(AIMessage(content=msg.content))

    # Execute LLM call
    timeout = orchestration_config.worker.tool_timeout_seconds

    try:
        response = await asyncio.wait_for(
            llm.ainvoke(conversation),
            timeout=timeout,
        )
        final_output = normalize_content(response.content) if hasattr(response, "content") else str(response)
    except asyncio.TimeoutError:
        raise
    except Exception as e:
        logger.error(f"LLM call failed in knowledge completion: {e}")
        final_output = f"I encountered an error while processing your request: {e}"

    return WorkerResult(
        success=bool(final_output),
        output=final_output,
        tool_calls=[],
        error=None,
        execution_time_ms=0,  # Will be set by caller
    )


@traceable(name="worker_react_loop", run_type="chain")
async def _run_react_loop(
    state: AgentState,
    worker_config: Dict[str, Any],
    tools: List[BaseTool],
    knowledge_context: str,
    action: str,
    event_callback: Optional[ToolEventCallback] = None,
) -> WorkerResult:
    """
    Run ReAct loop with the worker.

    Args:
        state: Agent state
        worker_config: Worker configuration
        tools: LangChain tools to use
        knowledge_context: RAG context
        action: Action being performed
        event_callback: Optional async callback for streaming tool events
                       Called with (event_type, event_data)

    Returns:
        WorkerResult with output and tool call records
    """
    print(f"\n[REACT LOOP] {'='*60}")
    print(f"[REACT LOOP] _run_react_loop() STARTED")
    print(f"[REACT LOOP] {'='*60}")
    print(f"[REACT LOOP] Tools received: {len(tools)}")
    for i, t in enumerate(tools):
        print(f"[REACT LOOP]   [{i}] {t.name}")
    print(f"[REACT LOOP] Knowledge context length: {len(knowledge_context)}")
    print(f"[REACT LOOP] Action: {action}")
    
    # Get auth_token from state for tool authorization
    auth_token = state.get("auth_token")
    print(f"[REACT LOOP] Auth token available: {bool(auth_token)}")
    
    # Get user_wallet from state for tools that need it (e.g., Gmail)
    user_wallet = state.get("user_wallet", "")
    print(f"[REACT LOOP] User wallet: {user_wallet[:20] if user_wallet else 'None'}...")
    
    # Get presence_id from state (the Presence agent ID, e.g., agent_F1JivhjD)
    presence_id = state.get("presence_id", "")
    print(f"[REACT LOOP] Presence ID: {presence_id}")
    
    # Get messages from state
    messages = state.get("messages", [])
    print(f"[REACT LOOP] Messages in state: {len(messages)}")
    
    # Check if this action REQUIRES a tool call
    requires_tool = _action_requires_tool(action)
    print(f"[REACT LOOP] Action requires tool (from action): {requires_tool}")
    
    # Check if the intent analyzer already flagged this as a confirmation
    # (This happens when user confirms a pending action and intent_analyzer short-circuited)
    is_confirmation_from_state = state.get("is_confirmation", False)
    print(f"[REACT LOOP] Is confirmation (from state): {is_confirmation_from_state}")
    
    # Check if the last user message is a confirmation
    is_confirmation = is_confirmation_from_state  # Start with state value
    last_user_message = ""
    pending_action_content = None
    
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage) or (hasattr(msg, 'type') and msg.type == 'human'):
            last_user_message = msg.content if hasattr(msg, 'content') else str(msg)
            # Only check if not already confirmed from state
            if not is_confirmation:
                is_confirmation = _is_user_confirmation(last_user_message)
            break
    
    # If it's a confirmation, look for the original action in conversation history
    if is_confirmation and len(messages) >= 2:
        print(f"[REACT LOOP] Confirmation detected, looking for pending action in history...")
        for msg in messages:
            msg_content = ""
            is_human = isinstance(msg, HumanMessage) or (hasattr(msg, 'type') and msg.type == 'human')
            if is_human:
                msg_content = msg.content if hasattr(msg, 'content') else str(msg)
                # Check if this earlier message contains an action request
                if _action_requires_tool(msg_content):
                    pending_action_content = msg_content
                    requires_tool = True
                    print(f"[REACT LOOP] Found pending action: '{msg_content[:50]}...'")
                    break
    
    # If confirmation came from state, it means intent_analyzer already matched the action
    # So we should definitely require tool execution
    if is_confirmation_from_state:
        requires_tool = True
        print(f"[REACT LOOP] Forcing requires_tool=True due to confirmation from intent_analyzer")
    
    print(f"[REACT LOOP] Last user message: '{last_user_message[:50]}...'" if last_user_message else "[REACT LOOP] No user message found")
    print(f"[REACT LOOP] Is confirmation: {is_confirmation}")
    print(f"[REACT LOOP] Requires tool (final): {requires_tool}")
    if pending_action_content:
        print(f"[REACT LOOP] Pending action content: '{pending_action_content[:50]}...'")
    
    for i, msg in enumerate(messages):
        msg_type = type(msg).__name__
        content = str(msg.content)[:50] if hasattr(msg, 'content') else str(msg)[:50]
        print(f"[REACT LOOP]   [{i}] {msg_type}: {content}...")
    
    # Get worker_id from worker_config for tool workerId parameter
    worker_id = worker_config.get("id")
    print(f"[REACT LOOP] Worker ID: {worker_id}")
    
    # Build system prompt
    system_prompt = _build_worker_system_prompt(
        worker_config=worker_config,
        tools=tools,
        knowledge_context=knowledge_context,
        action=action,
        auth_token=auth_token,
        presence_id=presence_id,
        worker_id=worker_id,
        user_wallet=user_wallet,
        is_confirmation=is_confirmation,
    )
    print(f"[REACT LOOP] System prompt length: {len(system_prompt)}")

    # Get LLM with tools bound
    print(f"[REACT LOOP] Creating LLM...")
    llm = get_llm(
        provider=state.get("llm_provider") or "anthropic",
        model=state.get("llm_model"),
        temperature=0.0,  # Zero temperature for deterministic tool usage
    )
    print(f"[REACT LOOP] LLM created: {type(llm)}")
    
    # Determine if we should FORCE tool usage
    # ONLY force when user has CONFIRMED (meaning they already provided all info)
    # On initial action requests, allow the LLM to ask for missing parameters
    force_tool_initially = is_confirmation  # Only force on confirmation, not on initial request
    print(f"[REACT LOOP] Force tool initially: {force_tool_initially} (is_confirmation={is_confirmation})")
    print(f"[REACT LOOP] Action requires tool: {requires_tool}")
    
    print(f"[REACT LOOP] Binding {len(tools)} tools to LLM...")
    
    # Create TWO LLM bindings:
    # 1. Forced binding (tool_choice="any") - MUST call a tool (used on confirmation or retry)
    # 2. Normal binding - can choose to call tools or respond with text (used initially to allow asking for params)
    if tools:
        print(f"[REACT LOOP] 🔒 Creating FORCED tool binding (tool_choice='any')")
        llm_forced_tools = llm.bind_tools(tools, tool_choice="any")
        print(f"[REACT LOOP] 📝 Creating NORMAL tool binding (optional tools)")
        llm_optional_tools = llm.bind_tools(tools)
    else:
        llm_forced_tools = llm
        llm_optional_tools = llm
    
    # Use forced binding ONLY when user has confirmed (all info should already be provided)
    # Otherwise use optional binding so LLM can ask for missing parameters
    llm_with_tools = llm_forced_tools if force_tool_initially else llm_optional_tools
    print(f"[REACT LOOP] ✅ Initial LLM binding: {'FORCED (user confirmed)' if force_tool_initially else 'OPTIONAL (can ask for params)'}")

    # Build conversation
    conversation = [SystemMessage(content=system_prompt)]
    for msg in messages:
        if isinstance(msg, (HumanMessage, AIMessage)):
            conversation.append(msg)
    print(f"[REACT LOOP] Conversation length: {len(conversation)}")

    # ReAct loop
    max_iterations = orchestration_config.worker.max_tool_calls
    timeout = orchestration_config.worker.tool_timeout_seconds
    tool_calls_record: List[ToolCallInfo] = []
    final_output = ""
    
    print(f"[REACT LOOP] Max iterations: {max_iterations}")
    print(f"[REACT LOOP] Timeout: {timeout}s")

    for iteration in range(max_iterations):
        print(f"\n[REACT LOOP] {'─'*40}")
        print(f"[REACT LOOP] ITERATION {iteration + 1}/{max_iterations}")
        print(f"[REACT LOOP] {'─'*40}")
        
        # Call LLM
        try:
            print(f"[REACT LOOP] Calling LLM with {len(conversation)} messages...")
            response = await asyncio.wait_for(
                llm_with_tools.ainvoke(conversation),
                timeout=timeout,
            )
            print(f"[REACT LOOP] ✅ LLM response received")
            print(f"[REACT LOOP] Response type: {type(response)}")
            response_content = normalize_content(response.content) if hasattr(response, 'content') else ''
            print(f"[REACT LOOP] Response content length: {len(response_content) if response_content else 'N/A'}")
            print(f"[REACT LOOP] Has tool_calls: {hasattr(response, 'tool_calls') and bool(response.tool_calls)}")
            if hasattr(response, 'tool_calls') and response.tool_calls:
                print(f"[REACT LOOP] Tool calls count: {len(response.tool_calls)}")
                for tc in response.tool_calls:
                    print(f"[REACT LOOP]   Tool call: {tc.get('name', 'unknown')} - args: {tc.get('args', {})}")
        except asyncio.TimeoutError:
            print(f"[REACT LOOP] ❌ LLM TIMEOUT after {timeout}s")
            raise
        except Exception as e:
            print(f"[REACT LOOP] ❌ LLM call EXCEPTION: {e}")
            import traceback
            traceback.print_exc()
            logger.error(f"LLM call failed in iteration {iteration}: {e}")
            break

        # Check for tool calls
        if hasattr(response, "tool_calls") and response.tool_calls:
            print(f"[REACT LOOP] Processing {len(response.tool_calls)} tool calls...")
            conversation.append(response)

            # Execute each tool call
            for tool_call in response.tool_calls:
                tool_name = tool_call.get("name", "unknown")
                tool_args = tool_call.get("args", {})
                tool_id = tool_call.get("id", "")

                print(f"\n[REACT LOOP] >>> EXECUTING TOOL: {tool_name}")
                print(f"[REACT LOOP]     Args: {tool_args}")
                print(f"[REACT LOOP]     ID: {tool_id}")
                
                logger.info(f"Executing tool: {tool_name}")

                # Emit tool_call event
                if event_callback:
                    print(f"[REACT LOOP]     Emitting tool_call event...")
                    await event_callback(
                        "tool_call",
                        {
                            "tool_name": tool_name,
                            "arguments": tool_args,
                            "iteration": iteration,
                        },
                    )

                # Find and execute tool
                print(f"[REACT LOOP]     Calling _execute_tool()...")
                tool_result = await _execute_tool(
                    tools=tools,
                    tool_name=tool_name,
                    tool_args=tool_args,
                )
                print(f"[REACT LOOP]     Tool result: success={tool_result.get('success')}, output_len={len(str(tool_result.get('output', '')))}")
                if tool_result.get('error'):
                    print(f"[REACT LOOP]     Tool error: {tool_result.get('error')}")

                # Record tool call (using ToolCallInfo format)
                tool_calls_record.append(
                    ToolCallInfo(
                        tool_name=tool_name,
                        arguments=tool_args,
                        result=tool_result.get("output", ""),
                        success=tool_result.get("success", False),
                        error=tool_result.get("error"),
                        duration_ms=tool_result.get("execution_time_ms", 0),
                    )
                )

                # Emit tool_result event
                if event_callback:
                    print(f"[REACT LOOP]     Emitting tool_result event...")
                    await event_callback(
                        "tool_result",
                        {
                            "tool_name": tool_name,
                            "success": tool_result.get("success", False),
                            "duration_ms": tool_result.get("execution_time_ms", 0),
                            "error": tool_result.get("error"),
                        },
                    )

                # Add tool result to conversation
                from langchain_core.messages import ToolMessage

                conversation.append(
                    ToolMessage(
                        content=tool_result.get("output", "Error executing tool"),
                        tool_call_id=tool_id,
                    )
                )
                print(f"[REACT LOOP]     Added ToolMessage to conversation")
            
            # After successful tool call(s), switch to optional tools for summary response
            if tool_calls_record:
                print(f"[REACT LOOP] 📝 Switching to OPTIONAL tool binding for summary")
                llm_with_tools = llm_optional_tools
        else:
            # No tool calls - check if this was expected
            print(f"[REACT LOOP] ⚠️ No tool calls in LLM response")
            response_content = normalize_content(response.content) if hasattr(response, 'content') else str(response)
            print(f"[REACT LOOP] LLM response content: {response_content[:200]}...")
            
            # Check for fabricated success, confirmation request, or asking for missing params
            is_fake_success = _is_fabricated_success(response_content)
            is_asking_confirmation = _is_asking_for_confirmation(response_content)
            is_asking_for_params = _is_asking_for_missing_parameters(response_content)
            
            if is_fake_success:
                print(f"[REACT LOOP] 🚨 DETECTED FABRICATED SUCCESS RESPONSE!")
            if is_asking_confirmation:
                print(f"[REACT LOOP] 🚨 DETECTED CONFIRMATION REQUEST (should execute directly)!")
            if is_asking_for_params:
                print(f"[REACT LOOP] ✅ LLM is asking for missing required parameters (CORRECT behavior)")
            
            # If LLM is asking for missing parameters, this is CORRECT - let it through
            if is_asking_for_params and not is_fake_success:
                print(f"[REACT LOOP] 📋 Allowing response - LLM correctly asking for missing information")
                final_output = response_content
                break
            
            # CRITICAL: If action requires a tool and we haven't made any tool calls yet
            if requires_tool and not tool_calls_record:
                print(f"[REACT LOOP] ⚠️ Action '{action}' requires tool but LLM didn't call any!")
                
                # RETRY: Add a forcing message and try again (max 3 retries)
                if iteration < 3:
                    print(f"[REACT LOOP] 🔄 RETRYING with explicit tool instruction (attempt {iteration + 2})")
                    
                    # Get available tool names
                    tool_names_list = [t.name for t in tools]
                    
                    # Add a forcing message
                    conversation.append(response)
                    
                    if is_fake_success:
                        retry_message = HumanMessage(content=f"""ERROR: You claimed success without calling a tool.

The action was NOT performed. Call a tool to execute it.

Available tools: {', '.join(tool_names_list)}

Use the authorization token from the system prompt. Call the tool now.""")
                    elif is_asking_confirmation:
                        retry_message = HumanMessage(content=f"""Do not ask for confirmation. The user's request is the confirmation.

Execute the action now by calling the appropriate tool.

Available tools: {', '.join(tool_names_list)}

Use the authorization token from the system prompt. Call the tool now.""")
                    else:
                        retry_message = HumanMessage(content=f"""You must call a tool to complete this action.

Available tools: {', '.join(tool_names_list)}

Use the authorization token from the system prompt. Extract other parameters from the conversation. Call the tool now.""")
                    
                    conversation.append(retry_message)
                    
                    # Ensure we're using forced tool binding for retry
                    print(f"[REACT LOOP] 🔒 Ensuring FORCED tool binding for retry")
                    llm_with_tools = llm_forced_tools
                    
                    print(f"[REACT LOOP] Added retry message, continuing loop...")
                    continue  # Continue to next iteration
                else:
                    # After retries, return error
                    print(f"[REACT LOOP] ❌ CRITICAL: Exhausted retries - LLM refuses to call tools")
                    logger.error(f"Tool-required action '{action}' failed after retries - LLM hallucinating")
                    
                    return WorkerResult(
                        success=False,
                        output="I was unable to complete this action because the tool could not be executed. Please try again or contact support if the issue persists.",
                        tool_calls=[],
                        error=f"Action '{action}' requires a tool call but LLM refused to call tools after multiple attempts",
                        execution_time_ms=0,
                    )
            
            # If we already made tool calls, this is the final summary response
            final_output = response_content
            break
    else:
        # Max iterations reached
        logger.warning(f"Max iterations ({max_iterations}) reached")
        final_output = "I've tried multiple approaches. Here's what I found so far."

    # Build result
    all_succeeded = (
        all(tc.get("success", False) for tc in tool_calls_record) if tool_calls_record else True
    )

    return WorkerResult(
        success=all_succeeded and bool(final_output),
        output=final_output,
        tool_calls=tool_calls_record,
        error=None if all_succeeded else "Some tool calls failed",
        execution_time_ms=0,  # Will be set by caller
    )


@traceable(name="tool_execution", run_type="tool")
async def _execute_tool(
    tools: List[BaseTool],
    tool_name: str,
    tool_args: Dict[str, Any],
) -> Dict[str, Any]:
    """Execute a single tool with error handling (#15)."""
    print(f"\n[EXECUTE TOOL] {'─'*40}")
    print(f"[EXECUTE TOOL] _execute_tool() called")
    print(f"[EXECUTE TOOL] tool_name: {tool_name}")
    print(f"[EXECUTE TOOL] tool_args: {tool_args}")
    print(f"[EXECUTE TOOL] Available tools: {[t.name for t in tools]}")
    
    start_time = time.time()

    # Find tool
    tool = next((t for t in tools if t.name == tool_name), None)
    if not tool:
        print(f"[EXECUTE TOOL] ❌ Tool '{tool_name}' NOT FOUND in available tools!")
        return {
            "success": False,
            "output": f"Tool '{tool_name}' not found",
            "error": "Tool not found",
            "execution_time_ms": 0,
        }

    print(f"[EXECUTE TOOL] ✅ Found tool: {tool.name}")
    print(f"[EXECUTE TOOL]    Type: {type(tool)}")
    print(f"[EXECUTE TOOL]    Description: {tool.description[:80] if tool.description else 'None'}...")
    
    try:
        # Execute tool
        print(f"[EXECUTE TOOL] >>> Calling tool.ainvoke({tool_args})...")
        result = await tool.ainvoke(tool_args)
        execution_time_ms = int((time.time() - start_time) * 1000)

        print(f"[EXECUTE TOOL] ✅ Tool execution SUCCESS!")
        print(f"[EXECUTE TOOL]    Duration: {execution_time_ms}ms")
        print(f"[EXECUTE TOOL]    Result type: {type(result)}")
        print(f"[EXECUTE TOOL]    Result preview: {str(result)[:200]}...")

        return {
            "success": True,
            "output": str(result),
            "error": None,
            "execution_time_ms": execution_time_ms,
        }
    except Exception as e:
        execution_time_ms = int((time.time() - start_time) * 1000)
        print(f"[EXECUTE TOOL] ❌ Tool execution FAILED!")
        print(f"[EXECUTE TOOL]    Duration: {execution_time_ms}ms")
        print(f"[EXECUTE TOOL]    Exception type: {type(e).__name__}")
        print(f"[EXECUTE TOOL]    Exception: {e}")
        import traceback
        traceback.print_exc()
        
        logger.error(f"Tool execution failed: {tool_name}: {e}")

        return {
            "success": False,
            "output": f"Tool execution failed: {e}",
            "error": str(e),
            "execution_time_ms": execution_time_ms,
        }


def _build_worker_system_prompt(
    worker_config: Dict[str, Any],
    tools: List[BaseTool],
    knowledge_context: str,
    action: str,
    auth_token: Optional[str] = None,
    presence_id: Optional[str] = None,
    worker_id: Optional[str] = None,
    user_wallet: Optional[str] = None,
    is_confirmation: bool = False,
) -> str:
    """Build system prompt for worker with strict tool usage enforcement."""
    name = worker_config.get("name", "Worker")
    description = worker_config.get("description", "")
    backstory = worker_config.get("backstory", "")
    system_prompt = worker_config.get("system_prompt", "")

    # Determine if this action requires tool usage
    requires_tool = _action_requires_tool(action)

    # Build credentials section (these are auto-filled by the system)
    # NOTE: Use snake_case parameter names to match MCP tool schemas
    credentials_lines = []
    if auth_token:
        credentials_lines.append(f"authorization: {auth_token}")
    if presence_id:
        credentials_lines.append(f"presence_id: {presence_id}")
    if worker_id:
        credentials_lines.append(f"worker_id: {worker_id}")
    if user_wallet:
        credentials_lines.append(f"wallet: {user_wallet}")
    
    credentials_block = "\n".join(credentials_lines) if credentials_lines else ""

    # Common parameter rules that apply to ALL tool usage
    parameter_rules = """
=== CRITICAL: PARAMETER HANDLING RULES ===

SYSTEM-PROVIDED PARAMETERS (use these exact values):
""" + credentials_block + """

IMPORTANT: Use the EXACT parameter names as shown above:
- presence_id = The Presence agent ID (use this for tool parameters named 'presence_id')
- worker_id = The Worker ID (use this for tool parameters named 'worker_id')
- wallet = The user's wallet address (use this for tool parameters named 'wallet')
- authorization = The auth token (use this for tool parameters named 'authorization')

USER-PROVIDED PARAMETERS (NEVER auto-fill these):
- For ANY tool parameter that requires user content (e.g., text, body, subject, message, content, title, description, amount, recipient details, etc.):
  * ONLY use values EXPLICITLY provided by the user in their message
  * NEVER invent, generate, or assume default values
  * NEVER use placeholder text like "Hello", "Test", "Sample", etc.

IF REQUIRED PARAMETERS ARE MISSING:
1. STOP - Do NOT call the tool
2. Ask the user to provide the specific missing information
3. Be clear about exactly what you need (e.g., "What would you like the email subject to be?")
4. Wait for the user's response before proceeding

EXAMPLES OF WHAT NOT TO DO:
- User says "Send an email to john@example.com" → Do NOT invent subject/body
- User says "Post to Bluesky" → Do NOT invent the post content
- User says "Transfer SOL" → Do NOT invent the amount
- User says "Create a tweet" → Do NOT invent the tweet text

EXAMPLES OF CORRECT BEHAVIOR:
- User says "Send an email to john@example.com" → Ask: "What should the subject and body of the email be?"
- User says "Post to Bluesky" → Ask: "What would you like the post to say?"
- User says "Transfer SOL to <address>" → Ask: "How much SOL would you like to transfer?"
"""

    # Build tools section
    if tools:
        tool_names = [tool.name for tool in tools]
        tool_list = "\n".join([f"  - {tool.name}" for tool in tools])
        
        if requires_tool or is_confirmation:
            # STRICT tool enforcement section
            if is_confirmation:
                # User has confirmed - MUST execute now
                tools_section = f"""
=== MANDATORY TOOL EXECUTION ===

The user has CONFIRMED. You MUST call a tool NOW.

Available tools:
{tool_list}

{parameter_rules}

CONFIRMATION CONTEXT:
- The user has already provided the required information in the conversation
- Look back at the conversation history to find the user-provided values
- Use those exact values - do not modify or add to them

INSTRUCTIONS:
1. Call one of the tools listed above IMMEDIATELY
2. Use the exact authorization and agentId values provided above
3. Extract ALL user-provided parameters from the conversation history
4. Only proceed if you have all required user-provided values

PROHIBITED:
- DO NOT respond with only text
- DO NOT say "I have posted" or "Success" without calling a tool
- DO NOT ask for more confirmation
- DO NOT invent or guess any parameter values

Your next response MUST be a tool call, not text."""
            else:
                # Action request - check for required parameters first
                tools_section = f"""
=== TOOL EXECUTION MODE ===

This request requires calling a tool.

Available tools:
{tool_list}

{parameter_rules}

WORKFLOW:
1. Identify which tool is needed for this action
2. Check what parameters the tool requires
3. Determine which required parameters the user has provided
4. IF any user-content parameters are missing → ASK the user for them
5. IF all required parameters are provided → Execute the tool immediately

DO NOT ask for confirmation if all parameters are provided - just execute.
DO NOT invent values for missing parameters - ask the user instead.

PROHIBITED:
- DO NOT generate fake or placeholder content
- DO NOT say "Done" or "Success" without actually calling a tool
- DO NOT generate fake results or URIs"""
        else:
            tools_section = f"""
Available tools:
{tool_list}

{parameter_rules}

Use tools when needed, but always ensure you have all required user-provided information first."""
    else:
        tools_section = "No tools available. Respond based on knowledge only."

    # Build knowledge section
    knowledge_section = f"\nContext:\n{knowledge_context}" if knowledge_context else ""

    # Build backstory section  
    backstory_section = f"\nBackground: {backstory}" if backstory else ""

    # Final instruction
    if is_confirmation:
        final_instruction = "\n\n>>> USER CONFIRMED. CALL THE TOOL NOW USING VALUES FROM CONVERSATION HISTORY. <<<"
    elif requires_tool:
        final_instruction = "\n\n>>> CHECK FOR MISSING PARAMETERS. ASK USER IF NEEDED. EXECUTE WHEN ALL INFO IS AVAILABLE. <<<"
    else:
        final_instruction = ""

    return f"""You are {name}.
{description}
{backstory_section}
{system_prompt}
{tools_section}
{knowledge_section}

Current task: {action}
{final_instruction}""".strip()


def _error_result(
    error_type: str,
    worker_id: str,
    worker_name: str,
    start_time: float,
    error: Optional[str] = None,
) -> Dict[str, Any]:
    """Create error result with appropriate message (#15)."""
    execution_time_ms = int((time.time() - start_time) * 1000)

    # Get error message template
    message = ERROR_RESPONSES.get(error_type, ERROR_RESPONSES["execution_error"])
    if "{error}" in message and error:
        message = message.format(error=error)

    logger.error(
        f"Worker error: {error_type}",
        extra={
            "worker_id": worker_id,
            "worker_name": worker_name,
            "error_type": error_type,
            "error_detail": error,
            "execution_time_ms": execution_time_ms,
        },
    )

    return {
        "worker_result": WorkerResult(
            success=False,
            output=message,
            tool_calls=[],
            error=error or error_type,
            execution_time_ms=execution_time_ms,
        )
    }


# ─────────────────────────────────────────────────────────────────────────────
# STREAMING WORKER EXECUTION
# ─────────────────────────────────────────────────────────────────────────────


@traceable(name="worker_executor_streaming", run_type="chain")
async def execute_worker_streaming(
    state: AgentState,
) -> AsyncIterator[Dict[str, Any]]:
    """
    Execute the selected worker with streaming tool events.

    Yields events:
    - {"event": "tool_loading", "tools": [...]}
    - {"event": "tool_call", "tool_name": "...", "arguments": {...}}
    - {"event": "tool_result", "tool_name": "...", "success": bool, "duration_ms": int}
    - {"event": "worker_result", "success": bool, "output": "..."}

    At the end, yields the final result with event="worker_complete"
    """
    from app.agents.cache.manager import cache_manager
    from app.agents.mcp.registry import mcp_tool_registry
    from app.agents.mcp.langchain_adapter import load_and_convert_tools
    from app.agents.knowledge import get_relevant_knowledge

    print(f"\n{'#'*70}")
    print(f"[WORKER EXECUTOR] execute_worker_streaming() STARTED")
    print(f"{'#'*70}")

    start_time = time.time()
    worker_id = state.get("selected_worker_id")
    worker_name = state.get("selected_worker_name", "Worker")
    action = state.get("action", "task")

    print(f"[WORKER EXECUTOR] worker_id: {worker_id}")
    print(f"[WORKER EXECUTOR] worker_name: {worker_name}")
    print(f"[WORKER EXECUTOR] action: {action}")

    logger.info(f"Worker streaming execution started: {worker_name} ({worker_id})")

    # Load worker config
    db_session = state.get("db_session")
    print(f"[WORKER EXECUTOR] db_session exists: {db_session is not None}")
    
    if not db_session:
        print(f"[WORKER EXECUTOR] ❌ ERROR: No db_session!")
        yield {"event": "error", "error": "Database session not available"}
        return

    print(f"[WORKER EXECUTOR] Loading worker config from cache...")
    try:
        worker_config = await cache_manager.get_worker_config(worker_id, db_session)
        print(f"[WORKER EXECUTOR] ✅ Worker config loaded")
        print(f"[WORKER EXECUTOR] Worker config keys: {list(worker_config.keys()) if worker_config else 'None'}")
    except Exception as e:
        print(f"[WORKER EXECUTOR] ❌ Failed to load worker config: {e}")
        logger.error(f"Failed to load worker config: {e}")
        yield {"event": "error", "error": f"Failed to load worker: {e}"}
        return

    if not worker_config:
        print(f"[WORKER EXECUTOR] ❌ Worker config is None!")
        yield {"event": "error", "error": "Worker not found"}
        return

    # Get knowledge context
    knowledge_context = ""
    knowledge_base_ids = worker_config.get("knowledge_base_ids", [])
    print(f"[WORKER EXECUTOR] knowledge_base_ids: {knowledge_base_ids}")

    if knowledge_base_ids:
        try:
            messages = state.get("messages", [])
            query = ""
            for msg in reversed(messages):
                if isinstance(msg, HumanMessage):
                    query = msg.content
                    break
                elif hasattr(msg, "type") and msg.type == "human":
                    query = msg.content
                    break

            if query:
                knowledge_context = await get_relevant_knowledge(
                    knowledge_base_ids=knowledge_base_ids,
                    query=query,
                    db_session=db_session,
                )
                print(f"[WORKER EXECUTOR] Knowledge context length: {len(knowledge_context)}")
        except Exception as e:
            print(f"[WORKER EXECUTOR] ⚠️ Knowledge retrieval failed: {e}")
            logger.warning(f"Failed to retrieve knowledge: {e}")

    # Check tools
    tool_names = worker_config.get("tools", [])
    print(f"\n[WORKER EXECUTOR] {'─'*50}")
    print(f"[WORKER EXECUTOR] TOOLS FROM WORKER CONFIG:")
    print(f"[WORKER EXECUTOR] tool_names: {tool_names}")
    print(f"[WORKER EXECUTOR] tool_names type: {type(tool_names)}")
    print(f"[WORKER EXECUTOR] {'─'*50}")

    if not tool_names:
        # No tools - run knowledge completion
        print(f"[WORKER EXECUTOR] No tools configured - running knowledge completion")
        try:
            result = await _run_knowledge_completion(
                state=state,
                worker_config=worker_config,
                knowledge_context=knowledge_context,
                action=action,
            )
            execution_time_ms = int((time.time() - start_time) * 1000)
            result["execution_time_ms"] = execution_time_ms

            yield {
                "event": "worker_complete",
                "worker_result": result,
            }
            return
        except Exception as e:
            print(f"[WORKER EXECUTOR] ❌ Knowledge completion failed: {e}")
            yield {"event": "error", "error": str(e)}
            return

    # Validate and load tools
    print(f"\n[WORKER EXECUTOR] Validating tools with mcp_tool_registry...")
    validation = mcp_tool_registry.validate_worker_tools(worker_id, tool_names)
    print(f"[WORKER EXECUTOR] Validation result:")
    print(f"[WORKER EXECUTOR]   is_valid: {validation.is_valid}")
    print(f"[WORKER EXECUTOR]   valid_tools: {validation.valid_tools}")
    print(f"[WORKER EXECUTOR]   errors: {validation.errors}")

    if not validation.is_valid:
        print(f"[WORKER EXECUTOR] ⚠️ Validation failed, using only valid tools")
        tool_names = validation.valid_tools
        if not tool_names:
            # CRITICAL: Do NOT fall back to knowledge completion when tools are required!
            print(f"[WORKER EXECUTOR] ❌ CRITICAL: No valid tools at all!")
            logger.error(
                f"❌ CRITICAL: No valid tools for worker {worker_id}. "
                f"Validation errors: {validation.errors}"
            )
            yield {
                "event": "error",
                "error": f"Tool validation failed: {'; '.join(validation.errors)}",
            }
            return

    # Emit tool_loading event
    print(f"\n[WORKER EXECUTOR] Emitting tool_loading event...")
    print(f"[WORKER EXECUTOR]   tools: {tool_names}")
    print(f"[WORKER EXECUTOR]   worker_id: {worker_id}")
    yield {
        "event": "tool_loading",
        "tools": tool_names,
        "worker_id": worker_id,
    }

    # Extract auth token from state
    auth_token = state.get("auth_token")
    mcp_headers = state.get("mcp_headers", {})
    print(f"[WORKER EXECUTOR] auth_token: {auth_token[:20] if auth_token else 'None'}...")
    print(f"[WORKER EXECUTOR] mcp_headers: {list(mcp_headers.keys()) if mcp_headers else 'None'}")

    # Load MCP tools with auth headers
    print(f"\n[WORKER EXECUTOR] {'='*50}")
    print(f"[WORKER EXECUTOR] CALLING load_and_convert_tools({tool_names})")
    print(f"[WORKER EXECUTOR] {'='*50}")
    
    try:
        langchain_tools = await load_and_convert_tools(
            tool_names, 
            auth_token=auth_token,
            mcp_headers=mcp_headers,
        )
        print(f"\n[WORKER EXECUTOR] load_and_convert_tools RETURNED:")
        print(f"[WORKER EXECUTOR]   Type: {type(langchain_tools)}")
        print(f"[WORKER EXECUTOR]   Count: {len(langchain_tools) if langchain_tools else 0}")
        if langchain_tools:
            for i, t in enumerate(langchain_tools):
                print(f"[WORKER EXECUTOR]   [{i}] {t.name}: {type(t)}")
    except Exception as e:
        print(f"[WORKER EXECUTOR] ❌ load_and_convert_tools EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        logger.error(f"Failed to load MCP tools: {e}")
        yield {"event": "error", "error": f"Failed to load tools: {e}"}
        return

    if not langchain_tools:
        print(f"[WORKER EXECUTOR] ❌ CRITICAL: langchain_tools is empty!")
        yield {"event": "error", "error": "No tools loaded from MCP servers"}
        return

    print(f"[WORKER EXECUTOR] ✅ Successfully loaded {len(langchain_tools)} tools")
    logger.info(f"Loaded {len(langchain_tools)} tools for streaming execution")

    # Collect events from ReAct loop
    collected_events: List[Dict[str, Any]] = []

    async def event_collector(event_type: str, event_data: Dict[str, Any]) -> None:
        """Callback to collect events from ReAct loop."""
        print(f"[WORKER EXECUTOR] Event collected: {event_type} - {event_data}")
        collected_events.append({"event": event_type, **event_data})

    # Run ReAct loop with callback
    print(f"\n[WORKER EXECUTOR] {'='*50}")
    print(f"[WORKER EXECUTOR] CALLING _run_react_loop()")
    print(f"[WORKER EXECUTOR] {'='*50}")
    
    try:
        result = await _run_react_loop(
            state=state,
            worker_config=worker_config,
            tools=langchain_tools,
            knowledge_context=knowledge_context,
            action=action,
            event_callback=event_collector,
        )
        
        print(f"\n[WORKER EXECUTOR] _run_react_loop RETURNED:")
        print(f"[WORKER EXECUTOR]   result type: {type(result)}")
        print(f"[WORKER EXECUTOR]   result keys: {list(result.keys()) if isinstance(result, dict) else 'N/A'}")

        execution_time_ms = int((time.time() - start_time) * 1000)
        result["execution_time_ms"] = execution_time_ms

        # Yield all collected events
        print(f"[WORKER EXECUTOR] Yielding {len(collected_events)} collected events")
        for event in collected_events:
            yield event

        # Yield final result
        yield {
            "event": "worker_complete",
            "worker_result": result,
        }

    except asyncio.TimeoutError:
        yield {"event": "error", "error": "Worker execution timeout"}
    except Exception as e:
        logger.error(f"Worker streaming execution error: {e}")
        yield {"event": "error", "error": str(e)}