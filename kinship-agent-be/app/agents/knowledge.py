"""
Kinship Agent - Knowledge Base Service

Handles knowledge base operations including:
- Document ingestion
- Text chunking
- Embedding generation
- Similarity search
"""

from typing import Optional, List, Dict, Any
from dataclasses import dataclass

from langsmith import traceable

from app.core.config import settings


@dataclass
class Document:
    """Simple document class."""
    page_content: str
    metadata: Dict[str, Any]


class SimpleTextSplitter:
    """Simple text splitter without external dependencies."""
    
    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 200):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
    
    def split_text(self, text: str) -> List[str]:
        """Split text into overlapping chunks."""
        if len(text) <= self.chunk_size:
            return [text]
        
        chunks = []
        start = 0
        
        while start < len(text):
            end = start + self.chunk_size
            
            # Try to break at a natural boundary
            if end < len(text):
                # Look for paragraph break
                para_break = text.rfind("\n\n", start, end)
                if para_break > start + self.chunk_size // 2:
                    end = para_break + 2
                else:
                    # Look for line break
                    line_break = text.rfind("\n", start, end)
                    if line_break > start + self.chunk_size // 2:
                        end = line_break + 1
                    else:
                        # Look for space
                        space = text.rfind(" ", start, end)
                        if space > start + self.chunk_size // 2:
                            end = space + 1
            
            chunks.append(text[start:end].strip())
            start = end - self.chunk_overlap
            
            if start >= len(text):
                break
        
        return [c for c in chunks if c]  # Remove empty chunks


class KnowledgeBaseService:
    """
    Service for managing knowledge bases.
    """

    def __init__(self):
        self.text_splitter = SimpleTextSplitter(
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )

    def chunk_text(self, text: str, metadata: Optional[Dict[str, Any]] = None) -> List[Document]:
        """
        Split text into chunks for embedding.

        Args:
            text: Text to chunk
            metadata: Optional metadata to attach to chunks

        Returns:
            List of Document objects
        """
        chunks = self.text_splitter.split_text(text)
        documents = []

        for i, chunk in enumerate(chunks):
            doc_metadata = {
                "chunk_index": i,
                "total_chunks": len(chunks),
                **(metadata or {}),
            }
            documents.append(Document(page_content=chunk, metadata=doc_metadata))

        return documents

    async def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for a list of texts.
        Note: Requires OpenAI API key for embeddings.
        """
        try:
            from langchain_openai import OpenAIEmbeddings
            embedding_model = OpenAIEmbeddings(model=settings.embedding_model)
            return await embedding_model.aembed_documents(texts)
        except Exception as e:
            # Return empty embeddings if not configured
            print(f"Warning: Embeddings not available: {e}")
            return [[0.0] * 1536 for _ in texts]

    async def embed_query(self, query: str) -> List[float]:
        """
        Generate embedding for a query.
        """
        try:
            from langchain_openai import OpenAIEmbeddings
            embedding_model = OpenAIEmbeddings(model=settings.embedding_model)
            return await embedding_model.aembed_query(query)
        except Exception as e:
            print(f"Warning: Embeddings not available: {e}")
            return [0.0] * 1536

    def cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """
        Calculate cosine similarity between two vectors.
        """
        import math

        dot_product = sum(a * b for a, b in zip(vec1, vec2))
        norm1 = math.sqrt(sum(a * a for a in vec1))
        norm2 = math.sqrt(sum(b * b for b in vec2))

        if norm1 == 0 or norm2 == 0:
            return 0.0

        return dot_product / (norm1 * norm2)

    async def search_similar(
        self,
        query: str,
        embeddings_data: List[Dict[str, Any]],
        top_k: int = 5,
        threshold: float = 0.7,
    ) -> List[Dict[str, Any]]:
        """
        Search for similar content using embeddings.
        """
        query_embedding = await self.embed_query(query)

        results = []
        for item in embeddings_data:
            similarity = self.cosine_similarity(query_embedding, item["embedding"])
            if similarity >= threshold:
                results.append({
                    "text": item["text"],
                    "similarity": similarity,
                    "metadata": item.get("metadata", {}),
                })

        results.sort(key=lambda x: x["similarity"], reverse=True)
        return results[:top_k]


@traceable(name="knowledge_retrieval", run_type="retriever")
async def get_relevant_knowledge(
    knowledge_base_ids: List[str],
    query: str,
    db_session,
    top_k: int = 5,
) -> str:
    """
    Retrieve relevant knowledge for a query from knowledge bases using Pinecone.

    Args:
        knowledge_base_ids: List of knowledge base IDs to search
        query: Search query
        db_session: Database session
        top_k: Number of results per knowledge base

    Returns:
        Combined relevant knowledge as a string
    """
    from sqlalchemy import select
    from app.db.models import KnowledgeBase
    from app.services.voyage import embed_query
    from app.services.pinecone import query_vectors, check_pinecone_config

    if not knowledge_base_ids:
        return ""

    # Check if Pinecone is configured
    if not check_pinecone_config():
        print("Warning: Pinecone not configured, skipping knowledge retrieval")
        return ""

    all_results = []

    try:
        # Generate query embedding using Voyage
        query_embedding = await embed_query(query)
        
        if not query_embedding:
            print("Warning: Failed to generate query embedding")
            return ""

        # Fetch knowledge bases to get their namespaces
        stmt = select(KnowledgeBase).where(KnowledgeBase.id.in_(knowledge_base_ids))
        result = await db_session.execute(stmt)
        knowledge_bases = result.scalars().all()

        for kb in knowledge_bases:
            # Get namespace from embeddings metadata
            namespace = None
            if kb.embeddings and isinstance(kb.embeddings, dict):
                namespace = kb.embeddings.get("namespace")
            
            if not namespace:
                # Fallback to kb ID-based namespace
                namespace = f"kb_{kb.id}"
            
            try:
                # Query Pinecone for this namespace
                matches = await query_vectors(
                    namespace=namespace,
                    vector=query_embedding,
                    top_k=top_k,
                    include_metadata=True,
                )
                
                for match in matches:
                    all_results.append({
                        "source": kb.name,
                        "text": match["metadata"].get("text", ""),
                        "score": match["score"],
                    })
            except Exception as e:
                print(f"Warning: Failed to query Pinecone namespace {namespace}: {e}")
                continue

    except Exception as e:
        print(f"Warning: Knowledge retrieval failed: {e}")
        return ""

    # Sort all results by score
    all_results.sort(key=lambda x: x["score"], reverse=True)

    # Format as context string
    if not all_results:
        return ""

    context_parts = []
    for r in all_results[:top_k]:
        if r["text"]:
            context_parts.append(f"[Source: {r['source']}]\n{r['text']}")

    return "\n\n---\n\n".join(context_parts)


# Singleton instance
knowledge_service = KnowledgeBaseService()
