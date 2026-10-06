export const RESEARCH_SCHEMA_SQL = `
-- Evidence-backed program research. Additive: preserves existing opportunity/search systems.
CREATE TABLE IF NOT EXISTS program_research (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL UNIQUE REFERENCES opportunities(id) ON DELETE CASCADE,
  lifecycle_status VARCHAR(50) NOT NULL DEFAULT 'DISCOVERED',
  research_completeness JSONB NOT NULL DEFAULT '{}'::jsonb,
  status_verified_at TIMESTAMPTZ,
  application_status_verified_at TIMESTAMPTZ,
  stale_after TIMESTAMPTZ,
  human_review_required BOOLEAN NOT NULL DEFAULT FALSE,
  conflict_present BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CHECK (lifecycle_status IN ('DISCOVERED','RESEARCHING','SOURCE_VERIFIED','REVIEW_REQUIRED','VERIFIED','STALE','CONFLICT','INACTIVE'))
);

CREATE TABLE IF NOT EXISTS evidence_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  fact_type VARCHAR(100) NOT NULL,
  fact_key VARCHAR(255) NOT NULL,
  value_json JSONB,
  source_url TEXT NOT NULL,
  source_title TEXT,
  source_organization VARCHAR(255) NOT NULL,
  source_kind VARCHAR(50) NOT NULL DEFAULT 'OFFICIAL_PROGRAM_PAGE',
  authoritative BOOLEAN NOT NULL DEFAULT FALSE,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at TIMESTAMPTZ,
  confidence NUMERIC(4,3),
  notes TEXT,
  superseded_at TIMESTAMPTZ,
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  UNIQUE (id, opportunity_id)
);
CREATE INDEX IF NOT EXISTS idx_evidence_opportunity_fact ON evidence_records(opportunity_id, fact_type, fact_key);
CREATE INDEX IF NOT EXISTS idx_evidence_current ON evidence_records(opportunity_id) WHERE superseded_at IS NULL;

CREATE TABLE IF NOT EXISTS program_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  availability_state VARCHAR(50) NOT NULL DEFAULT 'STATUS_NOT_CONFIRMED',
  evidence_record_id UUID,
  verified_at TIMESTAMPTZ,
  stale_after TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CHECK (availability_state IN ('ACCEPTING_APPLICATIONS','APPLICATION_WINDOW_SCHEDULED','WAITLIST_OPEN','WAITLIST_CLOSED','TEMPORARILY_PAUSED','FUNDING_EXHAUSTED','CLOSED','EXPIRED','STATUS_NOT_CONFIRMED')),
  FOREIGN KEY (evidence_record_id, opportunity_id)
    REFERENCES evidence_records(id, opportunity_id) ON DELETE SET NULL (evidence_record_id)
);

CREATE TABLE IF NOT EXISTS researched_eligibility_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  rule_key VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  operator VARCHAR(50),
  target_value JSONB,
  evidence_record_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (evidence_record_id, opportunity_id)
    REFERENCES evidence_records(id, opportunity_id) ON DELETE RESTRICT,
  UNIQUE(opportunity_id, rule_key, evidence_record_id)
);

CREATE TABLE IF NOT EXISTS researched_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  document_name VARCHAR(255) NOT NULL,
  requirement_state VARCHAR(50) NOT NULL,
  source_wording TEXT,
  evidence_record_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (evidence_record_id, opportunity_id)
    REFERENCES evidence_records(id, opportunity_id) ON DELETE RESTRICT,
  CHECK (requirement_state IN ('REQUIRED','REQUESTED_DURING_APPLICATION','MAY_BE_REQUESTED','NOT_CONFIRMED'))
);

CREATE TABLE IF NOT EXISTS application_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  instruction TEXT NOT NULL,
  method VARCHAR(50),
  evidence_record_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (evidence_record_id, opportunity_id)
    REFERENCES evidence_records(id, opportunity_id) ON DELETE RESTRICT,
  UNIQUE(opportunity_id, step_number)
);

CREATE TABLE IF NOT EXISTS source_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  fact_type VARCHAR(100) NOT NULL,
  fact_key VARCHAR(255) NOT NULL,
  evidence_record_a UUID NOT NULL,
  evidence_record_b UUID NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMPTZ,
  CHECK (status IN ('OPEN','RESOLVED','SUPERSEDED')),
  FOREIGN KEY (evidence_record_a, opportunity_id)
    REFERENCES evidence_records(id, opportunity_id) ON DELETE RESTRICT,
  FOREIGN KEY (evidence_record_b, opportunity_id)
    REFERENCES evidence_records(id, opportunity_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS verification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  outcome VARCHAR(50) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_program_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  report_type VARCHAR(100) NOT NULL,
  report_text TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING_REVERIFICATION',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_action_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  application_step_id UUID REFERENCES application_steps(id) ON DELETE SET NULL,
  action_text TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'NOT_STARTED',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Existing legacy fields remain for compatibility, but trusted claims must be evidence-backed.
ALTER TABLE eligibility_rules ADD COLUMN IF NOT EXISTS evidence_record_id UUID REFERENCES evidence_records(id) ON DELETE SET NULL;
ALTER TABLE opportunity_documents ADD COLUMN IF NOT EXISTS evidence_record_id UUID REFERENCES evidence_records(id) ON DELETE SET NULL;
ALTER TABLE opportunity_documents ADD COLUMN IF NOT EXISTS requirement_state VARCHAR(50) DEFAULT 'NOT_CONFIRMED';
ALTER TABLE application_links ADD COLUMN IF NOT EXISTS evidence_record_id UUID REFERENCES evidence_records(id) ON DELETE SET NULL;
`;
