export const CASE_SCHEMA_SQL = `
-- Private per-person case persistence. Program research remains shared; inquiries stay scoped to one actor.
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) DEFAULT 'ACCOUNT';
ALTER TABLE users ADD COLUMN IF NOT EXISTS guest_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_subject VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_auth_subject ON users(auth_subject) WHERE auth_subject IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) UNIQUE NOT NULL,
  session_type VARCHAR(20) NOT NULL DEFAULT 'GUEST',
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CHECK (session_type IN ('GUEST','ACCOUNT'))
);

CREATE TABLE IF NOT EXISTS assistance_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  intent VARCHAR(50),
  user_facts JSONB NOT NULL DEFAULT '{}'::jsonb,
  system_interpretations JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('ACTIVE','ARCHIVED','DELETED'))
);

ALTER TABLE searches ADD COLUMN IF NOT EXISTS case_id UUID REFERENCES assistance_cases(id) ON DELETE CASCADE;
ALTER TABLE searches ADD COLUMN IF NOT EXISTS interpretation JSONB DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS case_search_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES assistance_cases(id) ON DELETE CASCADE,
  search_id UUID NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  rank INTEGER,
  match_classification VARCHAR(50) NOT NULL DEFAULT 'NEEDS_VERIFICATION',
  match_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_facts JSONB NOT NULL DEFAULT '[]'::jsonb,
  research_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(search_id, opportunity_id)
);

CREATE INDEX IF NOT EXISTS idx_assistance_cases_user ON assistance_cases(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_searches_case ON searches(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_search_results_case ON case_search_results(case_id, created_at DESC);
`;
