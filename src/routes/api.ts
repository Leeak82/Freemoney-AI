import { Router, Request, Response } from 'express';
import { query } from '../db/index.js';
import { searchEngine } from '../search/search-engine.js';
import { sourceRegistry } from '../sources/registry.js';
import { syncEngine } from '../sources/sync-engine.js';
import { profileService } from '../services/profile-service.js';
import { applicationService } from '../services/application-service.js';
import { requireAdminAuth } from '../middleware/auth.js';
import { PublicApisDiscoveryParser } from '../sources/discovery.js';
import { businessService } from '../services/business-service.js';
import { businessProviderRegistry } from '../business/providers.js';
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
    const { category, keyword, state, official_only, limit, offset } = req.query;
    const searchResult = await searchEngine.search({
      category: category as string,
      keyword: keyword as string,
      state: state as string,
      official_only: official_only === 'true',
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

apiRouter.get('/opportunities/:id', async (req: Request, res: Response) => {
  try {
    const result = await searchEngine.getOpportunityById(req.params.id);
    if (!result) {
      res.status(404).json({ error: 'Opportunity not found' });
      return;
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch opportunity detail', details: err.message });
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
apiRouter.get('/profile', async (req: Request, res: Response) => {
  try {
    const userId = (req.headers['x-user-id'] as string) || (req.query.user_id as string) || '00000000-0000-4000-8000-000000000001';
    const profile = await profileService.getProfile(userId);
    res.json({ profile: profile || null });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch profile', details: err.message });
  }
});

apiRouter.post('/profile', async (req: Request, res: Response) => {
  try {
    const userId = req.body.user_id || (req.headers['x-user-id'] as string) || '00000000-0000-4000-8000-000000000001';
    const profile = await profileService.upsertProfile(userId, req.body);
    res.json({ success: true, profile });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save profile', details: err.message });
  }
});

// ==========================================
// 5. Business Startup, Formation & Requirements
// ==========================================
apiRouter.get('/businesses', async (req: Request, res: Response) => {
  try {
    const userId =
      (req.headers['x-user-id'] as string) ||
      (req.query.user_id as string) ||
      '00000000-0000-4000-8000-000000000001';
    const businesses = await businessService.getBusinesses(userId);
    res.json({ businesses });
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to fetch businesses', details: err.message });
  }
});

apiRouter.post('/businesses', async (req: Request, res: Response) => {
  try {
    const userId =
      req.body.user_id ||
      (req.headers['x-user-id'] as string) ||
      '00000000-0000-4000-8000-000000000001';
    const parsed = businessProfileSchema.parse(req.body);
    const result = await businessService.upsertBusiness(userId, parsed);
    res.status(201).json({ success: true, ...result });
  } catch (err: any) {
    const details = err instanceof z.ZodError ? err.flatten() : err.message;
    res.status(400).json({ error: 'Failed to save business profile', details });
  }
});

apiRouter.get('/businesses/:id', async (req: Request, res: Response) => {
  try {
    const business = await businessService.getBusiness(req.params.id);
    if (!business) {
      res.status(404).json({ error: 'Business not found' });
      return;
    }
    const checklists = await businessService.getChecklists(req.params.id);
    res.json({ business, checklists });
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to fetch business', details: err.message });
  }
});

apiRouter.get('/businesses/:id/checklists', async (req: Request, res: Response) => {
  try {
    const checklists = await businessService.getChecklists(req.params.id);
    res.json({ checklists });
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to fetch checklists', details: err.message });
  }
});

apiRouter.patch(
  '/businesses/:businessId/checklists/items/:itemId',
  async (req: Request, res: Response) => {
    try {
      const status = z
        .enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'])
        .parse(req.body.status);
      const item = await businessService.updateChecklistItem(
        req.params.businessId,
        req.params.itemId,
        status
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

apiRouter.post('/business/search', async (req: Request, res: Response) => {
  try {
    const businessId = z.string().uuid().parse(req.body.business_id);
    const profile = await businessService.getBusiness(businessId);
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
apiRouter.get('/applications', async (req: Request, res: Response) => {
  try {
    const userId = (req.headers['x-user-id'] as string) || (req.query.user_id as string) || '00000000-0000-4000-8000-000000000001';
    const apps = await applicationService.getUserApplications(userId);
    res.json({ applications: apps });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch applications', details: err.message });
  }
});

apiRouter.get('/applications/:id', async (req: Request, res: Response) => {
  try {
    const app = await applicationService.getApplicationById(req.params.id);
    if (!app) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }
    res.json({ application: app });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch application', details: err.message });
  }
});

apiRouter.post('/applications', async (req: Request, res: Response) => {
  try {
    const userId = req.body.user_id || (req.headers['x-user-id'] as string) || '00000000-0000-4000-8000-000000000001';
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

apiRouter.patch('/applications/:id', async (req: Request, res: Response) => {
  try {
    const updated = await applicationService.updateApplication(req.params.id, req.body);
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
    const rows = req.body.rows ? parseInt(req.body.rows, 10) : 50;
    const keyword = req.body.keyword || '';

    const syncResult = await syncEngine.syncSource(sourceId, { rows, keyword });
    res.json({ success: syncResult.status === 'SUCCESS', result: syncResult });
  } catch (err: any) {
    res.status(500).json({ error: 'Synchronization failed', details: err.message });
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
        (SELECT COUNT(*) FROM opportunities WHERE active = true) AS active_opportunities,
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
    const { enabled, discovery_status } = req.body;
    await sourceRegistry.updateSourceStatus(req.params.id, { enabled, discovery_status });
    res.json({ success: true, message: `Source ${req.params.id} status updated.` });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update source status', details: err.message });
  }
});

apiRouter.post('/admin/discover-apis', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const parser = new PublicApisDiscoveryParser();
    const url =
      req.body.url ||
      'https://raw.githubusercontent.com/public-apis/public-apis/master/README.md';

    const candidates = await parser.fetchAndDiscover(url);
    const assistanceCandidates = candidates.filter(
      (c) => c.classifiedCategory !== 'OTHER' || c.trustLevel === 'OFFICIAL_GOVERNMENT'
    );

    res.json({
      total_found: candidates.length,
      assistance_relevant: assistanceCandidates.length,
      candidates: assistanceCandidates.slice(0, 100),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Discovery parser execution failed', details: err.message });
  }
});
