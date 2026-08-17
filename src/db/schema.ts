export const SCHEMA_SQL = `
-- PostgreSQL & Supabase Compatible Schema for FreeMoney-AI

-- Enable UUID extension if available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE,
    full_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Profiles Table (Optional Extensible User Attributes)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    zip_code VARCHAR(20),
    state VARCHAR(50),
    household_size INTEGER,
    income_range VARCHAR(100),
    employment_status VARCHAR(100),
    age_range VARCHAR(50),
    is_veteran BOOLEAN DEFAULT FALSE,
    is_disabled BOOLEAN DEFAULT FALSE,
    is_student BOOLEAN DEFAULT FALSE,
    housing_status VARCHAR(50), -- RENTER, HOMEOWNER, UNHOUSED, OTHER
    is_business_owner BOOLEAN DEFAULT FALSE,
    dependents_count INTEGER DEFAULT 0,
    additional_attributes JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Categories Table (Hierarchical Taxonomy)
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    icon VARCHAR(100),
    audience_type VARCHAR(50) DEFAULT 'BOTH',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. User Selected Categories
CREATE TABLE IF NOT EXISTS user_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, category_id)
);

-- 5. Sources Table (Registry of APIs, Feeds, and Catalogs)
CREATE TABLE IF NOT EXISTS sources (
    id VARCHAR(100) PRIMARY KEY, -- e.g., 'grants-gov', 'treasury-fiscal-data'
    name VARCHAR(255) NOT NULL,
    organization VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- API, JSON, CSV, RSS, WEB, MANUAL
    base_url TEXT NOT NULL,
    api_url TEXT,
    documentation_url TEXT,
    authentication_type VARCHAR(50) DEFAULT 'NONE', -- NONE, API_KEY, OAUTH, OTHER
    source_role VARCHAR(50) DEFAULT 'RESOURCE',
    jurisdiction_scope VARCHAR(50) DEFAULT 'UNKNOWN',
    trust_level VARCHAR(50) DEFAULT 'COMMUNITY', -- OFFICIAL_GOVERNMENT, OFFICIAL_ORGANIZATION, VERIFIED_PARTNER, COMMUNITY, UNKNOWN
    discovery_status VARCHAR(50) DEFAULT 'DISCOVERED', -- DISCOVERED, VERIFIED, ACTIVE, REJECTED, DISABLED
    enabled BOOLEAN DEFAULT TRUE,
    official BOOLEAN DEFAULT FALSE,
    priority INTEGER DEFAULT 10,
    sync_frequency VARCHAR(50),
    request_timeout_ms INTEGER DEFAULT 10000,
    max_retries INTEGER DEFAULT 3,
    page_size INTEGER DEFAULT 50,
    max_pages INTEGER DEFAULT 10,
    rate_limit_per_minute INTEGER,
    last_sync_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    last_error_at TIMESTAMPTZ,
    last_error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. Source Endpoints
CREATE TABLE IF NOT EXISTS source_endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id VARCHAR(100) NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    endpoint_name VARCHAR(255) NOT NULL,
    path TEXT NOT NULL,
    http_method VARCHAR(10) DEFAULT 'GET',
    description TEXT,
    rate_limit_per_minute INTEGER DEFAULT 60,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. Opportunities Table (Core Grant & Assistance Records)
CREATE TABLE IF NOT EXISTS opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    provider_name VARCHAR(255) NOT NULL,
    source_id VARCHAR(100) NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
    source_url TEXT NOT NULL,
    application_url TEXT,
    application_url_type VARCHAR(50) DEFAULT 'UNKNOWN',
    application_url_verified BOOLEAN DEFAULT FALSE,
    category VARCHAR(100) NOT NULL,
    subcategories TEXT[] DEFAULT ARRAY[]::TEXT[],
    program_type VARCHAR(50) DEFAULT 'GRANT',
    amount_min NUMERIC(14, 2),
    amount_max NUMERIC(14, 2),
    currency VARCHAR(10) DEFAULT 'USD',
    deadline TIMESTAMPTZ,
    rolling_deadline BOOLEAN DEFAULT FALSE,
    location_scope VARCHAR(50) DEFAULT 'NATIONWIDE', -- NATIONWIDE, STATE, COUNTY, CITY, ZIP
    country_code VARCHAR(2) DEFAULT 'US',
    regions TEXT[] DEFAULT ARRAY[]::TEXT[],
    states TEXT[] DEFAULT ARRAY[]::TEXT[],
    counties TEXT[] DEFAULT ARRAY[]::TEXT[],
    cities TEXT[] DEFAULT ARRAY[]::TEXT[],
    zip_codes TEXT[] DEFAULT ARRAY[]::TEXT[],
    eligibility_summary TEXT,
    eligibility_rules JSONB DEFAULT '{}'::jsonb,
    required_documents TEXT[] DEFAULT ARRAY[]::TEXT[],
    contact_information JSONB DEFAULT '{}'::jsonb,
    official_source BOOLEAN DEFAULT FALSE,
    source_provider VARCHAR(255),
    source_metadata JSONB DEFAULT '{}'::jsonb,
    raw_source_identifier TEXT NOT NULL,
    source_opportunity_id VARCHAR(255) NOT NULL,
    dedup_fingerprint VARCHAR(255) NOT NULL,
    last_verified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    retrieved_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'UNKNOWN',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_source_opportunity UNIQUE (source_id, source_opportunity_id)
);

-- 8. Opportunity Category Mappings
CREATE TABLE IF NOT EXISTS opportunity_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(opportunity_id, category_id)
);

-- 9. Opportunity Locations
CREATE TABLE IF NOT EXISTS opportunity_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    scope VARCHAR(50) DEFAULT 'UNKNOWN',
    country_code VARCHAR(2),
    region VARCHAR(100),
    state VARCHAR(50),
    county VARCHAR(100),
    city VARCHAR(100),
    zip_code VARCHAR(20),
    tribal_area VARCHAR(255),
    online_only BOOLEAN DEFAULT FALSE,
    location_type VARCHAR(50) DEFAULT 'SERVICE_AREA',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 10. Eligibility Rules (Granular Criteria)
CREATE TABLE IF NOT EXISTS eligibility_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    rule_type VARCHAR(100) NOT NULL, -- INCOME_LIMIT, AGE_LIMIT, VETERAN_REQUIRED, CITIZENSHIP, BUSINESS_SIZE
    operator VARCHAR(50) DEFAULT 'EQUALS',
    target_value TEXT,
    description TEXT NOT NULL,
    is_mandatory BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 11. Opportunity Documents (Checklist Requirements)
CREATE TABLE IF NOT EXISTS opportunity_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    document_name VARCHAR(255) NOT NULL,
    description TEXT,
    is_required BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 12. Application Links (Official External Application Portals)
CREATE TABLE IF NOT EXISTS application_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    portal_name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    portal_type VARCHAR(50) DEFAULT 'OFFICIAL_PORTAL',
    official BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    source_id VARCHAR(100) REFERENCES sources(id) ON DELETE RESTRICT,
    is_direct_apply BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 13. Applications Table (User Application Tracking)
CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    business_id UUID,
    application_type VARCHAR(50) DEFAULT 'PERSONAL_ASSISTANCE',
    status VARCHAR(50) DEFAULT 'DISCOVERED', -- DISCOVERED, REVIEWING, PREPARING, READY_FOR_REVIEW, APPROVED, SUBMITTED, REJECTED, WITHDRAWN, COMPLETED
    notes TEXT,
    checklist JSONB DEFAULT '[]'::jsonb,
    user_approved_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    confirmation_number VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, opportunity_id)
);

-- Phase 1 business and geographic extensions are additive so existing deployments migrate in place.
ALTER TABLE categories ADD COLUMN IF NOT EXISTS audience_type VARCHAR(50) DEFAULT 'BOTH';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) DEFAULT 'US';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS regions TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE opportunity_locations ADD COLUMN IF NOT EXISTS scope VARCHAR(50) DEFAULT 'UNKNOWN';
ALTER TABLE opportunity_locations ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);
ALTER TABLE opportunity_locations ADD COLUMN IF NOT EXISTS region VARCHAR(100);
ALTER TABLE opportunity_locations ADD COLUMN IF NOT EXISTS tribal_area VARCHAR(255);
ALTER TABLE opportunity_locations ADD COLUMN IF NOT EXISTS online_only BOOLEAN DEFAULT FALSE;

-- Unified audience and funding-purpose classification.
CREATE TABLE IF NOT EXISTS opportunity_audiences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    audience VARCHAR(50) NOT NULL,
    source_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(opportunity_id, audience)
);

CREATE TABLE IF NOT EXISTS opportunity_funding_purposes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    funding_purpose VARCHAR(50) NOT NULL,
    source_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(opportunity_id, funding_purpose)
);

-- Every canonical opportunity may retain additional source records discovered
-- through fallback fingerprint deduplication.
CREATE TABLE IF NOT EXISTS opportunity_source_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    source_id VARCHAR(100) NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
    source_opportunity_id VARCHAR(255) NOT NULL,
    source_url TEXT NOT NULL,
    source_provider VARCHAR(255) NOT NULL,
    official_source BOOLEAN DEFAULT FALSE,
    retrieved_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_verified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    source_metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(source_id, source_opportunity_id)
);

-- Business identity and optional matching profile.
CREATE TABLE IF NOT EXISTS businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS business_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID UNIQUE NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_name VARCHAR(255),
    business_description TEXT,
    industry VARCHAR(255),
    business_stage VARCHAR(50),
    country VARCHAR(2) DEFAULT 'US',
    state VARCHAR(50),
    county VARCHAR(100),
    city VARCHAR(100),
    postal_code VARCHAR(20),
    business_structure VARCHAR(50) DEFAULT 'UNKNOWN',
    formation_status VARCHAR(100),
    employee_count INTEGER,
    annual_revenue NUMERIC(14, 2),
    estimated_startup_cost NUMERIC(14, 2),
    funding_needed NUMERIC(14, 2),
    funding_purpose VARCHAR(50),
    veteran_owned BOOLEAN,
    women_owned BOOLEAN,
    disability_owned BOOLEAN,
    minority_owned BOOLEAN,
    rural_business BOOLEAN,
    other_certifications TEXT[] DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS business_certifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    certification_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'UNVERIFIED',
    issuing_organization VARCHAR(255),
    source_url TEXT,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(business_id, certification_type)
);

CREATE TABLE IF NOT EXISTS business_funding_needs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    funding_purpose VARCHAR(50) NOT NULL,
    amount_needed NUMERIC(14, 2),
    notes TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Configurable startup, formation, license, permit, and funding checklists.
CREATE TABLE IF NOT EXISTS business_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    checklist_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(business_id, checklist_type)
);

CREATE TABLE IF NOT EXISTS business_checklist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checklist_id UUID NOT NULL REFERENCES business_checklists(id) ON DELETE CASCADE,
    item_key VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'NOT_STARTED',
    completion_source VARCHAR(50) DEFAULT 'USER',
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(checklist_id, item_key)
);

-- Verified business formation, license, permit, tax, and employer requirements.
CREATE TABLE IF NOT EXISTS business_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    requirement_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    agency VARCHAR(255),
    required_status VARCHAR(50) DEFAULT 'NEEDS_VERIFICATION',
    jurisdiction_scope VARCHAR(50) DEFAULT 'UNKNOWN',
    country_code VARCHAR(2),
    state VARCHAR(50),
    county VARCHAR(100),
    city VARCHAR(100),
    industry VARCHAR(255),
    official_url TEXT,
    source_identifier VARCHAR(255),
    retrieved_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS business_requirement_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_requirement_id UUID NOT NULL REFERENCES business_requirements(id) ON DELETE CASCADE,
    source_id VARCHAR(100) REFERENCES sources(id) ON DELETE RESTRICT,
    organization VARCHAR(255) NOT NULL,
    source_url TEXT NOT NULL,
    official BOOLEAN DEFAULT FALSE,
    source_identifier VARCHAR(255),
    retrieved_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_verified_at TIMESTAMPTZ,
    UNIQUE(business_requirement_id, source_url)
);

ALTER TABLE applications ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE SET NULL;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS application_type VARCHAR(50) DEFAULT 'PERSONAL_ASSISTANCE';
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'applications_business_id_fkey'
    ) THEN
        ALTER TABLE applications
            ADD CONSTRAINT applications_business_id_fkey
            FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE SET NULL;
    END IF;
END $$;
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_user_id_opportunity_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_application_context
    ON applications(user_id, opportunity_id, COALESCE(business_id, '00000000-0000-0000-0000-000000000000'::uuid), application_type);

-- Extension table avoids duplicating application state while supporting business-specific metadata.
CREATE TABLE IF NOT EXISTS business_applications (
    application_id UUID PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    funding_need_id UUID REFERENCES business_funding_needs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 14. Application Events (Audit Trail)
CREATE TABLE IF NOT EXISTS application_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    previous_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    actor_id UUID,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 15. Searches & Search Filters (Telemetry & Search Optimization)
CREATE TABLE IF NOT EXISTS searches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    query_text TEXT,
    category_slug VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    results_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS search_filters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    search_id UUID NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
    filter_key VARCHAR(100) NOT NULL,
    filter_value TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 16. Sync Runs & Sync Errors (Data Pipeline Tracking)
CREATE TABLE IF NOT EXISTS sync_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id VARCHAR(100) NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'RUNNING', -- RUNNING, SUCCESS, FAILED, PARTIAL
    started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    request_parameters JSONB DEFAULT '{}'::jsonb,
    records_found INTEGER DEFAULT 0,
    records_created INTEGER DEFAULT 0,
    records_fetched INTEGER DEFAULT 0,
    records_inserted INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_deactivated INTEGER DEFAULT 0,
    records_rejected INTEGER DEFAULT 0,
    records_skipped INTEGER DEFAULT 0,
    errors_count INTEGER DEFAULT 0,
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS sync_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_run_id UUID REFERENCES sync_runs(id) ON DELETE CASCADE,
    source_id VARCHAR(100) NOT NULL,
    record_identifier TEXT,
    error_code VARCHAR(100),
    error_message TEXT NOT NULL,
    raw_payload JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Additive Phase 2 migration for existing installations.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS source_role VARCHAR(50) DEFAULT 'RESOURCE';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS jurisdiction_scope VARCHAR(50) DEFAULT 'UNKNOWN';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS sync_frequency VARCHAR(50);
ALTER TABLE sources ADD COLUMN IF NOT EXISTS request_timeout_ms INTEGER DEFAULT 10000;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS page_size INTEGER DEFAULT 50;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS max_pages INTEGER DEFAULT 10;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS rate_limit_per_minute INTEGER;

ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS application_url_type VARCHAR(50) DEFAULT 'UNKNOWN';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS application_url_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS source_provider VARCHAR(255);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS source_metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'UNKNOWN';
ALTER TABLE application_links ADD COLUMN IF NOT EXISTS official BOOLEAN DEFAULT FALSE;
ALTER TABLE application_links ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE application_links ADD COLUMN IF NOT EXISTS source_id VARCHAR(100) REFERENCES sources(id) ON DELETE RESTRICT;
UPDATE opportunities
SET source_provider = COALESCE(source_provider, provider_name),
    status = CASE
      WHEN status <> 'UNKNOWN' THEN status
      WHEN deadline IS NOT NULL AND deadline < CURRENT_TIMESTAMP THEN 'EXPIRED'
      WHEN active THEN 'ACTIVE'
      ELSE 'CLOSED'
    END
WHERE source_provider IS NULL OR status = 'UNKNOWN';

ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS request_parameters JSONB DEFAULT '{}'::jsonb;
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS records_found INTEGER DEFAULT 0;
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS records_created INTEGER DEFAULT 0;
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS records_deactivated INTEGER DEFAULT 0;
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS records_rejected INTEGER DEFAULT 0;
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS errors_count INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS source_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    catalog_source_id VARCHAR(100) NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    candidate_url TEXT NOT NULL,
    documentation_url TEXT,
    authentication_type VARCHAR(50) DEFAULT 'OTHER',
    discovery_category VARCHAR(50) DEFAULT 'OTHER',
    trust_level VARCHAR(50) DEFAULT 'UNKNOWN',
    lifecycle_status VARCHAR(50) DEFAULT 'DISCOVERED',
    relevance_score INTEGER DEFAULT 0,
    https BOOLEAN DEFAULT TRUE,
    cors VARCHAR(50),
    review_notes TEXT,
    discovered_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(catalog_source_id, candidate_url)
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_opportunities_source ON opportunities(source_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_category ON opportunities(category);
CREATE INDEX IF NOT EXISTS idx_opportunities_active ON opportunities(active);
CREATE INDEX IF NOT EXISTS idx_opportunities_deadline ON opportunities(deadline);
CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_program_type ON opportunities(program_type);
CREATE INDEX IF NOT EXISTS idx_opportunities_fingerprint ON opportunities(dedup_fingerprint);
CREATE INDEX IF NOT EXISTS idx_opportunities_location_scope ON opportunities(location_scope);
CREATE INDEX IF NOT EXISTS idx_opportunities_states_gin ON opportunities USING GIN(states);
CREATE INDEX IF NOT EXISTS idx_opportunities_counties_gin ON opportunities USING GIN(counties);
CREATE INDEX IF NOT EXISTS idx_opportunities_cities_gin ON opportunities USING GIN(cities);
CREATE INDEX IF NOT EXISTS idx_opportunities_zip_codes_gin ON opportunities USING GIN(zip_codes);
CREATE INDEX IF NOT EXISTS idx_opportunity_locations_state ON opportunity_locations(state);
CREATE INDEX IF NOT EXISTS idx_opportunity_locations_zip ON opportunity_locations(zip_code);
CREATE INDEX IF NOT EXISTS idx_opportunity_locations_hierarchy ON opportunity_locations(country_code, state, county, city, zip_code);
CREATE INDEX IF NOT EXISTS idx_opportunity_audiences_audience ON opportunity_audiences(audience);
CREATE INDEX IF NOT EXISTS idx_opportunity_funding_purposes_purpose ON opportunity_funding_purposes(funding_purpose);
CREATE INDEX IF NOT EXISTS idx_opportunity_source_records_opportunity ON opportunity_source_records(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_business_profiles_user ON business_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_business_profiles_location ON business_profiles(country, state, county, city, postal_code);
CREATE INDEX IF NOT EXISTS idx_business_profiles_stage ON business_profiles(business_stage);
CREATE INDEX IF NOT EXISTS idx_business_requirements_location ON business_requirements(country_code, state, county, city);
CREATE INDEX IF NOT EXISTS idx_source_candidates_status ON source_candidates(lifecycle_status, discovery_category);
CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_application_links_opportunity_url ON application_links(opportunity_id, url);
CREATE INDEX IF NOT EXISTS idx_sources_trust ON sources(trust_level, enabled);
`;
