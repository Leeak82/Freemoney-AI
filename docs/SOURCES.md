# FreeMoney-AI Source Network

## Source roles

The registry separates four roles. Only `OPPORTUNITY_FEED` sources may create searchable opportunities.

| Role | Meaning |
| :--- | :--- |
| `OPPORTUNITY_FEED` | Published opportunities that can be normalized and synchronized. |
| `RESOURCE` | Verified official guidance or program navigation, not a machine-readable feed. |
| `DISCOVERY_CATALOG` | Community directory used only to identify candidates for review. |
| `OPEN_DATA` | Official data that is useful context but is not automatically an opportunity. |

Lifecycle is `DISCOVERED → REVIEW → VERIFIED → ACTIVE`; broken sources may be `DISABLED`. Candidate catalog entries are persisted in `source_candidates` as `DISCOVERED` and cannot become active until an administrator completes each review step.

## Active opportunity feeds

### Grants.gov

| Field | Value |
| :--- | :--- |
| Registry ID | `grants-gov` |
| Purpose | Federal grant and cooperative-agreement opportunities |
| Official URL | https://www.grants.gov |
| API | `POST https://api.grants.gov/v1/api/search2` and `POST https://api.grants.gov/v1/api/fetchOpportunity` |
| Documentation | https://www.grants.gov/api |
| Authentication | None for these two endpoints |
| Numeric rate limit | Not published in the reviewed documentation; conservative request spacing, timeouts, retries, and page caps are configurable |
| Geographic coverage | Source-dependent; the API does not publish a universal geography field, so scope remains `UNKNOWN` unless an explicit source field establishes it |
| Data used | IDs, opportunity number, title, agency, status, dates, description, applicant types, funding instruments/categories, amounts, contacts, Assistance Listing numbers, package metadata, and API-supplied application URL |
| Sync frequency | Configured as daily; no production scheduler is enabled by default |
| Trust | `OFFICIAL_GOVERNMENT` |
| Verification | `ACTIVE`; live search and detail calls verified August 17, 2026 |

`fetchOpportunity` expects `{ "opportunityId": number }`. A Grants.gov detail page is the official program page. It is not labeled an official application link. An API-supplied `assistURL` is labeled official only when it is an HTTP(S) government host; any other supplied URL remains third-party/unverified.

The current production contract uses the request filter `cfda` and detail array `cfdas`. The parser also accepts the older documented `aln`/`alns` form and supports both `synopsis` and `forecast` detail records.

### USA.gov Benefit Finder

| Field | Value |
| :--- | :--- |
| Registry ID | `usa-gov-benefits` |
| Purpose | Federal benefit records for disability, retirement, and death-related life events |
| Official URL | https://www.usa.gov/benefit-finder |
| Data | First-party static JSON at `https://www.usa.gov/s3/files/benefit-finder/api/life-event/all_benefits.json` |
| Documentation | No formal API/schema contract; schema is monitored and rejected on incompatible change |
| Authentication | None |
| Numeric rate limit | Not published; the entire file is cached during synchronization |
| Geographic coverage | Not consistently published per record; normalized as `UNKNOWN` |
| Data used | Title, summary, official agency, official program URL, and published eligibility criteria |
| Sync frequency | Configured as daily |
| Trust | `OFFICIAL_GOVERNMENT` |
| Verification | Feed `ACTIVE`; live JSON retrieval and 64-record import verified August 17, 2026 |

The feed does not publish per-record open/closed status, deadlines, required documents, amounts, or direct application links. Imported records therefore remain `status=UNKNOWN`, `active=false`, and are excluded from active-only search. This prevents stale entries—such as time-limited disaster programs—from being presented as currently open merely because they remain in the Benefit Finder file.

## Verified official resources and open data

These sources are registered for navigation or future adapters. They do not currently generate opportunity rows.

| Registry ID | Source | Role | API/data availability | Auth | Coverage | Trust/status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `sba-funding-programs` | [SBA Funding Programs](https://www.sba.gov/funding-programs) | `RESOURCE` | Official program pages. SBA lending APIs require approved institutional access and are not discovery feeds | None for pages | United States | Official / Active |
| `hud-egis` | [HUD Enterprise GIS](https://egis.hud.gov/arcgis/rest/services) | `OPEN_DATA` | ArcGIS REST housing/property layers; layer limits vary (commonly 1,000 or 5,000) | None | United States/local | Official / Active |
| `va-benefits` | [VA Benefits](https://www.va.gov/) | `RESOURCE` | VA developer APIs focus on authenticated claims, intake, and reference data, not a public opportunity catalog | None for pages | United States | Official / Active |
| `irs-credits-deductions` | [IRS Credits and Deductions](https://www.irs.gov/credits-deductions) | `RESOURCE` | Official guidance pages; no opportunity feed used | None | United States | Official / Active |
| `usda-rural-development` | [USDA Rural Development Programs](https://www.rd.usda.gov/programs-services) | `RESOURCE` | Official program navigation; no general opportunity API verified | None for pages | United States/rural | Official / Active |
| `dol-benefits` | [DOL Benefits](https://www.dol.gov/general/topic/benefits-leave) | `RESOURCE` | Official guidance; no opportunity feed used | None | United States | Official / Active |
| `federal-student-aid` | [Federal Student Aid](https://studentaid.gov/understand-aid/types) | `RESOURCE` | Official aid guidance; no opportunity feed used | None for pages | United States | Official / Active |
| `open-fema` | [OpenFEMA](https://www.fema.gov/about/openfema/api) | `OPEN_DATA` | Free read-only datasets; default 1,000 and documented maximum 10,000 records per request | None | United States/disaster-specific | Official / Active |
| `hhs-programs` | [HHS Programs and Services](https://www.hhs.gov/programs/index.html) | `RESOURCE` | Official program navigation; HHS grant opportunities are ingested through Grants.gov | None | United States | Official / Active |
| `treasury-fiscal-data` | [Treasury Fiscal Data](https://fiscaldata.treasury.gov/api-documentation/) | `OPEN_DATA` | Public fiscal datasets, not direct assistance opportunities | None | United States | Official / Active |

The application does not convert an assisted property, historical award, loan record, claim API, aggregate payment, or general guidance page into a funding opportunity.

## Discovery catalogs and review-only sources

| Registry ID | Purpose | Status |
| :--- | :--- | :--- |
| `public-api-lists` | Parses `public-api-lists/public-api-lists` Markdown entries into review candidates | Active discovery catalog; never authoritative |
| `n0shake-public-apis` | Parses `n0shake/Public-APIs` Markdown entries into review candidates | Active discovery catalog; never authoritative |
| `followthemoney` | Supplementary campaign-finance source registered from the original scope | `REVIEW`, disabled; not treated as a grant feed |

Discovery classifications are: `GRANTS`, `HOUSING`, `RENT`, `UTILITIES`, `FOOD`, `TRANSPORTATION`, `VETERANS`, `DISABILITY`, `EDUCATION`, `SCHOLARSHIPS`, `MEDICAL`, `FAMILY`, `EMERGENCY`, `TAX`, `BUSINESS`, `STARTUP`, `LOANS`, `MICROLOANS`, `GOVERNMENT_CONTRACTING`, `LICENSES`, `PERMITS`, `TRAINING`, `DISASTER`, and `OTHER`.

## Adding an opportunity feed

1. Verify the official contract, terms, authentication, update behavior, and rate guidance.
2. Implement `IOpportunitySource` with metadata, health check, page fetch, and detail fetch.
3. Use `ResilientHttpClient` for timeout, retry, backoff, and rate handling.
4. Normalize only published values; unknown geography, documents, eligibility, amount, and deadline remain unknown.
5. Register the adapter and seed it as `REVIEW` until live validation succeeds.
6. Add parser, pagination, failure, provenance, deduplication, and live acceptance coverage.
7. Promote to `VERIFIED`, then `ACTIVE`, through the administrative review lifecycle.
