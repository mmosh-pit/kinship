"""
Kinship Agent - Conversations API Routes

Endpoints for retrieving and managing conversation history.
"""

from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_session
from app.services.conversation import conversation_service
from app.schemas.chat import (
    ConversationResponse,
    ConversationSummary,
    ConversationListResponse,
)


router = APIRouter(prefix="/api/conversations", tags=["conversations"])


# ─────────────────────────────────────────────────────────────────────────────
# Get Conversation History
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/{presence_id}/{user_wallet}", response_model=ConversationResponse)
async def get_conversation(
    presence_id: str,
    user_wallet: str,
    db: AsyncSession = Depends(get_session),
):
    """
    Get full conversation history between a user and a Presence agent.
    
    **Path Parameters:**
    - presence_id: ID of the Presence agent
    - user_wallet: User's wallet address
    
    **Returns:**
    - Full conversation with all messages
    - 404 if conversation not found
    """
    conversation = await conversation_service.get_full_history(
        db=db,
        user_wallet=user_wallet,
        presence_id=presence_id,
    )
    
    if not conversation:
        raise HTTPException(
            status_code=404, 
            detail="Conversation not found"
        )
    
    return conversation


# ─────────────────────────────────────────────────────────────────────────────
# List User Conversations
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/user/{user_wallet}", response_model=ConversationListResponse)
async def list_user_conversations(
    user_wallet: str,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_session),
):
    """
    List all conversations for a user.
    
    **Path Parameters:**
    - user_wallet: User's wallet address
    
    **Query Parameters:**
    - limit: Maximum number of conversations (default: 50, max: 100)
    - offset: Number of conversations to skip (for pagination)
    
    **Returns:**
    - List of conversation summaries (without full message history)
    - Ordered by most recently updated first
    """
    conversations = await conversation_service.get_user_conversations(
        db=db,
        user_wallet=user_wallet,
        limit=limit,
        offset=offset,
    )
    
    return {"conversations": conversations}


# ─────────────────────────────────────────────────────────────────────────────
# Clear Conversation History
# ─────────────────────────────────────────────────────────────────────────────


@router.delete("/{presence_id}/{user_wallet}/messages")
async def clear_conversation_history(
    presence_id: str,
    user_wallet: str,
    db: AsyncSession = Depends(get_session),
):
    """
    Clear all messages from a conversation (keeps the conversation record).
    
    **Path Parameters:**
    - presence_id: ID of the Presence agent
    - user_wallet: User's wallet address
    
    **Returns:**
    - Success status
    - 404 if conversation not found
    """
    success = await conversation_service.clear_history(
        db=db,
        user_wallet=user_wallet,
        presence_id=presence_id,
    )
    
    if not success:
        raise HTTPException(
            status_code=404, 
            detail="Conversation not found"
        )
    
    return {
        "success": True,
        "message": "Conversation history cleared",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Delete Conversation
# ─────────────────────────────────────────────────────────────────────────────


@router.delete("/{presence_id}/{user_wallet}")
async def delete_conversation(
    presence_id: str,
    user_wallet: str,
    db: AsyncSession = Depends(get_session),
):
    """
    Delete a conversation entirely.
    
    **Path Parameters:**
    - presence_id: ID of the Presence agent
    - user_wallet: User's wallet address
    
    **Returns:**
    - Success status
    - 404 if conversation not found
    """
    success = await conversation_service.delete_conversation(
        db=db,
        user_wallet=user_wallet,
        presence_id=presence_id,
    )
    
    if not success:
        raise HTTPException(
            status_code=404, 
            detail="Conversation not found"
        )
    
    return {
        "success": True,
        "message": "Conversation deleted",
    }
