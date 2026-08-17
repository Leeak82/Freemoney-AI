# FreeMoney-AI

> **A source-backed platform for personal assistance and for starting or growing a business—covering grants, benefits, formation guidance, funding, licenses, permits, and official resources.**

---

## 🌟 Mission & Core Principles

FreeMoney-AI is **NOT** a generic grant directory. It provides an honest, source-verified discovery and application preparation lifecycle:

$$\text{DISCOVER} \longrightarrow \text{FILTER} \longrightarrow \text{VERIFY} \longrightarrow \text{MATCH} \longrightarrow \text{PREPARE APPLICATION} \longrightarrow \text{USER APPROVES} \longrightarrow \text{SUBMIT} \longrightarrow \text{TRACK}$$

### Core Tenets:
1. **Real Data Over Demo Data:** Searchable opportunities come from active opportunity feeds. Grants.gov is the currently verified production feed; Treasury and other official datasets are not mislabeled as grants.
2. **Strict Provenance:** Every record tracks `source_id`, `source_url`, `last_verified_at`, and `retrieved_at`.
3. **No Giant Questionnaire Required:** Users can search and explore immediately. User profile is 100% optional.
4. **Honest AI Matching & Preserved Uncertainty:** If criteria or user information is incomplete, the system marks the match as *Needs Verification* and never hallucinates positive qualifications.
5. **No Unauthorized Auto-Submissions:** Applications generate document checklists and require explicit user consent and review before submission.
6. **Geography Is Explicit:** Nationwide, country, state, county, city, region, ZIP, tribal, online, and unknown scopes are distinct. Unknown is never treated as nationwide.
7. **Business Guidance Is Not Legal Advice:** State LLC facts are displayed only from verified providers. Unsupported jurisdictions remain marked *Needs verification*.

---

## 🏗️ Architecture

- **Backend:** Node.js, TypeScript, Express, PostgreSQL / Supabase Compatible DDL.
- **Data Ingestion:** Extensible `IOpportunitySource` framework, resilient Grants.gov REST client (`/search2`, `/fetchOpportunity`), paginated synchronization, source status history, and review-only Public API catalog importers.
- **Search & Ranking:** Multi-factor deterministic ranking weighted by category, geography, demographic fit, and source trust multipliers.
- **AI Eligibility Engine:** `IEligibilityMatcher` interface with rule-based and configurable LLM adapters.
- **Business Engine:** Optional business profiles, stage-aware matching, unified opportunity audiences, funding purposes, startup/LLC checklists, and official requirement-provider abstractions.
- **Geographic Engine:** `IGeographicMatcher` returns exact, city, county, state, region, country, nationwide, online, no-match, or unknown outcomes.
- **Frontend:** Responsive dual-path experience for personal assistance or business startup/growth, plus program detail, profiles, checklists, application tracking, and admin telemetry.

---

## 🚀 Quick Start & Local Setup

### 1. Prerequisites
- Node.js 20+ or 22+
- PostgreSQL 15+ (or Supabase)

### 2. Install & Configure
```bash
git clone https://github.com/Leeak82/Freemoney-AI.git
cd Freemoney-AI
npm install
cp .env.example .env
```

Required local configuration is documented in `.env.example`. Important Phase 2 controls include:

| Variable | Purpose |
| :--- | :--- |
| `DATABASE_URL` | PostgreSQL/Supabase-compatible connection |
| `ADMIN_API_KEY` | Protects synchronization and source administration |
| `GRANTS_GOV_API_URL` | Official Grants.gov API base |
| `GRANTS_GOV_TIMEOUT_MS`, `GRANTS_GOV_MAX_RETRIES` | Failure handling |
| `GRANTS_GOV_RETRY_BASE_MS`, `GRANTS_GOV_MIN_INTERVAL_MS` | Backoff and request spacing |
| `GRANTS_GOV_PAGE_SIZE`, `GRANTS_GOV_MAX_PAGES` | Safe page controls |
| `GRANTS_GOV_FETCH_DETAILS` | Enables source detail enrichment |

### 3. Database Migration & Seed
```bash
npm run migrate
npm run seed
```

### 4. Ingest Official Grants.gov Data
```bash
npm run sync
```

### 5. Run the Application
```bash
npm run dev
```
Open **`http://localhost:3000`** in your browser.

The homepage immediately offers:

- **Find Personal Assistance**
- **Start or Grow a Business**

No account or questionnaire is required for basic exploration.

---

## 🧪 Testing

Run the automated test suite covering source registration, live Grants.gov sync-to-search, pagination, retries, rate limits, timeouts, status transitions, provenance, deduplication, search, personal/business matching, and API endpoints:
```bash
npm test
```

The live acceptance case requires outbound access to `api.grants.gov`. Isolated parser and transport tests use controlled responses.

## Adding and verifying a source

1. Register the source as the correct role: opportunity feed, resource, discovery catalog, or open data.
2. Verify its official contract and whether it actually publishes current opportunities.
3. Implement `IOpportunitySource` only for an opportunity feed and use the resilient transport.
4. Add normalization, provenance, pagination, failure, deduplication, and live contract coverage.
5. Promote through `REVIEW → VERIFIED → ACTIVE`; never activate directory candidates automatically.

See [Source Registry & Discovery Guide](docs/SOURCES.md) for the full process and current verification matrix.

---

## 📚 Detailed Documentation

- [Architecture & Technical Blueprint](docs/ARCHITECTURE.md)
- [Data Model & Schema Reference](docs/DATA_MODEL.md)
- [REST API Reference](docs/API.md)
- [Source Registry & Discovery Guide](docs/SOURCES.md)
- [Security & Privacy Guardrails](docs/SECURITY.md)
- [Development Guide](docs/DEVELOPMENT.md)
- [Project Roadmap](docs/ROADMAP.md)

---

## 🔒 Security
No secrets, keys, or private tokens are stored in version control. All configuration is environment-based and validated at runtime.
