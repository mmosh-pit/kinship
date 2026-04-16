-- Migration: Add tags, facets, source_url to knowledge_docs and update prompts schema
-- Run this manually if not using Alembic
-- Date: 2026-02-03

-- =============================================
-- KNOWLEDGE DOCUMENTS
-- =============================================

-- Add tags column (array of strings for searchability)
ALTER TABLE knowledge_docs 
ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb NOT NULL;

-- Add facets column (HEARTS facets this doc relates to)
ALTER TABLE knowledge_docs 
ADD COLUMN IF NOT EXISTS facets JSONB DEFAULT '[]'::jsonb NOT NULL;

-- Add source_url column (reference to original source)
ALTER TABLE knowledge_docs 
ADD COLUMN IF NOT EXISTS source_url VARCHAR(500);

-- Add file_url column (S3/bucket URL for uploaded PDFs)
ALTER TABLE knowledge_docs 
ADD COLUMN IF NOT EXISTS file_url VARCHAR(500);

-- Add file_name column (original filename)
ALTER TABLE knowledge_docs 
ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);

-- =============================================
-- PROMPTS
-- =============================================

-- Add category column
ALTER TABLE prompts 
ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'instructions' NOT NULL;

-- Add scene_type column (replaces scene_id for scene-based filtering)
ALTER TABLE prompts 
ADD COLUMN IF NOT EXISTS scene_type VARCHAR(100);

-- Add priority column (higher = runs first)
ALTER TABLE prompts 
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 100 NOT NULL;

-- Add is_guardian column (safety/boundary prompts)
ALTER TABLE prompts 
ADD COLUMN IF NOT EXISTS is_guardian BOOLEAN DEFAULT false NOT NULL;

-- Add status column (draft, active, archived)
ALTER TABLE prompts 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft' NOT NULL;

-- Add version column (for tracking prompt versions)
ALTER TABLE prompts 
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1 NOT NULL;

-- =============================================
-- DATA MIGRATION (if upgrading existing data)
-- =============================================

-- Copy scene_id to scene_type if scene_id exists
UPDATE prompts 
SET scene_type = scene_id 
WHERE scene_id IS NOT NULL AND scene_type IS NULL;

-- Convert is_active to status if is_active column exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prompts' AND column_name='is_active') THEN
        UPDATE prompts 
        SET status = CASE WHEN is_active = true THEN 'active' ELSE 'archived' END
        WHERE status = 'draft';
    END IF;
END $$;

-- =============================================
-- VERIFICATION
-- =============================================
-- Run these queries to verify the migration:

-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'knowledge_docs' 
-- ORDER BY ordinal_position;

-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'prompts' 
-- ORDER BY ordinal_position;
