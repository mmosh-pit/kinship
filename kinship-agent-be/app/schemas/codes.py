"""
Kinship Agent - Codes Schemas

Pydantic models for Codes API request/response validation.
"""

from datetime import datetime
from decimal import Decimal
from typing import Optional, List

from pydantic import BaseModel, Field, ConfigDict, field_validator

from app.db.models import CodeAccessType, CodeStatus, CodeRole


# ─────────────────────────────────────────────────────────────────────────────
# Request Schemas
# ─────────────────────────────────────────────────────────────────────────────


class CreateCode(BaseModel):
    """Schema for creating a code."""
    
    model_config = ConfigDict(populate_by_name=True)
    
    # Access configuration
    access_type: CodeAccessType = Field(
        default=CodeAccessType.CONTEXT,
        alias="accessType"
    )
    context_id: str = Field(..., alias="contextId", min_length=1)
    gathering_id: Optional[str] = Field(None, alias="gatheringId")
    scope_id: Optional[str] = Field(None, alias="scopeId")
    
    # Role
    role: CodeRole = Field(default=CodeRole.MEMBER)
    
    # Pricing
    price: Optional[Decimal] = Field(None, ge=0)
    discount: Optional[Decimal] = Field(None, ge=0, le=100)
    
    # Expiry
    expiry_date: Optional[datetime] = Field(None, alias="expiryDate")
    
    # Usage limits
    max_uses: Optional[int] = Field(None, alias="maxUses", ge=1)
    
    # Ownership
    creator_wallet: str = Field(..., alias="creatorWallet", min_length=1)
    
    @field_validator("expiry_date")
    @classmethod
    def strip_timezone(cls, v):
        """Convert timezone-aware datetime to timezone-naive UTC."""
        if v is not None and v.tzinfo is not None:
            # Convert to UTC and strip timezone info
            import datetime as dt
            utc_dt = v.astimezone(dt.timezone.utc)
            return utc_dt.replace(tzinfo=None)
        return v
    
    @field_validator("gathering_id")
    @classmethod
    def validate_gathering_for_access_type(cls, v, info):
        """Validate gathering_id is provided when access_type is gathering."""
        # Note: Full validation happens in service layer since we need access_type
        return v


class UpdateCode(BaseModel):
    """Schema for updating a code."""
    
    model_config = ConfigDict(populate_by_name=True)
    
    # Access configuration (cannot change access_type or context_id)
    gathering_id: Optional[str] = Field(None, alias="gatheringId")
    scope_id: Optional[str] = Field(None, alias="scopeId")
    
    # Role
    role: Optional[CodeRole] = None
    
    # Pricing
    price: Optional[Decimal] = Field(None, ge=0)
    discount: Optional[Decimal] = Field(None, ge=0, le=100)
    
    # Expiry
    expiry_date: Optional[datetime] = Field(None, alias="expiryDate")
    
    # Usage limits
    max_uses: Optional[int] = Field(None, alias="maxUses", ge=1)
    
    # Status
    status: Optional[CodeStatus] = None
    
    @field_validator("expiry_date")
    @classmethod
    def strip_timezone(cls, v):
        """Convert timezone-aware datetime to timezone-naive UTC."""
        if v is not None and v.tzinfo is not None:
            import datetime as dt
            utc_dt = v.astimezone(dt.timezone.utc)
            return utc_dt.replace(tzinfo=None)
        return v


class ToggleCodeStatus(BaseModel):
    """Schema for toggling code active status."""
    
    model_config = ConfigDict(populate_by_name=True)
    
    is_active: bool = Field(..., alias="isActive")


class RedeemCode(BaseModel):
    """Schema for redeeming a code."""
    
    model_config = ConfigDict(populate_by_name=True)
    
    wallet: str = Field(..., min_length=1)


# ─────────────────────────────────────────────────────────────────────────────
# Response Schemas
# ─────────────────────────────────────────────────────────────────────────────


class ContextSummary(BaseModel):
    """Summary of a context."""
    
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)
    
    id: str
    name: str
    slug: str


class GatheringSummary(BaseModel):
    """Summary of a gathering (nested context)."""
    
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)
    
    id: str
    name: str
    slug: str


class ScopeSummary(BaseModel):
    """Summary of a scope (context role)."""
    
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)
    
    id: str
    name: str


class CodeResponse(BaseModel):
    """Schema for code response."""
    
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )
    
    id: str
    code: str
    
    # Access configuration
    access_type: CodeAccessType = Field(..., alias="accessType")
    context_id: str = Field(..., alias="contextId")
    gathering_id: Optional[str] = Field(None, alias="gatheringId")
    scope_id: Optional[str] = Field(None, alias="scopeId")
    
    # Role
    role: CodeRole
    
    # Pricing
    price: Optional[Decimal] = None
    discount: Optional[Decimal] = None
    
    # Expiry
    expiry_date: Optional[datetime] = Field(None, alias="expiryDate")
    
    # Usage
    max_uses: Optional[int] = Field(None, alias="maxUses")
    current_uses: int = Field(..., alias="currentUses")
    
    # Status
    is_active: bool = Field(..., alias="isActive")
    status: CodeStatus
    
    # Ownership
    creator_wallet: str = Field(..., alias="creatorWallet")
    
    # Timestamps
    created_at: datetime = Field(..., alias="createdAt")
    updated_at: datetime = Field(..., alias="updatedAt")
    
    # Related entities (optional, populated when requested)
    context: Optional[ContextSummary] = None
    gathering: Optional[GatheringSummary] = None
    scope: Optional[ScopeSummary] = None


class CodeListResponse(BaseModel):
    """Schema for listing codes with pagination."""
    
    model_config = ConfigDict(populate_by_name=True)
    
    codes: List[CodeResponse]
    count: int
    total: int
    page: int
    limit: int
    total_pages: int = Field(..., alias="totalPages")


class ValidateCodeResponse(BaseModel):
    """Schema for code validation response."""
    
    model_config = ConfigDict(populate_by_name=True)
    
    valid: bool
    code: Optional[str] = None
    
    # Access details (only if valid)
    access_type: Optional[CodeAccessType] = Field(None, alias="accessType")
    context_id: Optional[str] = Field(None, alias="contextId")
    gathering_id: Optional[str] = Field(None, alias="gatheringId")
    scope_id: Optional[str] = Field(None, alias="scopeId")
    role: Optional[CodeRole] = None
    
    # Related entity names (for display)
    context_name: Optional[str] = Field(None, alias="contextName")
    gathering_name: Optional[str] = Field(None, alias="gatheringName")
    scope_name: Optional[str] = Field(None, alias="scopeName")
    
    # Validation failure reason (if invalid)
    reason: Optional[str] = None


class RedeemCodeResponse(BaseModel):
    """Schema for code redemption response."""
    
    model_config = ConfigDict(populate_by_name=True)
    
    success: bool
    code: str
    
    # Access granted
    access_type: CodeAccessType = Field(..., alias="accessType")
    context_id: str = Field(..., alias="contextId")
    gathering_id: Optional[str] = Field(None, alias="gatheringId")
    scope_id: Optional[str] = Field(None, alias="scopeId")
    role: CodeRole
    
    # Usage info
    current_uses: int = Field(..., alias="currentUses")
    max_uses: Optional[int] = Field(None, alias="maxUses")
    
    # Failure reason (if not successful)
    reason: Optional[str] = None


class SendInviteRequest(BaseModel):
    """Schema for sending an invite email."""
    
    model_config = ConfigDict(populate_by_name=True)
    
    recipient_name: str = Field(..., alias="recipientName", min_length=1)
    recipient_email: str = Field(..., alias="recipientEmail", min_length=1)
    personal_message: Optional[str] = Field(None, alias="personalMessage", max_length=500)


class SendInviteResponse(BaseModel):
    """Schema for send invite response."""
    
    model_config = ConfigDict(populate_by_name=True)
    
    success: bool
    message: str
    code: str
    recipient_email: str = Field(..., alias="recipientEmail")
    recipient_name: str = Field(..., alias="recipientName")