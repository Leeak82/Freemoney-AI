import { describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';

process.env.SHARE_MODE = 'true';
const { createApp } = await import('../src/index.js');
const { linkChecker } = await import('../src/share/link-checker.js');

describe('Find Assistance form (share mode)', () => {
  const app = createApp();
  beforeAll(() => {
    // Keep tests offline: every link "works".
    (linkChecker as any).fetcher = async () => ({ status: 200 });
  });

  const form = (extra: any) => ({
    categories: ['education-scholarships'],
    keyword: undefined, state: undefined, county: undefined, city: undefined, zip: undefined,
    location_scope: undefined, intent: 'PERSONAL_ASSISTANCE', ...extra,
  });

  it.each([
    ['education, everything empty', form({})],
    ['education, nationwide', form({ location_scope: 'NATIONWIDE' })],
    ['education with state + zip + text', form({ keyword: 'college', state: 'OH', zip: '43215', city: 'Columbus' })],
    ['no category at all', form({ categories: undefined })],
    ['utilities in Texas', form({ categories: ['utilities'], state: 'TX' })],
  ])('%s returns JSON', async (_name, payload) => {
    const res = await request(app).post('/api/search').send(payload);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(Array.isArray(res.body.results)).toBe(true);
    if (res.body.results.length === 0) expect(res.body.notice).toBeTruthy();
  }, 30_000);

  it('education results never include WIC (nutrition education is not education aid)', async () => {
    const res = await request(app).post('/api/search').send(form({}));
    expect(res.body.results.map((r: any) => r.opportunity.title).join('|')).not.toMatch(/WIC/);
  }, 30_000);

  it('malformed JSON and unknown API routes still return JSON', async () => {
    const bad = await request(app).post('/api/search').set('Content-Type', 'application/json').send('{bad');
    expect(bad.status).toBe(400);
    expect(bad.headers['content-type']).toMatch(/json/);
    const missing = await request(app).get('/api/nope');
    expect(missing.status).toBe(404);
    expect(missing.headers['content-type']).toMatch(/json/);
  });

  it('guest session and case work without any database in share mode', async () => {
    const res = await request(app).post('/api/session/guest');
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    const c = await request(app).post('/api/cases').set('Authorization', `Bearer ${res.body.token}`).send({ title: 'x' });
    expect(c.status).toBe(201);
    expect(c.body.case.id).toBeTruthy();
  }, 30_000);
});
