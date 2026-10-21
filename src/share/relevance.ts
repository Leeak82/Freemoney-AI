/** Relevance, freshness, and expiry rules for live (share-mode) search results. */

export interface Candidate {
  id: string;
  title: string;
  description: string;
  provider?: string;
  url?: string | null;
  categories?: string[];
  audiences?: string[];
  deadline?: string | null;
  status?: string | null;
}

export const CATEGORY_PATTERNS: Record<string, RegExp> = {
  'rent-housing': /\b(rent|rental|renters?|housing|section 8|voucher|evict\w*|homeless\w*|shelter|apartment|mortgage|foreclos\w*|home repair|home loan)\b/i,
  utilities: /\b(utilit\w*|energy|heating|cooling|electric\w*|gas bill|water bill|liheap|weatheriz\w*|phone|internet|broadband)\b/i,
  food: /\b(food|snap|wic|nutrition|groceries|grocery|meals?|ebt|food banks?|pantr\w*)\b/i,
  veterans: /\b(veterans?|va|military|service members?|gi bill)\b/i,
  disability: /\b(disabilit\w*|disabled|ssi|ssdi|blind|braille)\b/i,
  'medical-assistance': /\b(medica\w*|health|medical|prescription|chip|dental|hospital)\b/i,
  'education-scholarships': /\b(education\w*|scholarships?|students?|college|tuition|gi bill|pell|fafsa)\b/i,
  'cash-assistance': /\b(cash assistance|tanf|income support)\b/i,
  childcare: /\b(child ?care|daycare)\b/i,
  retirement: /\b(retire\w*|pension|annuit\w*|thrift savings)\b/i,
  'death-burial': /\b(funeral|burial|death|deceased|survivors?|headstone|grave|memorial|cemetery|medallions?|gratuity)\b/i,
  'small-business': /\b(small business\w*|business|startup|entrepreneur\w*|microloans?|sbir|sba)\b/i,
};

const CATEGORY_ALIASES: Record<string, string[]> = {
  'business-grants': ['small-business'],
  'startup-funding': ['small-business'],
  'small-business-loans': ['small-business'],
  microloans: ['small-business'],
  'business-assistance': ['small-business'],
  housing: ['rent-housing'],
  rent: ['rent-housing'],
  medical: ['medical-assistance'],
  healthcare: ['medical-assistance'],
};

export function normalizeCategories(categories: string[]): string[] {
  const out = new Set<string>();
  for (const c of categories) {
    if (!c || c === 'all' || c === 'other') continue;
    out.add(c);
    for (const alias of CATEGORY_ALIASES[c] || []) out.add(alias);
  }
  return [...out];
}

/** Topics that are never shown unless the person asked for them explicitly. */
const SENSITIVE_TOPICS = new Set(['death-burial', 'retirement']);

export function classify(c: Candidate): string[] {
  const set = new Set(c.categories || []);
  // Curated programs are tagged by hand; feed records are classified by title + agency only,
  // so a passing mention in a long description (e.g. "food, clothing, shelter") doesn't count.
  const curated = (c.categories || []).length > 0;
  const titleText = c.title;
  const fullText = curated ? `${c.title} ${c.description}` : `${c.title} ${c.provider || ''}`;
  for (const [slug, re] of Object.entries(CATEGORY_PATTERNS)) {
    // Sensitive topics are matched on the title so a passing mention doesn't tag a program.
    if (SENSITIVE_TOPICS.has(slug) ? re.test(titleText) : re.test(fullText)) set.add(slug);
  }
  return [...set];
}

const ENDED_TEXT = /\b(no longer (?:accepting|available|taking)|program (?:has )?ended|has ended|was discontinued|discontinued|applications? (?:are |is )?closed|closed to new applicants|expired|sunset(?:ted)?|wound down)\b/i;
/** Temporary pandemic-era programs; all federal COVID relief programs have ended. */
const PANDEMIC_ERA = /\b(covid(?:-19)?|coronavirus|pandemic|emergency rental assistance|era program|affordable connectivity|acp\b|emergency broadband)\b/i;

export function parseDeadline(value?: string | null): Date | null {
  if (!value) return null;
  const mdy = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const d = mdy ? new Date(Number(mdy[3]), Number(mdy[1]) - 1, Number(mdy[2]), 23, 59, 59) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function expiryReason(c: Candidate, now = new Date()): string | null {
  const status = String(c.status || '').toUpperCase();
  if (/CLOSED|EXPIRED|ARCHIVED|ENDED|INACTIVE/.test(status)) return `status ${status}`;
  const deadline = parseDeadline(c.deadline);
  if (deadline && deadline.getTime() < now.getTime()) return `deadline passed ${deadline.toISOString().slice(0, 10)}`;
  const text = `${c.title} ${c.description}`;
  if (PANDEMIC_ERA.test(text)) return 'pandemic-era program that has ended';
  if (ENDED_TEXT.test(text)) return 'source text says it ended or closed';
  return null;
}

export function isExpired(c: Candidate, now = new Date()): boolean {
  return expiryReason(c, now) !== null;
}

const STOP = new Set(['the','and','for','with','from','that','this','help','need','find','show','what','where','when','how','can','could','would','should','about','have','has','are','was','were','my','our','your','their','into','paying','pay','get','getting','program','programs','assistance','benefits','benefit','money','free','grant','grants','any','some','want','looking','government']);

export function queryTokens(text: string): string[] {
  return [...new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t)))].slice(0, 12);
}

export interface ScoreInput {
  categories: string[];
  tokens: string[];
  audiences?: string[];
}

export interface ScoredCandidate<T extends Candidate> {
  item: T;
  score: number;
  matched_categories: string[];
  reasons: string[];
}

function wordMatch(haystack: string, token: string): boolean {
  return new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(haystack);
}

/** Score 0..100. Returns null when the item doesn't fit the request at all. */
export function scoreCandidate<T extends Candidate>(c: T, q: ScoreInput): ScoredCandidate<T> | null {
  const itemCats = classify(c);
  const wanted = normalizeCategories(q.categories);
  // Explicitly asking about e.g. funeral or retirement opts in to that sensitive topic.
  for (const topic of SENSITIVE_TOPICS) {
    if (!wanted.includes(topic) && q.tokens.some((t) => CATEGORY_PATTERNS[topic].test(t))) wanted.push(topic);
  }
  const reasons: string[] = [];
  // Never show funeral/burial or retirement programs unless that is what was asked for.
  for (const cat of itemCats) {
    if (SENSITIVE_TOPICS.has(cat) && !wanted.includes(cat)) return null;
  }
  const matchedCats = wanted.filter((w) => itemCats.includes(w));
  if (wanted.length > 0 && matchedCats.length === 0) return null;

  let score = 0;
  if (matchedCats.length) {
    score += 50 + 10 * (matchedCats.length - 1);
    reasons.push(`Matches: ${matchedCats.map((x) => x.replace(/-/g, ' ')).join(', ')}`);
  }
  const hay = `${c.title} ${c.description} ${c.provider || ''}`;
  const hits = q.tokens.filter((t) => wordMatch(hay, t));
  const titleHits = q.tokens.filter((t) => wordMatch(c.title, t));
  score += Math.min(30, hits.length * 8 + titleHits.length * 4);
  if (hits.length) reasons.push(`Mentions: ${hits.slice(0, 4).join(', ')}`);

  const itemAud = new Set((c.audiences || []).map((a) => a.toUpperCase()));
  const wantAud = (q.audiences || []).map((a) => a.toUpperCase());
  for (const a of wantAud) if (itemAud.has(a)) { score += 10; reasons.push(`For ${a.toLowerCase().replace(/_/g, ' ')}`); }
  // Audience-restricted programs (e.g., veteran-only) are demoted when the person didn't say they qualify.
  const restricted = ['VETERAN', 'SMALL_BUSINESS'].filter((a) => itemAud.has(a) && !wantAud.includes(a));
  if (restricted.length && !matchedCats.some((m) => m === 'veterans' || m === 'small-business')) score -= 25;

  if (wanted.length === 0 && hits.length === 0) return null;
  return { item: c, score: Math.max(0, Math.min(100, score)), matched_categories: matchedCats, reasons };
}

export const MIN_SCORE = 40;
