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
    trust_level VARCHAR(50) DEFAULT 'COMMUNITY', -- OFFICIAL_GOVERNMENT, OFFICIAL_ORGANIZATION, VERIFIED_PARTNER, COMMUNITY, UNKNOWN
    discovery_status VARCHAR(50) DEFAULT 'DISCOVERED', -- DISCOVERED, VERIFIED, ACTIVE, REJECTED, DISABLED
    enabled BOOLEAN DEFAULT TRUE,
    official BOOLEAN DEFAULT FALSE,
    priority INTEGER DEFAULT 10,
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
    category VARCHAR(100) NOT NULL,
    subcategories TEXT[] DEFAULT ARRAY[]::TEXT[],
    program_type VARCHAR(50) DEFAULT 'GRANT',
    amount_min NUMERIC(14, 2),
    amount_max NUMERIC(14, 2),
    currency VARCHAR(10) DEFAULT 'USD',
    deadline TIMESTAMPTZ,
    rolling_deadline BOOLEAN DEFAULT FALSE,
    location_scope VARCHAR(50) DEFAULT 'NATIONWIDE', -- NATIONWIDE, STATE, COUNTY, CITY, ZIP
    states TEXT[] DEFAULT ARRAY[]::TEXT[],
    counties TEXT[] DEFAULT ARRAY[]::TEXT[],
    cities TEXT[] DEFAULT ARRAY[]::TEXT[],
    zip_codes TEXT[] DEFAULT ARRAY[]::TEXT[],
    eligibility_summary TEXT,
    eligibility_rules JSONB DEFAULT '{}'::jsonb,
    required_documents TEXT[] DEFAULT ARRAY[]::TEXT[],
    contact_information JSONB DEFAULT '{}'::jsonb,
    official_source BOOLEAN DEFAULT FALSE,
    raw_source_identifier TEXT NOT NULL,
    source_opportunity_id VARCHAR(255) NOT NULL,
    dedup_fingerprint VARCHAR(255) NOT NULL,
    last_verified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    retrieved_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
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
    state VARCHAR(50),
    county VARCHAR(100),
    city VARCHAR(100),
    zip_code VARCHAR(20),
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
    is_direct_apply BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 13. Applications Table (User Application Tracking)
CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
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
    records_fetched INTEGER DEFAULT 0,
    records_inserted INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_skipped INTEGER DEFAULT 0,
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

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_opportunities_source ON opportunities(source_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_category ON opportunities(category);
CREATE INDEX IF NOT EXISTS idx_opportunities_active ON opportunities(active);
CREATE INDEX IF NOT EXISTS idx_opportunities_deadline ON opportunities(deadline);
CREATE INDEX IF NOT EXISTS idx_opportunities_fingerprint ON opportunities(dedup_fingerprint);
CREATE INDEX IF NOT EXISTS idx_opportunities_location_scope ON opportunities(location_scope);
CREATE INDEX IF NOT EXISTS idx_opportunity_locations_state ON opportunity_locations(state);
CREATE INDEX IF NOT EXISTS idx_opportunity_locations_zip ON opportunity_locations(zip_code);
CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_sources_trust ON sources(trust_level, enabled);
`;
