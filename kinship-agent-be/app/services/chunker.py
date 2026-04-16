"""
Kinship Agent - Text Chunker Service

Splits text into chunks for embedding.
"""

from typing import List, Optional

from app.core.config import settings


def chunk_text(
    text: str,
    max_chars: Optional[int] = None,
    overlap: Optional[int] = None,
) -> List[str]:
    """
    Split text into overlapping chunks suitable for embedding.
    
    Tries to break at natural boundaries (paragraphs, sentences, words)
    to maintain semantic coherence.
    
    Args:
        text: The text to chunk
        max_chars: Maximum characters per chunk (default from settings)
        overlap: Overlap between chunks (default from settings)
        
    Returns:
        List of text chunks
    """
    max_chars = max_chars or settings.chunk_size
    overlap = overlap or settings.chunk_overlap
    
    # Clean up the text
    cleaned = text.replace("\r\n", "\n").strip()
    
    if not cleaned:
        return []
    
    # If text is short enough, return as single chunk
    if len(cleaned) <= max_chars:
        return [cleaned]
    
    chunks: List[str] = []
    start = 0
    
    while start < len(cleaned):
        end = start + max_chars
        
        # If this is the last chunk
        if end >= len(cleaned):
            chunk = cleaned[start:].strip()
            if chunk:
                chunks.append(chunk)
            break
        
        # Try to find a good break point
        break_point = _find_break_point(cleaned, start, end)
        
        chunk = cleaned[start:break_point + 1].strip()
        if chunk:
            chunks.append(chunk)
        
        # Move start forward, accounting for overlap
        start = break_point + 1 - overlap
        if start < 0:
            start = 0
    
    return [c for c in chunks if c]


def _find_break_point(text: str, start: int, end: int) -> int:
    """
    Find the best break point for a chunk.
    
    Priority:
    1. Paragraph boundary (double newline)
    2. Sentence boundary (". ")
    3. Single newline
    4. Space
    5. Force break at end
    """
    # Try paragraph boundary
    break_point = text.rfind("\n\n", start, end)
    if break_point > start:
        return break_point
    
    # Try sentence boundary
    break_point = text.rfind(". ", start, end)
    if break_point > start:
        return break_point
    
    # Try single newline
    break_point = text.rfind("\n", start, end)
    if break_point > start:
        return break_point
    
    # Try space
    break_point = text.rfind(" ", start, end)
    if break_point > start:
        return break_point
    
    # Force break at end
    return end


def estimate_token_count(text: str) -> int:
    """
    Estimate token count for a text.
    
    Rough approximation: ~4 characters per token for English text.
    """
    return len(text) // 4
