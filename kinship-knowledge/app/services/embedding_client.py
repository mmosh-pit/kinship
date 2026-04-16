"""Embedding service — generates vector embeddings via Voyage AI."""

import logging

import voyageai

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_client: voyageai.AsyncClient | None = None


def get_voyage_client() -> voyageai.AsyncClient:
    global _client
    if _client is None:
        _client = voyageai.AsyncClient(api_key=settings.voyage_api_key)
    return _client


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """
    Generate embeddings for a batch of texts.

    Returns list of embedding vectors (1024-dim for voyage-3-lite).
    """
    client = get_voyage_client()
    result = await client.embed(
        texts=texts,
        model=settings.voyage_model,
        input_type="document",
    )
    return result.embeddings


async def embed_query(text: str) -> list[float]:
    """Generate a single query embedding (uses query input_type for better retrieval)."""
    client = get_voyage_client()
    result = await client.embed(
        texts=[text],
        model=settings.voyage_model,
        input_type="query",
    )
    return result.embeddings[0]
