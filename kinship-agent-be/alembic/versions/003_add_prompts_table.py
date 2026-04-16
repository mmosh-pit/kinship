"""Add prompts table

Revision ID: 003_add_prompts_table
Revises: 002_fix_column_sizes
Create Date: 2024-01-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '003_add_prompts_table'
down_revision: Union[str, None] = '002_fix_column_sizes'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create prompts table."""
    op.create_table(
        'prompts',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('content', sa.Text, nullable=False, server_default=''),
        sa.Column('category', sa.String(100), nullable=True),
        sa.Column('tier', sa.Integer, nullable=False, server_default='1'),
        sa.Column('status', sa.String(50), nullable=False, server_default='active'),
        sa.Column('wallet', sa.String(255), nullable=False),
        sa.Column('platform_id', sa.String(64), nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    
    # Create indexes
    op.create_index('ix_prompts_wallet', 'prompts', ['wallet'])
    op.create_index('ix_prompts_platform_id', 'prompts', ['platform_id'])


def downgrade() -> None:
    """Drop prompts table."""
    op.drop_index('ix_prompts_platform_id', table_name='prompts')
    op.drop_index('ix_prompts_wallet', table_name='prompts')
    op.drop_table('prompts')
