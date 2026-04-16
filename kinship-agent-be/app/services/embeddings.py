"""
Kinship Agent - Embeddings Service

Generates embeddings using either OpenAI or Voyage AI.
Defaults to OpenAI if Voyage is not configured.
"""

import httpx
from typing import List, Literal

from app.core.config import settings


# ─────────────────────────────────────────────────────────────────────────────
# Main Embeddings Functions
# ─────────────────────────────────────────────────────────────────────────────


async def embed_texts(
    texts: List[str],
    input_type: Literal["document", "query"] = "document",
) -> List[List[float]]:
    """
    Generate embeddings for a list of texts.
    
    Uses Voyage AI if configured, otherwise falls back to OpenAI.
    
    Args:
        texts: List of text strings to embed
        input_type: "document" for indexing, "query" for search queries
        
    Returns:
        List of embedding vectors (each is a list of floats)
    """
    if not texts:
        return []
    
    # Prefer Voyage if configured, otherwise use OpenAI
    if settings.voyage_api_key:
        return await _embed_with_voyage(texts, input_type)
    elif settings.openai_api_key:
        return await _embed_with_openai(texts)
    else:
        raise ValueError(
            "No embedding provider configured. "
            "Set either VOYAGE_API_KEY or OPENAI_API_KEY in your environment."
        )


async def embed_query(text: str) -> List[float]:
    """
    Generate embedding for a single query text.
    
    Args:
        text: Query text to embed
        
    Returns:
        Embedding vector as list of floats
    """
    embeddings = await embed_texts([text], input_type="query")
    return embeddings[0] if embeddings else []


# ─────────────────────────────────────────────────────────────────────────────
# OpenAI Embeddings
# ─────────────────────────────────────────────────────────────────────────────


OPENAI_API_URL = "https://api.openai.com/v1/embeddings"
MAX_OPENAI_BATCH = 2048  # OpenAI allows up to 2048 inputs


async def _embed_with_openai(texts: List[str]) -> List[List[float]]:
    """Generate embeddings using OpenAI API."""
    all_embeddings: List[List[float]] = []
    
    # Process in batches
    for i in range(0, len(texts), MAX_OPENAI_BATCH):
        batch = texts[i:i + MAX_OPENAI_BATCH]
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                OPENAI_API_URL,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {settings.openai_api_key}",
                },
                json={
                    "input": batch,
                    "model": settings.embedding_model,  # text-embedding-3-small
                },
                timeout=60.0,
            )
            
            if response.status_code != 200:
                raise Exception(f"OpenAI embed failed ({response.status_code}): {response.text}")
            
            data = response.json()
            # Sort by index to maintain order
            sorted_data = sorted(data["data"], key=lambda x: x["index"])
            embeddings = [d["embedding"] for d in sorted_data]
            all_embeddings.extend(embeddings)
    
    return all_embeddings


# ─────────────────────────────────────────────────────────────────────────────
# Voyage AI Embeddings
# ─────────────────────────────────────────────────────────────────────────────


VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings"
MAX_VOYAGE_BATCH = 128  # Voyage AI batch limit


async def _embed_with_voyage(
    texts: List[str],
    input_type: Literal["document", "query"] = "document",
) -> List[List[float]]:
    """Generate embeddings using Voyage AI API."""
    all_embeddings: List[List[float]] = []
    
    # Process in batches
    for i in range(0, len(texts), MAX_VOYAGE_BATCH):
        batch = texts[i:i + MAX_VOYAGE_BATCH]
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                VOYAGE_API_URL,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {settings.voyage_api_key}",
                },
                json={
                    "input": batch,
                    "model": settings.voyage_model,  # voyage-3
                    "input_type": input_type,
                },
                timeout=60.0,
            )
            
            if response.status_code != 200:
                raise Exception(f"Voyage AI embed failed ({response.status_code}): {response.text}")
            
            data = response.json()
            embeddings = [d["embedding"] for d in data["data"]]
            all_embeddings.extend(embeddings)
    
    return all_embeddings


# ─────────────────────────────────────────────────────────────────────────────
# Utility
# ─────────────────────────────────────────────────────────────────────────────


def get_embedding_provider() -> str:
    """Get the current embedding provider name."""
    if settings.voyage_api_key:
        return "voyage"
    elif settings.openai_api_key:
        return "openai"
    else:
        return "none"


def get_embedding_dimensions() -> int:
    """Get the embedding dimensions for the current provider/model."""
    provider = get_embedding_provider()
    
    if provider == "openai":
        # OpenAI embedding dimensions
        dims = {
            "text-embedding-3-small": 1536,
            "text-embedding-3-large": 3072,
            "text-embedding-ada-002": 1536,
        }
        return dims.get(settings.embedding_model, 1536)
    
    elif provider == "voyage":
        # Voyage embedding dimensions
        dims = {
            "voyage-3": 1024,
            "voyage-3-lite": 512,
            "voyage-code-3": 1024,
            "voyage-finance-2": 1024,
            "voyage-law-2": 1024,
        }
        return dims.get(settings.voyage_model, 1024)
    
    return 1536  # Default
