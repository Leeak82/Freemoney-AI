import { CURATED_PROGRAMS, FALLBACK_RESOURCES } from './curated-programs.js';
import { Candidate, MIN_SCORE, expiryReason, normalizeCategories, scoreCandidate } from './relevance.js';
import { LinkChecker, LinkResult } from './link-checker.js';
import { STATE_NAMES, stateName } from './state-detect.js';
import { STATE_KIND_CATEGORIES, STATE_PROGRAMS } from './state-programs.js';

/** Official programs for ONE state only; other states' programs are never returned. */
export function stateProgramsAsRaw(state?: string): RawLike[] {
  if (!state) return [];
  return STATE_PROGRAMS.filter((p) => p.state === state.toUpperCase()).map((p) => ({
    sourceOpportunityId: `state-${p.state}-${p.kind}`,
    sourceOpportunityNumber: `state-${p.state}-${p.kind}`,
    sourceUrl: p.url,
    title: p.title,
    description: p.description,
    agencyOrProvider: p.provider,
    oppStatus: 'active',
    detail: {
      title: p.title,
      description: p.phone ? `${p.description} Phone: ${p.phone}.` : p.description,
      providerName: p.provider,
      sourceUrl: p.url,
      applicationUrl: p.url,
      applicationUrlType: 'OFFICIAL_STATE_PROGRAM',
      applicationUrlVerified: true,
      category: STATE_KIND_CATEGORIES[p.kind][0],
      subcategories: STATE_KIND_CATEGORIES[p.kind],
      audiences: ['INDIVIDUAL'],
      locationScope: 'STATE',
      countryCode: 'US',
      states: [p.state],
      status: 'ACTIVE',
      contactInfo: p.phone ? { phone: p.phone } : null,
      sourceMetadata: { curated: true, stateProgram: true, kind: p.kind, phone: p.phone, directorySource: p.sourceUrl, lastVerified: p.lastVerified },
    },
  }));
}

/** Returns the state a title is specifically about, if any (e.g. "State of Kansas Network"). */
function titleState(title: string): string | undefined {
  for (const [code, name] of Object.entries(STATE_NAMES).sort((a, b) => b[1].length - a[1].length)) {
    if (new RegExp(`\\b${name.replace(/ /g, '\\s+')}\\b`, 'i').test(title)) {
      if (code === 'VA' && /west\s+virginia/i.test(title)) continue;
      if (code === 'WA' && /washington,?\s*d\.?c/i.test(title)) return 'DC';
      return code;
    }
  }
  return undefined;
}

export interface RawLike {
  sourceOpportunityId: string;
  sourceUrl?: string;
  title?: string;
  description?: string;
  agencyOrProvider?: string;
  closeDate?: string;
  oppStatus?: string;
  detail?: any;
  [k: string]: any;
}

export interface RankedRaw {
  raw: RawLike;
  sourceKey: 'usa-gov-benefits' | 'grants-gov' | 'curated' | 'state';
  score: number;
  reasons: string[];
  matched_categories: string[];
  link: LinkResult | null;
}

export interface RankInput {
  categories: string[];
  tokens: string[];
  audiences?: string[];
  state?: string;
  limit: number;
}

export function curatedAsRaw(): RawLike[] {
  return CURATED_PROGRAMS.map((p) => ({
    sourceOpportunityId: p.id,
    sourceOpportunityNumber: p.id,
    sourceUrl: p.url,
    title: p.title,
    description: p.description,
    agencyOrProvider: p.provider,
    oppStatus: 'active',
    detail: {
      title: p.title,
      description: p.description,
      providerName: p.provider,
      sourceUrl: p.url,
      applicationUrl: p.url,
      applicationUrlType: 'OFFICIAL_PROGRAM_PAGE',
      applicationUrlVerified: true,
      category: p.categories[0],
      subcategories: p.categories,
      audiences: p.audiences || ['INDIVIDUAL'],
      locationScope: 'NATIONWIDE',
      countryCode: 'US',
      status: 'ACTIVE',
      sourceMetadata: { curated: true, stateLookupUrl: p.stateLookupUrl || null },
    },
  }));
}

function toCandidate(raw: RawLike): Candidate {
  const d = raw.detail || {};
  return {
    id: raw.sourceOpportunityId,
    title: d.title || raw.title || '',
    description: [d.description || raw.description || '', d.eligibilitySummary || ''].join(' '),
    provider: d.providerName || raw.agencyOrProvider,
    url: d.applicationUrl || d.sourceUrl || raw.sourceUrl,
    categories: d.sourceMetadata?.curated ? d.subcategories : [],
    audiences: d.audiences || [],
    deadline: d.deadline || raw.closeDate || null,
    status: d.status || raw.oppStatus || null,
  };
}

/**
 * Drops expired/ended programs and off-topic results, ranks by match strength,
 * hides dead links, and returns at most `limit` strong matches (never padded).
 */
export async function rankAndVerify(
  pools: Array<{ sourceKey: RankedRaw['sourceKey']; items: RawLike[] }>,
  q: RankInput,
  checker: LinkChecker,
  now = new Date(),
): Promise<{ results: RankedRaw[]; dropped: { expired: number; offTopic: number; deadLinks: number; otherState: number } }> {
  const dropped = { expired: 0, offTopic: 0, deadLinks: 0, otherState: 0 };
  const scored: RankedRaw[] = [];
  const seenUrlTitle = new Set<string>();
  for (const pool of pools) {
    for (const raw of pool.items) {
      const c = toCandidate(raw);
      if (expiryReason(c, now)) { dropped.expired++; continue; }
      const itemStates: string[] = raw.detail?.states || [];
      const namedState = pool.sourceKey === 'state' ? itemStates[0] : titleState(c.title);
      if (namedState && namedState !== q.state) { dropped.otherState++; continue; }
      const s = scoreCandidate(c, { categories: q.categories, tokens: q.tokens, audiences: q.audiences });
      if (!s || s.score < MIN_SCORE) { dropped.offTopic++; continue; }
      const key = `${(c.url || '').toLowerCase()}|${c.title.toLowerCase()}`;
      if (seenUrlTitle.has(key)) continue;
      seenUrlTitle.add(key);
      let score = s.score;
      if (pool.sourceKey === 'curated') score += 5; // evergreen, directly applicable programs
      // The person's own state office is the most actionable result: rank above national programs.
      if (pool.sourceKey === 'state') score += raw.detail?.sourceMetadata?.kind === '211' ? 15 : 30;
      else if (q.state && namedState === q.state) score += 10;
      scored.push({ raw, sourceKey: pool.sourceKey, score, reasons: s.reasons, matched_categories: s.matched_categories, link: null });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  // Check links for a few more than needed so dead ones can be replaced.
  const window = scored.slice(0, Math.max(q.limit * 2, 10));
  const links = await checker.checkAll(window.map((r) => toCandidate(r.raw).url || ''));
  const results: RankedRaw[] = [];
  for (const r of window) {
    const link = links.get(toCandidate(r.raw).url || '') || null;
    if (link?.state === 'DEAD') { dropped.deadLinks++; continue; }
    if (link?.state === 'UNVERIFIED' && r.sourceKey !== 'state') r.score = Math.max(0, r.score - 10);
    r.link = link;
    results.push(r);
  }
  results.sort((a, b) => b.score - a.score);
  // Without capping at 100 before sorting, state boosts can't be lost; cap for display only.
  for (const r of results) r.score = Math.min(100, r.score);
  return { results: results.slice(0, q.limit), dropped };
}

export function honestNotice(count: number, q: { categories: string[]; state?: string }) {
  const cats = normalizeCategories(q.categories).map((c) => c.replace(/-/g, ' '));
  const parts: string[] = [];
  if (count === 0) {
    parts.push(`No current official program closely matched this search${cats.length ? ` (${cats.join(', ')})` : ''}. Rather than show unrelated results, here are official places that can connect you with local help.`);
  } else if (count < 3) {
    parts.push('Only a few current official programs matched closely. The resources below can find more local options.');
  }
  if (q.state && count > 0) {
    const name = stateName(q.state);
    parts.push(`Showing ${name}'s official state offices first, then national programs available in ${name}. Call or text 211 for county and city programs.`);
  }
  return {
    notice: parts.join(' ') || null,
    fallback_resources: count < 3 ? FALLBACK_RESOURCES : [],
  };
}
