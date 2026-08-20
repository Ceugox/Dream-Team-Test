import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString, max: 2 });

const sql = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  company text NOT NULL,
  location text,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
UPDATE jobs SET status='open' WHERE status='active';
UPDATE jobs SET status='filled' WHERE status='closed';
ALTER TABLE jobs ALTER COLUMN status SET DEFAULT 'open';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='jobs_status_v2_check') THEN
    ALTER TABLE jobs ADD CONSTRAINT jobs_status_v2_check CHECK (status IN ('draft','open','screening','interviewing','offer','filled','paused','cancelled'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS administrators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,email)
);

CREATE TABLE IF NOT EXISTS admin_network_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  administrator_id uuid NOT NULL REFERENCES administrators(id) ON DELETE CASCADE,
  name text NOT NULL,
  headline text,
  linkedin_url text,
  phone text,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_network_contacts ADD COLUMN IF NOT EXISTS profile_context text;
ALTER TABLE admin_network_contacts ADD COLUMN IF NOT EXISTS network_capital_score double precision NOT NULL DEFAULT 0;
ALTER TABLE admin_network_contacts ADD COLUMN IF NOT EXISTS network_capital_evidence jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE admin_network_contacts ADD COLUMN IF NOT EXISTS network_capital_confidence double precision NOT NULL DEFAULT 0;
ALTER TABLE admin_network_contacts ADD COLUMN IF NOT EXISTS public_enrichment_status text NOT NULL DEFAULT 'pending';
ALTER TABLE admin_network_contacts ADD COLUMN IF NOT EXISTS public_identity_confidence double precision NOT NULL DEFAULT 0;
ALTER TABLE admin_network_contacts ADD COLUMN IF NOT EXISTS public_sources jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE admin_network_contacts ADD COLUMN IF NOT EXISTS public_enriched_at timestamptz;

CREATE TABLE IF NOT EXISTS network_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES admin_network_contacts(id) ON DELETE CASCADE,
  administrator_id uuid NOT NULL REFERENCES administrators(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('candidate_fit','connector_fit')),
  score double precision NOT NULL CHECK (score >= 0 AND score <= 1),
  confidence double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  algorithm_version text NOT NULL DEFAULT 'admin-network-v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id,contact_id,kind)
);

ALTER TABLE network_recommendations ADD COLUMN IF NOT EXISTS ai_insight text;
ALTER TABLE network_recommendations ADD COLUMN IF NOT EXISTS ai_confidence double precision;
ALTER TABLE network_recommendations ADD COLUMN IF NOT EXISTS inference_model text;

CREATE TABLE IF NOT EXISTS job_inferences (
  job_id uuid PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  model text NOT NULL,
  analysis jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inference_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('job_analysis','match_rerank')),
  model text NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outreach_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  recommendation_id uuid NOT NULL REFERENCES network_recommendations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES administrators(id) ON DELETE CASCADE,
  phone text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('candidate_fit','connector_fit')),
  message text NOT NULL,
  status text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','opened','manually_confirmed_sent','replied','referred','no_response','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id,recommendation_id,kind)
);

CREATE TABLE IF NOT EXISTS outreach_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outreach_id uuid NOT NULL REFERENCES outreach_requests(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES administrators(id) ON DELETE CASCADE,
  event text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  email text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz
);

CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invitation_id uuid UNIQUE REFERENCES invitations(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);

CREATE TABLE IF NOT EXISTS member_sources (
  member_id uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  linkedin_status text NOT NULL DEFAULT 'pending',
  linkedin_count integer NOT NULL DEFAULT 0,
  google_contacts_status text NOT NULL DEFAULT 'pending',
  google_calendar_status text NOT NULL DEFAULT 'pending',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS network_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  name text NOT NULL,
  headline text,
  linkedin_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, linkedin_url)
);

CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  candidate_name text NOT NULL,
  candidate_headline text,
  linkedin_url text,
  relationship_note text,
  consented_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','reviewing','contacted','declined','hired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_org_status_idx ON jobs(organization_id, status);
CREATE INDEX IF NOT EXISTS invitations_org_status_idx ON invitations(organization_id, status);
CREATE INDEX IF NOT EXISTS members_org_idx ON members(organization_id);
CREATE INDEX IF NOT EXISTS referrals_org_status_idx ON referrals(organization_id, status);
CREATE INDEX IF NOT EXISTS contacts_member_idx ON network_contacts(member_id);
CREATE INDEX IF NOT EXISTS administrators_org_idx ON administrators(organization_id);
CREATE INDEX IF NOT EXISTS admin_contacts_org_owner_idx ON admin_network_contacts(organization_id,administrator_id);
CREATE UNIQUE INDEX IF NOT EXISTS admin_contacts_linkedin_unique_idx ON admin_network_contacts(administrator_id,linkedin_url) WHERE linkedin_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS recommendations_job_kind_idx ON network_recommendations(job_id,kind,score DESC);
CREATE INDEX IF NOT EXISTS outreach_job_status_idx ON outreach_requests(job_id,status);
CREATE INDEX IF NOT EXISTS inference_runs_job_idx ON inference_runs(job_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS referrals_unique_candidate_idx ON referrals(job_id, member_id, linkedin_url) WHERE linkedin_url IS NOT NULL;

INSERT INTO organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Referral Copilot')
ON CONFLICT (id) DO NOTHING;
`;

try {
  await pool.query(sql);
  console.log("Database schema is ready");
} finally {
  await pool.end();
}
