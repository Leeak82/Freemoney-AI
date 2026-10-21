import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiRouter } from './routes/api.js';
import { caseRouter } from './routes/cases.js';
import { config } from './config/index.js';
import { naturalLanguageSearchParser } from './search/natural-language-parser.js';
import { GrantsGovSource } from './sources/grants-gov.js';
import { UsaGovBenefitsSource } from './sources/usa-gov-benefits.js';
import { businessProviderRegistry } from './business/providers.js';
import { queryTokens } from './share/relevance.js';
import { curatedAsRaw, honestNotice, rankAndVerify, stateProgramsAsRaw } from './share/share-search.js';
import { detectState, normalizeStateInput } from './share/state-detect.js';
import { STATE_PROGRAMS } from './share/state-programs.js';
import { ensureDatabaseReady } from './db/ready.js';
import { LinkChecker, linkChecker } from './share/link-checker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHARE_CATEGORIES = [
  { slug: 'rent-housing', name: 'Housing & Rent', audience_type: 'PERSONAL', sort_order: 10 },
  { slug: 'utilities', name: 'Utilities', audience_type: 'PERSONAL', sort_order: 20 },
  { slug: 'food', name: 'Food Assistance', audience_type: 'PERSONAL', sort_order: 30 },
  { slug: 'veterans', name: 'Veteran Assistance', audience_type: 'PERSONAL', sort_order: 40 },
  { slug: 'disability', name: 'Disability Assistance', audience_type: 'PERSONAL', sort_order: 50 },
  { slug: 'medical-assistance', name: 'Medical Assistance', audience_type: 'PERSONAL', sort_order: 55 },
  { slug: 'education-scholarships', name: 'Education & Scholarships', audience_type: 'BOTH', sort_order: 60 },
  { slug: 'llc-formation', name: 'LLC Formation', audience_type: 'BUSINESS', sort_order: 70 },
  { slug: 'business-grants', name: 'Business Grants', audience_type: 'BUSINESS', sort_order: 80 },
  { slug: 'startup-funding', name: 'Startup Funding', audience_type: 'BUSINESS', sort_order: 90 },
  { slug: 'business-licenses', name: 'Licenses & Permits', audience_type: 'BUSINESS', sort_order: 100 },
];

const grantsSource = new GrantsGovSource();
const benefitsSource = new UsaGovBenefitsSource();
const shareResultCache = new Map<string, any>();

function mapShareResult(item: any, meta: any, category: string): any {
  const detail = item.detail || {};
  const now = new Date();
  const id = `${meta.id}:${item.sourceOpportunityId}`;
  const rawStatus = String(detail.status || item.oppStatus || '').toUpperCase();
  const status =
    rawStatus.includes('CLOSED') ? 'CLOSED' :
    rawStatus.includes('EXPIRED') ? 'EXPIRED' :
    rawStatus.includes('POSTED') || rawStatus.includes('ACTIVE') ? 'ACTIVE' :
    'UNKNOWN';

  const opportunity = {
    id,
    title: detail.title || item.title || 'Untitled opportunity',
    description: detail.description || item.description || '',
    provider_name: detail.providerName || item.agencyOrProvider || meta.organization,
    source_id: meta.id,
    source_url: detail.sourceUrl || item.sourceUrl || meta.baseUrl,
    application_url: detail.applicationUrl || null,
    application_url_type: detail.applicationUrlType || 'UNKNOWN',
    application_url_verified: Boolean(detail.applicationUrlVerified),
    category: detail.category || category || 'other',
    subcategories: detail.subcategories || item.cfdaList || [],
    program_type: detail.programType || (meta.id === 'grants-gov' ? 'GRANT' : 'BENEFIT'),
    amount_min: detail.amountMin ?? null,
    amount_max: detail.amountMax ?? null,
    currency: detail.currency || 'USD',
    deadline: detail.deadline || item.closeDate || null,
    rolling_deadline: Boolean(detail.rollingDeadline),
    location_scope: detail.locationScope || 'UNKNOWN',
    country_code: detail.countryCode || null,
    regions: detail.regions || [],
    states: detail.states || [],
    counties: detail.counties || [],
    cities: detail.cities || [],
    zip_codes: detail.zipCodes || [],
    eligibility_summary: detail.eligibilitySummary || null,
    eligibility_rules: detail.eligibilityRules || null,
    required_documents: detail.requiredDocuments || [],
    contact_information: detail.contactInfo || null,
    official_source: true,
    source_provider: meta.organization,
    source_metadata: detail.sourceMetadata || {},
    raw_source_identifier: item.sourceOpportunityNumber || item.sourceOpportunityId,
    source_opportunity_id: item.sourceOpportunityId,
    dedup_fingerprint: id,
    last_verified_at: now,
    retrieved_at: now,
    status,
    active: status !== 'CLOSED' && status !== 'EXPIRED',
    audiences: detail.audiences || [],
    funding_purposes: detail.fundingPurposes || [],
    created_at: now,
    updated_at: now,
  };

  const result = {
    opportunity,
    source: {
      id: meta.id,
      name: meta.name,
      organization: meta.organization,
      official: true,
      trust_level: 'OFFICIAL_GOVERNMENT',
    },
    match_score: null,
    confidence: 'INSUFFICIENT_DATA',
    match_status: 'NEEDS_VERIFICATION',
    why_you_may_qualify: [
      'This official-source record matched your search. Confirm the published eligibility rules before applying.',
    ],
    requirements: opportunity.eligibility_summary ? [opportunity.eligibility_summary] : [],
    documents: opportunity.required_documents,
    missing_information: ['Eligibility and local applicability must be confirmed on the official source.'],
    potential_disqualifiers: [],
    source_provenance: {
      source_name: meta.name,
      source_url: opportunity.source_url,
      official_source: true,
      trust_level: 'OFFICIAL_GOVERNMENT',
      last_verified: now.toISOString().slice(0, 10),
      retrieved_at: now.toISOString().slice(0, 10),
      source_opportunity_id: item.sourceOpportunityId,
      source_provider: meta.organization,
      additional_sources: [],
    },
    application_links: opportunity.application_url ? [{
      url: opportunity.application_url,
      type: opportunity.application_url_type,
      official: opportunity.application_url_verified,
      verified_at: opportunity.application_url_verified ? now.toISOString() : null,
    }] : [],
  };

  shareResultCache.set(id, result);
  return result;
}

const CURATED_META = {
  id: 'curated-official',
  name: 'Official federal program directory',
  organization: 'U.S. federal agencies',
  baseUrl: 'https://www.usa.gov/benefits',
};

const PERSONAL_DEFAULT_CATEGORIES = new Set(['other', 'all']);

export async function shareSearch(input: any, rawText = '', deps: { checker?: LinkChecker; now?: Date } = {}) {
  const checker = deps.checker || linkChecker;
  const now = deps.now || new Date();
  const intent = input.intent || 'PERSONAL_ASSISTANCE';
  const limit = Math.max(1, Math.min(Number(input.limit || 20), 30));
  const offset = Math.max(0, Number(input.offset || 0));
  const requested = [
    ...(Array.isArray(input.categories) ? input.categories : []),
    ...(input.category ? [input.category] : []),
  ].filter((c: string) => c && !PERSONAL_DEFAULT_CATEGORIES.has(c));
  const categories = intent === 'BUSINESS_ASSISTANCE' && requested.length === 0 ? ['small-business'] : requested;
  const audiences = [
    ...(Array.isArray(input.audiences) ? input.audiences : []),
    ...(input.user_profile?.is_veteran ? ['VETERAN'] : []),
    ...(input.user_profile?.is_disabled ? ['DISABLED'] : []),
    ...(input.user_profile?.is_student ? ['STUDENT'] : []),
    ...(intent === 'BUSINESS_ASSISTANCE' ? ['SMALL_BUSINESS'] : []),
  ];
  const tokens = queryTokens([rawText, input.keyword || ''].join(' '));
  const state = normalizeStateInput(input.state)
    || normalizeStateInput(input.user_profile?.state)
    || detectState(rawText);

  const pools: Array<{ sourceKey: 'usa-gov-benefits' | 'grants-gov' | 'curated' | 'state'; items: any[] }> = [
    { sourceKey: 'state', items: intent === 'BUSINESS_ASSISTANCE' ? [] : stateProgramsAsRaw(state) },
    { sourceKey: 'curated', items: curatedAsRaw() },
  ];
  if (intent === 'BUSINESS_ASSISTANCE') {
    try {
      const keyword = tokens.filter((t) => !['business', 'small'].includes(t)).slice(0, 4).join(' ') || 'small business';
      const page = await grantsSource.fetchOpportunities({ keyword, rows: 25, startRecordNum: 0, oppStatuses: 'posted' });
      pools.push({ sourceKey: 'grants-gov', items: page.items });
    } catch (err) {
      console.error('[share search] grants.gov unavailable', err);
    }
  } else {
    try {
      const page = await benefitsSource.fetchOpportunities({ rows: 100, startRecordNum: 0 });
      pools.push({ sourceKey: 'usa-gov-benefits', items: page.items });
    } catch (err) {
      console.error('[share search] USA.gov feed unavailable', err);
    }
  }

  const { results: ranked, dropped } = await rankAndVerify(
    pools,
    { categories, tokens, audiences, state, limit: limit + offset },
    checker,
    now,
  );

  const results = ranked.map((r) => {
    const meta = r.sourceKey === 'curated' ? CURATED_META
      : r.sourceKey === 'grants-gov' ? grantsSource.getSourceMetadata() : benefitsSource.getSourceMetadata();
    const meta2 = r.sourceKey === 'state' ? { id: 'state-official', name: 'Official state program directory', organization: r.raw.agencyOrProvider, baseUrl: r.raw.sourceUrl } : meta;
    const mapped = mapShareResult(r.raw, meta2, r.matched_categories[0] || r.raw.detail?.category || categories[0] || 'other');
    const verifiedDay = (r.link?.checkedAt || now.toISOString()).slice(0, 10);
    mapped.opportunity.category = r.matched_categories[0] || mapped.opportunity.category;
    mapped.match_score = r.score;
    mapped.confidence = r.score >= 75 ? 'HIGH' : r.score >= 55 ? 'MEDIUM' : 'LOW';
    mapped.why_you_may_qualify = [
      ...r.reasons,
      'Confirm the published eligibility rules on the official site before applying.',
    ];
    mapped.source_provenance.last_verified = verifiedDay;
    mapped.source_provenance.link_status = r.link?.state || 'UNVERIFIED';
    const stateLookup = r.raw.detail?.sourceMetadata?.stateLookupUrl;
    if (state && stateLookup) {
      mapped.application_links.push({ url: stateLookup, type: 'STATE_OFFICE_LOOKUP', official: true, verified_at: null });
    }
    return mapped;
  });

  const page = results.slice(offset, offset + limit);
  return {
    total: results.length,
    limit,
    offset,
    results: page,
    filtered_out: dropped,
    detected_state: state || null,
    ...honestNotice(results.length, { categories, state }),
  };
}

let shareRefreshTimer: NodeJS.Timeout | null = null;

/** Re-pulls source feeds and re-checks every program link so data is never stale. */
export async function refreshShareData(): Promise<void> {
  try {
    const page = await benefitsSource.fetchOpportunities({ rows: 100, startRecordNum: 0 });
    const urls = [
      ...curatedAsRaw().map((r) => r.sourceUrl as string),
      ...STATE_PROGRAMS.map((p) => p.url),
      ...page.items.map((i: any) => i.detail?.applicationUrl || i.sourceUrl).filter(Boolean),
    ];
    const checked = await linkChecker.checkAll(urls);
    const dead = [...checked.values()].filter((r) => r.state === 'DEAD').length;
    console.log(`[refresh] ${page.items.length} USA.gov records, ${checked.size} links checked, ${dead} dead`);
  } catch (err) {
    console.error('[refresh] failed', err);
  }
}

function startShareRefresh() {
  if (shareRefreshTimer || process.env.NODE_ENV === 'test' || process.env.VITEST) return;
  void refreshShareData();
  shareRefreshTimer = setInterval(() => void refreshShareData(), 24 * 60 * 60 * 1000);
  shareRefreshTimer.unref();
}

function shareChecklist() {
  return [{
    id: 'browser-launch-checklist',
    checklist_type: 'BUSINESS_LAUNCH',
    title: 'Business launch checklist',
    items: [
      { id: 'idea', title: 'Define the business and customer', description: 'Write down the product or service, customer, and operating location.', status: 'NOT_STARTED' },
      { id: 'structure', title: 'Choose a business structure', description: 'Compare structures and verify state requirements before filing.', status: 'NOT_STARTED' },
      { id: 'formation', title: 'Use the official state filing office', description: 'File only through the responsible state agency or official portal.', status: 'NOT_STARTED' },
      { id: 'ein', title: 'Review EIN requirements', description: 'Use IRS.gov to determine whether an EIN is needed and apply directly if applicable.', status: 'NOT_STARTED' },
      { id: 'licenses', title: 'Check licenses and permits', description: 'Verify federal, state, county, city, and industry requirements.', status: 'NOT_STARTED' },
      { id: 'funding', title: 'Search verified funding sources', description: 'Search official programs and confirm eligibility before applying.', status: 'NOT_STARTED' },
    ],
  }];
}

export function createApp(): express.Application {
  const app = express();

  app.use(cors());
  app.use(express.json());

  const publicDir = path.join(__dirname, '../public');
  app.use(express.static(publicDir));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'freemoney-ai' });
  });

  // Private guest/account case routes are available in both SHARE_MODE and full mode.
  if (process.env.SHARE_MODE === 'true') {
    void ensureDatabaseReady().catch((err) => console.error('[db] not ready', err));
    app.use(['/api/session', '/api/cases'], async (_req, res, next) => {
      try {
        await ensureDatabaseReady();
        next();
      } catch (err: any) {
        res.status(503).json({ error: 'Private sessions are temporarily unavailable. Please try again.', details: err.message });
      }
    });
  }
  app.use('/api', caseRouter);

  const shareMode = process.env.SHARE_MODE === 'true';
  if (shareMode) startShareRefresh();

  if (shareMode) {
    app.get('/api/categories', (req, res) => {
      const selectedPath = String(req.query.path || '').toUpperCase();
      const categories = selectedPath === 'PERSONAL' || selectedPath === 'BUSINESS'
        ? SHARE_CATEGORIES.filter((item) => item.audience_type === selectedPath || item.audience_type === 'BOTH')
        : SHARE_CATEGORIES;
      res.json({ categories });
    });

    app.get('/api/profile', (_req, res) => res.json({ profile: null }));
    app.post('/api/profile', (req, res) => res.json({ success: true, profile: req.body || {} }));

    app.get('/api/businesses', (_req, res) => res.json({ businesses: [] }));
    app.post('/api/businesses', (req, res) => {
      const business = {
        ...req.body,
        business_id: req.body?.business_id || `browser-${Date.now()}`,
        user_id: req.body?.user_id || 'browser-local',
      };
      res.status(201).json({ success: true, business });
    });
    app.get('/api/businesses/:id/checklists', (_req, res) => {
      res.json({ checklists: shareChecklist() });
    });
    app.patch('/api/businesses/:businessId/checklists/items/:itemId', (req, res) => {
      res.json({ success: true, item: { id: req.params.itemId, status: req.body?.status || 'NOT_STARTED' } });
    });

    app.get('/api/applications', (_req, res) => res.json({ applications: [] }));
    app.post('/api/applications', (req, res) => {
      res.status(201).json({
        success: true,
        application: {
          id: `browser-app-${Date.now()}`,
          opportunity_id: req.body?.opportunity_id || null,
          status: 'PREPARING',
          checklist: [],
          created_at: new Date().toISOString(),
        },
      });
    });

    app.post('/api/search', async (req, res) => {
      try {
        res.json(await shareSearch(req.body || {}));
      } catch (err: any) {
        console.error('[share search]', err);
        res.status(502).json({ error: 'Official-source search failed', details: err.message });
      }
    });

    app.post('/api/search/natural-language', async (req, res) => {
      try {
        const text = String(req.body?.text || req.body?.query || '').trim();
        if (!text) {
          res.status(400).json({ error: 'Natural-language search text is required.' });
          return;
        }
        const interpretation = naturalLanguageSearchParser.parse(text, req.body?.intent);
        const search = {
          ...interpretation.search,
          user_profile: interpretation.search.intent === 'PERSONAL_ASSISTANCE'
            ? { ...(interpretation.inferred_profile || {}), ...(req.body?.user_profile || {}) }
            : undefined,
          business_profile: interpretation.search.intent === 'BUSINESS_ASSISTANCE'
            ? { ...(interpretation.inferred_business_profile || {}), ...(req.body?.business_profile || {}) }
            : undefined,
          limit: Number.isFinite(Number(req.body?.limit)) ? Number(req.body.limit) : 20,
          offset: Number.isFinite(Number(req.body?.offset)) ? Number(req.body.offset) : 0,
        };
        const result = await shareSearch(search, text);
        res.json({ interpretation, ...result });
      } catch (err: any) {
        console.error('[share natural search]', err);
        res.status(502).json({ error: 'Natural-language search failed', details: err.message });
      }
    });

    app.get('/api/opportunities', async (req, res) => {
      try {
        res.json(await shareSearch({
          category: req.query.category,
          keyword: req.query.keyword,
          intent: req.query.intent || 'PERSONAL_ASSISTANCE',
          limit: req.query.limit || 20,
          offset: req.query.offset || 0,
        }));
      } catch (err: any) {
        res.status(502).json({ error: 'Official-source search failed', details: err.message });
      }
    });

    app.get('/api/opportunities/:id', async (req, res) => {
      const cached = shareResultCache.get(req.params.id);
      if (cached) {
        res.json(cached);
        return;
      }
      const split = req.params.id.indexOf(':');
      if (split < 1) {
        res.status(404).json({ error: 'Opportunity not found' });
        return;
      }
      const sourceId = req.params.id.slice(0, split);
      const sourceOpportunityId = req.params.id.slice(split + 1);
      try {
        const source = sourceId === 'grants-gov' ? grantsSource :
          sourceId === 'usa-gov-benefits' ? benefitsSource : null;
        if (!source) {
          res.status(404).json({ error: 'Opportunity not found' });
          return;
        }
        const detail = await source.fetchOpportunityDetail(sourceOpportunityId);
        if (!detail) {
          res.status(404).json({ error: 'Opportunity not found' });
          return;
        }
        const item = {
          sourceOpportunityId,
          sourceUrl: detail.sourceUrl,
          title: detail.title,
          agencyOrProvider: detail.providerName,
          description: detail.description,
          rawPayload: detail.rawPayload,
          detail,
        };
        res.json(mapShareResult(item, source.getSourceMetadata(), detail.category || 'other'));
      } catch (err: any) {
        res.status(502).json({ error: 'Failed to fetch opportunity detail', details: err.message });
      }
    });

    app.post('/api/business/formation-guidance', async (req, res) => {
      try {
        const guidance = await businessProviderRegistry.getFormationGuidance({
          countryCode: String(req.body?.countryCode || 'US').slice(0, 2),
          state: req.body?.state ? String(req.body.state) : undefined,
          structure: req.body?.structure || 'LLC',
        });
        res.json({ guidance });
      } catch (err: any) {
        res.status(400).json({ error: 'Invalid formation request', details: err.message });
      }
    });

    app.post('/api/business/requirements', async (req, res) => {
      try {
        const requirements = await businessProviderRegistry.findRequirements({
          countryCode: String(req.body?.countryCode || 'US').slice(0, 2),
          state: req.body?.state ? String(req.body.state) : undefined,
          county: req.body?.county ? String(req.body.county) : undefined,
          city: req.body?.city ? String(req.body.city) : undefined,
          industry: req.body?.industry ? String(req.body.industry) : undefined,
          businessType: req.body?.businessType ? String(req.body.businessType) : undefined,
        });
        res.json({
          requirements,
          notice: 'Verify state, local, and industry-specific requirements with the responsible official agency.',
        });
      } catch (err: any) {
        res.status(400).json({ error: 'Invalid requirement request', details: err.message });
      }
    });

    app.get('/api/sources', (_req, res) => {
      res.json({ sources: [grantsSource.getSourceMetadata(), benefitsSource.getSourceMetadata()] });
    });
  } else {
    app.use('/api', apiRouter);
  }

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  // Every API response is JSON, including unknown routes and crashes.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[error]', req.method, req.path, err);
    if (res.headersSent) return;
    const status = err?.type === 'entity.parse.failed' ? 400 : Number(err?.status) || 500;
    res.status(status).json({ error: status === 400 ? 'Invalid request body' : 'Something went wrong. Please try again.' });
  });

  return app;
}

if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  const app = createApp();
  app.listen(config.PORT, () => {
    console.log(`FreeMoney-AI server running on port ${config.PORT} (${config.NODE_ENV})`);
    console.log(`Web App: ${config.API_BASE_URL}`);
  });
}
