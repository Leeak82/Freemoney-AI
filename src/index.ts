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

function tokensFor(value: string): string[] {
  const stop = new Set(['the','and','for','with','from','that','this','help','need','find','show','what','where','when','how','can','could','would','should','about','have','has','are','was','were','my','our','your','their','into','a','an','to','of','in','on','at','is','it','i','me']);
  return [...new Set(
    value.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2 && !stop.has(token))
  )].slice(0, 12);
}

function rankItems(items: any[], tokens: string[]): any[] {
  if (!tokens.length) return items;
  const scored = items.map((item) => {
    const detail = item.detail || {};
    const haystack = [
      item.title,
      item.description,
      item.agencyOrProvider,
      detail.title,
      detail.description,
      detail.eligibilitySummary,
      ...(detail.audiences || []),
      ...(detail.subcategories || []),
    ].filter(Boolean).join(' ').toLowerCase();
    return {
      item,
      score: tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0),
    };
  });
  const matched = scored.filter((entry) => entry.score > 0);
  return (matched.length ? matched : scored)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}

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

async function shareSearch(input: any, rawText = '') {
  const intent = input.intent || 'PERSONAL_ASSISTANCE';
  const limit = Math.max(1, Math.min(Number(input.limit || 20), 30));
  const offset = Math.max(0, Number(input.offset || 0));
  const categories = [
    ...(Array.isArray(input.categories) ? input.categories : []),
    ...(input.category ? [input.category] : []),
  ];
  const text = [
    rawText,
    input.keyword || '',
    categories.join(' '),
    Array.isArray(input.audiences) ? input.audiences.join(' ') : '',
    intent === 'BUSINESS_ASSISTANCE' ? 'small business grant startup funding' : '',
  ].filter(Boolean).join(' ');
  const tokens = tokensFor(text);
  const category = categories[0] || (intent === 'BUSINESS_ASSISTANCE' ? 'business-grants' : 'other');
  let results: any[] = [];

  if (intent === 'BUSINESS_ASSISTANCE') {
    const keyword = tokens.slice(0, 5).join(' ') || 'small business';
    const page = await grantsSource.fetchOpportunities({
      keyword,
      rows: Math.min(25, limit + offset + 5),
      startRecordNum: 0,
      oppStatuses: 'posted',
    });
    results = rankItems(page.items, tokens)
      .map((item) => mapShareResult(item, grantsSource.getSourceMetadata(), category));
  } else {
    const page = await benefitsSource.fetchOpportunities({ rows: 100, startRecordNum: 0 });
    results = rankItems(page.items, tokens)
      .map((item) => mapShareResult(item, benefitsSource.getSourceMetadata(), category));
  }

  const unique = [...new Map(results.map((item) => [item.opportunity.id, item])).values()];
  return {
    total: unique.length,
    limit,
    offset,
    results: unique.slice(offset, offset + limit),
  };
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
  app.use('/api', caseRouter);

  const shareMode = process.env.SHARE_MODE === 'true';

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

  return app;
}

if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  const app = createApp();
  app.listen(config.PORT, () => {
    console.log(`FreeMoney-AI server running on port ${config.PORT} (${config.NODE_ENV})`);
    console.log(`Web App: ${config.API_BASE_URL}`);
  });
}
