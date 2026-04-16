"""Pydantic schemas for Knowledge documents."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class KnowledgeBase(BaseModel):
    title: str = Field(..., max_length=255)
    content: str | None = None
    category: str | None = None
    doc_type: str | None = None
    tags: list[str] = Field(default_factory=list)
    facets: list[str] = Field(default_factory=list)
    source_url: str | None = None
    file_url: str | None = None
    file_name: str | None = None
    pinecone_namespace: str = "kinship-knowledge"
    platform_id: UUID | None = None


class KnowledgeCreate(KnowledgeBase):
    pass


class KnowledgeUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    category: str | None = None
    doc_type: str | None = None
    tags: list[str] | None = None
    facets: list[str] | None = None
    source_url: str | None = None
    file_url: str | None = None
    file_name: str | None = None
    ingest_status: str | None = None
    pinecone_namespace: str | None = None
    platform_id: UUID | None = None


class KnowledgeResponse(KnowledgeBase):
    id: UUID
    chunk_count: int
    ingest_status: str
    last_ingested_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
