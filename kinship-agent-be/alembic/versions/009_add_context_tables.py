"""Add context and nested_context tables

Revision ID: 009
Revises: 008
Create Date: 2025-04-09

This migration:
1. Creates the `context` table for top-level organizational containers
2. Creates the `nested_context` table for nested contexts under contexts
3. Adds necessary indexes and constraints
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import ENUM


# revision identifiers, used by Alembic.
revision = '009_add_context_tables'
down_revision = '008_add_conversation_summary_cache'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Check if visibilitylevel enum already exists
    conn = op.get_bind()
    result = conn.execute(text(
        "SELECT 1 FROM pg_type WHERE typname = 'visibilitylevel'"
    ))
    enum_exists = result.fetchone() is not None
    
    # Create enum only if it doesn't exist
    if not enum_exists:
        visibility_enum = ENUM('public', 'private', 'secret', name='visibilitylevel', create_type=True)
        visibility_enum.create(conn)
    
    # 1. Create the context table (use create_type=False since we created it above)
    op.create_table(
        'context',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('slug', sa.String(250), nullable=False),
        sa.Column('handle', sa.String(25), nullable=True, unique=True),
        sa.Column('context_type', sa.String(100), nullable=True),
        sa.Column('description', sa.Text, nullable=False, server_default=''),
        sa.Column('icon', sa.String(10), nullable=False, server_default='🎮'),
        sa.Column('color', sa.String(7), nullable=False, server_default='#4CADA8'),
        
        # Presence agent IDs (JSON array stored as string)
        sa.Column('presence_id', sa.Text, nullable=True),
        
        # Visibility enum (use existing type)
        sa.Column(
            'visibility',
            sa.Enum('public', 'private', 'secret', name='visibilitylevel', create_type=False),
            nullable=False,
            server_default='public'
        ),
        
        # Knowledge and instructions (JSON arrays stored as strings)
        sa.Column('knowledge_base_ids', sa.Text, nullable=True),
        sa.Column('instruction_ids', sa.Text, nullable=True),
        sa.Column('instructions', sa.Text, nullable=False, server_default=''),
        
        # Status
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        
        # Ownership
        sa.Column('created_by', sa.String(255), nullable=False),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    
    # Create indexes for context
    op.create_index('ix_context_slug', 'context', ['slug'])
    op.create_index('ix_context_handle', 'context', ['handle'])
    op.create_index('ix_context_is_active', 'context', ['is_active'])
    op.create_index('ix_context_created_by', 'context', ['created_by'])
    
    # 2. Create the nested_context table
    op.create_table(
        'nested_context',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column(
            'context_id',
            sa.String(64),
            sa.ForeignKey('context.id', ondelete='CASCADE'),
            nullable=False
        ),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('slug', sa.String(250), nullable=False),
        sa.Column('handle', sa.String(25), nullable=True, unique=True),
        sa.Column('context_type', sa.String(100), nullable=True),
        sa.Column('description', sa.Text, nullable=False, server_default=''),
        sa.Column('icon', sa.String(10), nullable=False, server_default='📁'),
        sa.Column('color', sa.String(7), nullable=False, server_default='#A855F7'),
        
        # Presence agent IDs (JSON array stored as string)
        sa.Column('presence_id', sa.Text, nullable=True),
        
        # Visibility enum (reuses the same enum type)
        sa.Column(
            'visibility',
            sa.Enum('public', 'private', 'secret', name='visibilitylevel', create_type=False),
            nullable=False,
            server_default='public'
        ),
        
        # Knowledge, gatherings, and instructions (JSON arrays stored as strings)
        sa.Column('knowledge_base_ids', sa.Text, nullable=True),
        sa.Column('gathering_ids', sa.Text, nullable=True),
        sa.Column('instruction_ids', sa.Text, nullable=True),
        sa.Column('instructions', sa.Text, nullable=False, server_default=''),
        
        # Status
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        
        # Ownership
        sa.Column('created_by', sa.String(255), nullable=False),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        
        # Unique constraint for slug within context
        sa.UniqueConstraint('context_id', 'slug', name='uq_nested_context_slug'),
    )
    
    # Create indexes for nested_context
    op.create_index('ix_nested_context_context_id', 'nested_context', ['context_id'])
    op.create_index('ix_nested_context_slug', 'nested_context', ['slug'])
    op.create_index('ix_nested_context_handle', 'nested_context', ['handle'])
    op.create_index('ix_nested_context_is_active', 'nested_context', ['is_active'])
    op.create_index('ix_nested_context_created_by', 'nested_context', ['created_by'])


def downgrade() -> None:
    # Drop nested_context table first (has FK to context)
    op.drop_index('ix_nested_context_created_by', table_name='nested_context')
    op.drop_index('ix_nested_context_is_active', table_name='nested_context')
    op.drop_index('ix_nested_context_handle', table_name='nested_context')
    op.drop_index('ix_nested_context_slug', table_name='nested_context')
    op.drop_index('ix_nested_context_context_id', table_name='nested_context')
    op.drop_table('nested_context')
    
    # Drop context table
    op.drop_index('ix_context_created_by', table_name='context')
    op.drop_index('ix_context_is_active', table_name='context')
    op.drop_index('ix_context_handle', table_name='context')
    op.drop_index('ix_context_slug', table_name='context')
    op.drop_table('context')
    
    # Drop the visibility enum type
    op.execute('DROP TYPE IF EXISTS visibilitylevel')