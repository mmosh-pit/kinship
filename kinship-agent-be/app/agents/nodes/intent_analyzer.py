"""
Kinship Agent - Enhanced Intent Analyzer Node

ADDRESSES CONCERNS:
- #6 Intent Routing: Multi-candidate scoring with fallback strategy
- #7 Over-Delegation: Direct response threshold for simple queries
- #11 Observability: Detailed logging of routing decisions

ROUTING LOGIC:
1. Simple patterns (greetings, thanks) → ALWAYS direct response
2. No workers available → Direct response
3. LLM analysis with multi-candidate scoring
4. Confidence below threshold → Direct response (fallback)
5. High confidence match → Delegate to worker
"""

import json
import logging
from typing import Dict, Any, Optional, List

from langchain_core.messages import HumanMessage, SystemMessage
from langsmith import traceable

from app.agents.types import AgentState, WorkerSummary
from app.core.config import orchestration_config
from app.core.llm import get_llm, normalize_content

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# OVER-DELEGATION SAFEGUARD (#7)
# Patterns that ALWAYS get direct response, no worker delegation
# ─────────────────────────────────────────────────────────────────────────────

DIRECT_RESPONSE_PATTERNS = [
    # Greetings
    "hello", "hi", "hey", "good morning", "good afternoon", "good evening",
    "how are you", "what's up", "howdy", "greetings",
    # Meta questions about the assistant
    "who are you", "what can you do", "help me", "what are your capabilities",
    "tell me about yourself", "what are you",
    # Farewells
    "bye", "goodbye", "see you", "later", "good night",
]

# Confirmations - these should trigger action execution, NOT direct response
CONFIRMATION_PATTERNS = [
    "yes", "yeah", "yep", "yup", "sure", "ok", "okay", "confirm", "confirmed",
    "proceed", "go ahead", "do it", "go", "please", "approved", "approve",
    "affirmative", "correct", "right", "absolutely", "definitely", "y",
    "thanks", "thank you", "got it", "understood",
    "nice", "great", "cool", "awesome", "interesting",
]

# Action verbs that indicate a tool-requiring action in conversation history
ACTION_VERBS_IN_HISTORY = {
    "create", "post", "send", "transfer", "publish", "share", "make",
    "delete", "remove", "update", "edit", "modify", "add",
    "buy", "sell", "trade", "swap", "mint", "burn", "stake",
    "tweet", "reply", "follow", "like", "message",
}


INTENT_ANALYSIS_PROMPT = """You are an intent analyzer for a multi-agent system. Your job is to route queries to specialized domain experts.

## Available Domain Expert Workers:
{workers_info}

## Available Capabilities:
{all_capabilities}

## User Message:
{user_message}

## Response Format (JSON only, no markdown):
{{
    "intent": "conversation|task|query|help",
    "action": "specific_action or null",
    "candidates": [
        {{
            "worker_id": "id",
            "worker_name": "name",
            "confidence": 0.0-1.0,
            "reason": "why this worker"
        }}
    ],
    "can_answer_directly": true/false,
    "direct_reason": "why direct response is appropriate (if applicable)",
    "reasoning": "overall decision explanation"
}}

## CRITICAL ROUTING RULES:

### MUST route to a worker (can_answer_directly=false, intent=task) when:
- User requests an ACTION: create, post, send, transfer, publish, delete, update, buy, sell, trade, swap, mint, etc.
- The query is about a DOMAIN that a worker specializes in (based on their description)
- The query requires specialized knowledge
- A worker has TOOLS that can perform the requested action
- Example: "Create a post on Bluesky" → Route to worker with bluesky tools (confidence: 0.9+)
- Example: "Send 1 SOL to this address" → Route to worker with solana tools (confidence: 0.9+)

### ONLY answer directly (can_answer_directly=true) when:
- Greetings: "hi", "hello", "hey"
- Meta questions: "who are you?", "what can you do?"
- Farewells: "bye", "goodbye"
- Questions that NO worker can help with

### Worker Selection:
- For ACTIONS (create, post, send, etc.), look for workers with relevant TOOLS
- Match the query topic to worker DESCRIPTIONS
- Always suggest the most relevant worker with high confidence (0.85-1.0 for actions)
- Multiple candidates OK if query spans multiple domains

### IMPORTANT:
- ACTION REQUESTS (create, post, send, transfer, etc.) should ALWAYS have can_answer_directly=false
- If a worker has tools for the requested action, ALWAYS route to that worker with high confidence
- Do NOT try to perform actions directly - route to the worker with tools
- Confidence: 0.85-1.0 = action request with matching tools, 0.7-0.84 = partial match
"""


def format_workers_info(workers: List[WorkerSummary]) -> str:
    """Format worker info for prompt."""
    if not workers:
        return "No workers available."
    
    lines = []
    for w in workers:
        tools = ", ".join(w["tools"]) if w["tools"] else "none"
        caps = ", ".join(w["capabilities"]) if w["capabilities"] else "none"
        desc = w.get("description", "")
        
        # Include description for context, especially for workers without tools
        if desc:
            lines.append(f"- {w['name']} (ID: {w['id']}): {desc}. Tools=[{tools}], Capabilities=[{caps}]")
        else:
            lines.append(f"- {w['name']} (ID: {w['id']}): Tools=[{tools}], Capabilities=[{caps}]")
    
    return "\n".join(lines)


def _is_confirmation_message(message: str) -> bool:
    """Check if message is a confirmation word/phrase."""
    msg_lower = message.lower().strip()
    
    # Check exact match
    if msg_lower in CONFIRMATION_PATTERNS:
        return True
    
    # Check if starts with confirmation word
    first_word = msg_lower.split()[0] if msg_lower else ""
    if first_word in CONFIRMATION_PATTERNS:
        return True
    
    return False


def _has_pending_action_in_history(messages: list) -> bool:
    """
    Check if conversation history contains a pending action request.
    
    This helps determine if a confirmation should trigger action execution
    rather than being treated as a simple conversational response.
    """
    for msg in messages:
        content = ""
        if hasattr(msg, 'content'):
            content = msg.content.lower() if isinstance(msg.content, str) else str(msg.content).lower()
        elif isinstance(msg, dict) and 'content' in msg:
            content = str(msg['content']).lower()
        
        if not content:
            continue
        
        # Check for action verbs in history
        for verb in ACTION_VERBS_IN_HISTORY:
            if verb in content:
                return True
    
    return False


def _find_pending_action_and_worker(messages: list, available_workers: list) -> Optional[Dict[str, Any]]:
    """
    Find the most recent pending action from conversation history and match it to a worker.
    
    Returns:
        Dict with 'action', 'worker_id', 'worker_name' if found, None otherwise
    """
    # Tool keywords to worker matching
    TOOL_KEYWORDS = {
        "bluesky": ["bluesky", "bsky", "blue sky"],
        "solana": ["sol", "solana", "transfer sol", "send sol", "swap", "stake"],
        "telegram": ["telegram", "tg", "message on telegram"],
        "google": ["gmail", "google", "calendar", "drive", "email"],
    }
    
    # Find the most recent user message with an action verb (excluding the current confirmation)
    pending_action = None
    for msg in reversed(messages[:-1] if len(messages) > 1 else messages):  # Skip the last message (confirmation)
        content = ""
        is_human = False
        
        if hasattr(msg, 'type'):
            is_human = msg.type == 'human'
        elif isinstance(msg, dict):
            is_human = msg.get('role') == 'user'
        
        if hasattr(msg, 'content'):
            content = msg.content if isinstance(msg.content, str) else str(msg.content)
        elif isinstance(msg, dict) and 'content' in msg:
            content = str(msg['content'])
        
        if not is_human or not content:
            continue
        
        content_lower = content.lower()
        
        # Check if this message contains an action verb
        has_action = False
        for verb in ACTION_VERBS_IN_HISTORY:
            if verb in content_lower:
                has_action = True
                break
        
        if has_action:
            pending_action = content
            break
    
    if not pending_action:
        logger.debug("No pending action found in history")
        return None
    
    logger.info(f"Found pending action: '{pending_action[:50]}...'")
    
    # Now find which worker can handle this action
    pending_action_lower = pending_action.lower()
    
    for worker in available_workers:
        worker_tools = worker.get("tools", [])
        worker_name = worker.get("name", "").lower()
        worker_desc = worker.get("description", "").lower()
        
        # Check if worker's tools match the action
        for tool in worker_tools:
            tool_lower = tool.lower()
            
            # Check tool keywords
            if tool_lower in TOOL_KEYWORDS:
                for keyword in TOOL_KEYWORDS[tool_lower]:
                    if keyword in pending_action_lower:
                        logger.info(f"Matched worker '{worker['name']}' for action via tool '{tool}' keyword '{keyword}'")
                        return {
                            "action": pending_action,
                            "worker_id": worker["id"],
                            "worker_name": worker["name"],
                            "matched_tool": tool,
                        }
            
            # Direct tool name match
            if tool_lower in pending_action_lower:
                logger.info(f"Matched worker '{worker['name']}' for action via direct tool match '{tool}'")
                return {
                    "action": pending_action,
                    "worker_id": worker["id"],
                    "worker_name": worker["name"],
                    "matched_tool": tool,
                }
        
        # Check worker name/description match
        for tool in worker_tools:
            tool_lower = tool.lower()
            if tool_lower in pending_action_lower or tool_lower in worker_name:
                logger.info(f"Matched worker '{worker['name']}' for action via name/desc match")
                return {
                    "action": pending_action,
                    "worker_id": worker["id"],
                    "worker_name": worker["name"],
                    "matched_tool": tool,
                }
    
    # Fallback: try to match based on action verbs and worker capabilities
    for worker in available_workers:
        worker_caps = worker.get("capabilities", [])
        for cap in worker_caps:
            cap_lower = cap.lower()
            for verb in ACTION_VERBS_IN_HISTORY:
                if verb in pending_action_lower and verb in cap_lower:
                    logger.info(f"Matched worker '{worker['name']}' for action via capability '{cap}'")
                    return {
                        "action": pending_action,
                        "worker_id": worker["id"],
                        "worker_name": worker["name"],
                        "matched_tool": None,
                    }
    
    logger.warning(f"No worker found for pending action: '{pending_action[:50]}...'")
    return None


def should_respond_directly(message: str, messages: list = None) -> bool:
    """
    Check if message should bypass worker delegation entirely (#7).
    
    This prevents unnecessary worker calls for simple queries.
    
    IMPORTANT: Confirmations (yes, ok, proceed) should NOT be treated as direct
    response patterns if there's a pending action in conversation history.
    """
    import re
    
    msg_lower = message.lower().strip()
    messages = messages or []
    
    # Check if this is a confirmation message
    is_confirmation = _is_confirmation_message(msg_lower)
    
    # If it's a confirmation AND there's pending action in history,
    # this should go through worker routing, not direct response
    if is_confirmation and messages:
        has_pending_action = _has_pending_action_in_history(messages)
        if has_pending_action:
            # This confirmation should trigger the pending action
            return False
    
    # Check against direct response patterns using word boundaries
    for pattern in DIRECT_RESPONSE_PATTERNS:
        # Use word boundary matching to avoid false positives
        # e.g., "no" should not match "know"
        if re.search(r'\b' + re.escape(pattern) + r'\b', msg_lower):
            return True
    
    # Very short messages (1-2 words) are usually conversational
    # BUT not if they're confirmations with pending actions
    word_count = len(msg_lower.split())
    if word_count <= 2:
        # If it's a confirmation, don't treat as direct response
        if is_confirmation:
            return False
        return True
    
    return False


@traceable(name="intent_analyzer", run_type="chain")
async def analyze_intent(state: AgentState) -> Dict[str, Any]:
    """
    Analyze intent with multi-candidate scoring and fallback.
    
    FLOW:
    1. Extract user message
    2. Check for confirmation with pending action (SHORT-CIRCUIT to worker)
    3. Check direct response patterns (#7)
    4. Check if workers available
    5. LLM analysis with multi-candidate (#6)
    6. Apply confidence threshold
    7. Log decision for observability (#11)
    
    Returns:
        State updates with routing decision
    """
    # Extract user message
    messages = state.get("messages", [])
    user_message = _extract_user_message(messages)
    available_workers = state.get("available_workers", [])
    
    if not user_message:
        logger.debug("Intent: No user message found")
        return _direct_response_result("No user message", intent="conversation")
    
    # ─────────────────────────────────────────────────────────────────────────
    # CONFIRMATION HANDLING - SHORT-CIRCUIT TO WORKER
    # If user is confirming a pending action, route directly to the appropriate worker
    # ─────────────────────────────────────────────────────────────────────────
    is_confirmation = _is_confirmation_message(user_message)
    
    if is_confirmation and messages and available_workers:
        logger.info(f"Intent: Detected confirmation message: '{user_message[:30]}...'")
        
        # Find the pending action and matching worker
        pending_match = _find_pending_action_and_worker(messages, available_workers)
        
        if pending_match:
            logger.info(
                f"Intent: SHORT-CIRCUIT - Routing confirmation to worker",
                extra={
                    "original_action": pending_match["action"][:50],
                    "worker_id": pending_match["worker_id"],
                    "worker_name": pending_match["worker_name"],
                    "matched_tool": pending_match.get("matched_tool"),
                }
            )
            
            # Return routing decision directly to the matched worker
            return {
                "intent": "task",
                "action": pending_match["action"],  # Use the ORIGINAL action, not the confirmation
                "selected_worker_id": pending_match["worker_id"],
                "selected_worker_name": pending_match["worker_name"],
                "confidence": 0.95,  # High confidence for explicit confirmation
                "requires_delegation": True,
                "all_candidates": [{
                    "worker_id": pending_match["worker_id"],
                    "worker_name": pending_match["worker_name"],
                    "confidence": 0.95,
                    "reason": f"User confirmed pending action: {pending_match['action'][:50]}",
                }],
                "intent_reasoning": f"User confirmed pending action. Routing to {pending_match['worker_name']}.",
                "is_confirmation": True,  # Flag for worker_executor
            }
        else:
            logger.warning("Intent: Confirmation detected but no matching worker found for pending action")
    
    # ─────────────────────────────────────────────────────────────────────────
    # OVER-DELEGATION SAFEGUARD (#7)
    # ─────────────────────────────────────────────────────────────────────────
    if should_respond_directly(user_message, messages):
        logger.info(
            "Intent: Direct response (simple pattern)",
            extra={"message_preview": user_message[:50], "reason": "pattern_match"}
        )
        return _direct_response_result(
            reason="Simple conversational pattern",
            intent="conversation"
        )
    
    # Check for available workers
    if not available_workers:
        logger.info("Intent: Direct response (no workers)")
        return _direct_response_result(
            reason="No workers configured",
            intent="query"
        )
    
    # ─────────────────────────────────────────────────────────────────────────
    # LLM INTENT ANALYSIS WITH MULTI-CANDIDATE (#6)
    # ─────────────────────────────────────────────────────────────────────────
    capability_index = state.get("capability_index", {})
    all_capabilities = list(capability_index.keys())
    
    # Debug: Log workers being analyzed
    workers_info_str = format_workers_info(available_workers)
    logger.info(
        f"Intent analyzer - Workers available: {len(available_workers)}",
        extra={"workers_info": workers_info_str}
    )
    
    prompt = INTENT_ANALYSIS_PROMPT.format(
        workers_info=workers_info_str,
        all_capabilities=", ".join(all_capabilities) or "None",
        user_message=user_message,
    )
    
    llm = get_llm(
        provider=state.get("llm_provider") or "anthropic",
        model=state.get("llm_model"),
        temperature=0.1,  # Low for consistency
    )
    
    try:
        response = await llm.ainvoke([
            SystemMessage(content="Respond only with valid JSON."),
            HumanMessage(content=prompt),
        ])
        
        # Normalize content (Gemini may return list of parts)
        content = normalize_content(response.content)
        result = _parse_llm_response(content)
        
        # Extract analysis
        intent = result.get("intent", "conversation")
        action = result.get("action")
        candidates = result.get("candidates", [])
        can_answer_directly = result.get("can_answer_directly", True)
        reasoning = result.get("reasoning", "")
        
        # Log LLM decision for debugging
        logger.info(
            f"Intent LLM response: intent={intent}, can_answer_directly={can_answer_directly}, "
            f"candidates_count={len(candidates)}, reasoning={reasoning[:100] if reasoning else 'none'}"
        )
        
        # ─────────────────────────────────────────────────────────────────────
        # MULTI-CANDIDATE SELECTION - Check candidates FIRST (#6)
        # Workers with matching domains should ALWAYS be preferred over direct response
        # ─────────────────────────────────────────────────────────────────────
        threshold = orchestration_config.intent.confidence_threshold
        
        selected_worker_id = None
        selected_worker_name = None
        confidence = 0.0
        
        if candidates:
            # Sort by confidence
            sorted_candidates = sorted(
                candidates,
                key=lambda c: c.get("confidence", 0),
                reverse=True
            )
            
            best = sorted_candidates[0]
            confidence = float(best.get("confidence", 0.0))
            
            if confidence >= threshold:
                selected_worker_id = best.get("worker_id")
                selected_worker_name = best.get("worker_name")
                
                # ─────────────────────────────────────────────────────────────
                # OBSERVABILITY (#11) - Log routing decision
                # ─────────────────────────────────────────────────────────────
                logger.info(
                    "Intent: Delegating to worker",
                    extra={
                        "intent": intent,
                        "action": action,
                        "worker_id": selected_worker_id,
                        "worker_name": selected_worker_name,
                        "confidence": confidence,
                        "threshold": threshold,
                        "candidates_count": len(candidates),
                        "all_candidates": [
                            {"id": c.get("worker_id"), "conf": c.get("confidence")}
                            for c in sorted_candidates[:3]  # Top 3
                        ],
                        "reasoning": reasoning,
                    }
                )
            else:
                # FALLBACK: Confidence too low (#6)
                logger.info(
                    "Intent: Fallback to direct (low confidence)",
                    extra={
                        "intent": intent,
                        "action": action,
                        "best_confidence": confidence,
                        "threshold": threshold,
                        "best_candidate": best.get("worker_name"),
                        "reasoning": reasoning,
                    }
                )
        
        # Determine if we should delegate to a worker
        # SIMPLIFIED: If we found a high-confidence worker, delegate to them
        # Only answer directly if NO suitable worker was found
        requires_delegation = (
            selected_worker_id is not None and
            confidence >= threshold
        )
        
        # If no worker selected but query is domain-specific, log for debugging
        if not requires_delegation and intent == "query" and not candidates:
            logger.warning(
                "Intent: Query without candidates - might be missing worker descriptions",
                extra={
                    "user_message": user_message[:100],
                    "intent": intent,
                    "available_workers_count": len(available_workers),
                }
            )
        
        # Log the final routing decision
        logger.info(
            f"Intent: Final routing decision",
            extra={
                "requires_delegation": requires_delegation,
                "intent": intent,
                "selected_worker_id": selected_worker_id,
                "confidence": confidence,
                "can_answer_directly": can_answer_directly,
            }
        )
        
        return {
            "intent": intent,
            "action": action,
            "selected_worker_id": selected_worker_id,
            "selected_worker_name": selected_worker_name,
            "confidence": confidence,
            "requires_delegation": requires_delegation,
            "all_candidates": candidates,  # Keep for debugging
            "intent_reasoning": reasoning,
        }
        
    except json.JSONDecodeError as e:
        logger.error(f"Intent: JSON parse error: {e}")
        return _direct_response_result(
            reason="Intent analysis parse error",
            intent="conversation"
        )
    except Exception as e:
        logger.error(f"Intent: Analysis error: {e}")
        return _direct_response_result(
            reason=f"Intent analysis error: {e}",
            intent="conversation"
        )


def _extract_user_message(messages: List) -> Optional[str]:
    """Extract the latest user message from message list."""
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            return msg.content
        if hasattr(msg, "type") and msg.type == "human":
            return msg.content if hasattr(msg, "content") else str(msg)
    return None


def _parse_llm_response(content: str) -> Dict[str, Any]:
    """Parse LLM response, handling markdown code blocks."""
    text = content.strip()
    
    # Remove markdown code blocks if present
    if text.startswith("```"):
        parts = text.split("```")
        if len(parts) >= 2:
            text = parts[1]
            if text.startswith("json"):
                text = text[4:]
    
    return json.loads(text.strip())


def _direct_response_result(
    reason: str,
    intent: str = "conversation",
    action: Optional[str] = None,
) -> Dict[str, Any]:
    """Create result indicating direct response (no worker delegation)."""
    return {
        "intent": intent,
        "action": action,
        "selected_worker_id": None,
        "selected_worker_name": None,
        "confidence": 0.0,
        "requires_delegation": False,
        "all_candidates": [],
        "intent_reasoning": reason,
    }