import crypto from 'crypto';
import { config } from '../config/index.js';
import { OpportunityAudience } from '../types/index.js';
import { ResilientHttpClient } from './http-client.js';
import {
  IOpportunitySource,
  RawOpportunityDetail,
  RawOpportunityItem,
  SourceFetchParams,
  SourceFetchResult,
  SourceMetadata,
} from './registry.js';

interface UsaGovEligibilityCriterion {
  criteriaKey?: string;
  label?: string;
  acceptableValues?: unknown[];
}

interface UsaGovBenefit {
  title?: string;
  summary?: string;
  SourceLink?: string;
  SourceIsEnglish?: boolean;
  agency?: {
    title?: string;
    summary?: string;
    lede?: string;
  };
  eligibility?: UsaGovEligibilityCriterion[];
}

interface UsaGovBenefitsResponse {
  status?: number;
  method?: string;
  data?: {
    benefits?: Array<{ benefit?: UsaGovBenefit }>;
  };
}

function cleanText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function benefitId(benefit: UsaGovBenefit): string {
  const seed = `${benefit.SourceLink || ''}|${benefit.title || ''}`.toLowerCase();
  return `usa-benefit-${crypto.createHash('sha256').update(seed).digest('hex').slice(0, 32)}`;
}

function audiencesFor(benefit: UsaGovBenefit): OpportunityAudience[] {
  const text = [
    benefit.title,
    benefit.summary,
    ...(benefit.eligibility || []).flatMap((criterion) => [
      criterion.criteriaKey,
      criterion.label,
    ]),
  ]
    .join(' ')
    .toLowerCase();
  const audiences = new Set<OpportunityAudience>(['INDIVIDUAL']);
  if (text.includes('veteran')) audiences.add('VETERAN');
  if (text.includes('disab')) audiences.add('DISABLED');
  if (
    text.includes('child') ||
    text.includes('spouse') ||
    text.includes('survivor') ||
    text.includes('deceased')
  ) {
    audiences.add('FAMILY');
  }
  return [...audiences];
}

export class UsaGovBenefitsSource implements IOpportunitySource {
  private readonly httpClient: ResilientHttpClient;
  private cachedAt = 0;
  private cachedBenefits: UsaGovBenefit[] = [];
  private readonly detailById = new Map<string, RawOpportunityDetail>();

  constructor(
    private readonly feedUrl: string = config.USA_GOV_BENEFITS_URL,
    httpClient?: ResilientHttpClient
  ) {
    this.httpClient =
      httpClient ||
      new ResilientHttpClient({
        timeoutMs: config.USA_GOV_TIMEOUT_MS,
        maxRetries: config.USA_GOV_MAX_RETRIES,
        retryBaseMs: 250,
        minRequestIntervalMs: 100,
      });
  }

  public getSourceMetadata(): SourceMetadata {
    return {
      id: 'usa-gov-benefits',
      name: 'USA.gov Benefit Finder',
      organization: 'U.S. General Services Administration',
      type: 'JSON',
      baseUrl: 'https://www.usa.gov/benefit-finder',
      apiUrl: this.feedUrl,
      documentationUrl: 'https://www.usa.gov/benefit-finder',
      authType: 'NONE',
      sourceRole: 'OPPORTUNITY_FEED',
      jurisdictionScope: 'UNKNOWN',
      trustLevel: 'OFFICIAL_GOVERNMENT',
      official: true,
      priority: 90,
      defaultPageSize: 100,
      maxPages: 1,
    };
  }

  public async validateConnection(): Promise<{
    healthy: boolean;
    message: string;
    latencyMs: number;
  }> {
    const started = Date.now();
    try {
      const benefits = await this.loadBenefits(true);
      return {
        healthy: benefits.length > 0,
        message: `USA.gov returned ${benefits.length} Benefit Finder records`,
        latencyMs: Date.now() - started,
      };
    } catch (error: unknown) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - started,
      };
    }
  }

  public async fetchOpportunities(params: SourceFetchParams): Promise<SourceFetchResult> {
    const benefits = await this.loadBenefits();
    const keyword = params.keyword?.trim().toLowerCase();
    const matching = keyword
      ? benefits.filter((benefit) =>
          [
            benefit.title,
            benefit.summary,
            benefit.agency?.title,
            ...(benefit.eligibility || []).map((criterion) => criterion.label),
          ]
            .join(' ')
            .toLowerCase()
            .includes(keyword)
        )
      : benefits;
    const start = Math.max(0, params.startRecordNum || 0);
    const rows = Math.max(1, Math.min(params.rows || 100, 100));
    const selected = matching.slice(start, start + rows);
    const items = selected.map((benefit) => this.toRawItem(benefit));
    const next = start + items.length;
    const hasMore = items.length > 0 && next < matching.length;
    return {
      sourceId: 'usa-gov-benefits',
      totalHits: matching.length,
      startRecord: start,
      nextStartRecord: hasMore ? next : null,
      hasMore,
      items,
      rawResponse: {
        status: 200,
        method: 'GET',
        totalBenefits: benefits.length,
        filteredBenefits: matching.length,
      },
    };
  }

  public async fetchOpportunityDetail(
    sourceOpportunityId: string
  ): Promise<RawOpportunityDetail | null> {
    await this.loadBenefits();
    return this.detailById.get(sourceOpportunityId) || null;
  }

  private async loadBenefits(force = false): Promise<UsaGovBenefit[]> {
    if (!force && this.cachedBenefits.length > 0 && Date.now() - this.cachedAt < 300_000) {
      return this.cachedBenefits;
    }
    const response = await this.httpClient.requestJson<UsaGovBenefitsResponse>(
      this.feedUrl,
      { method: 'GET', headers: { Accept: 'application/json' } }
    );
    const wrappers = response.data?.benefits;
    if (response.status !== 200 || !Array.isArray(wrappers)) {
      throw new Error('USA.gov Benefit Finder JSON contract changed or returned no benefits');
    }
    const benefits = wrappers
      .map((wrapper) => wrapper.benefit)
      .filter(
        (benefit): benefit is UsaGovBenefit =>
          Boolean(
            benefit &&
              cleanText(benefit.title) &&
              typeof benefit.SourceLink === 'string' &&
              /^https?:\/\//i.test(benefit.SourceLink)
          )
      );
    if (benefits.length === 0) {
      throw new Error('USA.gov Benefit Finder returned no valid benefit records');
    }
    this.cachedBenefits = benefits;
    this.cachedAt = Date.now();
    this.detailById.clear();
    for (const benefit of benefits) {
      this.detailById.set(benefitId(benefit), this.toDetail(benefit));
    }
    return benefits;
  }

  private toRawItem(benefit: UsaGovBenefit): RawOpportunityItem {
    const id = benefitId(benefit);
    return {
      sourceOpportunityId: id,
      sourceOpportunityNumber: id,
      sourceUrl: benefit.SourceLink!,
      title: cleanText(benefit.title),
      agencyOrProvider: cleanText(benefit.agency?.title),
      description: cleanText(benefit.summary),
      oppStatus: 'unknown',
      docType: 'benefit-finder-record',
      rawPayload: benefit,
      detail: this.detailById.get(id) || this.toDetail(benefit),
    };
  }

  private toDetail(benefit: UsaGovBenefit): RawOpportunityDetail {
    const eligibility = (benefit.eligibility || []).map((criterion) => ({
      criteriaKey: criterion.criteriaKey || null,
      label: cleanText(criterion.label),
      acceptableValues: Array.isArray(criterion.acceptableValues)
        ? criterion.acceptableValues
        : [],
    }));
    const labels = eligibility.map((criterion) => criterion.label).filter(Boolean);
    return {
      sourceOpportunityId: benefitId(benefit),
      title: cleanText(benefit.title),
      description: cleanText(benefit.summary),
      providerName: cleanText(benefit.agency?.title),
      sourceUrl: benefit.SourceLink!,
      applicationUrl: undefined,
      applicationUrlType: 'UNKNOWN',
      applicationUrlVerified: false,
      amountMin: undefined,
      amountMax: undefined,
      currency: 'USD',
      deadline: null,
      rollingDeadline: false,
      status: 'UNKNOWN',
      programType: 'BENEFIT',
      locationScope: 'UNKNOWN',
      countryCode: null,
      states: [],
      counties: [],
      cities: [],
      zipCodes: [],
      regions: [],
      category: 'other',
      subcategories: [],
      audiences: audiencesFor(benefit),
      fundingPurposes: [],
      requiredDocuments: [],
      eligibilitySummary: labels.length > 0 ? labels.join('; ') : undefined,
      eligibilityRules: { criteria: eligibility },
      contactInfo: {},
      sourceMetadata: {
        feed: 'USA.gov Benefit Finder all_benefits.json',
        sourceIsEnglish: benefit.SourceIsEnglish ?? null,
        agencySummary: cleanText(benefit.agency?.summary || benefit.agency?.lede),
        recordStatusPublished: false,
        geographicScopePublished: false,
        documentsSourceVerified: false,
      },
      rawPayload: benefit,
    };
  }
}

export { benefitId as usaGovBenefitId };
