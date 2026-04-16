"""
Kinship Agent - Pinecone Vector Storage Service

Manages vector operations with Pinecone using the official SDK.
"""

from typing import List, Dict, Any, Optional
from functools import lru_cache

from pinecone import Pinecone
from langsmith import traceable

from app.core.config import settings


# ─────────────────────────────────────────────────────────────────────────────
# Pinecone Client
# ─────────────────────────────────────────────────────────────────────────────


@lru_cache()
def get_pinecone_client() -> Pinecone:
    """Get cached Pinecone client instance."""
    if not settings.pinecone_api_key:
        raise ValueError("PINECONE_API_KEY is not configured")
    return Pinecone(api_key=settings.pinecone_api_key)


def get_index():
    """Get the Pinecone index."""
    pc = get_pinecone_client()
    index_name = settings.pinecone_index
    
    if not index_name:
        raise ValueError("PINECONE_INDEX is not configured")
    
    return pc.Index(index_name)


# ─────────────────────────────────────────────────────────────────────────────
# Vector Classes
# ─────────────────────────────────────────────────────────────────────────────


class PineconeVector:
    """Represents a vector for Pinecone upsert."""
    
    def __init__(
        self,
        id: str,
        values: List[float],
        metadata: Optional[Dict[str, Any]] = None,
    ):
        self.id = id
        self.values = values
        self.metadata = metadata or {}
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "values": self.values,
            "metadata": self.metadata,
        }


# ─────────────────────────────────────────────────────────────────────────────
# Vector Operations
# ─────────────────────────────────────────────────────────────────────────────


async def upsert_vectors(
    namespace: str,
    vectors: List[PineconeVector],
) -> Dict[str, Any]:
    """
    Upsert vectors to Pinecone.
    
    Args:
        namespace: Pinecone namespace (usually kb_id)
        vectors: List of PineconeVector objects
        
    Returns:
        Pinecone upsert response
    """
    index = get_index()
    
    # Convert to tuples format: (id, values, metadata)
    vector_tuples = [
        (v.id, v.values, v.metadata)
        for v in vectors
    ]
    
    # Upsert to index
    response = index.upsert(
        vectors=vector_tuples,
        namespace=namespace,
    )
    
    return {"upserted_count": response.upserted_count}


@traceable(name="pinecone_query", run_type="retriever")
async def query_vectors(
    namespace: str,
    vector: List[float],
    top_k: int = 5,
    filter: Optional[Dict[str, Any]] = None,
    include_metadata: bool = True,
) -> List[Dict[str, Any]]:
    """
    Query similar vectors from Pinecone.
    
    Args:
        namespace: Pinecone namespace
        vector: Query vector
        top_k: Number of results to return
        filter: Optional metadata filter
        include_metadata: Whether to include metadata in results
        
    Returns:
        List of matches with scores and metadata
    """
    index = get_index()
    
    response = index.query(
        vector=vector,
        top_k=top_k,
        namespace=namespace,
        filter=filter,
        include_metadata=include_metadata,
    )
    
    return [
        {
            "id": match.id,
            "score": match.score,
            "metadata": match.metadata or {},
        }
        for match in response.matches
    ]


async def delete_vectors(
    namespace: str,
    ids: Optional[List[str]] = None,
    delete_all: bool = False,
    filter: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Delete vectors from Pinecone.
    
    Args:
        namespace: Pinecone namespace
        ids: Specific vector IDs to delete
        delete_all: Delete all vectors in namespace
        filter: Metadata filter for deletion
        
    Returns:
        Pinecone delete response
    """
    index = get_index()
    
    if delete_all:
        index.delete(delete_all=True, namespace=namespace)
    elif ids:
        index.delete(ids=ids, namespace=namespace)
    elif filter:
        index.delete(filter=filter, namespace=namespace)
    
    return {"deleted": True}


async def fetch_vectors(
    namespace: str,
    ids: List[str],
) -> Dict[str, Any]:
    """
    Fetch vectors by ID from Pinecone.
    
    Args:
        namespace: Pinecone namespace
        ids: Vector IDs to fetch
        
    Returns:
        Dict with vectors data
    """
    index = get_index()
    
    response = index.fetch(ids=ids, namespace=namespace)
    
    return {
        "vectors": {
            id: {
                "id": vec.id,
                "values": vec.values,
                "metadata": vec.metadata,
            }
            for id, vec in response.vectors.items()
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# Utility
# ─────────────────────────────────────────────────────────────────────────────


def check_pinecone_config() -> bool:
    """Check if Pinecone is properly configured."""
    return bool(settings.pinecone_api_key and settings.pinecone_index)


def get_index_stats() -> Dict[str, Any]:
    """Get index statistics."""
    try:
        index = get_index()
        stats = index.describe_index_stats()
        return {
            "total_vector_count": stats.total_vector_count,
            "dimension": stats.dimension,
            "namespaces": {
                ns: {"vector_count": data.vector_count}
                for ns, data in stats.namespaces.items()
            }
        }
    except Exception as e:
        return {"error": str(e)}
