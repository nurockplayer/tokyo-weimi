-- Migration: 202607180001_content_store
-- Description: Content store schema for multi-source profile data
-- Issue: #79 — [Content migration 2/9] 新增 Supabase content schema migration

-- ============================================================
-- Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================
-- content_scrape_runs
-- Tracks each scraping run with status and metadata.
-- ============================================================
CREATE TABLE IF NOT EXISTS content_scrape_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    status text NOT NULL,
    source_date date,
    profile_count integer NOT NULL DEFAULT 0,
    error_message text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT ck_scrape_runs_status CHECK (status IN ('running', 'succeeded', 'failed'))
);

-- ============================================================
-- content_profiles
-- Canonical profile store. One row per (shop, source_id).
-- Stable columns mirror the existing Profile TypeScript type.
-- ============================================================
CREATE TABLE IF NOT EXISTS content_profiles (
    id text PRIMARY KEY,
    shop_id text NOT NULL,
    source_id text NOT NULL,
    name text NOT NULL,
    image text NOT NULL,
    date text NOT NULL,
    title text NOT NULL,
    origin text NOT NULL,
    age text NOT NULL,
    height text NOT NULL,
    weight text NOT NULL,
    cup text NOT NULL,
    price text NOT NULL,
    summary text NOT NULL,
    tags jsonb NOT NULL DEFAULT '[]'::jsonb,
    source_hash text NOT NULL,
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    source_updated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_profiles_tags CHECK (jsonb_typeof(tags) = 'array'),
    CONSTRAINT uq_profiles_shop_source UNIQUE (shop_id, source_id)
);

-- ============================================================
-- content_profile_media
-- Images and videos linked to a profile.
-- ============================================================
CREATE TABLE IF NOT EXISTS content_profile_media (
    id text PRIMARY KEY,
    profile_id text NOT NULL REFERENCES content_profiles(id) ON DELETE CASCADE,
    source_url text NOT NULL,
    media_type text NOT NULL,
    image_key text,
    role text NOT NULL DEFAULT 'gallery',
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_media_type CHECK (media_type IN ('image', 'video')),
    CONSTRAINT ck_media_role CHECK (role IN ('gallery', 'support', 'supplemental', 'video'))
);

-- ============================================================
-- content_attendance
-- Daily attendance snapshot per profile per date.
-- ============================================================
CREATE TABLE IF NOT EXISTS content_attendance (
    profile_id text NOT NULL REFERENCES content_profiles(id) ON DELETE CASCADE,
    attendance_date date NOT NULL,
    shop_id text NOT NULL,
    position integer NOT NULL DEFAULT 0,
    scraped_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (profile_id, attendance_date)
);

-- ============================================================
-- content_profile_translations
-- Per-language translations of profile title, summary, tags.
-- ============================================================
CREATE TABLE IF NOT EXISTS content_profile_translations (
    profile_id text NOT NULL REFERENCES content_profiles(id) ON DELETE CASCADE,
    language text NOT NULL,
    title text,
    summary text,
    tags jsonb NOT NULL DEFAULT '[]'::jsonb,
    source_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_translations_tags CHECK (jsonb_typeof(tags) = 'array'),
    PRIMARY KEY (profile_id, language)
);

-- ============================================================
-- content_profile_overrides
-- Manual overrides for individual profile fields.
-- Null columns mean "no override" (fall back to base row).
-- ============================================================
CREATE TABLE IF NOT EXISTS content_profile_overrides (
    profile_id text PRIMARY KEY REFERENCES content_profiles(id) ON DELETE CASCADE,
    name text,
    title text,
    origin text,
    age text,
    height text,
    weight text,
    cup text,
    price text,
    summary text,
    tags jsonb,
    hidden boolean,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_overrides_tags CHECK (tags IS NULL OR jsonb_typeof(tags) = 'array')
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_attendance_date_shop_pos
    ON content_attendance (attendance_date, shop_id, position);
CREATE INDEX IF NOT EXISTS idx_profiles_shop_id
    ON content_profiles (shop_id);
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen
    ON content_profiles (last_seen_at);
CREATE INDEX IF NOT EXISTS idx_translations_language
    ON content_profile_translations (language);
CREATE INDEX IF NOT EXISTS idx_media_profile_pos
    ON content_profile_media (profile_id, position);

-- ============================================================
-- Row Level Security
-- All content_* tables have RLS enabled.
-- No anon/authenticated read policies — the browser never
-- queries these tables directly. All access goes through
-- application code using the service_role key.
-- ============================================================
ALTER TABLE content_scrape_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_profile_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_profile_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_profile_overrides ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Storage: site-content bucket
-- Public read; writes via service_role only.
-- ============================================================

-- Idempotent bucket creation — safe to run multiple times.
INSERT INTO storage.buckets (id, name, public)
VALUES ('site-content', 'site-content', true)
ON CONFLICT (id) DO NOTHING;

-- Public SELECT policy so objects can be served as static files.
-- Write operations use the service_role key and are not gated
-- by this policy.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'Public read site-content bucket'
          AND schemaname = 'storage'
          AND tablename = 'objects'
    ) THEN
        CREATE POLICY "Public read site-content bucket"
        ON storage.objects
        FOR SELECT
        USING (bucket_id = 'site-content');
    END IF;
END $$;
