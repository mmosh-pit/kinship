"""Add prompt guidance fields

Revision ID: 004
Revises: 003
Create Date: 2024-03-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '004_add_prompt_guidance_fields'
down_revision: Union[str, None] = '003_add_prompts_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new guidance fields to prompts table
    op.add_column('prompts', sa.Column('tone', sa.String(100), nullable=True))
    op.add_column('prompts', sa.Column('persona', sa.String(100), nullable=True))
    op.add_column('prompts', sa.Column('audience', sa.String(100), nullable=True))
    op.add_column('prompts', sa.Column('format', sa.String(100), nullable=True))
    op.add_column('prompts', sa.Column('goal', sa.Text(), nullable=True))
    op.add_column('prompts', sa.Column('connected_kb_id', sa.String(64), nullable=True))
    op.add_column('prompts', sa.Column('connected_kb_name', sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column('prompts', 'connected_kb_name')
    op.drop_column('prompts', 'connected_kb_id')
    op.drop_column('prompts', 'goal')
    op.drop_column('prompts', 'format')
    op.drop_column('prompts', 'audience')
    op.drop_column('prompts', 'persona')
    op.drop_column('prompts', 'tone')
