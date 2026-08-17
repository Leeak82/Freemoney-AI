# FreeMoney-AI Data Model & Database Architecture

## Overview
FreeMoney-AI is architected for PostgreSQL 15+ and is natively compatible with Supabase. The database enforces strict source provenance, deterministic deduplication, hierarchical assistance taxonomy, and secure application tracking.

---

## Entity Relationship Summary

```
                       +-------------------+
                       |      users        |
                       +---------+---------+
                                 | 1:1
                                 v
                       +-------------------+
                       |     profiles      |
                       +-------------------+
                                 |
                                 v 1:N
                       +-------------------+
                       |   user_categories |
                       +---------+---------+
                                 | N:1
                                 v
                       +-------------------+
                       |    categories     |
                       +---------+---------+
                                 ^
                                 | N:M
                       +---------+-----------+
                       |opportunity_category |
                       +---------+-----------+
                                 ^
                                 | N:1
+------------------+   +---------+-----------+   +----------------------+
|     sources      |-->|    opportunities    |<--| opportunity_locations|
+--------+---------+   +---------+-----------+   +----------------------+
         |                       |
         | 1:N                   | 1:N
         v                       +-------------> +----------------------+
+------------------+             |               |  eligibility_rules   |
| source_endpoints |             | 1:N           +----------------------+
+------------------+             +-------------> +----------------------+
         |                       |               |opportunity_documents |
         v 1:N                   | 1:N           +----------------------+
+------------------+             +-------------> +----------------------+
|    sync_runs     |             |               |  application_links   |
+--------+---------+             |               +----------------------+
         | 1:N                   |
         v                       v 1:N
+------------------+   +---------+-----------+
|   sync_errors    |   |    applications     |
+------------------+   +---------+-----------+
                                 | 1:N
                                 v
                       +---------------------+
                       | application_events  |
                       +---------------------+
```

---

## Table Definitions

### 1. `sources`
Maintains the registry of official and partner assistance feeds.
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `VARCHAR(100) PK` | Unique source identifier (e.g. `grants-gov`) |
| `name` | `VARCHAR(255)` | Human-readable source name |
| `organization` | `VARCHAR(255)` | Publishing entity or government branch |
| `type` | `VARCHAR(50)` | `API`, `JSON`, `CSV`, `RSS`, `WEB`, `MANUAL` |
| `base_url` | `TEXT` | Base website address |
| `api_url` | `TEXT` | API base endpoint |
| `documentation_url`| `TEXT` | Official documentation reference |
| `authentication_type`| `VARCHAR(50)`| `NONE`, `API_KEY`, `OAUTH`, `OTHER` |
| `trust_level` | `VARCHAR(50)` | `OFFICIAL_GOVERNMENT`, `OFFICIAL_ORGANIZATION`, `VERIFIED_PARTNER`, `COMMUNITY`, `UNKNOWN` |
| `discovery_status` | `VARCHAR(50)` | `DISCOVERED`, `VERIFIED`, `ACTIVE`, `REJECTED`, `DISABLED` |
| `enabled` | `BOOLEAN` | Whether source is actively used |
| `official` | `BOOLEAN` | Official government designation |
| `priority` | `INTEGER` | Ranking and sync priority weight |
| `last_sync_at` | `TIMESTAMPTZ` | Timestamp of last synchronization attempt |
| `last_success_at` | `TIMESTAMPTZ` | Timestamp of last successful sync |
| `last_error_at` | `TIMESTAMPTZ` | Timestamp of last sync failure |
| `last_error_message` | `TEXT` | Diagnostic error payload |

### 2. `opportunities`
Core assistance and grant program catalog.
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID PK` | Primary internal UUID |
| `title` | `VARCHAR(500)` | Program title |
| `description` | `TEXT` | Detailed program narrative |
| `provider_name` | `VARCHAR(255)` | Sponsoring agency / organization |
| `source_id` | `VARCHAR(100) FK` | References `sources(id)` |
| `source_url` | `TEXT` | Official funding notice URL |
| `application_url` | `TEXT` | Direct portal application link |
| `category` | `VARCHAR(100)` | Primary category slug |
| `subcategories` | `TEXT[]` | Specific CFDA numbers or sub-domains |
| `program_type` | `VARCHAR(50)` | `GRANT`, `BENEFIT`, `SCHOLARSHIP`, `ASSISTANCE`, `TAX_CREDIT`, `LOAN`, `EMERGENCY`, `OTHER` |
| `amount_min` | `NUMERIC(14,2)` | Minimum award (nullable) |
| `amount_max` | `NUMERIC(14,2)` | Maximum award (nullable) |
| `currency` | `VARCHAR(10)` | Currency standard (e.g. `USD`) |
| `deadline` | `TIMESTAMPTZ` | Closing date / deadline (nullable) |
| `rolling_deadline` | `BOOLEAN` | True if ongoing or open on rolling basis |
| `location_scope` | `VARCHAR(50)` | `NATIONWIDE`, `STATE`, `COUNTY`, `CITY`, `ZIP` |
| `states` | `TEXT[]` | Eligible two-letter state codes |
| `eligibility_summary`| `TEXT` | Official criteria text summary |
| `eligibility_rules` | `JSONB` | Structured programmatic requirements |
| `required_documents`| `TEXT[]` | Documentation requirements checklist |
| `raw_source_identifier`| `TEXT` | Raw ID in external system |
| `source_opportunity_id`| `VARCHAR(255)`| Verified external ID (e.g. `361754`) |
| `dedup_fingerprint` | `VARCHAR(255)`| SHA-256 normalized hash for deduplication |
| `last_verified_at` | `TIMESTAMPTZ` | Verification timestamp |
| `retrieved_at` | `TIMESTAMPTZ` | Ingestion timestamp |
| `active` | `BOOLEAN` | Active status flag |

### 3. `applications` & `application_events`
Tracks the user application lifecycle safely without auto-submission.
- `applications.status`: `DISCOVERED`, `REVIEWING`, `PREPARING`, `READY_FOR_REVIEW`, `APPROVED`, `SUBMITTED`, `REJECTED`, `WITHDRAWN`, `COMPLETED`.
- `applications.checklist`: JSON array containing `{ document_name, required, collected }`.
- `applications.user_approved_at`: Audit timestamp when user explicitly approved application package.
- `application_events`: Immutable log of state transitions with timestamps and actor tracking.

---

## Business and Geographic Extensions

The expansion remains relational and reuses `opportunities`, `sources`, and `applications`.

| Table | Purpose |
| :--- | :--- |
| `businesses` | Stable user-to-business identity. |
| `business_profiles` | Optional stage, industry, structure, geography, financial need, and self-reported ownership attributes. |
| `business_certifications` | Certification claims and verification status without assuming qualification. |
| `business_funding_needs` | Extensible normalized funding purposes and requested amounts. |
| `business_checklists` / `business_checklist_items` | Configurable startup and LLC progress tracking; completion is user- or trusted-integration-confirmed. |
| `business_requirements` | License, permit, formation, tax, employer, and other requirements with jurisdiction and verification status. |
| `business_requirement_sources` | Official source provenance for every persisted requirement. |
| `business_applications` | Business context attached to the unified `applications` workflow. |
| `opportunity_audiences` | Many-to-many audiences such as `STARTUP`, `SMALL_BUSINESS`, `VETERAN`, or `STUDENT`. |
| `opportunity_funding_purposes` | Normalized purposes such as `EQUIPMENT`, `WORKING_CAPITAL`, or `TRAINING`. |

`applications` adds nullable `business_id` and an `application_type` while retaining one lifecycle and audit trail. Geographic coverage adds country, region, tribal, and online attributes; `UNKNOWN` remains a first-class scope and cannot be interpreted as nationwide.
