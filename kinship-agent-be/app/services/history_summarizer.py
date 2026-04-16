"""
Kinship Agent - History Summarizer Service

Generates concise summaries of conversation history using gpt-4o-mini.
Used when conversation history exceeds the token budget.
"""

from typing import List, Dict

from langchain_core.messages import HumanMessage, SystemMessage

from app.core.llm import get_llm, normalize_content


SUMMARIZATION_SYSTEM_PROMPT = """You are summarizing a conversation history to preserve context for future interactions.

Your summary must be concise but capture all important information.

Extract and preserve:
1. Key topics discussed and decisions made
2. Actions the assistant performed (tool calls, posts, transactions, emails sent, etc.)
3. Important user information (preferences, facts they shared, context about their situation)
4. Any ongoing tasks, commitments, or follow-ups mentioned

Format your summary as a flowing paragraph, not bullet points. Be direct and factual.
Do not include phrases like "In this conversation" or "The user and assistant discussed".
Just state the facts directly.

Keep your summary under {max_tokens} tokens."""


def _format_messages_for_summary(messages: List[Dict[str, str]]) -> str:
    """
    Format messages into a readable format for summarization.
    
    Args:
        messages: List of message dicts with 'role' and 'content' keys
        
    Returns:
        Formatted string of messages
    """
    formatted_parts = []
    
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        
        if role == "user":
            formatted_parts.append(f"User: {content}")
        elif role == "assistant":
            formatted_parts.append(f"Assistant: {content}")
    
    return "\n\n".join(formatted_parts)


async def summarize_messages(
    messages: List[Dict[str, str]],
    max_tokens: int = 500,
) -> str:
    """
    Summarize a batch of messages using gpt-4o-mini.
    
    Args:
        messages: List of message dicts with 'role' and 'content' keys
        max_tokens: Maximum tokens for the summary output
        
    Returns:
        Condensed summary of the conversation
    """
    if not messages:
        return ""
    
    print(f"[HistorySummarizer] 🔄 Summarizing {len(messages)} messages (max_tokens={max_tokens})...")
    
    # Format messages for the prompt
    formatted_messages = _format_messages_for_summary(messages)
    print(f"[HistorySummarizer] Formatted messages: {len(formatted_messages)} chars")
    
    # Build the prompt
    system_prompt = SUMMARIZATION_SYSTEM_PROMPT.format(max_tokens=max_tokens)
    user_prompt = f"Summarize this conversation:\n\n{formatted_messages}"
    
    # Use gpt-4o-mini for cost-effective summarization
    print("[HistorySummarizer] Calling gpt-4o-mini for summarization...")
    llm = get_llm(
        provider="openai",
        model="gpt-4o-mini",
        temperature=0.3,
    )
    
    response = await llm.ainvoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt),
    ])
    
    # Normalize content (handle potential list response)
    summary = normalize_content(response.content)
    summary = summary.strip()
    
    print(f"[HistorySummarizer] ✅ Generated summary: {len(summary)} chars")
    print(f"[HistorySummarizer] Summary preview: {summary[:100]}...")
    
    return summary