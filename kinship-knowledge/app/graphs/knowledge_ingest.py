"""Graph 2: Knowledge Ingestion — chunk docs, enrich with Claude, embed, upsert to Pinecone.

Trigger: Studio UI → "🚀 Ingest All Pending"
Flow: load_pending → chunk → enrich → embed → upsert → update_status
"""

import json
import logging
from datetime import datetime, timezone
from typing import TypedDict

from langgraph.graph import StateGraph, END
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import KnowledgeDoc
from app.services.claude_client import invoke_claude, parse_json_response
from app.services.embedding_client import embed_texts
from app.services.pinecone_client import upsert_vectors

logger = logging.getLogger(__name__)


class IngestState(TypedDict):
    doc_ids: list[str]
    current_doc: dict | None
    chunks: list[dict]  # [{text, summary, keywords, embedding}]
    results: list[dict]
    db_session: object  # AsyncSession passed through state


# ── Nodes ──


async def load_pending(state: IngestState) -> dict:
    db: AsyncSession = state["db_session"]
    result = await db.execute(
        select(KnowledgeDoc).where(KnowledgeDoc.ingest_status == "pending")
    )
    docs = result.scalars().all()
    return {
        "doc_ids": [str(d.id) for d in docs],
        "results": [],
    }


async def process_next_doc(state: IngestState) -> dict:
    """Pop the next doc from the queue and load it."""
    doc_ids = state.get("doc_ids", [])
    if not doc_ids:
        return {"current_doc": None}

    doc_id = doc_ids[0]
    remaining = doc_ids[1:]

    db: AsyncSession = state["db_session"]
    doc = await db.get(KnowledgeDoc, doc_id)
    if not doc:
        return {"doc_ids": remaining, "current_doc": None}

    return {
        "doc_ids": remaining,
        "current_doc": {
            "id": str(doc.id),
            "title": doc.title,
            "content": doc.content or "",
            "category": doc.category,
            "doc_type": doc.doc_type,
            "tags": doc.tags or [],
            "facets": doc.facets or [],
            "source_url": doc.source_url,
            "file_url": getattr(doc, "file_url", None),
            "namespace": doc.pinecone_namespace,
        },
    }


async def chunk_doc(state: IngestState) -> dict:
    """Split document into ~500 token chunks by paragraphs."""
    doc = state["current_doc"]
    if not doc:
        return {"chunks": []}

    content = doc["content"]
    paragraphs = content.split("\n\n")

    chunks = []
    current_chunk = ""

    for para in paragraphs:
        if len(current_chunk) + len(para) > 2000:  # ~500 tokens
            if current_chunk:
                chunks.append({"text": current_chunk.strip(), "index": len(chunks)})
            current_chunk = para
        else:
            current_chunk += "\n\n" + para if current_chunk else para

    if current_chunk:
        chunks.append({"text": current_chunk.strip(), "index": len(chunks)})

    # Minimum: at least one chunk with the full content
    if not chunks and content:
        chunks.append({"text": content[:4000], "index": 0})

    return {"chunks": chunks}


async def enrich_chunks(state: IngestState) -> dict:
    """Use Claude to generate summary + keywords for each chunk."""
    doc = state["current_doc"]
    chunks = state.get("chunks", [])
    if not chunks:
        return {"chunks": []}

    system = """For each text chunk, generate a JSON object with:
- "summary": 1-2 sentence summary
- "keywords": list of 3-5 keywords
Respond with a JSON array. No markdown fences."""

    chunks_text = json.dumps(
        [{"index": c["index"], "text": c["text"][:500]} for c in chunks]
    )
    response = await invoke_claude(system, chunks_text, model="haiku")

    try:
        # Use robust parser to handle GPT/Gemini response formats
        parsed = parse_json_response(response)
        # Handle both array and dict with items key
        if isinstance(parsed, list):
            enrichments = parsed
        elif isinstance(parsed, dict) and "items" in parsed:
            enrichments = parsed["items"]
        else:
            enrichments = [parsed] if parsed else []
    except (json.JSONDecodeError, TypeError):
        enrichments = [{"summary": c["text"][:100], "keywords": []} for c in chunks]

    # Merge enrichments back
    for i, chunk in enumerate(chunks):
        if i < len(enrichments):
            chunk["summary"] = enrichments[i].get("summary", "")
            chunk["keywords"] = enrichments[i].get("keywords", [])
        else:
            chunk["summary"] = chunk["text"][:100]
            chunk["keywords"] = []

    return {"chunks": chunks}


async def embed_chunks(state: IngestState) -> dict:
    """Generate embeddings for all chunks via Voyage AI."""
    chunks = state.get("chunks", [])
    if not chunks:
        return {"chunks": []}

    texts = [f"{c.get('summary', '')} {c['text'][:500]}" for c in chunks]

    try:
        embeddings = await embed_texts(texts)
        for i, chunk in enumerate(chunks):
            chunk["embedding"] = embeddings[i]
    except Exception as e:
        logger.error(f"Embedding failed: {e}")
        # Skip embedding — chunks won't be upserted
        for chunk in chunks:
            chunk["embedding"] = None

    return {"chunks": chunks}


async def upsert_to_pinecone(state: IngestState) -> dict:
    """Upsert enriched chunks to Pinecone."""
    doc = state["current_doc"]
    chunks = state.get("chunks", [])
    namespace = (
        doc.get("namespace", "kinship-knowledge") if doc else "kinship-knowledge"
    )

    vectors = []
    for chunk in chunks:
        if chunk.get("embedding") is None:
            continue
        vectors.append(
            {
                "id": f"{doc['id']}_chunk_{chunk['index']}",
                "values": chunk["embedding"],
                "metadata": {
                    "doc_id": doc["id"],
                    "doc_title": doc["title"],
                    "category": doc.get("category", ""),
                    "doc_type": doc.get("doc_type", ""),
                    "tags": doc.get("tags", []),
                    "facets": doc.get("facets", []),
                    "source_url": doc.get("source_url") or "",
                    "file_url": doc.get("file_url") or "",
                    "chunk_index": chunk["index"],
                    "text": chunk["text"][:1000],  # Store text for retrieval
                    "summary": chunk.get("summary", ""),
                    "keywords": chunk.get("keywords", []),
                },
            }
        )

    if vectors:
        await upsert_vectors(vectors, namespace=namespace)

    return {"chunks": chunks}


async def update_doc_status(state: IngestState) -> dict:
    """Mark document as ingested in the database."""
    doc = state.get("current_doc")
    chunks = state.get("chunks", [])
    results = state.get("results", [])

    if doc:
        db: AsyncSession = state["db_session"]
        await db.execute(
            update(KnowledgeDoc)
            .where(KnowledgeDoc.id == doc["id"])
            .values(
                ingest_status="ingested",
                chunk_count=len(chunks),
                last_ingested_at=datetime.now(timezone.utc),
            )
        )
        results.append(
            {
                "doc_id": doc["id"],
                "title": doc["title"],
                "chunks": len(chunks),
                "status": "ingested",
            }
        )

    return {"results": results}


# ── Routing ──


def has_more_docs(state: IngestState) -> str:
    if state.get("current_doc") and state.get("doc_ids"):
        return "more"
    elif state.get("current_doc"):
        return "last"
    return "done"


# ── Graph Assembly ──


def build_knowledge_ingest_graph():
    workflow = StateGraph(IngestState)

    workflow.add_node("load_pending", load_pending)
    workflow.add_node("process_next", process_next_doc)
    workflow.add_node("chunk", chunk_doc)
    workflow.add_node("enrich", enrich_chunks)
    workflow.add_node("embed", embed_chunks)
    workflow.add_node("upsert", upsert_to_pinecone)
    workflow.add_node("update_status", update_doc_status)

    workflow.set_entry_point("load_pending")
    workflow.add_edge("load_pending", "process_next")
    workflow.add_edge("process_next", "chunk")
    workflow.add_edge("chunk", "enrich")
    workflow.add_edge("enrich", "embed")
    workflow.add_edge("embed", "upsert")
    workflow.add_edge("upsert", "update_status")

    workflow.add_conditional_edges(
        "update_status",
        has_more_docs,
        {
            "more": "process_next",
            "last": END,
            "done": END,
        },
    )

    return workflow.compile()


ingest_graph = build_knowledge_ingest_graph()


async def run_knowledge_ingest(db: AsyncSession) -> dict:
    """Entry point — ingest all pending knowledge docs."""
    initial_state: IngestState = {
        "doc_ids": [],
        "current_doc": None,
        "chunks": [],
        "results": [],
        "db_session": db,
    }
    result = await ingest_graph.ainvoke(initial_state)
    return {
        "ingested": len(result.get("results", [])),
        "results": result.get("results", []),
    }


async def ingest_single_doc(db: AsyncSession, doc: KnowledgeDoc) -> KnowledgeDoc:
    """Ingest a single document and return the updated document."""
    initial_state: IngestState = {
        "doc_ids": [],
        "current_doc": {
            "id": str(doc.id),
            "title": doc.title,
            "content": doc.content or "",
            "category": doc.category,
            "doc_type": doc.doc_type,
            "tags": doc.tags or [],
            "facets": doc.facets or [],
            "source_url": doc.source_url,
            "file_url": getattr(doc, "file_url", None),
            "namespace": doc.pinecone_namespace,
        },
        "chunks": [],
        "results": [],
        "db_session": db,
    }

    # Run the processing steps manually for single doc
    state = await chunk_doc(initial_state)
    initial_state["chunks"] = state["chunks"]

    state = await enrich_chunks(initial_state)
    initial_state["chunks"] = state["chunks"]

    state = await embed_chunks(initial_state)
    initial_state["chunks"] = state["chunks"]

    state = await upsert_to_pinecone(initial_state)
    initial_state["chunks"] = state["chunks"]

    await update_doc_status(initial_state)
    await db.commit()

    # Refresh and return the updated document
    await db.refresh(doc)
    return doc
