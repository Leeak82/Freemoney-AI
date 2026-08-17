# FreeMoney-AI REST API Reference

Base URL: `http://localhost:3000/api` (or configured `API_BASE_URL`)

---

## Public Endpoints

### 1. Categories
- **`GET /api/categories`**
  - **Description:** Returns the hierarchical taxonomy of financial assistance categories.
  - **Query:** `path=PERSONAL` or `path=BUSINESS` filters the dual-path taxonomy.
  - **Response:**
    ```json
    {
      "categories": [
        {
          "id": "uuid",
          "slug": "grants",
          "name": "Grants",
          "description": "Federal, state, and foundational grant funding opportunities...",
          "sort_order": 1
        }
      ]
    }
    ```

### 2. Search & Opportunities
- **`POST /api/search`**
  - **Description:** Multi-factor deterministic search with optional profile-based AI eligibility evaluation.
  - **Request Body:**
    ```json
    {
      "categories": ["grants", "rent-housing"],
      "keyword": "health",
      "state": "WA",
      "official_only": true,
      "intent": "PERSONAL_ASSISTANCE",
      "user_profile": {
        "state": "WA",
        "is_veteran": true,
        "is_business_owner": false,
        "income_range": "25k-50k"
      },
      "limit": 20,
      "offset": 0
    }
    ```

- **`POST /api/business/search`**
  - Uses the same opportunity engine with a saved business profile.
  - Body: `{ "business_id": "<uuid>", "categories": ["startup-funding"], "limit": 20 }`.
  - **Response:**
    ```json
    {
      "total": 42,
      "limit": 20,
      "offset": 0,
      "results": [
        {
          "opportunity": {
            "id": "uuid",
            "title": "Title X Family Planning Services",
            "provider_name": "Office of the Assistant Secretary for Health",
            "category": "grants",
            "deadline": "2027-01-11T00:00:00.000Z",
            "source_url": "https://www.grants.gov/search-results-detail/361754"
          },
          "match_score": 85,
          "confidence": "HIGH",
          "match_status": "LIKELY_MATCH",
          "why_you_may_qualify": [
            "You qualify geographically: Program is open nationwide."
          ],
          "missing_information": [],
          "potential_disqualifiers": [],
          "source_provenance": {
            "source_name": "Grants.gov",
            "source_url": "https://www.grants.gov/search-results-detail/361754",
            "official_source": true,
            "trust_level": "OFFICIAL_GOVERNMENT",
            "last_verified": "2026-08-17",
            "source_opportunity_id": "361754"
          }
        }
      ]
    }
    ```

- **`GET /api/opportunities`**
  - **Query Parameters:** `category`, `keyword`, `state`, `official_only`, `limit`, `offset`.

- **`GET /api/opportunities/:id`**
  - **Description:** Retrieves detailed opportunity overview, provenance verification, and document checklist.

### 3. Optional User Profile
- **`GET /api/profile`**
  - **Headers:** `X-User-Id: <uuid>` (or query `?user_id=<uuid>`)
  - **Response:** Returns saved profile attributes or `null`.

- **`POST /api/profile`**
  - **Request Body:**
    ```json
    {
      "user_id": "00000000-0000-4000-8000-000000000001",
      "state": "WA",
      "zip_code": "98402",
      "household_size": 2,
      "income_range": "25k-50k",
      "housing_status": "RENTER",
      "is_veteran": true,
      "is_disabled": false,
      "is_student": false,
      "is_business_owner": false
    }
    ```

### 4. Application Tracking
- **`POST /api/applications`**
  - **Description:** Initializes an application tracking record with dynamic document checklist.
  - **Request Body:**
    ```json
    {
      "user_id": "00000000-0000-4000-8000-000000000001",
      "business_id": null,
      "opportunity_id": "uuid",
      "application_type": "PERSONAL_ASSISTANCE",
      "notes": "Preparing documentation for grant cycle."
    }
    ```

### 5. Business Startup and Formation

- **`GET /api/businesses`** — lists optional business profiles for the user.
- **`POST /api/businesses`** — creates or incrementally updates a business profile and generates configurable startup/LLC checklists.
- **`GET /api/businesses/:id`** — returns the profile and checklists.
- **`GET /api/businesses/:id/checklists`** — returns all business checklists.
- **`PATCH /api/businesses/:businessId/checklists/items/:itemId`**
  - Body: `{ "status": "COMPLETED" }`.
  - Completion is recorded as user-confirmed; the system does not auto-complete requirements.
- **`POST /api/business/formation-guidance`**
  - Body: `{ "countryCode": "US", "state": "WA", "structure": "LLC" }`.
  - Unsupported state/structure combinations return `supported: false` and `missingInformation`; they never borrow another state’s requirements.
- **`POST /api/business/requirements`**
  - Body accepts country, state, county, city, industry, and business type.
  - Returns official source links and `NEEDS_VERIFICATION` where applicability is not established.

- **`GET /api/applications`**
  - **Description:** Returns all application records tracked for the user.

- **`PATCH /api/applications/:id`**
  - **Description:** Updates status, checklist items, or user approval.
  - **Request Body:**
    ```json
    {
      "status": "READY_FOR_REVIEW",
      "userApproved": true,
      "checklist": [
        { "document_name": "Standard Application Form", "required": true, "collected": true }
      ]
    }
    ```

---

## Admin Endpoints (Protected by `X-Admin-Key` or `Authorization: Bearer <key>`)

### 1. Source Health & Status
- **`GET /api/admin/health`**
  - Returns connection latency and status for all registered upstream sources.

- **`GET /api/admin/sync-runs`**
  - Returns historical sync runs, records inserted/updated, and error logs.

- **`PATCH /api/admin/sources/:id`**
  - Enables or disables a source, or modifies discovery status.

### 2. Manual Source Ingestion
- **`POST /api/sync/:source`**
  - **Example:** `POST /api/sync/grants-gov` with `{ "rows": 50 }`.
  - Triggers a real API ingestion run against the upstream provider.

### 3. Candidate API Discovery
- **`POST /api/admin/discover-apis`**
  - Scans `public-apis` catalogs, parses markdown tables, and classifies candidates.
