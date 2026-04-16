"""Add tool_connections table

Revision ID: 006
Revises: 005_cleanup_agent_schema
Create Date: 2024-01-15

This migration creates the tool_connections table for storing tool connections and credentials.
Supports Bluesky, Google, Telegram, etc.

Schema (one record per worker):
- id, worker_id (unique), worker_agent_name
- tool_names: ARRAY of connected tool names ["telegram", "google"]
- credentials_encrypted: JSON with credentials per tool {"telegram": {...}, "google": {...}}
- external_handles: JSON with handles per tool {"telegram": "@bot", "google": "user@gmail.com"}
- external_user_ids: JSON with user IDs per tool
- status, connected_at, updated_at
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '006_add_tool_connections'
down_revision = '005_cleanup_agent_schema'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create tool_connections table
    op.create_table(
        'tool_connections',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('worker_id', sa.String(64), sa.ForeignKey('agents.id'), nullable=False, unique=True),
        sa.Column('worker_agent_name', sa.String(255), nullable=True),
        sa.Column('tool_names', postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column('credentials_encrypted', sa.Text(), nullable=True),
        sa.Column('external_handles', postgresql.JSON(), nullable=True),
        sa.Column('external_user_ids', postgresql.JSON(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='active'),
        sa.Column('connected_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    
    # Create indexes
    op.create_index('ix_tool_connections_worker_id', 'tool_connections', ['worker_id'])
    op.create_index('ix_tool_connections_status', 'tool_connections', ['status'])
    op.create_index('ix_tool_connections_worker_agent_name', 'tool_connections', ['worker_agent_name'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_tool_connections_worker_agent_name', table_name='tool_connections')
    op.drop_index('ix_tool_connections_status', table_name='tool_connections')
    op.drop_index('ix_tool_connections_worker_id', table_name='tool_connections')
    
    # Drop table
    op.drop_table('tool_connections')
