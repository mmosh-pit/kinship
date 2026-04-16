"""
Kinship Agent - Voyage AI Embedding Service

Generates embeddings using Voyage AI API.
"""

import httpx
from typing import List, Literal

from langsmith import traceable

from app.core.config import settings


VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings"
MAX_BATCH_SIZE = 128  # Voyage AI batch limit


@traceable(name="voyage_embed_texts", run_type="embedding")
async def embed_texts(
    texts: List[str],
    input_type: Literal["document", "query"] = "document",
) -> List[List[float]]:
    """
    Generate embeddings for a list of texts using Voyage AI.
    
    Args:
        texts: List of text strings to embed
        input_type: "document" for indexing, "query" for search queries
        
    Returns:
        List of embedding vectors (each is a list of floats)
    """
    if not settings.voyage_api_key:
        raise ValueError("VOYAGE_API_KEY is not configured")
    
    if not texts:
        return []
    
    all_embeddings: List[List[float]] = []
    
    # Process in batches of MAX_BATCH_SIZE
    for i in range(0, len(texts), MAX_BATCH_SIZE):
        batch = texts[i:i + MAX_BATCH_SIZE]
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                VOYAGE_API_URL,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {settings.voyage_api_key}",
                },
                json={
                    "input": batch,
                    "model": settings.voyage_model,
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


@traceable(name="voyage_embed_query", run_type="embedding")
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
