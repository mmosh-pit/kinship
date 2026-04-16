"""Add conversation summary cache fields

Revision ID: 008_add_conversation_summary_cache
Revises: 007_add_conversations_table
Create Date: 2025-04-07

Adds summary cache fields to the conversations table for token-based
history management. When conversation history exceeds the token budget,
older messages are summarized and cached to avoid re-computation.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '008_add_conversation_summary_cache'
down_revision = '007_add_conversations_table'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add summary cache columns to conversations table
    op.add_column('conversations', sa.Column('summary_text', sa.Text(), nullable=True))
    op.add_column('conversations', sa.Column('summary_message_count', sa.Integer(), nullable=True))
    op.add_column('conversations', sa.Column('summary_updated_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    # Remove summary cache columns
    op.drop_column('conversations', 'summary_updated_at')
    op.drop_column('conversations', 'summary_message_count')
    op.drop_column('conversations', 'summary_text')
