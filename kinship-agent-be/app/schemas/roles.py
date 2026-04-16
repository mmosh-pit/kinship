"""
Kinship Agent - Roles Schemas

Pydantic models for Context Role API request/response validation.
"""

from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, Field, ConfigDict, field_validator


class CreateRole(BaseModel):
    """Schema for creating a role."""
    
    model_config = ConfigDict(populate_by_name=True)
    
    context_id: str = Field(..., alias="contextId")
    worker_ids: List[str] = Field(..., alias="workerIds", min_length=1)
    name: str = Field(..., min_length=1, max_length=255)
    wallet: str = Field(..., min_length=1)
    created_by: str = Field(..., alias="createdBy")
    
    @field_validator("worker_ids")
    @classmethod
    def validate_worker_ids(cls, v):
        if not v or len(v) == 0:
            raise ValueError("At least one worker ID is required")
        # Remove duplicates while preserving order
        seen = set()
        return [x for x in v if not (x in seen or seen.add(x))]


class UpdateRole(BaseModel):
    """Schema for updating a role."""
    
    model_config = ConfigDict(populate_by_name=True)
    
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    worker_ids: Optional[List[str]] = Field(None, alias="workerIds")
    
    @field_validator("worker_ids")
    @classmethod
    def validate_worker_ids(cls, v):
        if v is not None:
            if len(v) == 0:
                raise ValueError("At least one worker ID is required")
            # Remove duplicates while preserving order
            seen = set()
            return [x for x in v if not (x in seen or seen.add(x))]
        return v


class WorkerSummary(BaseModel):
    """Summary of a worker agent."""
    
    model_config = ConfigDict(populate_by_name=True)
    
    id: str
    name: str
    tools: List[str] = []


class RoleResponse(BaseModel):
    """Schema for role response."""
    
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )
    
    id: str
    context_id: str = Field(..., alias="context_id")
    worker_ids: List[str] = Field(default=[], alias="worker_ids")
    name: str
    wallet: str
    
    # Aggregated data from workers
    tool_ids: List[str] = Field(default=[], alias="tool_ids")
    workers: List[WorkerSummary] = []
    
    created_by: str = Field(..., alias="created_by")
    created_at: datetime = Field(..., alias="created_at")
    updated_at: datetime = Field(..., alias="updated_at")


class RoleListResponse(BaseModel):
    """Schema for listing roles."""
    roles: List[RoleResponse]
    count: int
