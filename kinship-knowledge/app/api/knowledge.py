"""Knowledge REST API — CRUD + ingest trigger + file upload."""

import io
from uuid import UUID
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from app.api import crud
from app.db.database import get_db
from app.db.models import KnowledgeDoc
from app.schemas.knowledge import KnowledgeCreate, KnowledgeResponse, KnowledgeUpdate

router = APIRouter(prefix="/api/knowledge", tags=["Knowledge"])


# ─── List all ───
@router.get("", response_model=list[KnowledgeResponse])
async def list_knowledge(
    category: str | None = Query(None),
    doc_type: str | None = Query(None),
    ingest_status: str | None = Query(None),
    platform_id: UUID | None = Query(None),
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    filters = {
        "category": category,
        "doc_type": doc_type,
        "ingest_status": ingest_status,
        "platform_id": platform_id,
    }
    items, _ = await crud.get_all(db, KnowledgeDoc, filters, skip, limit)
    return items


# ─── Create ───
@router.post("", response_model=KnowledgeResponse, status_code=201)
async def create_knowledge(body: KnowledgeCreate, db: AsyncSession = Depends(get_db)):
    return await crud.create(db, KnowledgeDoc, body.model_dump())


# ─── Upload PDF and create knowledge doc ───
@router.post(
    "/upload", response_model=KnowledgeResponse, status_code=201, tags=["Upload"]
)
async def upload_knowledge_pdf(
    file: UploadFile = File(...),
    title: str = Form(None),
    category: str = Form("General"),
    doc_type: str = Form("reference"),
    tags: str = Form(""),
    facets: str = Form(""),
    platform_id: str = Form(None),
    db: AsyncSession = Depends(get_db),
):
    """Upload a PDF file and create a knowledge document."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are allowed")

    if file.size and file.size > 50 * 1024 * 1024:
        raise HTTPException(400, "File size exceeds 50MB limit")

    try:
        file_content = await file.read()

        from app.services.assets_client import upload_file

        upload_result = await upload_file(
            file_data=file_content,
            filename=file.filename,
            content_type="application/pdf",
            folder="knowledge",
        )

        extracted_text = ""
        try:
            import pypdf

            pdf_reader = pypdf.PdfReader(io.BytesIO(file_content))
            for page in pdf_reader.pages:
                extracted_text += page.extract_text() + "\n\n"
            extracted_text = extracted_text.strip()
        except Exception as e:
            extracted_text = f"[PDF content - text extraction failed: {str(e)}]"

        tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []
        facet_list = (
            [f.strip() for f in facets.split(",") if f.strip()] if facets else []
        )

        doc_data = {
            "title": title or file.filename.rsplit(".", 1)[0],
            "content": extracted_text[:50000] if extracted_text else None,
            "category": category,
            "doc_type": doc_type,
            "tags": tag_list,
            "facets": facet_list,
            "file_url": upload_result["file_url"],
            "file_name": upload_result["file_name"],
            "ingest_status": "pending",
            "platform_id": platform_id if platform_id else None,
        }

        doc = await crud.create(db, KnowledgeDoc, doc_data)
        return doc

    except Exception as e:
        raise HTTPException(500, f"Upload failed: {str(e)}")


# ─── Bulk ingest ALL pending ───
@router.post("/ingest", tags=["AI"])
async def ingest_all_knowledge(db: AsyncSession = Depends(get_db)):
    from app.graphs.knowledge_ingest import run_knowledge_ingest

    result = await run_knowledge_ingest(db)
    return result


# ─── Single doc ingest ───
@router.post("/{id}/ingest", response_model=KnowledgeResponse, tags=["AI"])
async def ingest_single_knowledge(id: UUID, db: AsyncSession = Depends(get_db)):
    item = await crud.get_by_id(db, KnowledgeDoc, id)
    if not item:
        raise HTTPException(404, "Knowledge doc not found")

    try:
        from app.graphs.knowledge_ingest import ingest_single_doc

        result = await ingest_single_doc(db, item)
        return result
    except Exception as e:
        await crud.update(db, item, {"ingest_status": "failed"})
        raise HTTPException(500, f"Ingestion failed: {str(e)}")


# ─── Get single ───
@router.get("/{id}", response_model=KnowledgeResponse)
async def get_knowledge(id: UUID, db: AsyncSession = Depends(get_db)):
    item = await crud.get_by_id(db, KnowledgeDoc, id)
    if not item:
        raise HTTPException(404, "Knowledge doc not found")
    return item


# ─── Update ───
@router.put("/{id}", response_model=KnowledgeResponse)
async def update_knowledge(
    id: UUID, body: KnowledgeUpdate, db: AsyncSession = Depends(get_db)
):
    item = await crud.get_by_id(db, KnowledgeDoc, id)
    if not item:
        raise HTTPException(404, "Knowledge doc not found")
    return await crud.update(db, item, body.model_dump(exclude_unset=True))


# ─── Delete ───
@router.delete("/{id}", status_code=204)
async def delete_knowledge(id: UUID, db: AsyncSession = Depends(get_db)):
    item = await crud.get_by_id(db, KnowledgeDoc, id)
    if not item:
        raise HTTPException(404, "Knowledge doc not found")

    if item.file_url:
        try:
            from app.services.assets_client import delete_file

            file_key = item.file_url.split("/")[-1]
            await delete_file(f"knowledge/{file_key}")
        except Exception:
            pass

    await crud.delete(db, item)
