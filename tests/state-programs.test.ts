import { describe, expect, it } from 'vitest';
import { detectState } from '../src/share/state-detect.js';
import { STATE_PROGRAMS } from '../src/share/state-programs.js';
import { LinkChecker } from '../src/share/link-checker.js';
import { curatedAsRaw, rankAndVerify, stateProgramsAsRaw } from '../src/share/share-search.js';
import { queryTokens } from '../src/share/relevance.js';
import { naturalLanguageSearchParser } from '../src/search/natural-language-parser.js';

const okChecker = () => new LinkChecker(async () => ({ status: 200 }));

describe('state detection', () => {
  it.each([
    ['utility help in Ohio', 'OH'],
    ['rent help Texas', 'TX'],
    ['food stamps CA', 'CA'],
    ['heating bill help New York', 'NY'],
    ['help paying rent in Florida', 'FL'],
    ['food help in West Virginia', 'WV'],
    ['rent help in Virginia', 'VA'],
    ['utilities Washington DC', 'DC'],
    ['rent help Washington state', 'WA'],
    ['need help in OH', 'OH'],
    ['Springfield, IL rent help', 'IL'],
    ['rent help tx', 'TX'],
    ['Kansas heating help', 'KS'],
    ['Arkansas heating help', 'AR'],
  ])('%s -> %s', (text, code) => expect(detectState(text)).toBe(code));

  it.each([
    'help me pay rent',
    'I need help paying my bills or rent',
    'is it ok to ask for food help',
    'oh no my power is getting shut off',
    'hi I need utility help',
    'help with rent in me',
    'rent help in a hurry',
    'I am a veteran and need help',
    'pay my la rent',
  ])('no false state in "%s"', (text) => expect(detectState(text)).toBeUndefined());

  it('the natural-language parser uses the safe detector', () => {
    expect(naturalLanguageSearchParser.parse('help with rent in me').search.state).toBeUndefined();
    expect(naturalLanguageSearchParser.parse('utility help in Ohio').search.state).toBe('OH');
  });
});

describe('state program data', () => {
  const codes = [...new Set(STATE_PROGRAMS.map((p) => p.state))];
  it('covers all 50 states + DC with energy, housing, SNAP, and 211 entries', () => {
    expect(codes).toHaveLength(51);
    for (const code of codes) {
      const kinds = STATE_PROGRAMS.filter((p) => p.state === code).map((p) => p.kind).sort();
      expect(kinds).toEqual(['211', 'energy', 'housing', 'snap']);
    }
  });
  it('every entry has an https/http URL, a source URL, and a last-verified date', () => {
    for (const p of STATE_PROGRAMS) {
      expect(p.url).toMatch(/^https?:\/\//);
      expect(p.sourceUrl).toMatch(/^https?:\/\//);
      expect(p.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
  it('contains no ended pandemic programs', () => {
    for (const p of STATE_PROGRAMS) expect(`${p.title} ${p.description}`).not.toMatch(/covid|pandemic|emergency rental assistance/i);
  });
});

describe('state-ranked search', () => {
  const run = async (text: string) => {
    const parsed = naturalLanguageSearchParser.parse(text);
    const state = parsed.search.state;
    return rankAndVerify(
      [{ sourceKey: 'state', items: stateProgramsAsRaw(state) }, { sourceKey: 'curated', items: curatedAsRaw() }],
      { categories: parsed.search.categories || [], tokens: queryTokens(text), state, limit: 20 },
      okChecker(),
    );
  };

  it('Ohio utility query returns the Ohio LIHEAP office first', async () => {
    const { results } = await run('utility help in Ohio');
    expect(results[0].raw.sourceOpportunityId).toBe('state-OH-energy');
    expect(results[0].raw.sourceUrl).toMatch(/ohio\.gov/);
  });

  it('never leaks other states\' programs', async () => {
    for (const text of ['utility help in Ohio', 'rent help Texas', 'food stamps CA']) {
      const { results } = await run(text);
      const code = naturalLanguageSearchParser.parse(text).search.state;
      for (const r of results) {
        const states: string[] = r.raw.detail?.states || [];
        if (states.length) expect(states).toEqual([code]);
      }
    }
  });

  it('drops grants that name a different state', async () => {
    const grant = { sourceOpportunityId: 'g1', sourceUrl: 'https://www.grants.gov/x', title: 'Kansas rental housing assistance', description: 'rent help', detail: {} };
    const { results, dropped } = await rankAndVerify([{ sourceKey: 'grants-gov', items: [grant] }],
      { categories: ['rent-housing'], tokens: ['rent'], state: 'TX', limit: 10 }, okChecker());
    expect(results).toHaveLength(0);
    expect(dropped.otherState).toBe(1);
  });

  it('shows no state programs when no state is known', async () => {
    const { results } = await run('help paying rent and utilities');
    expect(results.some((r) => r.sourceKey === 'state')).toBe(false);
    expect(results.length).toBeGreaterThan(0);
  });

  it('keeps honest no-match behavior with a state', async () => {
    const { results } = await run('xylophone lessons in Ohio');
    expect(results).toHaveLength(0);
  });
});

describe('firewall-aware dead link check', () => {
  it('does not mark a page dead when the whole site returns 404 to servers', async () => {
    const checker = new LinkChecker(async () => ({ status: 404 }));
    expect((await checker.check('https://jfs.ohio.gov/some/page')).state).toBe('UNVERIFIED');
  });
});
