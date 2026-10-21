import { CURATED_PROGRAMS, FALLBACK_RESOURCES } from './curated-programs.js';
import { Candidate, MIN_SCORE, expiryReason, normalizeCategories, scoreCandidate } from './relevance.js';
import { LinkChecker, LinkResult } from './link-checker.js';
import { STATE_CODES } from '../search/natural-language-parser.js';

function stateName(code: string): string {
  const hit = Object.entries(STATE_CODES).find(([, c]) => c === code.toUpperCase());
  return hit ? hit[0].replace(/\b\w/g, (m) => m.toUpperCase()) : code;
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
  sourceKey: 'usa-gov-benefits' | 'grants-gov' | 'curated';
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
): Promise<{ results: RankedRaw[]; dropped: { expired: number; offTopic: number; deadLinks: number } }> {
  const dropped = { expired: 0, offTopic: 0, deadLinks: 0 };
  const scored: RankedRaw[] = [];
  const seenUrlTitle = new Set<string>();
  for (const pool of pools) {
    for (const raw of pool.items) {
      const c = toCandidate(raw);
      if (expiryReason(c, now)) { dropped.expired++; continue; }
      const s = scoreCandidate(c, { categories: q.categories, tokens: q.tokens, audiences: q.audiences });
      if (!s || s.score < MIN_SCORE) { dropped.offTopic++; continue; }
      const key = `${(c.url || '').toLowerCase()}|${c.title.toLowerCase()}`;
      if (seenUrlTitle.has(key)) continue;
      seenUrlTitle.add(key);
      let score = s.score;
      if (pool.sourceKey === 'curated') score += 5; // evergreen, directly applicable programs
      if (q.state && new RegExp(`\\b${q.state}\\b`, 'i').test(`${c.title} ${c.description}`)) score += 10;
      scored.push({ raw, sourceKey: pool.sourceKey, score: Math.min(100, score), reasons: s.reasons, matched_categories: s.matched_categories, link: null });
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
    if (link?.state === 'UNVERIFIED') r.score = Math.max(0, r.score - 10);
    r.link = link;
    results.push(r);
  }
  results.sort((a, b) => b.score - a.score);
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
  if (q.state) {
    const name = stateName(q.state);
    parts.push(`These are national programs that are available in ${name}; most are applied for through your state or local office. Call or text 211 for ${name}-specific and local programs.`);
  }
  return {
    notice: parts.join(' ') || null,
    fallback_resources: count < 3 || q.state ? FALLBACK_RESOURCES : [],
  };
}
