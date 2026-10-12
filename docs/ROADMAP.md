# FreeMoney-AI Development Roadmap

### Phase 1: Foundation (Current Status: COMPLETED)
- [x] PostgreSQL & Supabase compatible schema and migrations
- [x] Extensible Source Registry with trust level hierarchy
- [x] Verified Grants.gov REST API integration (`/search2`, `/fetchOpportunity`)
- [x] Deterministic Deduplication & Data Quality Guard
- [x] Fast multi-factor search engine with geographic and category filters
- [x] `IEligibilityMatcher` interface with preserved uncertainty
- [x] Optional profile and dynamic application document checklists
- [x] Full REST API and responsive user interface
- [x] Automated test suite & architecture documentation
- [x] Dual personal-assistance and business-startup paths
- [x] Optional business profiles, normalized stages, structures, funding purposes, and audiences
- [x] Universal deterministic geographic matcher with explicit unknown/no-match outcomes
- [x] Startup and LLC checklist foundation with user-confirmed progress
- [x] State-aware formation and business-requirement provider interfaces
- [x] Official federal SBA/IRS guidance with unverified state facts preserved as unknown

---

### Phase 2: Real Assistance Data Network (Current Status: COMPLETED)
- [x] Current documented Grants.gov search and opportunity-detail contracts
- [x] Current live Grants.gov `cfda`/`cfdas`, synopsis, and forecast compatibility
- [x] USA.gov Benefit Finder first-party JSON ingestion with unknown-status safeguards
- [x] Configurable pagination, timeout, request spacing, retry, and backoff
- [x] `SUCCESS`, `PARTIAL`, and `FAILED` sync accounting with classified errors
- [x] Active, expired, closed, paused, and unknown opportunity states
- [x] Source-specific metadata and many-source provenance retention
- [x] Primary and fallback fingerprint deduplication
- [x] Official program/application/third-party link distinction
- [x] Searchable local PostgreSQL cache; no upstream calls during user search
- [x] Review-only candidate importers for both requested public API catalogs
- [x] Registered federal resources and open data without misrepresenting them as funding feeds
- [x] Status-aware deterministic search and source administration
- [x] Automated live Grants.gov sync-to-search acceptance coverage

Deferred intentionally because no suitable verified opportunity feed was established in this phase:
- Direct state/local benefit registries and LIHEAP administering-agency connectors
- HUD property/resource data adapter (HUD EGIS remains registered as open data)
- FEMA disaster-program adapter (OpenFEMA remains registered as open data)
- Verified state formation, license, and permit providers
- Foundation, contracting, certification, incubator, and workforce feeds

---

### Phase 3: Verified State/Local Expansion and Matching Intelligence
- [ ] Add a jurisdiction provider registry with one verified state pilot, contract tests, and field-level provenance
- [ ] Build explicit adapters for program catalogs—not general agency pages or historical award datasets
- [ ] Add ZIP-to-county/city resolution from an authoritative geographic dataset
- [ ] Review and promote useful catalog candidates one at a time
- [ ] Configurable LLM-driven eligibility reasoning (Anthropic / OpenAI / Local models)
- [ ] Natural language query parsing ("I am a single mom in my county needing help with electric bills")
- [ ] Document OCR & pre-qualification verification

---

### Phase 4: Application Assistant
- [ ] Dynamic form schema generation from PDF/HTML application notices
- [ ] Secure client-side document vault with encryption-at-rest
- [ ] Auto-fill draft generation with field-by-field provenance

---

### Phase 5: Submission Workflow
- [ ] Authorized partner API submissions for municipal and foundation grants
- [ ] Explicit user confirmation ceremony before dispatch
- [ ] Real-time submission confirmation number capture and tracking

---

### Phase 6: Continuous Monitoring & Alerting
- [ ] User notifications for new matching programs and changing deadlines
- [ ] Automated source health monitoring and broken link detection
- [ ] Multi-channel alerts (Email, SMS, Webhook)
