import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString, max: 2 });

const sql = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SELECT pg_advisory_xact_lock(1357908642);

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

CREATE TABLE IF NOT EXISTS admin_source_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  administrator_id uuid NOT NULL REFERENCES administrators(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google','linkedin')),
  external_account_id text,
  account_email text,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','error','revoked')),
  contact_count integer NOT NULL DEFAULT 0,
  scopes text[] NOT NULL DEFAULT '{}'::text[],
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (administrator_id,provider)
);

ALTER TABLE admin_source_connections DROP CONSTRAINT IF EXISTS admin_source_connections_provider_check;
ALTER TABLE admin_source_connections ADD CONSTRAINT admin_source_connections_provider_check CHECK (provider IN ('google','linkedin'));

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

CREATE TABLE IF NOT EXISTS linkedin_sync_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('admin','member')),
  owner_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'preparing' CHECK (status IN (
    'preparing','awaiting_login','authenticated','inventorying','enriching',
    'results_available','completed','needs_attention','paused_rate_limit',
    'cancelled','failed','expired'
  )),
  inventory_count integer NOT NULL DEFAULT 0 CHECK (inventory_count >= 0),
  enriched_count integer NOT NULL DEFAULT 0 CHECK (enriched_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  provider_session_reference text,
  consented_at timestamptz,
  consent_version text,
  failure_code text,
  failure_message_safe text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS linkedin_profile_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES linkedin_sync_sessions(id) ON DELETE CASCADE,
  owner_type text NOT NULL CHECK (owner_type IN ('admin','member')),
  owner_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  linkedin_url text NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  professional_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_url text NOT NULL,
  observed_at timestamptz NOT NULL,
  extraction_confidence double precision NOT NULL CHECK (extraction_confidence >= 0 AND extraction_confidence <= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_type, owner_id, organization_id, linkedin_url)
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
CREATE INDEX IF NOT EXISTS linkedin_sync_sessions_owner_status_idx ON linkedin_sync_sessions(owner_type,owner_id,organization_id,status);
CREATE INDEX IF NOT EXISTS linkedin_sync_sessions_expiry_idx ON linkedin_sync_sessions(expires_at) WHERE status NOT IN ('completed','cancelled','failed','expired');
CREATE INDEX IF NOT EXISTS linkedin_profile_snapshots_owner_observed_idx ON linkedin_profile_snapshots(owner_type,owner_id,organization_id,observed_at DESC);
CREATE INDEX IF NOT EXISTS administrators_org_idx ON administrators(organization_id);
CREATE INDEX IF NOT EXISTS admin_contacts_org_owner_idx ON admin_network_contacts(organization_id,administrator_id);
CREATE INDEX IF NOT EXISTS admin_source_connections_owner_idx ON admin_source_connections(administrator_id,provider);
CREATE UNIQUE INDEX IF NOT EXISTS admin_contacts_linkedin_unique_idx ON admin_network_contacts(administrator_id,linkedin_url) WHERE linkedin_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS recommendations_job_kind_idx ON network_recommendations(job_id,kind,score DESC);
CREATE INDEX IF NOT EXISTS outreach_job_status_idx ON outreach_requests(job_id,status);
CREATE INDEX IF NOT EXISTS inference_runs_job_idx ON inference_runs(job_id,created_at DESC);

CREATE TABLE IF NOT EXISTS orchestration_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('job_activation','network_enrichment')),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','cancelled')),
  token_budget integer NOT NULL CHECK (token_budget > 0),
  estimated_cost_usd double precision NOT NULL DEFAULT 0,
  requested_by uuid REFERENCES administrators(id) ON DELETE SET NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orchestration_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES orchestration_workflows(id) ON DELETE CASCADE,
  task_type text NOT NULL CHECK (task_type IN ('job_analysis','profile_enrichment','match_rerank')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','retry','completed','failed','cancelled')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  depends_on uuid[] NOT NULL DEFAULT '{}'::uuid[],
  idempotency_key text NOT NULL UNIQUE,
  priority integer NOT NULL DEFAULT 100,
  token_budget integer NOT NULL CHECK (token_budget > 0),
  timeout_seconds integer NOT NULL DEFAULT 60 CHECK (timeout_seconds BETWEEN 5 AND 300),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 8),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_by text,
  lease_until timestamptz,
  model text,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE orchestration_workflows DROP CONSTRAINT IF EXISTS orchestration_workflows_kind_check;
ALTER TABLE orchestration_workflows ADD CONSTRAINT orchestration_workflows_kind_check
  CHECK (kind IN ('job_activation','network_enrichment','linkedin_sync'));

ALTER TABLE orchestration_tasks DROP CONSTRAINT IF EXISTS orchestration_tasks_task_type_check;
ALTER TABLE orchestration_tasks ADD CONSTRAINT orchestration_tasks_task_type_check
  CHECK (task_type IN ('job_analysis','profile_enrichment','match_rerank','linkedin_inventory','linkedin_profile_collect','linkedin_finalize'));

ALTER TABLE orchestration_tasks DROP CONSTRAINT IF EXISTS orchestration_tasks_timeout_seconds_check;
ALTER TABLE orchestration_tasks ADD CONSTRAINT orchestration_tasks_timeout_seconds_check
  CHECK (timeout_seconds BETWEEN 5 AND 3600);

CREATE INDEX IF NOT EXISTS orchestration_workflows_org_created_idx ON orchestration_workflows(organization_id,created_at DESC);
CREATE INDEX IF NOT EXISTS orchestration_tasks_claim_idx ON orchestration_tasks(status,available_at,priority,created_at);
CREATE INDEX IF NOT EXISTS orchestration_tasks_workflow_idx ON orchestration_tasks(workflow_id,status);
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
