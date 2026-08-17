import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedDatabase } from '../src/db/seed.js';
import { query, closePool } from '../src/db/index.js';
import { syncEngine } from '../src/sources/sync-engine.js';

describe('FreeMoney-AI Full REST API Suite', () => {
  const app = createApp();

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    // Ingest sample batch from real Grants.gov API or fallback
    try {
      await syncEngine.syncSource('grants-gov', { rows: 5 });
    } catch (e) {
      console.warn('Live Grants.gov sync notice in test suite:', e);
    }
  });

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
    const testUserId = '00000000-0000-0000-0000-000000000001';
    const profilePayload = {
      user_id: testUserId,
      state: 'WA',
      zip_code: '98402',
      is_veteran: true,
      income_range: '25k-50k',
    };

    const postRes = await request(app)
      .post('/api/profile')
      .send(profilePayload);
    expect(postRes.status).toBe(200);
    expect(postRes.body.success).toBe(true);
    expect(postRes.body.profile.state).toBe('WA');

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
      const testUserId = '00000000-0000-0000-0000-000000000099';

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
      expect(appRes.body.application.checklist.length).toBeGreaterThan(0);

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

  it('POST /api/sync/grants-gov requires admin authentication', async () => {
    const unauthRes = await request(app)
      .post('/api/sync/grants-gov')
      .send({ rows: 5 });
    expect(unauthRes.status).toBe(401);

    const authRes = await request(app)
      .post('/api/sync/grants-gov')
      .set('X-Admin-Key', 'test-admin-secret-key')
      .send({ rows: 5 });
    expect(authRes.status).toBe(200);
    expect(authRes.body.success).toBe(true);
  });
});
