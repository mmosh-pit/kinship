"""Add codes table

Revision ID: 011
Revises: 010
Create Date: 2025-04-10

This migration:
1. Creates enum types for code_access_type, code_status, and code_role
2. Creates the `codes` table for access codes
3. Adds necessary indexes
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '011_add_codes_table'
down_revision = '010_add_context_roles_table'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enum types
    code_access_type = sa.Enum('context', 'gathering', name='codeaccesstype')
    code_status = sa.Enum('active', 'expired', 'disabled', 'redeemed', name='codestatus')
    code_role = sa.Enum('member', 'guest', name='coderole')
    
    code_access_type.create(op.get_bind(), checkfirst=True)
    code_status.create(op.get_bind(), checkfirst=True)
    code_role.create(op.get_bind(), checkfirst=True)
    
    op.create_table(
        'codes',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('code', sa.String(15), unique=True, nullable=False),
        
        # Access configuration
        sa.Column(
            'access_type',
            sa.Enum('context', 'gathering', name='codeaccesstype', create_type=False),
            nullable=False,
            server_default='context'
        ),
        sa.Column(
            'context_id',
            sa.String(64),
            sa.ForeignKey('context.id', ondelete='CASCADE'),
            nullable=False
        ),
        sa.Column(
            'gathering_id',
            sa.String(64),
            sa.ForeignKey('nested_context.id', ondelete='SET NULL'),
            nullable=True
        ),
        sa.Column(
            'scope_id',
            sa.String(64),
            sa.ForeignKey('context_roles.id', ondelete='SET NULL'),
            nullable=True
        ),
        
        # Role granted by this code
        sa.Column(
            'role',
            sa.Enum('member', 'guest', name='coderole', create_type=False),
            nullable=False,
            server_default='member'
        ),
        
        # Pricing
        sa.Column('price', sa.Numeric(18, 6), nullable=True),
        sa.Column('discount', sa.Numeric(5, 2), nullable=True),
        
        # Expiry
        sa.Column('expiry_date', sa.DateTime, nullable=True),
        
        # Usage limits
        sa.Column('max_uses', sa.Integer, nullable=True),
        sa.Column('current_uses', sa.Integer, nullable=False, server_default='0'),
        
        # Status
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column(
            'status',
            sa.Enum('active', 'expired', 'disabled', 'redeemed', name='codestatus', create_type=False),
            nullable=False,
            server_default='active'
        ),
        
        # Ownership
        sa.Column('creator_wallet', sa.String(255), nullable=False),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    
    # Create indexes
    op.create_index('ix_codes_code', 'codes', ['code'], unique=True)
    op.create_index('ix_codes_context_id', 'codes', ['context_id'])
    op.create_index('ix_codes_gathering_id', 'codes', ['gathering_id'])
    op.create_index('ix_codes_scope_id', 'codes', ['scope_id'])
    op.create_index('ix_codes_role', 'codes', ['role'])
    op.create_index('ix_codes_creator_wallet', 'codes', ['creator_wallet'])
    op.create_index('ix_codes_status', 'codes', ['status'])
    op.create_index('ix_codes_is_active', 'codes', ['is_active'])
    op.create_index('ix_codes_access_type', 'codes', ['access_type'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_codes_access_type', table_name='codes')
    op.drop_index('ix_codes_is_active', table_name='codes')
    op.drop_index('ix_codes_status', table_name='codes')
    op.drop_index('ix_codes_creator_wallet', table_name='codes')
    op.drop_index('ix_codes_role', table_name='codes')
    op.drop_index('ix_codes_scope_id', table_name='codes')
    op.drop_index('ix_codes_gathering_id', table_name='codes')
    op.drop_index('ix_codes_context_id', table_name='codes')
    op.drop_index('ix_codes_code', table_name='codes')
    
    # Drop table
    op.drop_table('codes')
    
    # Drop enum types
    sa.Enum(name='coderole').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='codestatus').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='codeaccesstype').drop(op.get_bind(), checkfirst=True)