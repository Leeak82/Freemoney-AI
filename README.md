# FreeMoney-AI

> **Legitimate assistance-discovery platform helping users find grants, financial assistance, benefits, scholarships, housing aid, utility assistance, emergency assistance, and official financial programs.**

---

## 🌟 Mission & Core Principles

FreeMoney-AI is **NOT** a generic grant directory. It provides an honest, source-verified discovery and application preparation lifecycle:

$$\text{DISCOVER} \longrightarrow \text{FILTER} \longrightarrow \text{VERIFY} \longrightarrow \text{MATCH} \longrightarrow \text{PREPARE APPLICATION} \longrightarrow \text{USER APPROVES} \longrightarrow \text{SUBMIT} \longrightarrow \text{TRACK}$$

### Core Tenets:
1. **Real Data Over Demo Data:** All opportunities originate from verified, official sources (Grants.gov, Treasury, state assistance programs). No synthetic placeholder grants exist.
2. **Strict Provenance:** Every record tracks `source_id`, `source_url`, `last_verified_at`, and `retrieved_at`.
3. **No Giant Questionnaire Required:** Users can search and explore immediately. User profile is 100% optional.
4. **Honest AI Matching & Preserved Uncertainty:** If criteria or user information is incomplete, the system marks the match as *Needs Verification* and never hallucinates positive qualifications.
5. **No Unauthorized Auto-Submissions:** Applications generate document checklists and require explicit user consent and review before submission.

---

## 🏗️ Architecture

- **Backend:** Node.js, TypeScript, Express, PostgreSQL / Supabase Compatible DDL.
- **Data Ingestion:** Extensible `IOpportunitySource` framework, Grants.gov REST client (`/search2`, `/fetchOpportunity`), Public APIs catalog discovery parser.
- **Search & Ranking:** Multi-factor deterministic ranking weighted by category, geography, demographic fit, and source trust multipliers.
- **AI Eligibility Engine:** `IEligibilityMatcher` interface with rule-based and configurable LLM adapters.
- **Frontend:** Responsive, single-page application with immediate category chip filters, geographic search, program detail inspection, optional profile builder, application tracker, and admin telemetry.

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

---

## 🧪 Testing

Run the automated test suite covering source registration, Grants.gov client, normalizer, validator, deduplication, search ranking, and API endpoints:
```bash
npm test
```

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
