"""Cleanup agent schema - remove brief_description, config, and role; add tools

Revision ID: 005
Revises: 004
Create Date: 2024-03-23

Changes:
- Remove brief_description column (not needed)
- Remove config column (replaced by tools array)
- Remove role column (not needed - workers identified by name/description)
- Add tools column (VARCHAR[] array for worker tool IDs)
- Keep system_prompt column
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY


# revision identifiers, used by Alembic.
revision: str = '005_cleanup_agent_schema'
down_revision: Union[str, None] = '004_add_prompt_guidance_fields'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add tools column first (ARRAY of strings for worker tool IDs)
    op.add_column('agents', sa.Column('tools', ARRAY(sa.String()), nullable=True))
    
    # Migrate tools data from config->tools to new tools column
    op.execute("""
        UPDATE agents 
        SET tools = (
            SELECT ARRAY(
                SELECT jsonb_array_elements_text(config->'tools')
            )
        )
        WHERE config IS NOT NULL 
        AND config::text != '{}'
        AND config->'tools' IS NOT NULL
    """)
    
    # Drop config column
    op.drop_column('agents', 'config')
    
    # Drop brief_description column
    op.drop_column('agents', 'brief_description')
    
    # Drop role column
    op.drop_column('agents', 'role')
    
    # Add index for parent_id (for worker lookups)
    op.create_index('ix_agents_parent_id', 'agents', ['parent_id'])


def downgrade() -> None:
    # Drop parent_id index
    op.drop_index('ix_agents_parent_id', 'agents')
    
    # Re-add role column
    op.add_column('agents', sa.Column('role', sa.String(255), nullable=True))
    
    # Re-add brief_description column
    op.add_column('agents', sa.Column('brief_description', sa.Text(), nullable=True))
    
    # Re-add config column
    op.add_column('agents', sa.Column('config', sa.JSON(), nullable=True, server_default='{}'))
    
    # Migrate tools back to config
    op.execute("""
        UPDATE agents 
        SET config = jsonb_build_object('tools', tools)
        WHERE tools IS NOT NULL AND array_length(tools, 1) > 0
    """)
    
    # Drop tools column
    op.drop_column('agents', 'tools')
