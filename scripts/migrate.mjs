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
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
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
