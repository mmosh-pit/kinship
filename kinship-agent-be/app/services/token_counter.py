"""
Kinship Agent - Token Counter Service

Provides token counting using tiktoken with cl100k_base encoding.
This encoding is used by GPT-4, GPT-4o, and provides accurate enough
estimates for budget management across all LLM providers.
"""

from typing import List, Dict, Optional

import tiktoken


# Module-level cached tokenizer (lazy initialized)
_encoding: Optional[tiktoken.Encoding] = None

# Token overhead per message (role tokens, separators)
MESSAGE_OVERHEAD_TOKENS = 4


def _get_encoding() -> tiktoken.Encoding:
    """
    Get the tiktoken encoding, initializing lazily.
    
    Returns:
        tiktoken Encoding instance
    """
    global _encoding
    if _encoding is None:
        print("[TokenCounter] Initializing tiktoken cl100k_base encoding...")
        _encoding = tiktoken.get_encoding("cl100k_base")
        print("[TokenCounter] ✅ Encoding initialized")
    return _encoding


def count_tokens(text: str) -> int:
    """
    Count tokens for a given text.
    
    Args:
        text: Text to count tokens for
        
    Returns:
        Number of tokens
    """
    if not text:
        return 0
    return len(_get_encoding().encode(text))


def count_message_tokens(messages: List[Dict[str, str]]) -> int:
    """
    Count tokens for a list of messages including role overhead.
    
    Each message has approximately 4 tokens of overhead for role
    tokens and message separators.
    
    Args:
        messages: List of message dicts with 'role' and 'content' keys
        
    Returns:
        Total number of tokens
    """
    if not messages:
        return 0
    
    total_tokens = 0
    
    for message in messages:
        content = message.get("content", "")
        msg_tokens = count_tokens(content) + MESSAGE_OVERHEAD_TOKENS
        total_tokens += msg_tokens
    
    print(f"[TokenCounter] Counted {total_tokens} tokens for {len(messages)} messages")
    return total_tokens