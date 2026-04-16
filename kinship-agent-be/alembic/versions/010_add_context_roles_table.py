"""Add context_roles table

Revision ID: 010
Revises: 009
Create Date: 2025-04-09

This migration:
1. Creates the `context_roles` table for mapping workers to contexts
2. Uses ARRAY type for worker_ids to support multiple workers per role
3. Adds necessary indexes and constraints
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY


# revision identifiers, used by Alembic.
revision = '010_add_context_roles_table'
down_revision = '009_add_context_tables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'context_roles',
        sa.Column('id', sa.String(64), primary_key=True),
        
        # Parent context (required)
        sa.Column(
            'context_id',
            sa.String(64),
            sa.ForeignKey('context.id', ondelete='CASCADE'),
            nullable=False
        ),
        
        # Worker agent references (array of IDs)
        sa.Column('worker_ids', ARRAY(sa.String), nullable=False, server_default='{}'),
        
        # Role name
        sa.Column('name', sa.String(255), nullable=False),
        
        # Ownership
        sa.Column('wallet', sa.String(255), nullable=False),
        sa.Column('created_by', sa.String(255), nullable=False),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        
        # Unique constraint for role name within context
        sa.UniqueConstraint('context_id', 'name', name='uq_context_role_name'),
    )
    
    # Create indexes
    op.create_index('ix_context_roles_context_id', 'context_roles', ['context_id'])
    op.create_index('ix_context_roles_wallet', 'context_roles', ['wallet'])


def downgrade() -> None:
    op.drop_index('ix_context_roles_wallet', table_name='context_roles')
    op.drop_index('ix_context_roles_context_id', table_name='context_roles')
    op.drop_table('context_roles')
