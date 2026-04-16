"""
Kinship Agent - Knowledge Base API Routes

Full CRUD operations for knowledge bases with Pinecone/Voyage AI integration.
Supports file uploads, text extraction, chunking, embedding, and vector storage.
"""

from typing import Optional, List
from datetime import datetime
import re
import copy

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified
from nanoid import generate as nanoid
from pydantic import BaseModel, Field, ConfigDict

from app.db.database import get_session
from app.db.models import KnowledgeBase
from app.core.config import settings


router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


# ─────────────────────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────────────────────


def to_camel(string: str) -> str:
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])


class CreateKnowledgeBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    
    name: str = Field(..., min_length=1, max_length=255)
    wallet: str
    platform_id: Optional[str] = Field(None, alias="platformId")


class UpdateKnowledgeBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────────────────────────────────────


def slugify(text: str) -> str:
    """Create a URL-safe slug from text."""
    slug = text.lower()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = slug.strip('-')
    return slug[:40]


def get_item_count(kb: KnowledgeBase) -> int:
    """Get the number of items in a knowledge base."""
    if kb.embeddings and isinstance(kb.embeddings, dict):
        items = kb.embeddings.get("items", [])
        return len(items)
    return 0


def get_items(kb: KnowledgeBase) -> List[dict]:
    """Get all items from a knowledge base."""
    if kb.embeddings and isinstance(kb.embeddings, dict):
        return kb.embeddings.get("items", [])
    return []


# ─────────────────────────────────────────────────────────────────────────────
# List Knowledge Bases
# ─────────────────────────────────────────────────────────────────────────────


@router.get("")
async def list_knowledge_bases(
    wallet: Optional[str] = Query(None),
    platform_id: Optional[str] = Query(None, alias="platformId"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_session),
):
    """List knowledge bases with optional filters."""
    stmt = select(KnowledgeBase)

    if wallet:
        stmt = stmt.where(KnowledgeBase.wallet == wallet)
    if platform_id:
        stmt = stmt.where(
            or_(
                KnowledgeBase.platform_id == platform_id,
                KnowledgeBase.platform_id.is_(None)
            )
        )

    stmt = stmt.order_by(KnowledgeBase.updated_at.desc())
    stmt = stmt.offset(offset).limit(limit)

    result = await db.execute(stmt)
    knowledge_bases = result.scalars().all()

    return {
        "knowledgeBases": [
            {
                "id": kb.id,
                "name": kb.name,
                "namespace": kb.id,
                "description": kb.description,
                "contentType": kb.content_type,
                "wallet": kb.wallet,
                "platformId": kb.platform_id,
                "createdAt": kb.created_at.isoformat(),
                "updatedAt": kb.updated_at.isoformat(),
                "itemCount": get_item_count(kb),
            }
            for kb in knowledge_bases
        ],
        "total": len(knowledge_bases),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Get Single Knowledge Base
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/{kb_id}")
async def get_knowledge_base(
    kb_id: str,
    db: AsyncSession = Depends(get_session),
):
    """Get a knowledge base by ID with all items."""
    stmt = select(KnowledgeBase).where(KnowledgeBase.id == kb_id)
    result = await db.execute(stmt)
    kb = result.scalar_one_or_none()

    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    items = get_items(kb)

    return {
        "id": kb.id,
        "name": kb.name,
        "namespace": kb.id,
        "description": kb.description,
        "createdAt": kb.created_at.isoformat(),
        "updatedAt": kb.updated_at.isoformat(),
        "itemCount": len(items),
        "items": items,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Create Knowledge Base
# ─────────────────────────────────────────────────────────────────────────────


@router.post("", status_code=201)
async def create_knowledge_base(
    payload: CreateKnowledgeBase,
    db: AsyncSession = Depends(get_session),
):
    """Create a new knowledge base with just a name."""
    kb_id = f"kb_{nanoid(size=8)}"
    namespace = f"{slugify(payload.name)}-{nanoid(size=6)}"
    now = datetime.utcnow()

    kb = KnowledgeBase(
        id=kb_id,
        name=payload.name.strip(),
        description=None,
        content=None,
        content_type=None,
        embeddings={"items": [], "namespace": namespace},
        wallet=payload.wallet,
        platform_id=payload.platform_id,
        created_at=now,
        updated_at=now,
    )

    db.add(kb)
    await db.commit()
    await db.refresh(kb)

    return {
        "id": kb.id,
        "name": kb.name,
        "namespace": namespace,
        "createdAt": kb.created_at.isoformat(),
        "itemCount": 0,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Upload Files to Knowledge Base
# ─────────────────────────────────────────────────────────────────────────────


@router.post("/{kb_id}/upload", status_code=201)
async def upload_files(
    kb_id: str,
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_session),
):
    """
    Upload files to a knowledge base.
    
    Files are parsed, chunked, embedded via Voyage AI, and stored in Pinecone.
    Supports: PDF, TXT, MD, DOCX, CSV
    """
    from app.services.file_parser import get_mime_type, extract_text, validate_file
    from app.services.chunker import chunk_text
    from app.services.embeddings import embed_texts
    from app.services.pinecone import upsert_vectors, PineconeVector
    
    # Get knowledge base
    stmt = select(KnowledgeBase).where(KnowledgeBase.id == kb_id)
    result = await db.execute(stmt)
    kb = result.scalar_one_or_none()

    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    # Get or initialize embeddings data
    embeddings_data = kb.embeddings or {"items": [], "namespace": kb_id}
    if "items" not in embeddings_data:
        embeddings_data["items"] = []
    if "namespace" not in embeddings_data:
        embeddings_data["namespace"] = kb_id
    
    namespace = embeddings_data["namespace"]
    results = []
    
    # Check if Pinecone and embeddings are configured
    has_embedding_config = bool(settings.openai_api_key or settings.voyage_api_key)
    has_vector_config = bool(settings.pinecone_api_key and settings.pinecone_index and has_embedding_config)

    for file in files:
        item_id = f"item_{nanoid(size=8)}"
        filename = file.filename or "unknown"
        
        # Validate file
        is_valid, error_msg = validate_file(filename)
        if not is_valid:
            results.append({
                "name": filename,
                "status": "failed",
                "error": error_msg,
                "chunkCount": 0,
            })
            continue
        
        mime_type = get_mime_type(filename)
        
        # Create item entry
        item = {
            "id": item_id,
            "name": filename,
            "type": "file",
            "status": "processing",
            "createdAt": datetime.utcnow().isoformat(),
            "mimeType": mime_type,
        }
        embeddings_data["items"].append(item)
        
        try:
            # Read file content
            content = await file.read()
            
            # Extract text
            text = await extract_text(content, mime_type)
            
            if not text or not text.strip():
                item["status"] = "failed"
                item["error"] = "No text content extracted"
                results.append({
                    "name": filename,
                    "status": "failed",
                    "error": "No text content extracted",
                    "chunkCount": 0,
                })
                continue
            
            # Chunk text
            chunks = chunk_text(text)
            item["chunkCount"] = len(chunks)
            
            if has_vector_config:
                # Generate embeddings via Voyage AI
                embeddings = await embed_texts(chunks, input_type="document")
                
                # Build vectors for Pinecone
                vectors = [
                    PineconeVector(
                        id=f"{item_id}_chunk_{i}",
                        values=embeddings[i],
                        metadata={
                            "text": chunk,
                            "fileName": filename,
                            "itemId": item_id,
                            "kbId": kb_id,
                            "chunkIndex": i,
                        }
                    )
                    for i, chunk in enumerate(chunks)
                ]
                
                # Upsert to Pinecone in batches of 100
                for i in range(0, len(vectors), 100):
                    batch = vectors[i:i + 100]
                    await upsert_vectors(namespace, batch)
                
                item["status"] = "ingested"
            else:
                # Store content locally if no vector config
                item["status"] = "pending"
                item["content"] = text[:10000]  # Store first 10k chars
            
            results.append({
                "name": filename,
                "status": item["status"],
                "chunkCount": len(chunks),
            })
            
        except Exception as e:
            print(f"Error processing file {filename}: {e}")
            item["status"] = "failed"
            item["error"] = str(e)
            results.append({
                "name": filename,
                "status": "failed",
                "error": str(e),
                "chunkCount": 0,
            })
    
    # Update knowledge base - use flag_modified for JSON field
    kb.embeddings = copy.deepcopy(embeddings_data)
    flag_modified(kb, "embeddings")
    kb.updated_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(kb)

    return {"files": results}


# ─────────────────────────────────────────────────────────────────────────────
# Ingest Pending Items
# ─────────────────────────────────────────────────────────────────────────────


@router.post("/{kb_id}/items/{item_id}/ingest")
async def ingest_item(
    kb_id: str,
    item_id: str,
    db: AsyncSession = Depends(get_session),
):
    """
    Ingest a pending item (generate embeddings and store in Pinecone).
    """
    from app.services.chunker import chunk_text
    from app.services.embeddings import embed_texts
    from app.services.pinecone import upsert_vectors, PineconeVector
    
    stmt = select(KnowledgeBase).where(KnowledgeBase.id == kb_id)
    result = await db.execute(stmt)
    kb = result.scalar_one_or_none()

    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    
    embeddings_data = kb.embeddings or {"items": []}
    items = embeddings_data.get("items", [])
    namespace = embeddings_data.get("namespace", kb_id)
    
    # Find the item
    item = next((i for i in items if i["id"] == item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    if item["status"] == "ingested":
        return {"success": True, "status": "already_ingested"}
    
    # Check if we have content to ingest
    content = item.get("content")
    if not content:
        raise HTTPException(status_code=400, detail="No content to ingest")
    
    # Check Pinecone and embeddings config
    has_embedding_config = bool(settings.openai_api_key or settings.voyage_api_key)
    if not settings.pinecone_api_key or not settings.pinecone_index or not has_embedding_config:
        raise HTTPException(
            status_code=503,
            detail="Vector storage not configured. Set PINECONE_API_KEY, PINECONE_INDEX_HOST, and either OPENAI_API_KEY or VOYAGE_API_KEY."
        )
    
    try:
        item["status"] = "processing"
        
        # Chunk text
        chunks = chunk_text(content)
        
        # Generate embeddings
        embeddings = await embed_texts(chunks, input_type="document")
        
        # Build vectors
        vectors = [
            PineconeVector(
                id=f"{item_id}_chunk_{i}",
                values=embeddings[i],
                metadata={
                    "text": chunk,
                    "fileName": item.get("name", "unknown"),
                    "itemId": item_id,
                    "kbId": kb_id,
                    "chunkIndex": i,
                }
            )
            for i, chunk in enumerate(chunks)
        ]
        
        # Upsert to Pinecone
        for i in range(0, len(vectors), 100):
            batch = vectors[i:i + 100]
            await upsert_vectors(namespace, batch)
        
        item["status"] = "ingested"
        item["chunkCount"] = len(chunks)
        item.pop("content", None)  # Remove stored content after ingestion
        
        kb.embeddings = copy.deepcopy(embeddings_data)
        flag_modified(kb, "embeddings")
        kb.updated_at = datetime.utcnow()
        
        await db.commit()
        
        return {"success": True, "status": "ingested", "chunkCount": len(chunks)}
        
    except Exception as e:
        item["status"] = "failed"
        item["error"] = str(e)
        kb.embeddings = copy.deepcopy(embeddings_data)
        flag_modified(kb, "embeddings")
        await db.commit()
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Delete Item from Knowledge Base
# ─────────────────────────────────────────────────────────────────────────────


@router.delete("/{kb_id}/items/{item_id}")
async def delete_item(
    kb_id: str,
    item_id: str,
    db: AsyncSession = Depends(get_session),
):
    """Delete an item from a knowledge base and remove vectors from Pinecone."""
    from app.services.pinecone import delete_vectors
    
    stmt = select(KnowledgeBase).where(KnowledgeBase.id == kb_id)
    result = await db.execute(stmt)
    kb = result.scalar_one_or_none()

    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    
    embeddings_data = kb.embeddings or {"items": []}
    items = embeddings_data.get("items", [])
    namespace = embeddings_data.get("namespace", kb_id)
    
    # Find and remove the item
    item = next((i for i in items if i["id"] == item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Delete from Pinecone if configured
    if settings.pinecone_api_key and settings.pinecone_index:
        try:
            # Delete vectors with filter
            await delete_vectors(
                namespace=namespace,
                filter={"itemId": {"$eq": item_id}}
            )
        except Exception as e:
            print(f"Warning: Failed to delete vectors from Pinecone: {e}")
    
    # Remove item from list
    embeddings_data["items"] = [i for i in items if i["id"] != item_id]
    kb.embeddings = copy.deepcopy(embeddings_data)
    flag_modified(kb, "embeddings")
    kb.updated_at = datetime.utcnow()
    
    await db.commit()
    
    return {"success": True}


# ─────────────────────────────────────────────────────────────────────────────
# Update Knowledge Base
# ─────────────────────────────────────────────────────────────────────────────


@router.patch("/{kb_id}")
async def update_knowledge_base(
    kb_id: str,
    payload: UpdateKnowledgeBase,
    db: AsyncSession = Depends(get_session),
):
    """Update a knowledge base."""
    stmt = select(KnowledgeBase).where(KnowledgeBase.id == kb_id)
    result = await db.execute(stmt)
    kb = result.scalar_one_or_none()

    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(kb, field, value)
    
    kb.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(kb)

    return {
        "id": kb.id,
        "name": kb.name,
        "description": kb.description,
        "updatedAt": kb.updated_at.isoformat(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Delete Knowledge Base
# ─────────────────────────────────────────────────────────────────────────────


@router.delete("/{kb_id}", status_code=204)
async def delete_knowledge_base(
    kb_id: str,
    db: AsyncSession = Depends(get_session),
):
    """Delete a knowledge base and all its vectors from Pinecone."""
    from app.services.pinecone import delete_vectors
    
    stmt = select(KnowledgeBase).where(KnowledgeBase.id == kb_id)
    result = await db.execute(stmt)
    kb = result.scalar_one_or_none()

    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    
    # Delete all vectors from Pinecone
    if settings.pinecone_api_key and settings.pinecone_index:
        try:
            embeddings_data = kb.embeddings or {}
            namespace = embeddings_data.get("namespace", kb_id)
            await delete_vectors(namespace=namespace, delete_all=True)
        except Exception as e:
            print(f"Warning: Failed to delete vectors from Pinecone: {e}")
    
    await db.delete(kb)
    await db.commit()

    return None


# ─────────────────────────────────────────────────────────────────────────────
# Search Knowledge Base
# ─────────────────────────────────────────────────────────────────────────────


@router.post("/{kb_id}/search")
async def search_knowledge_base(
    kb_id: str,
    query: str = Form(...),
    top_k: int = Form(5),
    db: AsyncSession = Depends(get_session),
):
    """
    Search a knowledge base using semantic similarity.
    
    Embeds the query using Voyage AI and queries Pinecone for similar chunks.
    """
    from app.services.embeddings import embed_query
    from app.services.pinecone import query_vectors
    
    stmt = select(KnowledgeBase).where(KnowledgeBase.id == kb_id)
    result = await db.execute(stmt)
    kb = result.scalar_one_or_none()

    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    
    has_embedding_config = bool(settings.openai_api_key or settings.voyage_api_key)
    if not settings.pinecone_api_key or not settings.pinecone_index or not has_embedding_config:
        raise HTTPException(
            status_code=503,
            detail="Vector search not configured. Set PINECONE_API_KEY, PINECONE_INDEX_HOST, and either OPENAI_API_KEY or VOYAGE_API_KEY."
        )
    
    embeddings_data = kb.embeddings or {}
    namespace = embeddings_data.get("namespace", kb_id)
    
    # Embed query
    query_vector = await embed_query(query)
    
    # Search Pinecone
    matches = await query_vectors(
        namespace=namespace,
        vector=query_vector,
        top_k=top_k,
    )
    
    return {
        "query": query,
        "results": [
            {
                "id": m["id"],
                "score": m["score"],
                "text": m.get("metadata", {}).get("text", ""),
                "fileName": m.get("metadata", {}).get("fileName", ""),
                "chunkIndex": m.get("metadata", {}).get("chunkIndex", 0),
            }
            for m in matches
        ],
    }
