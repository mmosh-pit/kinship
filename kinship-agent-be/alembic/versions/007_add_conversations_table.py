"""Add conversations table and remove unused chat tables

Revision ID: 007
Revises: 006
Create Date: 2025-04-06

This migration:
1. Creates the new `conversations` table with JSONB messages array
2. Drops the unused `chat_messages` table
3. Drops the unused `chat_sessions` table
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision = '007_add_conversations_table'
down_revision = '006_add_tool_connections'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create the new conversations table
    op.create_table(
        'conversations',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('user_wallet', sa.String(255), nullable=False),
        sa.Column('presence_id', sa.String(64), nullable=False),
        sa.Column('messages', JSONB, nullable=False, server_default='[]'),
        sa.Column('message_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        
        # Unique constraint: one conversation per user_wallet + presence_id
        sa.UniqueConstraint('user_wallet', 'presence_id', name='uq_conversation_user_presence'),
    )
    
    # Create indexes for efficient querying
    op.create_index('ix_conversations_user_wallet', 'conversations', ['user_wallet'])
    op.create_index('ix_conversations_presence_id', 'conversations', ['presence_id'])
    op.create_index('ix_conversations_updated_at', 'conversations', ['updated_at'])
    
    # 2. Drop unused chat_messages table (has FK to chat_sessions, so drop first)
    op.drop_table('chat_messages')
    
    # 3. Drop unused chat_sessions table
    op.drop_table('chat_sessions')


def downgrade() -> None:
    # Recreate chat_sessions table
    op.create_table(
        'chat_sessions',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('presence_id', sa.String(64), sa.ForeignKey('agents.id'), nullable=False),
        sa.Column('user_id', sa.String(255), nullable=False),
        sa.Column('user_wallet', sa.String(255), nullable=False),
        sa.Column('user_role', sa.String(50), nullable=False, server_default='guest'),
        sa.Column('title', sa.String(255), nullable=True),
        sa.Column('status', sa.Enum('ACTIVE', 'ARCHIVED', name='sessionstatus'), nullable=False, server_default='ACTIVE'),
        sa.Column('message_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('last_message_at', sa.DateTime, nullable=True),
        sa.Column('platform_id', sa.String(64), nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_chat_sessions_user_id', 'chat_sessions', ['user_id'])
    op.create_index('ix_chat_sessions_user_wallet', 'chat_sessions', ['user_wallet'])
    op.create_index('ix_chat_sessions_presence_id', 'chat_sessions', ['presence_id'])
    
    # Recreate chat_messages table
    op.create_table(
        'chat_messages',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('session_id', sa.String(64), sa.ForeignKey('chat_sessions.id'), nullable=False),
        sa.Column('role', sa.Enum('USER', 'ASSISTANT', 'SYSTEM', 'TOOL', name='messagerole'), nullable=False, server_default='USER'),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('action', sa.JSON, nullable=True),
        sa.Column('usage', sa.JSON, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_chat_messages_session_id', 'chat_messages', ['session_id'])
    
    # Drop conversations table
    op.drop_index('ix_conversations_updated_at', table_name='conversations')
    op.drop_index('ix_conversations_presence_id', table_name='conversations')
    op.drop_index('ix_conversations_user_wallet', table_name='conversations')
    op.drop_table('conversations')
