import { Router, Request, Response } from 'express';
import { query } from '../db/index.js';
import { searchEngine } from '../search/search-engine.js';
import { naturalLanguageSearchParser } from '../search/natural-language-parser.js';
import { sourceRegistry } from '../sources/registry.js';
import { syncEngine } from '../sources/sync-engine.js';
import { profileService } from '../services/profile-service.js';
import { applicationService } from '../services/application-service.js';
import { requireAdminAuth } from '../middleware/auth.js';
import { requireUserSession } from '../middleware/user-session.js';
import { PublicApisDiscoveryParser } from '../sources/discovery.js';
import { businessService } from '../services/business-service.js';
import { businessProviderRegistry } from '../business/providers.js';
import { programResearchService } from '../research/research-service.js';
import { caseService } from '../services/case-service.js';
import { z } from 'zod';

export const apiRouter = Router();

// ==========================================
// 1. Categories Endpoint
// ==========================================
apiRouter.get('/categories', async (req: Request, res: Response) => {
  try {
    const path = String(req.query.path || '').toUpperCase();
    const params: string[] = [];
    let where = '';
    if (path === 'PERSONAL' || path === 'BUSINESS') {
      where = `WHERE audience_type IN ($1, 'BOTH')`;
      params.push(path);
    }
    const result = await query(
      `SELECT * FROM categories ${where} ORDER BY sort_order ASC, name ASC;`,
      params
    );
    res.json({ categories: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch categories', details: err.message });
  }
});

const businessProfileSchema = z.object({
  business_id: z.string().uuid().optional(),
  business_name: z.string().trim().max(255).optional().nullable(),
  business_description: z.string().trim().max(5000).optional().nullable(),
  industry: z.string().trim().max(255).optional().nullable(),
  business_stage: z
    .enum([
      'IDEA',
      'PLANNING',
      'FORMATION',
      'PRE_REVENUE',
      'OPERATING',
      'GROWING',
      'EXPANDING',
      'DISTRESSED',
    ])
    .optional()
    .nullable(),
  country: z.string().length(2).default('US'),
  state: z.string().trim().max(50).optional().nullable(),
  county: z.string().trim().max(100).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  postal_code: z.string().trim().max(20).optional().nullable(),
  business_structure: z
    .enum([
      'SOLE_PROPRIETORSHIP',
      'LLC',
      'PARTNERSHIP',
      'S_CORPORATION',
      'C_CORPORATION',
      'NONPROFIT',
      'OTHER',
      'UNKNOWN',
    ])
    .optional()
    .nullable(),
  formation_status: z.string().trim().max(100).optional().nullable(),
  employee_count: z.number().int().nonnegative().optional().nullable(),
  annual_revenue: z.number().nonnegative().optional().nullable(),
  estimated_startup_cost: z.number().nonnegative().optional().nullable(),
  funding_needed: z.number().nonnegative().optional().nullable(),
  funding_purpose: z
    .enum([
      'STARTUP_COSTS',
      'EQUIPMENT',
      'INVENTORY',
      'WORKING_CAPITAL',
      'RENT',
      'UTILITIES',
      'PAYROLL',
      'MARKETING',
      'TECHNOLOGY',
      'TRAINING',
      'REAL_ESTATE',
      'VEHICLE',
      'EXPANSION',
      'DISASTER_RECOVERY',
      'EXPORT',
      'OTHER',
    ])
    .optional()
    .nullable(),
  veteran_owned: z.boolean().optional().nullable(),
  women_owned: z.boolean().optional().nullable(),
  disability_owned: z.boolean().optional().nullable(),
  minority_owned: z.boolean().optional().nullable(),
  rural_business: z.boolean().optional().nullable(),
  other_certifications: z.array(z.string().trim().max(100)).optional(),
});

// ==========================================
// 2. Opportunities & Search Endpoints
// ==========================================
apiRouter.get('/opportunities', async (req: Request, res: Response) => {
  try {
    const {
      category, keyword, state, county, city, zip, program_type, source_id,
      official_only, active_only, limit, offset,
    } = req.query;
    const searchResult = await searchEngine.search({
      category: category as string,
      keyword: keyword as string,
      state: state as string,
      county: county as string,
      city: city as string,
      zip: zip as string,
      program_type: program_type as any,
      source_id: source_id as string,
      official_only: official_only === 'true',
      active_only: active_only !== 'false',
      limit: limit ? parseInt(limit as string, 10) : 20,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });
    res.json(searchResult);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to query opportunities', details: err.message });
  }
});

apiRouter.post('/search', async (req: Request, res: Response) => {
  try {
    const searchResult = await searchEngine.search(req.body);
    res.json(searchResult);
  } catch (err: any) {
    res.status(500).json({ error: 'Search execution failed', details: err.message });
  }
});


apiRouter.post('/search/natural-language', async (req: Request, res: Response) => {
  try {
    const text = String(req.body?.text || req.body?.query || '').trim();
    if (!text) {
      res.status(400).json({ error: 'Natural-language search text is required.' });
      return;
    }

    const interpretation = naturalLanguageSearchParser.parse(text, req.body?.intent);
    const searchQuery = {
      ...interpretation.search,
      user_profile: interpretation.search.intent === 'PERSONAL_ASSISTANCE'
        ? { ...(interpretation.inferred_profile || {}), ...(req.body?.user_profile || {}) }
        : undefined,
      business_profile: interpretation.search.intent === 'BUSINESS_ASSISTANCE'
        ? { ...(interpretation.inferred_business_profile || {}), ...(req.body?.business_profile || {}) }
        : undefined,
      limit: Number.isFinite(Number(req.body?.limit)) ? Math.min(Number(req.body.limit), 100) : 20,
      offset: Number.isFinite(Number(req.body?.offset)) ? Math.max(Number(req.body.offset), 0) : 0,
    };
    const searchResult = await searchEngine.search(searchQuery);

    // Persistence is opt-in per inquiry: only a caller that supplies a case_id and
    // a valid private session gets a durable query/result snapshot. General anonymous
    // search remains available without creating a profile or silently storing location.
    let searchId: string | undefined;
    const caseId = typeof req.body?.case_id === 'string' ? req.body.case_id : undefined;
    if (caseId) {
      const authorization = req.headers.authorization;
      if (!authorization) {
        res.status(401).json({ error: 'A private session is required to save this inquiry.' });
        return;
      }
      const actor = await import('../services/session-service.js').then(({ sessionService }) =>
        sessionService.resolve(authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '')
      );
      if (!actor) {
        res.status(401).json({ error: 'Invalid or expired private session.' });
        return;
      }
      searchId = await caseService.recordSearch(actor.userId, caseId, text, interpretation, searchResult.results || []);
    }

    res.json({ interpretation, ...searchResult, ...(searchId ? { saved_search_id: searchId, case_id: caseId } : {}) });
  } catch (err: any) {
    res.status(400).json({ error: 'Natural-language search failed', details: err.message });
  }
});

apiRouter.get('/opportunities/:id', async (req: Request, res: Response) => {
  try {
    const result = await searchEngine.getOpportunityById(req.params.id);
    if (!result) {
      res.status(404).json({ error: 'Opportunity not found' });
      return;
    }
    const research = await programResearchService.getSnapshot(req.params.id);
    res.json({
      ...result,
      research,
      research_notice: research
        ? 'Program-specific verified research is shown below. Unknown fields remain unknown until authoritative evidence is found.'
        : 'Detailed program research has not yet been completed for this record. Do not treat missing fields as eligibility requirements.',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch opportunity detail', details: err.message });
  }
});

apiRouter.post('/opportunities/:id/report-outdated', async (req: Request, res: Response) => {
  try {
    const input = z.object({
      report_type: z.enum([
        'PROGRAM_CLOSED',
        'BROKEN_LINK',
        'INCORRECT_PHONE',
        'ELIGIBILITY_CHANGED',
        'WAITLIST_CHANGED',
        'APPLICATION_PROCESS_CHANGED',
        'OTHER',
      ]),
      report_text: z.string().trim().max(2000).optional(),
    }).parse(req.body || {});
    const opportunity = await searchEngine.getOpportunityById(req.params.id);
    if (!opportunity) {
      res.status(404).json({ error: 'Opportunity not found' });
      return;
    }
    const report = await programResearchService.reportOutdated(
      req.params.id,
      input.report_type,
      input.report_text
    );
    res.status(202).json({
      success: true,
      report,
      message: 'Report received. Existing verified information was not overwritten; this program is queued for re-verification.',
    });
  } catch (err: any) {
    const details = err instanceof z.ZodError ? err.flatten() : err.message;
    res.status(err instanceof z.ZodError ? 400 : 500).json({ error: 'Failed to report program information', details });
  }
});

// ==========================================
// 3. Source Registry Endpoints
// ==========================================
apiRouter.get('/sources', async (_req: Request, res: Response) => {
  try {
    const sources = await sourceRegistry.getDbSources();
    res.json({ sources });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch sources', details: err.message });
  }
});

apiRouter.get('/sources/:id', async (req: Request, res: Response) => {
  try {
    const source = await sourceRegistry.getDbSourceById(req.params.id);
    if (!source) {
      res.status(404).json({ error: 'Source not found' });
      return;
    }

    // Health check live status
    const liveSource = sourceRegistry.get(req.params.id);
    let connectionHealth = null;
    if (liveSource) {
      connectionHealth = await liveSource.validateConnection();
    }

    res.json({ source, connection_health: connectionHealth });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch source detail', details: err.message });
  }
});

// ==========================================
// 4. User Profile Endpoints
// ==========================================
apiRouter.get('/profile', requireUserSession, async (req: Request, res: Response) => {
  try {
    const userId = req.actor!.userId;
    const profile = await profileService.getProfile(userId);
    res.json({ profile: profile || null });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch profile', details: err.message });
  }
});

apiRouter.post('/profile', requireUserSession, async (req: Request, res: Response) => {
  try {
    const userId = req.actor!.userId;
    const profile = await profileService.upsertProfile(userId, req.body);
    res.json({ success: true, profile });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save profile', details: err.message });
  }
});

// ==========================================
// 5. Business Startup, Formation & Requirements
// ==========================================
apiRouter.get('/businesses', requireUserSession, async (req: Request, res: Response) => {
  try {
    const userId = req.actor!.userId;
    const businesses = await businessService.getBusinesses(userId);
    res.json({ businesses });
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to fetch businesses', details: err.message });
  }
});

apiRouter.post('/businesses', requireUserSession, async (req: Request, res: Response) => {
  try {
    const userId = req.actor!.userId;
    const parsed = businessProfileSchema.parse(req.body);
    const result = await businessService.upsertBusiness(userId, parsed);
    res.status(201).json({ success: true, ...result });
  } catch (err: any) {
    const details = err instanceof z.ZodError ? err.flatten() : err.message;
    res.status(400).json({ error: 'Failed to save business profile', details });
  }
});

apiRouter.get('/businesses/:id', requireUserSession, async (req: Request, res: Response) => {
  try {
    const business = await businessService.getBusiness(req.params.id, req.actor!.userId);
    if (!business) {
      res.status(404).json({ error: 'Business not found' });
      return;
    }
    const checklists = await businessService.getChecklists(req.params.id, req.actor!.userId);
    res.json({ business, checklists });
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to fetch business', details: err.message });
  }
});

apiRouter.get('/businesses/:id/checklists', requireUserSession, async (req: Request, res: Response) => {
  try {
    const checklists = await businessService.getChecklists(req.params.id, req.actor!.userId);
    res.json({ checklists });
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to fetch checklists', details: err.message });
  }
});

apiRouter.patch(
  '/businesses/:businessId/checklists/items/:itemId',
  requireUserSession,
  async (req: Request, res: Response) => {
    try {
      const status = z
        .enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'])
        .parse(req.body.status);
      const item = await businessService.updateChecklistItem(
        req.params.businessId,
        req.params.itemId,
        status,
        req.actor!.userId
      );
      res.json({ success: true, item });
    } catch (err: any) {
      const details = err instanceof z.ZodError ? err.flatten() : err.message;
      res.status(400).json({ error: 'Failed to update checklist item', details });
    }
  }
);

apiRouter.post('/business/formation-guidance', async (req: Request, res: Response) => {
  try {
    const input = z
      .object({
        countryCode: z.string().length(2).default('US'),
        state: z.string().trim().max(50).optional(),
        structure: z.enum([
          'SOLE_PROPRIETORSHIP',
          'LLC',
          'PARTNERSHIP',
          'S_CORPORATION',
          'C_CORPORATION',
          'NONPROFIT',
          'OTHER',
          'UNKNOWN',
        ]),
      })
      .parse(req.body);
    const guidance = await businessProviderRegistry.getFormationGuidance(input);
    res.json({ guidance });
  } catch (err: any) {
    const details = err instanceof z.ZodError ? err.flatten() : err.message;
    res.status(400).json({ error: 'Invalid formation request', details });
  }
});

apiRouter.post('/business/requirements', async (req: Request, res: Response) => {
  try {
    const input = z
      .object({
        countryCode: z.string().length(2).default('US'),
        state: z.string().trim().max(50).optional(),
        county: z.string().trim().max(100).optional(),
        city: z.string().trim().max(100).optional(),
        industry: z.string().trim().max(255).optional(),
        businessType: z.string().trim().max(255).optional(),
      })
      .parse(req.body);
    const requirements = await businessProviderRegistry.findRequirements(input);
    res.json({
      requirements,
      notice:
        'These official resources do not establish every state, local, or industry requirement. Items marked NEEDS_VERIFICATION must be confirmed with the responsible agency.',
    });
  } catch (err: any) {
    const details = err instanceof z.ZodError ? err.flatten() : err.message;
    res.status(400).json({ error: 'Invalid requirement request', details });
  }
});

apiRouter.post('/business/search', requireUserSession, async (req: Request, res: Response) => {
  try {
    const businessId = z.string().uuid().parse(req.body.business_id);
    const profile = await businessService.getBusiness(businessId, req.actor!.userId);
    if (!profile) {
      res.status(404).json({ error: 'Business not found' });
      return;
    }
    const { business_id: _businessId, ...filters } = req.body;
    const searchResult = await searchEngine.search({
      ...filters,
      intent: 'BUSINESS_ASSISTANCE',
      business_profile: profile,
    });
    res.json(searchResult);
  } catch (err: any) {
    const details = err instanceof z.ZodError ? err.flatten() : err.message;
    res.status(400).json({ error: 'Business search failed', details });
  }
});

// ==========================================
// 6. Application Tracking Endpoints
// ==========================================
apiRouter.get('/applications', requireUserSession, async (req: Request, res: Response) => {
  try {
    const userId = req.actor!.userId;
    const apps = await applicationService.getUserApplications(userId);
    res.json({ applications: apps });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch applications', details: err.message });
  }
});

apiRouter.get('/applications/:id', requireUserSession, async (req: Request, res: Response) => {
  try {
    const app = await applicationService.getApplicationById(req.params.id, req.actor!.userId);
    if (!app) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }
    res.json({ application: app });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch application', details: err.message });
  }
});

apiRouter.post('/applications', requireUserSession, async (req: Request, res: Response) => {
  try {
    const userId = req.actor!.userId;
    const app = await applicationService.createApplication({
      userId,
      opportunityId: req.body.opportunity_id,
      businessId: req.body.business_id || null,
      applicationType: req.body.application_type,
      notes: req.body.notes,
    });
    res.status(201).json({ success: true, application: app });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create application', details: err.message });
  }
});

apiRouter.patch('/applications/:id', requireUserSession, async (req: Request, res: Response) => {
  try {
    const updated = await applicationService.updateApplication(req.params.id, req.actor!.userId, req.body);
    res.json({ success: true, application: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update application', details: err.message });
  }
});

// ==========================================
// 6. Admin & Sync Endpoints (Protected)
// ==========================================
apiRouter.post('/sync/:source', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const sourceId = req.params.source;
    const params = z.object({
      rows: z.coerce.number().int().min(1).max(100).optional(),
      max_pages: z.coerce.number().int().min(1).max(100).optional(),
      keyword: z.string().trim().max(255).optional(),
      opp_statuses: z.string().trim().max(100).optional(),
      agency: z.string().trim().max(100).optional(),
      funding_category: z.string().trim().max(100).optional(),
      include_details: z.boolean().optional(),
    }).parse(req.body || {});
    const syncResult = await syncEngine.syncSource(sourceId, {
      rows: params.rows,
      maxPages: params.max_pages,
      keyword: params.keyword,
      oppStatuses: params.opp_statuses,
      agency: params.agency,
      fundingCategory: params.funding_category,
      includeDetails: params.include_details,
    });
    res.json({ success: syncResult.status !== 'FAILED', result: syncResult });
  } catch (err: any) {
    const details = err instanceof z.ZodError ? err.flatten() : err.message;
    res.status(err instanceof z.ZodError ? 400 : 500).json({ error: 'Synchronization failed', details });
  }
});

apiRouter.get('/admin/research-queue', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const queue = await programResearchService.getResearchQueue(
      Number.isFinite(limit) ? limit : 100
    );
    res.json({ queue });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch research queue', details: err.message });
  }
});

apiRouter.get('/admin/health', requireAdminAuth, async (_req: Request, res: Response) => {
  try {
    const sources = sourceRegistry.getAll();
    const healthChecks = await Promise.all(
      sources.map(async (src) => {
        const meta = src.getSourceMetadata();
        const health = await src.validateConnection();
        return {
          id: meta.id,
          name: meta.name,
          official: meta.official,
          trust_level: meta.trustLevel,
          health,
        };
      })
    );

    const statsRes = await query(`
      SELECT 
        (SELECT COUNT(*) FROM opportunities WHERE status = 'ACTIVE') AS active_opportunities,
        (SELECT COUNT(*) FROM opportunities WHERE status = 'EXPIRED') AS expired_opportunities,
        (SELECT COUNT(*) FROM sources) AS total_sources,
        (SELECT COUNT(*) FROM applications) AS total_applications,
        (SELECT COUNT(*) FROM sync_runs WHERE status = 'SUCCESS') AS successful_syncs,
        (SELECT COUNT(*) FROM sync_runs WHERE status = 'FAILED') AS failed_syncs;
    `);

    res.json({
      timestamp: new Date().toISOString(),
      stats: statsRes.rows[0],
      source_health: healthChecks,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Admin health check failed', details: err.message });
  }
});

apiRouter.get('/admin/sync-runs', requireAdminAuth, async (_req: Request, res: Response) => {
  try {
    const runs = await query(
      `SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 50;`
    );
    const errors = await query(
      `SELECT * FROM sync_errors ORDER BY created_at DESC LIMIT 50;`
    );
    res.json({ sync_runs: runs.rows, sync_errors: errors.rows });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch sync runs', details: err.message });
  }
});

apiRouter.patch('/admin/sources/:id', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { enabled, discovery_status } = z.object({
      enabled: z.boolean().optional(),
      discovery_status: z.enum([
        'DISCOVERED', 'REVIEW', 'VERIFIED', 'ACTIVE', 'REJECTED', 'DISABLED',
      ]).optional(),
    }).parse(req.body);
    await sourceRegistry.updateSourceStatus(req.params.id, { enabled, discovery_status });
    const source = await sourceRegistry.getDbSourceById(req.params.id);
    if (!source) {
      res.status(404).json({ error: 'Source not found' });
      return;
    }
    res.json({ success: true, source });
  } catch (err: any) {
    const details = err instanceof z.ZodError ? err.flatten() : err.message;
    res.status(err instanceof z.ZodError ? 400 : 500).json({ error: 'Failed to update source status', details });
  }
});

apiRouter.post('/admin/discover-apis', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const parser = new PublicApisDiscoveryParser();
    const input = z.object({
      catalog_source_id: z.enum(['public-api-lists', 'n0shake-public-apis']),
      url: z.string().url().optional(),
    }).parse(req.body || {});
    const catalogUrls: Record<string, string> = {
      'public-api-lists':
        'https://raw.githubusercontent.com/public-api-lists/public-api-lists/master/README.md',
      'n0shake-public-apis':
        'https://raw.githubusercontent.com/n0shake/Public-APIs/master/README.md',
    };
    const outcome = await parser.discoverAndPersist(
      input.catalog_source_id,
      input.url || catalogUrls[input.catalog_source_id]
    );
    const relevant = await query(
      `SELECT * FROM source_candidates
       WHERE catalog_source_id=$1 AND discovery_category <> 'OTHER'
       ORDER BY relevance_score DESC, name ASC LIMIT 100;`,
      [input.catalog_source_id]
    );
    res.json({ ...outcome, candidates: relevant.rows });
  } catch (err: any) {
    const details = err instanceof z.ZodError ? err.flatten() : err.message;
    res.status(err instanceof z.ZodError ? 400 : 500).json({ error: 'Discovery parser execution failed', details });
  }
});

apiRouter.get('/admin/source-candidates', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const status = req.query.status ? String(req.query.status).toUpperCase() : null;
    const category = req.query.category ? String(req.query.category).toUpperCase() : null;
    const result = await query(
      `SELECT * FROM source_candidates
       WHERE ($1::text IS NULL OR lifecycle_status=$1)
         AND ($2::text IS NULL OR discovery_category=$2)
       ORDER BY relevance_score DESC, discovered_at DESC
       LIMIT 250;`,
      [status, category]
    );
    res.json({ candidates: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch source candidates', details: err.message });
  }
});

apiRouter.patch('/admin/source-candidates/:id', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const input = z.object({
      lifecycle_status: z.enum(['REVIEW', 'VERIFIED', 'ACTIVE', 'REJECTED', 'DISABLED']),
      trust_level: z.enum([
        'OFFICIAL_GOVERNMENT', 'OFFICIAL_ORGANIZATION', 'VERIFIED_PARTNER',
        'COMMUNITY', 'UNKNOWN',
      ]).optional(),
      review_notes: z.string().max(4000).optional(),
    }).parse(req.body);
    const current = await query<any>(
      `SELECT * FROM source_candidates WHERE id=$1;`,
      [req.params.id]
    );
    if (!current.rows[0]) {
      res.status(404).json({ error: 'Source candidate not found' });
      return;
    }
    const allowed: Record<string, string[]> = {
      DISCOVERED: ['REVIEW', 'REJECTED'],
      REVIEW: ['VERIFIED', 'REJECTED'],
      VERIFIED: ['ACTIVE', 'DISABLED', 'REVIEW'],
      ACTIVE: ['DISABLED', 'REVIEW'],
      DISABLED: ['REVIEW'],
      REJECTED: ['REVIEW'],
    };
    if (!allowed[current.rows[0].lifecycle_status]?.includes(input.lifecycle_status)) {
      res.status(409).json({ error: `Invalid lifecycle transition from ${current.rows[0].lifecycle_status} to ${input.lifecycle_status}` });
      return;
    }
    if (input.lifecycle_status === 'ACTIVE' && (input.trust_level || current.rows[0].trust_level) === 'UNKNOWN') {
      res.status(409).json({ error: 'An UNKNOWN-trust candidate cannot be activated' });
      return;
    }
    const updated = await query(
      `UPDATE source_candidates SET lifecycle_status=$2,
         trust_level=COALESCE($3, trust_level), review_notes=COALESCE($4, review_notes),
         reviewed_at=CASE WHEN $2 IN ('REVIEW','VERIFIED','ACTIVE') THEN CURRENT_TIMESTAMP ELSE reviewed_at END,
         verified_at=CASE WHEN $2 IN ('VERIFIED','ACTIVE') THEN CURRENT_TIMESTAMP ELSE verified_at END
       WHERE id=$1 RETURNING *;`,
      [req.params.id, input.lifecycle_status, input.trust_level || null, input.review_notes || null]
    );
    res.json({ success: true, candidate: updated.rows[0] });
  } catch (err: any) {
    const details = err instanceof z.ZodError ? err.flatten() : err.message;
    res.status(err instanceof z.ZodError ? 400 : 500).json({ error: 'Failed to update source candidate', details });
  }
});
