"""Initial schema - agents, sessions, messages

Revision ID: 001_initial
Revises: 
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create enum types
    agent_type = postgresql.ENUM('presence', 'worker', name='agenttype', create_type=False)
    agent_status = postgresql.ENUM('active', 'archived', 'suspended', name='agentstatus', create_type=False)
    agent_tone = postgresql.ENUM('neutral', 'friendly', 'professional', 'strict', 'cool', 'angry', 'playful', 'wise', name='agenttone', create_type=False)
    access_level = postgresql.ENUM('private', 'public', 'admin', 'creator', name='accesslevel', create_type=False)
    session_status = postgresql.ENUM('active', 'archived', name='sessionstatus', create_type=False)
    message_role = postgresql.ENUM('user', 'assistant', 'system', 'tool', name='messagerole', create_type=False)
    action_status = postgresql.ENUM('pending', 'executed', 'failed', 'requires_approval', name='actionstatus', create_type=False)

    # Create enums (UPPERCASE to match Python enum values)
    op.execute("CREATE TYPE agenttype AS ENUM ('PRESENCE', 'WORKER')")
    op.execute("CREATE TYPE agentstatus AS ENUM ('ACTIVE', 'ARCHIVED', 'SUSPENDED')")
    op.execute("CREATE TYPE agenttone AS ENUM ('NEUTRAL', 'FRIENDLY', 'PROFESSIONAL', 'STRICT', 'COOL', 'ANGRY', 'PLAYFUL', 'WISE')")
    op.execute("CREATE TYPE accesslevel AS ENUM ('PRIVATE', 'PUBLIC', 'ADMIN', 'CREATOR')")
    op.execute("CREATE TYPE sessionstatus AS ENUM ('ACTIVE', 'ARCHIVED')")
    op.execute("CREATE TYPE messagerole AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL')")
    op.execute("CREATE TYPE actionstatus AS ENUM ('PENDING', 'EXECUTED', 'FAILED', 'REQUIRES_APPROVAL')")

    # Create agents table
    op.create_table(
        'agents',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('handle', sa.String(25), unique=True, nullable=True),
        sa.Column('type', postgresql.ENUM('presence', 'worker', name='agenttype', create_type=False), nullable=False, server_default='presence'),
        sa.Column('status', postgresql.ENUM('active', 'archived', 'suspended', name='agentstatus', create_type=False), nullable=False, server_default='active'),
        sa.Column('brief_description', sa.Text(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('backstory', sa.Text(), nullable=True),
        sa.Column('role', sa.String(255), nullable=True),
        sa.Column('access_level', postgresql.ENUM('private', 'public', 'admin', 'creator', name='accesslevel', create_type=False), nullable=True),
        sa.Column('tone', postgresql.ENUM('neutral', 'friendly', 'professional', 'strict', 'cool', 'angry', 'playful', 'wise', name='agenttone', create_type=False), nullable=True, server_default='neutral'),
        sa.Column('system_prompt', sa.Text(), nullable=True),
        sa.Column('prompt_id', sa.String(64), nullable=True),
        sa.Column('knowledge_base_ids', postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column('config', postgresql.JSON(), nullable=True, server_default='{}'),
        sa.Column('wallet', sa.String(255), nullable=False),
        sa.Column('platform_id', sa.String(64), nullable=True),
        sa.Column('parent_id', sa.String(64), sa.ForeignKey('agents.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_index('ix_agents_wallet', 'agents', ['wallet'])
    op.create_index('ix_agents_type', 'agents', ['type'])
    op.create_index('ix_agents_wallet_type', 'agents', ['wallet', 'type'])
    op.create_index('ix_agents_platform_id', 'agents', ['platform_id'])

    # Create knowledge_bases table
    op.create_table(
        'knowledge_bases',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('content_type', sa.String(50), nullable=True),
        sa.Column('embeddings', postgresql.JSON(), nullable=True),
        sa.Column('metadata', postgresql.JSON(), nullable=True),
        sa.Column('wallet', sa.String(255), nullable=False),
        sa.Column('platform_id', sa.String(64), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_index('ix_knowledge_bases_wallet', 'knowledge_bases', ['wallet'])
    op.create_index('ix_knowledge_bases_platform_id', 'knowledge_bases', ['platform_id'])

    # Create chat_sessions table
    op.create_table(
        'chat_sessions',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('presence_id', sa.String(64), sa.ForeignKey('agents.id'), nullable=False),
        sa.Column('user_id', sa.String(255), nullable=False),
        sa.Column('user_wallet', sa.String(255), nullable=False),
        sa.Column('user_role', sa.String(50), nullable=False, server_default='guest'),
        sa.Column('title', sa.String(255), nullable=True),
        sa.Column('status', postgresql.ENUM('active', 'archived', name='sessionstatus', create_type=False), nullable=False, server_default='active'),
        sa.Column('message_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_message_at', sa.DateTime(), nullable=True),
        sa.Column('platform_id', sa.String(64), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_index('ix_chat_sessions_user_id', 'chat_sessions', ['user_id'])
    op.create_index('ix_chat_sessions_user_wallet', 'chat_sessions', ['user_wallet'])
    op.create_index('ix_chat_sessions_presence_id', 'chat_sessions', ['presence_id'])

    # Create chat_messages table
    op.create_table(
        'chat_messages',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('session_id', sa.String(64), sa.ForeignKey('chat_sessions.id'), nullable=False),
        sa.Column('role', postgresql.ENUM('user', 'assistant', 'system', 'tool', name='messagerole', create_type=False), nullable=False, server_default='user'),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('action', postgresql.JSON(), nullable=True),
        sa.Column('usage', postgresql.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_index('ix_chat_messages_session_id', 'chat_messages', ['session_id'])

    # Create pending_approvals table
    op.create_table(
        'pending_approvals',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('presence_id', sa.String(64), sa.ForeignKey('agents.id'), nullable=False),
        sa.Column('worker_id', sa.String(64), sa.ForeignKey('agents.id'), nullable=False),
        sa.Column('action_type', sa.String(100), nullable=False),
        sa.Column('action_params', postgresql.JSON(), nullable=True),
        sa.Column('requested_by_user_id', sa.String(255), nullable=False),
        sa.Column('requested_by_wallet', sa.String(255), nullable=False),
        sa.Column('status', postgresql.ENUM('pending', 'executed', 'failed', 'requires_approval', name='actionstatus', create_type=False), nullable=False, server_default='pending'),
        sa.Column('approved_by', sa.String(255), nullable=True),
        sa.Column('rejected_by', sa.String(255), nullable=True),
        sa.Column('rejection_reason', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
    )

    op.create_index('ix_pending_approvals_presence_id', 'pending_approvals', ['presence_id'])
    op.create_index('ix_pending_approvals_status', 'pending_approvals', ['status'])


def downgrade() -> None:
    # Drop tables
    op.drop_table('pending_approvals')
    op.drop_table('chat_messages')
    op.drop_table('chat_sessions')
    op.drop_table('knowledge_bases')
    op.drop_table('agents')

    # Drop enums
    op.execute("DROP TYPE IF EXISTS actionstatus")
    op.execute("DROP TYPE IF EXISTS messagerole")
    op.execute("DROP TYPE IF EXISTS sessionstatus")
    op.execute("DROP TYPE IF EXISTS accesslevel")
    op.execute("DROP TYPE IF EXISTS agenttone")
    op.execute("DROP TYPE IF EXISTS agentstatus")
    op.execute("DROP TYPE IF EXISTS agenttype")
