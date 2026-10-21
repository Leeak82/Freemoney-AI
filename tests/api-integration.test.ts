import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedDatabase } from '../src/db/seed.js';
import { query, closePool } from '../src/db/index.js';
import { syncEngine } from '../src/sources/sync-engine.js';
import { config } from '../src/config/index.js';
import express from 'express';

describe('FreeMoney-AI Full REST API Suite', () => {
  // Private routes require a guest session; attach one to every request like the browser does.
  let guestToken = '';
  const app = express()
    .use((req, _res, next) => {
      if (!req.headers.authorization && guestToken && req.path !== '/api/session/guest') {
        req.headers.authorization = `Bearer ${guestToken}`;
      }
      next();
    })
    .use(createApp());

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    const session = await request(app).post('/api/session/guest');
    guestToken = session.body.token;
    const result = await syncEngine.syncSource('grants-gov', {
      rows: 3,
      maxPages: 1,
      includeDetails: true,
    });
    expect(result.status).not.toBe('FAILED');
    expect(result.fetched).toBeGreaterThan(0);
  }, 30_000);

  afterAll(async () => {
    await closePool();
  });

  it('GET /api/categories returns all standard assistance categories', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body.categories).toBeDefined();
    expect(res.body.categories.length).toBeGreaterThanOrEqual(15);
  });

  it('GET /api/sources returns registered sources with trust ratings', async () => {
    const res = await request(app).get('/api/sources');
    expect(res.status).toBe(200);
    expect(res.body.sources.length).toBeGreaterThanOrEqual(4);
    const grantsGov = res.body.sources.find((s: any) => s.id === 'grants-gov');
    expect(grantsGov).toBeDefined();
    expect(grantsGov.trust_level).toBe('OFFICIAL_GOVERNMENT');
  });

  it('POST /api/search performs multi-category and keyword query', async () => {
    const res = await request(app)
      .post('/api/search')
      .send({
        keyword: '',
        limit: 10,
      });

    expect(res.status).toBe(200);
    expect(res.body.results).toBeDefined();
    expect(Array.isArray(res.body.results)).toBe(true);

    if (res.body.results.length > 0) {
      const first = res.body.results[0];
      expect(first.opportunity.source_id).toBeDefined();
      expect(first.source_provenance).toBeDefined();
      expect(first.source_provenance.source_name).toBeDefined();
    }
  });

  it('POST /api/profile saves optional profile and GET /api/profile retrieves it', async () => {
    const testUserId = '00000000-0000-4000-8000-000000000011';
    const profilePayload = {
      user_id: testUserId,
      state: 'OH',
      zip_code: '43215',
      is_veteran: true,
      income_range: '25k-50k',
    };

    const postRes = await request(app)
      .post('/api/profile')
      .send(profilePayload);
    expect(postRes.status).toBe(200);
    expect(postRes.body.success).toBe(true);
    expect(postRes.body.profile.state).toBe('OH');

    const getRes = await request(app)
      .get(`/api/profile?user_id=${testUserId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.profile.is_veteran).toBe(true);
  });

  it('POST /api/applications creates an application with dynamic document checklist', async () => {
    // Search to get an opportunity ID
    const searchRes = await request(app).post('/api/search').send({ limit: 1 });
    if (searchRes.body.results.length > 0) {
      const oppId = searchRes.body.results[0].opportunity.id;
      const testUserId = '00000000-0000-4000-8000-000000000099';

      // Clean any pre-existing test app for idempotency
      await query(`DELETE FROM applications WHERE user_id = $1;`, [testUserId]);

      const appRes = await request(app)
        .post('/api/applications')
        .send({
          user_id: testUserId,
          opportunity_id: oppId,
          notes: 'Preparing grant application for Q3 submission.',
        });

      expect(appRes.status).toBe(201);
      expect(appRes.body.application.status).toBe('DISCOVERED');
      expect(appRes.body.application.checklist).toBeDefined();
      // Checklists only contain source-verified documents, so they may be empty.
      expect(Array.isArray(appRes.body.application.checklist)).toBe(true);

      const appId = appRes.body.application.id;

      // Update status
      const patchRes = await request(app)
        .patch(`/api/applications/${appId}`)
        .send({
          status: 'READY_FOR_REVIEW',
          userApproved: true,
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.application.status).toBe('READY_FOR_REVIEW');
    }
  });

  it('supports the business startup wizard, LLC checklist, and unified search', async () => {
    const testUserId = '00000000-0000-4000-8000-000000000199';
    await query(`DELETE FROM users WHERE id = $1;`, [testUserId]);

    const businessRes = await request(app)
      .post('/api/businesses')
      .send({
        user_id: testUserId,
        business_description: 'A mobile equipment repair business',
        industry: 'Equipment repair',
        business_stage: 'IDEA',
        country: 'US',
        state: 'OH',
        business_structure: 'LLC',
        funding_needed: 25000,
        funding_purpose: 'EQUIPMENT',
        veteran_owned: true,
      });

    expect(businessRes.status).toBe(201);
    expect(businessRes.body.business.business_stage).toBe('IDEA');
    expect(businessRes.body.startupChecklist.items.length).toBeGreaterThan(5);
    expect(businessRes.body.llcChecklist.items.length).toBeGreaterThan(5);
    const businessId = businessRes.body.business.business_id;

    const item = businessRes.body.startupChecklist.items[0];
    const checklistRes = await request(app)
      .patch(`/api/businesses/${businessId}/checklists/items/${item.id}`)
      .send({ status: 'COMPLETED' });
    expect(checklistRes.status).toBe(200);
    expect(checklistRes.body.item.status).toBe('COMPLETED');
    expect(checklistRes.body.item.completion_source).toBe('USER');

    const formationRes = await request(app)
      .post('/api/business/formation-guidance')
      .send({ countryCode: 'US', state: 'OH', structure: 'LLC' });
    expect(formationRes.status).toBe(200);
    expect(formationRes.body.guidance.supported).toBe(false);
    expect(formationRes.body.guidance.missingInformation.length).toBeGreaterThan(0);

    const searchRes = await request(app)
      .post('/api/business/search')
      .send({ business_id: businessId, limit: 10 });
    expect(searchRes.status).toBe(200);
    expect(Array.isArray(searchRes.body.results)).toBe(true);
  });

  it('completes a real Grants.gov sync-to-search provenance flow', async () => {
    const stored = await query<any>(
      `SELECT * FROM opportunities
       WHERE source_id='grants-gov' AND description <> ''
       ORDER BY updated_at DESC LIMIT 1;`
    );
    expect(stored.rows.length).toBe(1);
    const opportunity = stored.rows[0];
    expect(opportunity.source_opportunity_id).toBeTruthy();
    expect(opportunity.raw_source_identifier).toBe(opportunity.source_opportunity_id);
    expect(opportunity.source_provider).toBeTruthy();
    expect(opportunity.source_url).toContain('grants.gov/search-results-detail/');
    expect(opportunity.official_source).toBe(true);
    expect(opportunity.location_scope).toBe('UNKNOWN');
    expect(opportunity.source_metadata?.opportunityNumber).toBeTruthy();

    const searchRes = await request(app)
      .post('/api/search')
      .send({
        category: opportunity.category,
        keyword: opportunity.title,
        state: 'OH',
        official_only: true,
        limit: 10,
      });
    expect(searchRes.status).toBe(200);
    const match = searchRes.body.results.find(
      (item: any) => item.opportunity.id === opportunity.id
    );
    expect(match).toBeDefined();
    expect(match.geographic_match.level).toBe('UNKNOWN');
    expect(match.source_provenance.source_opportunity_id).toBe(
      opportunity.source_opportunity_id
    );

    const detailRes = await request(app).get(`/api/opportunities/${opportunity.id}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.opportunity.description.length).toBeGreaterThan(0);
    expect(detailRes.body.source_provenance.source_url).toBe(opportunity.source_url);
    if (detailRes.body.opportunity.application_url) {
      expect(['OFFICIAL_APPLICATION', 'THIRD_PARTY']).toContain(
        detailRes.body.opportunity.application_url_type
      );
      const officialLinks = (detailRes.body.application_links || []).filter(
        (link: any) => link.official
      );
      if (detailRes.body.opportunity.application_url_verified) {
        expect(officialLinks.length).toBeGreaterThan(0);
      }
    }

    const before = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM opportunities WHERE source_id='grants-gov';`
    );
    const repeat = await syncEngine.syncSource('grants-gov', {
      opportunityNumber: opportunity.source_metadata.opportunityNumber,
      rows: 1,
      maxPages: 1,
      includeDetails: false,
    });
    expect(repeat.status).not.toBe('FAILED');
    const after = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM opportunities WHERE source_id='grants-gov';`
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);
    const preserved = await query<{ description: string }>(
      `SELECT description FROM opportunities WHERE id=$1;`,
      [opportunity.id]
    );
    expect(preserved.rows[0].description).toBe(opportunity.description);
  }, 30_000);

  it('imports official USA.gov benefits without assuming record status', async () => {
    const sync = await syncEngine.syncSource('usa-gov-benefits', {
      rows: 100,
      maxPages: 1,
    });
    expect(sync.status).toBe('SUCCESS');
    expect(sync.fetched).toBeGreaterThan(0);

    const stored = await query<any>(
      `SELECT * FROM opportunities
       WHERE source_id='usa-gov-benefits'
       ORDER BY title LIMIT 1;`
    );
    expect(stored.rows.length).toBe(1);
    const benefit = stored.rows[0];
    expect(benefit.status).toBe('UNKNOWN');
    expect(benefit.active).toBe(false);
    expect(benefit.location_scope).toBe('UNKNOWN');
    expect(benefit.application_url).toBeNull();
    expect(benefit.required_documents).toEqual([]);
    expect(benefit.source_url).toMatch(/^https:\/\/.+\.(gov|mil)\//);

    const searchRes = await request(app)
      .post('/api/search')
      .send({
        source_id: 'usa-gov-benefits',
        keyword: benefit.title,
        active_only: false,
        limit: 10,
      });
    expect(searchRes.status).toBe(200);
    const match = searchRes.body.results.find(
      (item: any) => item.opportunity.id === benefit.id
    );
    expect(match).toBeDefined();
    expect(match.opportunity.status).toBe('UNKNOWN');
    expect(match.source_provenance.source_name).toBe('USA.gov Benefit Finder');
  }, 30_000);

  it('POST /api/sync/grants-gov requires admin authentication', async () => {
    const unauthRes = await request(app)
      .post('/api/sync/grants-gov')
      .send({ rows: 5 });
    expect(unauthRes.status).toBe(401);

    const authRes = await request(app)
      .post('/api/sync/grants-gov')
      .set('X-Admin-Key', config.ADMIN_API_KEY)
      .send({ rows: 1, max_pages: 1, include_details: false });
    expect(authRes.status).toBe(200);
    expect(authRes.body.success).toBe(true);
  }, 15_000);
});
