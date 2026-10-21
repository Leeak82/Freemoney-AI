import { describe, expect, it } from 'vitest';
import { expiryReason, isExpired, scoreCandidate, queryTokens } from '../src/share/relevance.js';
import { LinkChecker } from '../src/share/link-checker.js';
import { rankAndVerify, curatedAsRaw, honestNotice } from '../src/share/share-search.js';

const okChecker = () => new LinkChecker(async () => ({ status: 200 }));
const raw = (id: string, title: string, description: string, extra: any = {}) => ({
  sourceOpportunityId: id, sourceUrl: `https://www.example.gov/${id}`, title, description,
  agencyOrProvider: 'Agency', detail: { title, description, ...extra },
});

describe('expiry filtering', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  it('drops past deadlines (ISO and MM/DD/YYYY) and keeps future ones', () => {
    expect(isExpired({ id: 'a', title: 'Grant', description: '', deadline: '2026-01-01' }, now)).toBe(true);
    expect(isExpired({ id: 'b', title: 'Grant', description: '', deadline: '09/30/2026' }, now)).toBe(true);
    expect(isExpired({ id: 'c', title: 'Grant', description: '', deadline: '11/19/2026' }, now)).toBe(false);
  });
  it('drops closed status, ended text, and pandemic-era programs', () => {
    expect(isExpired({ id: 'a', title: 'X', description: '', status: 'CLOSED' }, now)).toBe(true);
    expect(isExpired({ id: 'b', title: 'Rent relief', description: 'This program is no longer accepting applications.' }, now)).toBe(true);
    expect(expiryReason({ id: 'c', title: 'COVID-19 funeral assistance', description: 'FEMA funeral help' }, now)).toMatch(/pandemic/);
    expect(isExpired({ id: 'd', title: 'SNAP', description: 'Food benefits' }, now)).toBe(false);
  });
});

describe('relevance', () => {
  const q = { categories: ['rent-housing', 'utilities'], tokens: queryTokens('help paying rent and utilities') };
  it('never returns funeral or burial aid for a rent search', () => {
    expect(scoreCandidate({ id: 'f', title: 'Burial benefits', description: 'Help with rent and funeral costs' }, q)).toBeNull();
    expect(scoreCandidate({ id: 'g', title: 'Veterans burial allowance', description: '' }, q)).toBeNull();
  });
  it('does not substring-match (parents is not rent)', () => {
    expect(scoreCandidate({ id: 'p', title: 'Retirement benefits for parents', description: '' }, q)).toBeNull();
  });
  it('matches on-topic programs', () => {
    expect(scoreCandidate({ id: 'h', title: 'Housing choice voucher (Section 8)', description: 'Help paying rent' }, q)?.score).toBeGreaterThanOrEqual(50);
  });
  it('allows funeral programs only when asked for', () => {
    const fq = { categories: [], tokens: queryTokens('help with funeral costs') };
    expect(scoreCandidate({ id: 'b', title: 'Burial benefits', description: 'Funeral costs' }, fq)).not.toBeNull();
  });

  it('end-to-end: rent query with the real-world feed mix returns only rent/utility items, COVID funeral gone', async () => {
    const feed = [
      raw('covid', 'COVID-19 funeral assistance', 'FEMA funeral costs'),
      raw('burial', 'Burial benefits', 'Burial'),
      raw('ret', 'Retirement benefits for parents', 'Monthly payments'),
      raw('s8', 'Housing choice voucher (Section 8)', 'Help paying rent'),
      raw('msp', 'Medicare Savings Programs (MSP)', 'Help paying Medicare costs'),
    ];
    const { results, dropped } = await rankAndVerify(
      [{ sourceKey: 'curated', items: curatedAsRaw() }, { sourceKey: 'usa-gov-benefits', items: feed }],
      { ...q, limit: 20 }, okChecker(), new Date('2026-10-21'));
    const titles = results.map((r) => r.raw.title);
    expect(titles).toContain('Housing choice voucher (Section 8)');
    expect(titles.some((t) => /funeral|burial|retirement|medicare/i.test(t!))).toBe(false);
    expect(results.length).toBeLessThan(20);
    expect(dropped.expired).toBeGreaterThanOrEqual(1);
    for (const r of results) expect(r.matched_categories.some((c) => ['rent-housing', 'utilities'].includes(c))).toBe(true);
  });

  it('is honest when nothing matches and points to official resources', async () => {
    const { results } = await rankAndVerify([{ sourceKey: 'curated', items: curatedAsRaw() }],
      { categories: [], tokens: queryTokens('xylophone repair'), limit: 20 }, okChecker());
    expect(results).toHaveLength(0);
    const n = honestNotice(0, { categories: [] });
    expect(n.notice).toMatch(/No current official program/);
    expect(n.fallback_resources.map((r) => r.url)).toContain('https://www.211.org/');
  });
});

describe('dead-link handling', () => {
  it('classifies 404/410 as dead, 403 as unverified, 200 as ok, and caches', async () => {
    let calls = 0;
    const checker = new LinkChecker(async (url) => {
      calls++;
      return { status: url.includes('gone') ? 404 : url.includes('blocked') ? 403 : url.includes('removed') ? 410 : 200 };
    });
    expect((await checker.check('https://a.gov/gone')).state).toBe('DEAD');
    expect((await checker.check('https://a.gov/removed')).state).toBe('DEAD');
    expect((await checker.check('https://a.gov/blocked')).state).toBe('UNVERIFIED');
    expect((await checker.check('https://a.gov/fine')).state).toBe('OK');
    const before = calls;
    await checker.check('https://a.gov/fine');
    expect(calls).toBe(before);
  });
  it('treats DNS failure as dead and timeouts as unverified', async () => {
    const dns = new LinkChecker(async () => { const e: any = new Error('x'); e.cause = { code: 'ENOTFOUND' }; throw e; });
    expect((await dns.check('https://nope.invalid')).state).toBe('DEAD');
    const slow = new LinkChecker(async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); });
    expect((await slow.check('https://slow.gov')).state).toBe('UNVERIFIED');
  });
  it('hides programs whose links are dead', async () => {
    const checker = new LinkChecker(async (url) => ({ status: url.includes('dead') ? 404 : 200 }));
    const items = [raw('dead-rent', 'Rental assistance program', 'Help paying rent'), raw('live-rent', 'Rent help program', 'Help paying rent')];
    const { results, dropped } = await rankAndVerify([{ sourceKey: 'usa-gov-benefits', items }],
      { categories: ['rent-housing'], tokens: ['rent'], limit: 10 }, checker);
    expect(results.map((r) => r.raw.sourceOpportunityId)).toEqual(['live-rent']);
    expect(dropped.deadLinks).toBe(1);
  });
});
