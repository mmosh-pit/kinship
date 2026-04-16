"""
Kinship Agent - Codes API Routes

REST API endpoints for Access Code management.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_session
from app.db.models import CodeAccessType, CodeStatus, CodeRole
from app.schemas.codes import (
    CreateCode,
    UpdateCode,
    ToggleCodeStatus,
    RedeemCode,
    CodeResponse,
    CodeListResponse,
    ValidateCodeResponse,
    RedeemCodeResponse,
    SendInviteRequest,
    SendInviteResponse,
)
from app.services.codes import code_service


router = APIRouter(prefix="/api/v1/codes", tags=["Codes"])


# ─────────────────────────────────────────────────────────────────────────────
# CRUD Endpoints
# ─────────────────────────────────────────────────────────────────────────────


@router.post("", response_model=CodeResponse, status_code=201)
async def create_code(
    data: CreateCode,
    db: AsyncSession = Depends(get_session),
):
    """
    Create a new access code.
    
    - **accessType**: Type of access (context or gathering)
    - **contextId**: Parent context ID (required)
    - **gatheringId**: Gathering ID (required if accessType is 'gathering')
    - **scopeId**: Additional scope within context (optional)
    - **role**: Role granted by this code (member or guest)
    - **price**: Price of the code (optional, null = free)
    - **discount**: Discount percentage 0-100 (optional)
    - **expiryDate**: Expiration date (optional, null = never expires)
    - **maxUses**: Maximum number of uses (optional, null = unlimited)
    - **creatorWallet**: Creator's wallet address (required)
    """
    try:
        code = await code_service.create(
            db=db,
            context_id=data.context_id,
            creator_wallet=data.creator_wallet,
            access_type=data.access_type,
            gathering_id=data.gathering_id,
            scope_id=data.scope_id,
            role=data.role,
            price=data.price,
            discount=data.discount,
            expiry_date=data.expiry_date,
            max_uses=data.max_uses,
        )
        return code
    except ValueError as e:
        error_msg = str(e).lower()
        if "not found" in error_msg:
            raise HTTPException(status_code=404, detail=str(e))
        if "failed to generate" in error_msg:
            raise HTTPException(status_code=503, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("", response_model=CodeListResponse)
async def list_codes(
    context_id: Optional[str] = Query(None, alias="contextId"),
    gathering_id: Optional[str] = Query(None, alias="gatheringId"),
    scope_id: Optional[str] = Query(None, alias="scopeId"),
    access_type: Optional[CodeAccessType] = Query(None, alias="accessType"),
    role: Optional[CodeRole] = Query(None),
    status: Optional[CodeStatus] = Query(None),
    is_active: Optional[bool] = Query(None, alias="isActive"),
    creator_wallet: Optional[str] = Query(None, alias="creatorWallet"),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    limit: int = Query(10, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_session),
):
    """
    List codes with optional filters and pagination.
    
    - **contextId**: Filter by context ID
    - **gatheringId**: Filter by gathering ID
    - **scopeId**: Filter by scope ID
    - **accessType**: Filter by access type (context or gathering)
    - **role**: Filter by role (member or guest)
    - **status**: Filter by status (active, expired, disabled, redeemed)
    - **isActive**: Filter by active state
    - **creatorWallet**: Filter by creator wallet address
    - **page**: Page number (default: 1)
    - **limit**: Items per page (default: 10, max: 100)
    """
    try:
        result = await code_service.list_all(
            db=db,
            context_id=context_id,
            gathering_id=gathering_id,
            scope_id=scope_id,
            access_type=access_type,
            role=role,
            status=status,
            is_active=is_active,
            creator_wallet=creator_wallet,
            page=page,
            limit=limit,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{code_id}", response_model=CodeResponse)
async def get_code(
    code_id: str,
    db: AsyncSession = Depends(get_session),
):
    """Get a code by ID."""
    code = await code_service.get_by_id(db, code_id)
    if not code:
        raise HTTPException(status_code=404, detail="Code not found")
    return code


@router.patch("/{code_id}", response_model=CodeResponse)
async def update_code(
    code_id: str,
    data: UpdateCode,
    db: AsyncSession = Depends(get_session),
):
    """
    Update a code.
    
    Note: access_type and context_id cannot be changed after creation.
    """
    try:
        update_data = data.model_dump(exclude_unset=True, by_alias=False)
        code = await code_service.update(db, code_id, **update_data)
        if not code:
            raise HTTPException(status_code=404, detail="Code not found")
        return code
    except ValueError as e:
        error_msg = str(e).lower()
        if "not found" in error_msg:
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{code_id}", status_code=204)
async def delete_code(
    code_id: str,
    db: AsyncSession = Depends(get_session),
):
    """Delete a code."""
    deleted = await code_service.delete(db, code_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Code not found")
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Toggle Endpoint
# ─────────────────────────────────────────────────────────────────────────────


@router.patch("/{code_id}/toggle", response_model=CodeResponse)
async def toggle_code(
    code_id: str,
    data: ToggleCodeStatus,
    db: AsyncSession = Depends(get_session),
):
    """
    Enable or disable a code.
    
    - **isActive**: True to enable, False to disable
    """
    code = await code_service.toggle_active(db, code_id, data.is_active)
    if not code:
        raise HTTPException(status_code=404, detail="Code not found")
    return code


# ─────────────────────────────────────────────────────────────────────────────
# Validation & Redemption Endpoints
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/validate/{code}", response_model=ValidateCodeResponse)
async def validate_code(
    code: str,
    db: AsyncSession = Depends(get_session),
):
    """
    Validate a code without redeeming it.
    
    Returns:
    - **valid**: Whether the code is valid and can be redeemed
    - **accessType**, **contextId**, **gatheringId**, **scopeId**, **role**: Access details if valid
    - **contextName**, **gatheringName**, **scopeName**: Human-readable names
    - **reason**: Reason for invalidity if not valid
    """
    result = await code_service.validate(db, code)
    return result


@router.post("/{code_id}/redeem", response_model=RedeemCodeResponse)
async def redeem_code(
    code_id: str,
    data: RedeemCode,
    db: AsyncSession = Depends(get_session),
):
    """
    Redeem a code.
    
    Increments the usage count and returns access details.
    
    - **wallet**: Wallet address redeeming the code
    """
    # First get the code by ID to get the code string
    code = await code_service.get_by_id(db, code_id)
    if not code:
        raise HTTPException(status_code=404, detail="Code not found")
    
    result = await code_service.redeem(db, code["code"], data.wallet)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("reason", "Redemption failed"))
    
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Convenience Endpoints
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/context/{context_id}", response_model=CodeListResponse)
async def list_codes_by_context(
    context_id: str,
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    limit: int = Query(10, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_session),
):
    """List all codes for a specific context with pagination."""
    try:
        result = await code_service.list_all(
            db, 
            context_id=context_id,
            page=page,
            limit=limit,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Send Invite Endpoint
# ─────────────────────────────────────────────────────────────────────────────


@router.post("/{code_id}/send-invite", response_model=SendInviteResponse)
async def send_invite(
    code_id: str,
    data: SendInviteRequest,
    db: AsyncSession = Depends(get_session),
):
    """
    Send an invitation email for a code.
    
    - **recipientName**: Name of the recipient
    - **recipientEmail**: Email address to send the invite to
    - **personalMessage**: Optional personal message to include
    """
    try:
        result = await code_service.send_invite_email(
            db=db,
            code_id=code_id,
            recipient_name=data.recipient_name,
            recipient_email=data.recipient_email,
            personal_message=data.personal_message,
        )
        return result
    except ValueError as e:
        error_msg = str(e).lower()
        if "not found" in error_msg:
            raise HTTPException(status_code=404, detail=str(e))
        if "not configured" in error_msg:
            raise HTTPException(status_code=503, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))