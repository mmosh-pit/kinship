-- Kinship Agent - Sample Data
-- Use this to seed the database with example agents

-- Sample Presence Agent (Supervisor)
INSERT INTO agents (
    id, name, handle, type, status, brief_description, description, backstory,
    tone, system_prompt, knowledge_base_ids, wallet, config, created_at, updated_at
) VALUES (
    'agent_luna123',
    'Luna',
    'luna_ai',
    'presence',
    'active',
    'A friendly and helpful AI companion',
    'Luna is an advanced AI assistant designed to help users with a wide variety of tasks. She specializes in coordinating complex workflows and delegating tasks to specialized workers.',
    'Luna was created to be the perfect balance of helpful and insightful. She has a deep understanding of human needs and always strives to provide the best possible assistance.',
    'friendly',
    'You are Luna, a helpful and friendly AI assistant. Always be warm and approachable. Help users accomplish their goals efficiently.',
    ARRAY[]::varchar[],
    '0xDemo123456789',
    '{}',
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- Sample Worker Agent 1: Research
INSERT INTO agents (
    id, name, type, status, brief_description, role, access_level,
    system_prompt, wallet, parent_id, config, created_at, updated_at
) VALUES (
    'agent_research1',
    'Scout',
    'worker',
    'active',
    'A research specialist that finds and analyzes information',
    'Research & Analysis',
    'private',
    'You are Scout, a research specialist. Your job is to find accurate information, analyze data, and provide well-sourced insights.',
    '0xDemo123456789',
    'agent_luna123',
    '{"tools": ["notion", "github"]}',
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- Sample Worker Agent 2: Social Media
INSERT INTO agents (
    id, name, type, status, brief_description, role, access_level,
    system_prompt, wallet, parent_id, config, created_at, updated_at
) VALUES (
    'agent_social1',
    'Echo',
    'worker',
    'active',
    'A social media manager that handles posting and engagement',
    'Social Media Management',
    'private',
    'You are Echo, a social media specialist. Help craft engaging content, manage posts, and interact with communities appropriately.',
    '0xDemo123456789',
    'agent_luna123',
    '{"tools": ["twitter", "telegram", "discord"]}',
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- Sample Worker Agent 3: Calendar
INSERT INTO agents (
    id, name, type, status, brief_description, role, access_level,
    system_prompt, wallet, parent_id, config, created_at, updated_at
) VALUES (
    'agent_calendar1',
    'Tempo',
    'worker',
    'active',
    'A scheduling assistant that manages calendars and events',
    'Scheduling & Time Management',
    'private',
    'You are Tempo, a scheduling specialist. Help users manage their time, schedule meetings, and organize their calendars efficiently.',
    '0xDemo123456789',
    'agent_luna123',
    '{"tools": ["calendar", "email"]}',
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- Sample Knowledge Base
INSERT INTO knowledge_bases (
    id, name, description, content, content_type, wallet, created_at, updated_at
) VALUES (
    'kb_sample1',
    'Company Policies',
    'A knowledge base containing company policies and procedures',
    'This is a sample knowledge base with company information.

## Communication Guidelines
- Be professional in all external communications
- Respond to inquiries within 24 hours
- Use proper formatting and grammar

## Social Media Policy
- Always verify information before posting
- Maintain brand voice consistency
- Engage positively with the community

## Meeting Protocols
- Send agendas 24 hours in advance
- Keep meetings under 60 minutes
- Document action items and follow-ups',
    'text/markdown',
    '0xDemo123456789',
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- Link knowledge base to presence
UPDATE agents 
SET knowledge_base_ids = ARRAY['kb_sample1']::varchar[]
WHERE id = 'agent_luna123';

-- Sample Chat Session
INSERT INTO chat_sessions (
    id, presence_id, user_id, user_wallet, user_role, title, status,
    message_count, created_at, updated_at
) VALUES (
    'session_demo1',
    'agent_luna123',
    'user_demo1',
    '0xUserWallet123',
    'member',
    'Demo Conversation',
    'active',
    0,
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;
