"""
Kinship Agent - Conversation Service

Service for managing conversation history stored in PostgreSQL.
Each conversation is identified by (user_wallet, presence_id) combination.
Messages are stored as a JSONB array within a single record.

Token-Based History Management:
- CHAT_HISTORY_TOKEN_BUDGET: Maximum tokens for conversation history
- CHAT_HISTORY_RECENT_MESSAGES_RESERVED: Recent messages always kept unsummarized
- CHAT_HISTORY_SUMMARY_MAX_TOKENS: Maximum tokens for the summary
- CHAT_HISTORY_MAX_AGE_DAYS: Maximum age of messages to include (optional)

When history exceeds the token budget, older messages are summarized using
gpt-4o-mini and the summary is cached in the database.
"""

from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, TypedDict
from nanoid import generate as nanoid

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Conversation
from app.core.config import settings
from app.services.token_counter import count_message_tokens
from app.services.history_summarizer import summarize_messages


class HistoryResult(TypedDict):
    """Result from get_history_with_token_budget."""
    messages: List[Dict[str, str]]      # Messages to send to LLM
    summary: Optional[str]               # Summary of older messages (if any)
    total_tokens: int                    # Total tokens used
    summarized_message_count: int        # Number of messages that were summarized


class ConversationService:
    """
    Service for managing conversation history.
    
    Key operations:
    - get_or_create: Find existing or create new conversation
    - get_history_with_token_budget: Load messages for LLM context (token-limited)
    - get_full_history: Load all messages for display
    - append_messages: Add new messages to conversation
    - clear_history: Clear all messages and summary cache
    """
    
    @staticmethod
    def _generate_id() -> str:
        """Generate a unique conversation ID."""
        return f"conv_{nanoid(size=21)}"
    
    @staticmethod
    def _generate_message_id() -> str:
        """Generate a unique message ID."""
        return f"msg_{nanoid(size=21)}"
    
    @staticmethod
    async def get_or_create(
        db: AsyncSession,
        user_wallet: str,
        presence_id: str,
    ) -> Conversation:
        """
        Get existing conversation or create a new one.
        
        Args:
            db: Database session
            user_wallet: User's wallet address
            presence_id: Presence agent ID
            
        Returns:
            Conversation record
        """
        # Try to find existing conversation
        stmt = select(Conversation).where(
            and_(
                Conversation.user_wallet == user_wallet,
                Conversation.presence_id == presence_id,
            )
        )
        result = await db.execute(stmt)
        conversation = result.scalar_one_or_none()
        
        if conversation:
            return conversation
        
        # Create new conversation
        conversation = Conversation(
            id=ConversationService._generate_id(),
            user_wallet=user_wallet,
            presence_id=presence_id,
            messages=[],
            message_count=0,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        
        db.add(conversation)
        await db.commit()
        await db.refresh(conversation)
        
        print(f"[ConversationService] Created new conversation: {conversation.id}")
        return conversation
    
    @staticmethod
    def _is_summary_valid(
        conversation: Conversation,
        older_message_count: int,
    ) -> bool:
        """
        Check if the cached summary is still valid.
        
        A summary is valid if:
        - It exists
        - It covers the same number of older messages
        
        Args:
            conversation: Conversation record
            older_message_count: Number of messages that would be summarized
            
        Returns:
            True if cached summary is valid
        """
        print(f"[ConversationService] Checking summary validity...")
        print(f"[ConversationService]    - Has cached summary: {'YES' if conversation.summary_text else 'NO'}")
        print(f"[ConversationService]    - Cached covers: {conversation.summary_message_count} messages")
        print(f"[ConversationService]    - Need to cover: {older_message_count} messages")
        
        if not conversation.summary_text:
            print(f"[ConversationService]    ❌ Invalid: No cached summary")
            return False
        
        if conversation.summary_message_count != older_message_count:
            print(f"[ConversationService]    ❌ Invalid: Message count mismatch ({conversation.summary_message_count} != {older_message_count})")
            return False
        
        print(f"[ConversationService]    ✅ Valid: Cached summary is current")
        return True
    
    @staticmethod
    async def _generate_and_cache_summary(
        db: AsyncSession,
        conversation: Conversation,
        messages_to_summarize: List[Dict[str, str]],
    ) -> str:
        """
        Generate a summary and cache it in the database.
        
        Args:
            db: Database session
            conversation: Conversation record to update
            messages_to_summarize: Messages to summarize
            
        Returns:
            Generated summary text
        """
        print(f"[ConversationService] 🔄 Generating summary for {len(messages_to_summarize)} messages...")
        print(f"[ConversationService]    Max tokens: {settings.chat_history_summary_max_tokens}")
        
        # Generate summary
        summary = await summarize_messages(
            messages=messages_to_summarize,
            max_tokens=settings.chat_history_summary_max_tokens,
        )
        
        # Cache in database
        conversation.summary_text = summary
        conversation.summary_message_count = len(messages_to_summarize)
        conversation.summary_updated_at = datetime.utcnow()
        
        await db.commit()
        
        print(f"[ConversationService] ✅ Summary generated and cached:")
        print(f"[ConversationService]    - Length: {len(summary)} chars")
        print(f"[ConversationService]    - Covers: {len(messages_to_summarize)} messages")
        print(f"[ConversationService]    - Preview: {summary[:80]}...")
        
        return summary
    
    @staticmethod
    async def get_history_with_token_budget(
        db: AsyncSession,
        user_wallet: str,
        presence_id: str,
        token_budget: Optional[int] = None,
    ) -> HistoryResult:
        """
        Get conversation history within a token budget.
        
        When history exceeds the budget, older messages are summarized.
        Recent messages are always kept unsummarized.
        
        Args:
            db: Database session
            user_wallet: User's wallet address
            presence_id: Presence agent ID
            token_budget: Maximum tokens for history (default: from settings)
            
        Returns:
            HistoryResult with messages, optional summary, and token counts
        """
        if token_budget is None:
            token_budget = settings.chat_history_token_budget
        
        recent_reserved = settings.chat_history_recent_messages_reserved
        
        print(f"\n[ConversationService] ========== GET HISTORY WITH TOKEN BUDGET ==========")
        print(f"[ConversationService] Token budget: {token_budget}")
        print(f"[ConversationService] Recent messages reserved: {recent_reserved}")
        print(f"[ConversationService] User: {user_wallet[:20]}...")
        print(f"[ConversationService] Presence: {presence_id}")
        
        # Load conversation
        stmt = select(Conversation).where(
            and_(
                Conversation.user_wallet == user_wallet,
                Conversation.presence_id == presence_id,
            )
        )
        result = await db.execute(stmt)
        conversation = result.scalar_one_or_none()
        
        # No conversation or no messages
        if not conversation or not conversation.messages:
            print(f"[ConversationService] ❌ No conversation found or empty")
            return HistoryResult(
                messages=[],
                summary=None,
                total_tokens=0,
                summarized_message_count=0,
            )
        
        messages = conversation.messages
        print(f"[ConversationService] Found {len(messages)} total messages in database")
        
        # Check cached summary status
        if conversation.summary_text:
            print(f"[ConversationService] 📦 Cached summary exists: {len(conversation.summary_text)} chars, covers {conversation.summary_message_count} messages")
        else:
            print(f"[ConversationService] 📦 No cached summary")
        
        # Filter by max age if configured
        if settings.chat_history_max_age_days is not None:
            cutoff_date = datetime.utcnow() - timedelta(days=settings.chat_history_max_age_days)
            cutoff_iso = cutoff_date.isoformat()
            original_count = len(messages)
            messages = [
                msg for msg in messages
                if msg.get("timestamp", "") >= cutoff_iso
            ]
            if len(messages) < original_count:
                print(f"[ConversationService] Age filter: {original_count} -> {len(messages)} messages (max_age={settings.chat_history_max_age_days} days)")
        
        # No messages after filtering
        if not messages:
            print(f"[ConversationService] ❌ No messages after age filtering")
            return HistoryResult(
                messages=[],
                summary=None,
                total_tokens=0,
                summarized_message_count=0,
            )
        
        # Convert to simple format for token counting and LLM
        simple_messages = [
            {"role": msg.get("role", "user"), "content": msg.get("content", "")}
            for msg in messages
        ]
        
        # Count total tokens
        total_tokens = count_message_tokens(simple_messages)
        print(f"[ConversationService] Total tokens for all messages: {total_tokens}")
        
        # If within budget, return all messages
        if total_tokens <= token_budget:
            print(f"[ConversationService] ✅ WITHIN BUDGET: {total_tokens} <= {token_budget} tokens")
            print(f"[ConversationService] Returning all {len(simple_messages)} messages (no summarization needed)")
            print(f"[ConversationService] =================================================\n")
            return HistoryResult(
                messages=simple_messages,
                summary=None,
                total_tokens=total_tokens,
                summarized_message_count=0,
            )
        
        # Need to summarize older messages
        print(f"[ConversationService] ⚠️ EXCEEDS BUDGET: {total_tokens} > {token_budget} tokens")
        print(f"[ConversationService] Summarization required...")
        
        # Split messages: keep recent, summarize older
        if len(simple_messages) <= recent_reserved:
            # All messages are "recent", return as-is (shouldn't happen often)
            print(f"[ConversationService] All {len(simple_messages)} messages are within reserved limit, returning as-is")
            return HistoryResult(
                messages=simple_messages,
                summary=None,
                total_tokens=total_tokens,
                summarized_message_count=0,
            )
        
        recent_messages = simple_messages[-recent_reserved:]
        older_messages = simple_messages[:-recent_reserved]
        
        print(f"[ConversationService] Split: {len(older_messages)} older + {len(recent_messages)} recent")
        
        # Count tokens for recent messages
        recent_tokens = count_message_tokens(recent_messages)
        print(f"[ConversationService] Recent messages tokens: {recent_tokens}")
        
        # Check if cached summary is valid
        if ConversationService._is_summary_valid(conversation, len(older_messages)):
            summary = conversation.summary_text
            print(f"[ConversationService] ✅ USING CACHED SUMMARY (valid for {len(older_messages)} messages)")
        else:
            # Generate new summary
            print(f"[ConversationService] 🔄 GENERATING NEW SUMMARY for {len(older_messages)} messages...")
            summary = await ConversationService._generate_and_cache_summary(
                db=db,
                conversation=conversation,
                messages_to_summarize=older_messages,
            )
            print(f"[ConversationService] ✅ New summary generated and cached")
        
        # Calculate total tokens (summary + recent)
        summary_tokens = count_message_tokens([{"role": "system", "content": summary}])
        total_tokens = summary_tokens + recent_tokens
        
        print(f"[ConversationService] Summary tokens: {summary_tokens}")
        print(f"[ConversationService] Final total: {total_tokens} tokens (summary + recent)")
        print(f"[ConversationService] =================================================\n")
        
        return HistoryResult(
            messages=recent_messages,
            summary=summary,
            total_tokens=total_tokens,
            summarized_message_count=len(older_messages),
        )
    
    @staticmethod
    async def get_full_history(
        db: AsyncSession,
        user_wallet: str,
        presence_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get full conversation with all messages.
        
        Args:
            db: Database session
            user_wallet: User's wallet address
            presence_id: Presence agent ID
            
        Returns:
            Conversation dict with all messages, or None if not found
        """
        stmt = select(Conversation).where(
            and_(
                Conversation.user_wallet == user_wallet,
                Conversation.presence_id == presence_id,
            )
        )
        result = await db.execute(stmt)
        conversation = result.scalar_one_or_none()
        
        if not conversation:
            return None
        
        return {
            "id": conversation.id,
            "userWallet": conversation.user_wallet,
            "presenceId": conversation.presence_id,
            "messages": conversation.messages,
            "messageCount": conversation.message_count,
            "createdAt": conversation.created_at.isoformat(),
            "updatedAt": conversation.updated_at.isoformat(),
        }
    
    @staticmethod
    async def append_messages(
        db: AsyncSession,
        user_wallet: str,
        presence_id: str,
        new_messages: List[Dict[str, Any]],
    ) -> Conversation:
        """
        Append new messages to the conversation.
        
        Args:
            db: Database session
            user_wallet: User's wallet address
            presence_id: Presence agent ID
            new_messages: List of messages to append
                Format: [{"role": "user"|"assistant", "content": "..."}]
            
        Returns:
            Updated conversation record
        """
        # Get or create conversation
        conversation = await ConversationService.get_or_create(
            db, user_wallet, presence_id
        )
        
        # Add timestamps and IDs to new messages
        timestamp = datetime.utcnow().isoformat()
        formatted_messages = []
        for msg in new_messages:
            formatted_messages.append({
                "id": ConversationService._generate_message_id(),
                "role": msg.get("role", "user"),
                "content": msg.get("content", ""),
                "timestamp": timestamp,
            })
        
        # Append to existing messages
        updated_messages = (conversation.messages or []) + formatted_messages
        conversation.messages = updated_messages
        conversation.message_count = len(updated_messages)
        conversation.updated_at = datetime.utcnow()
        
        await db.commit()
        await db.refresh(conversation)
        
        print(f"[ConversationService] Appended {len(formatted_messages)} messages. Total: {conversation.message_count}")
        return conversation
    
    @staticmethod
    async def append_user_message(
        db: AsyncSession,
        user_wallet: str,
        presence_id: str,
        content: str,
    ) -> Dict[str, Any]:
        """
        Append a user message to the conversation.
        
        Args:
            db: Database session
            user_wallet: User's wallet address
            presence_id: Presence agent ID
            content: Message content
            
        Returns:
            The created message dict
        """
        message = {
            "role": "user",
            "content": content,
        }
        await ConversationService.append_messages(
            db, user_wallet, presence_id, [message]
        )
        return message
    
    @staticmethod
    async def append_assistant_message(
        db: AsyncSession,
        user_wallet: str,
        presence_id: str,
        content: str,
    ) -> Dict[str, Any]:
        """
        Append an assistant message to the conversation.
        
        Args:
            db: Database session
            user_wallet: User's wallet address
            presence_id: Presence agent ID
            content: Message content
            
        Returns:
            The created message dict
        """
        message = {
            "role": "assistant",
            "content": content,
        }
        await ConversationService.append_messages(
            db, user_wallet, presence_id, [message]
        )
        return message
    
    @staticmethod
    async def clear_history(
        db: AsyncSession,
        user_wallet: str,
        presence_id: str,
    ) -> bool:
        """
        Clear all messages and summary cache from a conversation.
        
        Args:
            db: Database session
            user_wallet: User's wallet address
            presence_id: Presence agent ID
            
        Returns:
            True if conversation was found and cleared, False otherwise
        """
        stmt = select(Conversation).where(
            and_(
                Conversation.user_wallet == user_wallet,
                Conversation.presence_id == presence_id,
            )
        )
        result = await db.execute(stmt)
        conversation = result.scalar_one_or_none()
        
        if not conversation:
            return False
        
        # Clear messages
        conversation.messages = []
        conversation.message_count = 0
        
        # Clear summary cache
        conversation.summary_text = None
        conversation.summary_message_count = None
        conversation.summary_updated_at = None
        
        conversation.updated_at = datetime.utcnow()
        
        await db.commit()
        
        print(f"[ConversationService] Cleared conversation and summary cache: {conversation.id}")
        return True
    
    @staticmethod
    async def delete_conversation(
        db: AsyncSession,
        user_wallet: str,
        presence_id: str,
    ) -> bool:
        """
        Delete a conversation entirely.
        
        Args:
            db: Database session
            user_wallet: User's wallet address
            presence_id: Presence agent ID
            
        Returns:
            True if conversation was found and deleted, False otherwise
        """
        stmt = select(Conversation).where(
            and_(
                Conversation.user_wallet == user_wallet,
                Conversation.presence_id == presence_id,
            )
        )
        result = await db.execute(stmt)
        conversation = result.scalar_one_or_none()
        
        if not conversation:
            return False
        
        await db.delete(conversation)
        await db.commit()
        
        print(f"[ConversationService] Deleted conversation: {conversation.id}")
        return True
    
    @staticmethod
    async def get_user_conversations(
        db: AsyncSession,
        user_wallet: str,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """
        Get all conversations for a user.
        
        Args:
            db: Database session
            user_wallet: User's wallet address
            limit: Maximum number of conversations to return
            offset: Number of conversations to skip
            
        Returns:
            List of conversation summaries (without full message history)
        """
        stmt = (
            select(Conversation)
            .where(Conversation.user_wallet == user_wallet)
            .order_by(Conversation.updated_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await db.execute(stmt)
        conversations = result.scalars().all()
        
        return [
            {
                "id": conv.id,
                "userWallet": conv.user_wallet,
                "presenceId": conv.presence_id,
                "messageCount": conv.message_count,
                "createdAt": conv.created_at.isoformat(),
                "updatedAt": conv.updated_at.isoformat(),
                # Include last message preview
                "lastMessage": conv.messages[-1] if conv.messages else None,
            }
            for conv in conversations
        ]


    # ─────────────────────────────────────────────────────────────────────────────
    # Cleanup / Pruning Methods
    # ─────────────────────────────────────────────────────────────────────────────
    
    @staticmethod
    async def prune_old_messages(
        db: AsyncSession,
        conversation_id: str,
        max_age_days: float,
    ) -> int:
        """
        Remove messages older than max_age_days from a single conversation.
        Also invalidates the summary cache.
        
        Args:
            db: Database session
            conversation_id: Conversation ID to prune
            max_age_days: Maximum age of messages in days (supports decimals)
            
        Returns:
            Number of messages removed
        """
        stmt = select(Conversation).where(Conversation.id == conversation_id)
        result = await db.execute(stmt)
        conversation = result.scalar_one_or_none()
        
        if not conversation or not conversation.messages:
            return 0
        
        original_count = len(conversation.messages)
        cutoff_date = datetime.utcnow() - timedelta(days=max_age_days)
        cutoff_iso = cutoff_date.isoformat()
        
        # Filter messages: keep only those newer than cutoff
        filtered_messages = []
        for msg in conversation.messages:
            timestamp = msg.get("timestamp", "")
            if not timestamp:
                # Keep messages without timestamp (shouldn't happen, but safe)
                filtered_messages.append(msg)
                continue
            
            if timestamp >= cutoff_iso:
                filtered_messages.append(msg)
        
        removed_count = original_count - len(filtered_messages)
        
        if removed_count > 0:
            conversation.messages = filtered_messages
            conversation.message_count = len(filtered_messages)
            conversation.updated_at = datetime.utcnow()
            
            # Invalidate summary cache (message count changed)
            conversation.summary_text = None
            conversation.summary_message_count = None
            conversation.summary_updated_at = None
            
            # Note: Caller is responsible for committing
        
        return removed_count
    
    @staticmethod
    async def prune_all_conversations(
        db: AsyncSession,
        max_age_days: float,
        batch_size: int = 100,
    ) -> Dict[str, int]:
        """
        Prune old messages from all conversations.
        
        Args:
            db: Database session
            max_age_days: Maximum age of messages in days (supports decimals)
            batch_size: Number of conversations to process per batch
            
        Returns:
            Dict with stats: conversations_processed, messages_removed
        """
        total_conversations = 0
        total_messages_removed = 0
        offset = 0
        
        while True:
            # Fetch batch of conversations
            stmt = (
                select(Conversation)
                .order_by(Conversation.id)
                .limit(batch_size)
                .offset(offset)
            )
            result = await db.execute(stmt)
            conversations = result.scalars().all()
            
            if not conversations:
                break
            
            batch_removed = 0
            for conv in conversations:
                removed = await ConversationService.prune_old_messages(
                    db=db,
                    conversation_id=conv.id,
                    max_age_days=max_age_days,
                )
                batch_removed += removed
                total_conversations += 1
            
            # Commit batch
            await db.commit()
            total_messages_removed += batch_removed
            
            offset += batch_size
            
            # If we got fewer than batch_size, we're done
            if len(conversations) < batch_size:
                break
        
        return {
            "conversations_processed": total_conversations,
            "messages_removed": total_messages_removed,
        }
    
    @staticmethod
    async def get_conversation_count(db: AsyncSession) -> int:
        """
        Get total number of conversations.
        
        Args:
            db: Database session
            
        Returns:
            Total conversation count
        """
        from sqlalchemy import func
        stmt = select(func.count(Conversation.id))
        result = await db.execute(stmt)
        return result.scalar() or 0


# Singleton instance for easy import
conversation_service = ConversationService()