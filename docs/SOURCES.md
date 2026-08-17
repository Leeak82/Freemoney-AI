# FreeMoney-AI Source Registry & Ingestion Pipeline

## Initial Registered Sources

| Source Identifier | Provider | Trust Level | Status | Sync Mechanism |
| :--- | :--- | :--- | :--- | :--- |
| **`grants-gov`** | U.S. Dept of Health and Human Services | `OFFICIAL_GOVERNMENT` | `ACTIVE` | REST API (`/search2`, `/fetchOpportunity`) |
| **`treasury-fiscal-data`** | U.S. Dept of the Treasury | `OFFICIAL_GOVERNMENT` | `ACTIVE` | REST API (`/v1/debt/...`) |
| **`public-api-lists`** | Community (GitHub Catalog) | `COMMUNITY` | `ACTIVE` | Markdown Table Parser |
| **`n0shake-public-apis`** | Community (GitHub Catalog) | `COMMUNITY` | `ACTIVE` | Markdown Table Parser |
| **`followthemoney`** | OpenSecrets / Transparency Org | `OFFICIAL_ORGANIZATION` | `ACTIVE` | REST API (API Key Configurable) |

---

## Source Verification & Progression Flow

Candidate data sources progress through a three-stage lifecycle:

$$\text{DISCOVERED} \longrightarrow \text{REVIEW} \longrightarrow \text{VERIFIED} \longrightarrow \text{ACTIVE}$$

1. **DISCOVERED:** Extracted via automated catalog discovery from public API repositories. Not exposed in user search results.
2. **VERIFIED:** Inspected by engineers/admins for authentication type, rate limits, schema stability, and non-prohibitive Terms of Service.
3. **ACTIVE:** Plugged into `IOpportunitySource`, mapped into the normalization layer, and scheduled for continuous synchronization.

## Verified Business Guidance Resources

Business requirement providers currently expose official federal starting points from:

- U.S. Small Business Administration (`sba.gov`) for structure, license, and permit research.
- Internal Revenue Service (`irs.gov`) for EIN and employer tax guidance.

These are guidance resources, not direct opportunity feeds. State filing agencies, state fees, registered-agent rules, and annual-report obligations are deliberately returned as `NEEDS_VERIFICATION` until a jurisdiction-specific provider is implemented and verified. FreeMoney-AI does not substitute one state’s process for another.

---

## Adding a New Source

To add an assistance provider:
1. Implement the `IOpportunitySource` interface in `src/sources/`:
   ```typescript
   export class MyCustomSource implements IOpportunitySource {
     getSourceMetadata(): SourceMetadata;
     validateConnection(): Promise<{ healthy: boolean; latencyMs: number }>;
     fetchOpportunities(params: SourceFetchParams): Promise<SourceFetchResult>;
     fetchOpportunityDetail(id: string): Promise<RawOpportunityDetail | null>;
   }
   ```
2. Register the instance in `src/sources/sync-engine.ts`.
3. Add seed configuration in `src/db/seed-data.ts`.
4. Run migration & seed scripts.
