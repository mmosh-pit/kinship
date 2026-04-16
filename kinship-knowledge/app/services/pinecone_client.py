"""Pinecone vector DB client — upsert, query, delete."""

import logging
from pinecone import Pinecone

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_pc: Pinecone | None = None
_index = None


def get_pinecone_index():
    """Get or create the Pinecone index client."""
    global _pc, _index
    if _index is None:
        _pc = Pinecone(api_key=settings.pinecone_api_key)
        _index = _pc.Index(settings.pinecone_index)
    return _index


async def upsert_vectors(
    vectors: list[dict],
    namespace: str | None = None,
) -> dict:
    """
    Upsert vectors to Pinecone.

    Args:
        vectors: List of {"id": str, "values": list[float], "metadata": dict}
        namespace: Pinecone namespace (defaults to config)
    """
    ns = namespace or settings.pinecone_namespace
    index = get_pinecone_index()

    batch_size = 100
    total = 0
    for i in range(0, len(vectors), batch_size):
        batch = vectors[i : i + batch_size]
        index.upsert(vectors=batch, namespace=ns)
        total += len(batch)

    logger.info(f"Upserted {total} vectors to namespace '{ns}'")
    return {"upserted": total}


async def query_vectors(
    embedding: list[float],
    top_k: int = 3,
    namespace: str | None = None,
    filter: dict | None = None,
) -> list[dict]:
    """
    Query Pinecone for similar vectors.

    Returns list of {"id", "score", "metadata"}.
    """
    ns = namespace or settings.pinecone_namespace
    index = get_pinecone_index()

    results = index.query(
        vector=embedding,
        top_k=top_k,
        namespace=ns,
        include_metadata=True,
        filter=filter,
    )

    return [
        {
            "id": match["id"],
            "score": match["score"],
            "metadata": match.get("metadata", {}),
        }
        for match in results.get("matches", [])
    ]


async def delete_by_doc_id(doc_id: str, namespace: str | None = None) -> dict:
    """Delete all vectors for a given doc_id."""
    ns = namespace or settings.pinecone_namespace
    index = get_pinecone_index()

    index.delete(filter={"doc_id": {"$eq": doc_id}}, namespace=ns)
    return {"deleted_doc": doc_id}
