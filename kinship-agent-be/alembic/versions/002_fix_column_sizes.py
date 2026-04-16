"""Fix column sizes for UUIDs and IDs

Revision ID: 002_fix_column_sizes
Revises: 001_initial
Create Date: 2024-01-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '002_fix_column_sizes'
down_revision: Union[str, None] = '001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Expand column sizes to accommodate:
    - UUIDs (36 chars)
    - Solana wallet addresses (44 chars) 
    - Various IDs with prefixes (e.g., agent_xxxxx)
    """
    
    # Agents table
    op.alter_column('agents', 'id', type_=sa.String(64), existing_type=sa.String(32))
    op.alter_column('agents', 'platform_id', type_=sa.String(64), existing_type=sa.String(32))
    op.alter_column('agents', 'parent_id', type_=sa.String(64), existing_type=sa.String(32))
    op.alter_column('agents', 'prompt_id', type_=sa.String(64), existing_type=sa.String(32))
    
    # Knowledge bases table
    op.alter_column('knowledge_bases', 'id', type_=sa.String(64), existing_type=sa.String(32))
    op.alter_column('knowledge_bases', 'platform_id', type_=sa.String(64), existing_type=sa.String(32))
    
    # Chat sessions table
    op.alter_column('chat_sessions', 'id', type_=sa.String(64), existing_type=sa.String(32))
    op.alter_column('chat_sessions', 'presence_id', type_=sa.String(64), existing_type=sa.String(32))
    op.alter_column('chat_sessions', 'platform_id', type_=sa.String(64), existing_type=sa.String(32))
    
    # Chat messages table
    op.alter_column('chat_messages', 'id', type_=sa.String(64), existing_type=sa.String(32))
    op.alter_column('chat_messages', 'session_id', type_=sa.String(64), existing_type=sa.String(32))
    
    # Pending approvals table
    op.alter_column('pending_approvals', 'id', type_=sa.String(64), existing_type=sa.String(32))
    op.alter_column('pending_approvals', 'presence_id', type_=sa.String(64), existing_type=sa.String(32))
    op.alter_column('pending_approvals', 'worker_id', type_=sa.String(64), existing_type=sa.String(32))


def downgrade() -> None:
    """Revert column sizes (may fail if data exceeds 32 chars)"""
    
    # Pending approvals table
    op.alter_column('pending_approvals', 'worker_id', type_=sa.String(32), existing_type=sa.String(64))
    op.alter_column('pending_approvals', 'presence_id', type_=sa.String(32), existing_type=sa.String(64))
    op.alter_column('pending_approvals', 'id', type_=sa.String(32), existing_type=sa.String(64))
    
    # Chat messages table
    op.alter_column('chat_messages', 'session_id', type_=sa.String(32), existing_type=sa.String(64))
    op.alter_column('chat_messages', 'id', type_=sa.String(32), existing_type=sa.String(64))
    
    # Chat sessions table
    op.alter_column('chat_sessions', 'platform_id', type_=sa.String(32), existing_type=sa.String(64))
    op.alter_column('chat_sessions', 'presence_id', type_=sa.String(32), existing_type=sa.String(64))
    op.alter_column('chat_sessions', 'id', type_=sa.String(32), existing_type=sa.String(64))
    
    # Knowledge bases table
    op.alter_column('knowledge_bases', 'platform_id', type_=sa.String(32), existing_type=sa.String(64))
    op.alter_column('knowledge_bases', 'id', type_=sa.String(32), existing_type=sa.String(64))
    
    # Agents table
    op.alter_column('agents', 'prompt_id', type_=sa.String(32), existing_type=sa.String(64))
    op.alter_column('agents', 'parent_id', type_=sa.String(32), existing_type=sa.String(64))
    op.alter_column('agents', 'platform_id', type_=sa.String(32), existing_type=sa.String(64))
    op.alter_column('agents', 'id', type_=sa.String(32), existing_type=sa.String(64))
