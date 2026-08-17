# FreeMoney-AI Architecture & Technical Blueprint

## 1. Executive Summary & Mission
**FreeMoney-AI** is a legitimate assistance-discovery platform designed to help individuals, families, students, veterans, businesses, and organizations find grants, financial assistance, benefits, scholarships, housing assistance, utility assistance, emergency assistance, tax credits, and official financial programs.

The system adheres to the end-to-end lifecycle:
$$\text{DISCOVER} \longrightarrow \text{FILTER} \longrightarrow \text{VERIFY} \longrightarrow \text{MATCH} \longrightarrow \text{PREPARE APPLICATION} \longrightarrow \text{USER APPROVES} \longrightarrow \text{SUBMIT} \longrightarrow \text{TRACK}$$

### Phase 1 Guardrails & Principles
1. **Real Data Over Demo Data:** All opportunities originate from verified sources (e.g., Grants.gov, state registries, official open datasets). No synthetic or placeholder grants exist in production.
2. **Strict Provenance:** Every opportunity record maintains a traceable origin (`source_id`, `source_url`, `raw_source_identifier`, `source_opportunity_id`, `last_verified_at`, `retrieved_at`).
3. **No Automatic Submission in Phase 1:** All application preparation leads to a checklist and review state. Submission requires explicit, informed user consent.
4. **Honest AI Matching & Preserved Uncertainty:** If eligibility criteria or user profile attributes are missing, the system never invents facts or creates false positive matches. It uses precise confidence language: *Potential match*, *Likely match*, *May qualify*, *Needs verification*.
5. **No Giant Questionnaires:** Profile creation is 100% optional. Users can discover assistance immediately by selecting categories and geographic scope.
6. **Supabase & PostgreSQL Compatibility:** Database schema is designed with standard SQL DDL compatible with PostgreSQL 15+ and Supabase.

---

## 2. System Architecture Overview

```
+-----------------------------------------------------------------------------------+
|                                  USER INTERFACE                                   |
|   - Landing Search (/)                 - Opportunity Directory (/opportunities)    |
|   - Opportunity Detail (/:id)          - Optional Profile (/profile)              |
|   - Application Tracker (/applications) - Admin Control Panel (/admin)             |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                               REST API ROUTING LAYER                              |
|   /api/categories  |  /api/search  |  /api/opportunities  |  /api/profile        |
|   /api/applications|  /api/sources |  /api/sync/:source   |  /api/admin/*        |
+-----------------------------------------+-----------------------------------------+
                                          |
          +-------------------------------+-------------------------------+
          |                               |                               |
          v                               v                               v
+--------------------+          +--------------------+          +--------------------+
|   SEARCH ENGINE    |          | ELIGIBILITY ENGINE |          | APPLICATION ENGINE |
| - Geo resolution   |          | - IEligibility-    |          | - Status workflow  |
| - Category filter  |          |   Matcher          |          | - Doc checklists   |
| - Audience filter  |          | - Rule-based Match |          | - Explicit User    |
| - Trust weighting  |          | - LLM Matcher      |          |   Approval Guard   |
| - Ranked scoring   |          | - Uncertainty eval |          | - Form mapping     |
+---------+----------+          +---------+----------+          +---------+----------+
          |                               |                               |
          +-------------------------------+-------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                           SYNC & DEDUPLICATION ENGINE                             |
|   - IOpportunitySource Abstraction                                                |
|   - GrantsGovSource (Real REST API Client: search2 / fetchOpportunity)           |
|   - PublicApisDiscoveryParser (Catalog Discovery for public-apis)                 |
|   - Deterministic Deduplication: (source_id + ext_id) & Normalization Fingerprint |
|   - Quality & Validation Guard (Schema verification & sanitization)               |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                     POSTGRESQL / SUPABASE DATA LAYER                              |
|  sources | source_endpoints | opportunities | opportunity_categories             |
|  opportunity_locations | eligibility_rules | opportunity_documents | applications |
|  application_events | profiles | categories | searches | sync_runs | sync_errors  |
+-----------------------------------------------------------------------------------+
```

---

## 3. Core Component Specifications

### 3.1. Source Registry & Trust Model
Sources are categorized by strict trust levels:
- `OFFICIAL_GOVERNMENT`: Federal/State/Municipal government APIs (e.g., Grants.gov, USA.gov, Treasury). Trust multiplier: 1.0.
- `OFFICIAL_ORGANIZATION`: Recognized philanthropic foundations and accredited universities. Trust multiplier: 0.9.
- `VERIFIED_PARTNER`: Verified regional non-profits and community action agencies. Trust multiplier: 0.8.
- `COMMUNITY`: Community-submitted or crawled data requiring manual verification. Trust multiplier: 0.5.
- `UNKNOWN`: Unverified candidate feeds; not served to end-users until verified.

### 3.2. Sync Engine & Deterministic Deduplication
The synchronization engine executes against the `IOpportunitySource` contract:
```typescript
interface IOpportunitySource {
  getSourceMetadata(): SourceMetadata;
  validateConnection(): Promise<ConnectionStatus>;
  fetchOpportunities(params: SourceFetchParams): Promise<FetchResult>;
  fetchOpportunityDetail(sourceOpportunityId: string): Promise<RawOpportunityDetail | null>;
}
```

**Deduplication Strategy:**
1. **Primary Key Match:** Composite key `(source_id, source_opportunity_id)`.
2. **Normalized Fingerprint Fallback:** SHA-256 hash of normalized tuple:
   $$\text{Hash}(\text{normalize}(\text{provider}) \,\|\, \text{normalize}(\text{title}) \,\|\, \text{normalize}(\text{state}) \,\|\, \text{normalize}(\text{application\_url}))$$
3. Upserts update `last_verified_at` and mutate changed attributes while preserving original creation timestamps.

### 3.3. Search & Ranking Algorithm
The search engine applies deterministic multi-factor scoring:
$$\text{Score} = w_{\text{cat}} S_{\text{cat}} + w_{\text{geo}} S_{\text{geo}} + w_{\text{aud}} S_{\text{aud}} + w_{\text{trust}} S_{\text{trust}} + w_{\text{kw}} S_{\text{kw}} + w_{\text{rec}} S_{\text{rec}}$$

- **Category Match ($S_{\text{cat}}$):** Exact category match vs. parent/child taxonomy match.
- **Geographic Match ($S_{\text{geo}}$):** Hierarchical matching (Nationwide = match all; State match; County/City/ZIP match).
- **Audience Match ($S_{\text{aud}}$):** When user profile is present, matches target demographics (veterans, students, low-income, disabled, small business).
- **Source Trust ($S_{\text{trust}}$):** Weighting based on source verification level.
- **Deadline Freshness ($S_{\text{rec}}$):** Active opportunities ranked higher; expired opportunities excluded.

### 3.4. AI Eligibility Matcher (`IEligibilityMatcher`)
```typescript
interface IEligibilityMatcher {
  evaluateEligibility(
    opportunity: Opportunity,
    profile?: UserProfile
  ): Promise<EligibilityMatchResult>;
}

interface EligibilityMatchResult {
  matchScore: number | null; // Null if insufficient profile data
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';
  status: 'LIKELY_MATCH' | 'POTENTIAL_MATCH' | 'MAY_QUALIFY' | 'NEEDS_VERIFICATION' | 'DISQUALIFIED';
  matchedFactors: string[];
  missingInformation: string[];
  potentialDisqualifiers: string[];
  explanation: string;
  requiredDocuments: string[];
}
```
**Core Rule:** When profile data is absent, the system outputs `status: 'NEEDS_VERIFICATION'`, `matchScore: null`, and clearly advises: *"Complete your optional profile to improve matching."*

### 3.5. Application Preparation Foundation
- Tracks applications across statuses: `DISCOVERED` $\rightarrow$ `REVIEWING` $\rightarrow$ `PREPARING` $\rightarrow$ `READY_FOR_REVIEW` $\rightarrow$ `APPROVED` $\rightarrow$ `SUBMITTED` $\rightarrow$ `REJECTED` / `WITHDRAWN` / `COMPLETED`.
- Generates dynamic document checklists based on program requirements (e.g., Proof of Income, Government ID, Utility Bill, Lease Agreement, DD-214).
- Application submission is strictly guarded: no external submission occurs without manual user confirmation.

---

## 4. Database Schema Structure
The PostgreSQL schema consists of 14 core entities:
1. `users`: Identity and authentication records.
2. `profiles`: Extensible demographic, household, location, and economic attributes.
3. `categories`: Hierarchical assistance taxonomy (Grants, Housing, Utilities, Food, Veterans, etc.).
4. `user_categories`: User-selected category interests.
5. `sources`: Registry of official APIs, web feeds, and catalogs.
6. `source_endpoints`: Specific API routes and parameters for each source.
7. `opportunities`: Normalized assistance programs and grants.
8. `opportunity_categories`: Many-to-many opportunity category mappings.
9. `opportunity_locations`: Geographic coverage (Nationwide, States, Counties, Cities, ZIPs).
10. `eligibility_rules`: Structured and text eligibility requirements.
11. `opportunity_documents`: Required and recommended application documentation.
12. `application_links`: Official application URLs and portals.
13. `applications`: User application tracking records with state history.
14. `application_events`: Audit trail of application status changes and document uploads.
15. `searches` & `search_filters`: User search telemetry for performance and ranking refinement.
16. `sync_runs` & `sync_errors`: Synchronization audit trail and diagnostic logs.

---

## 5. Security & Configuration
- **No Secrets in Source:** All configuration managed via `.env` with validation on startup using schema validators.
- **Admin Endpoints:** Administrative source sync and source mutation protected by `ADMIN_API_KEY`.
- **Input Sanitization:** Parameterized SQL queries preventing SQL injection, strict payload validation on all REST endpoints.

---

## 6. Phase 1 Scope Expansion: Business + Geographic Intelligence

### 6.1. Dual user paths
The landing experience branches immediately without registration:

1. `PERSONAL_ASSISTANCE` keeps the original assistance categories and optional personal profile.
2. `BUSINESS_ASSISTANCE` supports startup guidance, formation, funding, licenses, permits, contracting, certifications, and growth assistance.

Both paths query the same normalized `opportunities` table. Business funding is not stored in a parallel grant database.

### 6.2. Unified opportunity extensions
The opportunity aggregate gains:

- many-to-many `opportunity_audiences` classifications;
- richer `opportunity_locations` with country, region, tribal, online, and unknown scopes;
- optional structured business eligibility rules stored through the existing eligibility model;
- normalized funding purposes in `opportunity_funding_purposes`.

Search combines the same source trust, deadline, category, audience, and eligibility factors for personal and business users.

### 6.3. Geographic intelligence
`IGeographicMatcher` is a deterministic, side-effect-free domain service. It accepts a user/business location and an opportunity location and returns:

`EXACT | CITY | COUNTY | STATE | REGION | COUNTRY | NATIONWIDE | ONLINE | NO_MATCH | UNKNOWN`

Unknown geography is never promoted to nationwide. The search database performs conservative candidate filtering; the matcher produces the final geographic outcome and rank contribution.

### 6.4. Business domain
`businesses` holds ownership and lifecycle identity, while `business_profiles` holds optional, changeable matching attributes. Related tables represent certifications, funding needs, configurable checklists, and verified business requirements. Applications remain unified: `applications.business_id` is nullable and `application_type` indicates personal assistance, business assistance, LLC formation, license, permit, or funding.

Business stages:

`IDEA | PLANNING | FORMATION | PRE_REVENUE | OPERATING | GROWING | EXPANDING | DISTRESSED`

Business structures:

`SOLE_PROPRIETORSHIP | LLC | PARTNERSHIP | S_CORPORATION | C_CORPORATION | NONPROFIT | OTHER | UNKNOWN`

### 6.5. Provider abstractions

```typescript
interface IBusinessRequirementProvider {
  findRequirements(input: BusinessRequirementInput): Promise<BusinessRequirementResult[]>;
}

interface IFormationRequirementProvider {
  getFormationRequirements(input: FormationRequirementInput): Promise<FormationGuidance>;
}
```

Providers may return only source-backed facts. Unsupported states or industries return `NEEDS_VERIFICATION`; they do not receive copied requirements from another jurisdiction. Official `.gov` resources are preferred and every requirement retains organization, URL, source identifier, retrieval time, and verification time.

### 6.6. Startup and LLC workflow
The startup wizard persists a small business profile first, then derives a configurable checklist appropriate to the selected stage. LLC guidance is structure- and state-aware. Phase 1 exposes the workflow architecture, progress tracking, universal IRS EIN guidance, and verified provider results where available. It never presents formation guidance as legal advice and never submits a filing.

---

## 7. Phase 2: Real Assistance Data Network

### 7.1. Local-first source pipeline
User searches never call upstream APIs. Each active feed is synchronized through:

`SOURCE → RESILIENT HTTP → RAW PARSING → DETAIL ENRICHMENT → NORMALIZATION → VALIDATION → DEDUPLICATION → POSTGRESQL`

The searchable database is the cache and system of record for normalized opportunities. Raw source identifiers and useful source-specific metadata remain attached to each record.

### 7.2. Resilient transport
All opportunity feeds use a shared HTTP client with source-specific timeout, retry, backoff, request spacing, page-size, and maximum-page controls. HTTP 429, transient 5xx responses, timeouts, invalid JSON, schema failures, and page/detail failures are classified and persisted. A failed source cannot terminate another source’s synchronization.

### 7.3. Grants.gov contract
`GrantsGovSource` uses only the documented, unauthenticated endpoints:

- `POST /v1/api/search2` for filtered, paginated summaries;
- `POST /v1/api/fetchOpportunity` with `{ "opportunityId": number }` for details.

Search pages retain the numeric Grants.gov opportunity ID and opportunity number. Detail enrichment supplies published description, applicant types, funding instruments/categories, award floor/ceiling, response date, agency contacts, Assistance Listing numbers, package identifiers, and a verified application URL only when the API explicitly returns one.

### 7.4. Status and history
Opportunities use `ACTIVE | EXPIRED | CLOSED | PAUSED | UNKNOWN`. Expired or closed records remain stored for application history and analytics but are excluded from active search by default. A sync may deactivate unseen records only after a complete, unfiltered source traversal; partial/limited runs never infer removal.

### 7.5. Source roles
The source registry distinguishes:

- `OPPORTUNITY_FEED`: supplies normalized opportunity records;
- `RESOURCE`: verified official guidance but not a funding feed;
- `DISCOVERY_CATALOG`: candidate API directory, never authoritative;
- `OPEN_DATA`: official data that is not automatically an assistance opportunity feed.

Discovered candidate APIs are persisted separately and follow `DISCOVERED → REVIEW → VERIFIED → ACTIVE`. Discovery never activates a candidate.

### 7.6. Synchronization coordination
`SourceSyncCoordinator` can synchronize one source or all enabled opportunity feeds while isolating failures. `ISyncScheduleProvider` describes future daily, six-hour, or source-specific schedules without requiring a production scheduler in Phase 2. Sync runs record found, created, updated, deactivated, rejected, and error counts.
