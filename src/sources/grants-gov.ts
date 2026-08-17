import { config } from '../config/index.js';
import { OpportunityAudience, OpportunityStatus } from '../types/index.js';
import { ResilientHttpClient } from './http-client.js';
import {
  IOpportunitySource,
  RawOpportunityDetail,
  RawOpportunityItem,
  SourceFetchParams,
  SourceFetchResult,
  SourceMetadata,
} from './registry.js';

interface GrantsGovSearchHit {
  id: string | number;
  number?: string;
  title: string;
  agencyCode?: string;
  agency?: string;
  agencyName?: string;
  openDate?: string;
  closeDate?: string;
  oppStatus?: string;
  docType?: string;
  cfdaList?: string[];
  alnist?: string[];
  description?: string;
}

export interface GrantsGovSearchResponse {
  errorcode: number;
  msg: string;
  data?: {
    searchParams?: Record<string, unknown>;
    hitCount: number;
    startRecord: number;
    oppHits: GrantsGovSearchHit[];
    errorMsgs?: string[];
  };
}

interface GrantsGovDetailResponse {
  errorcode: number;
  msg: string;
  data?: Record<string, any>;
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

function parseNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const normalized = value.match(/^\d{4}-\d{2}-\d{2}/)
    ? value.slice(0, 10)
    : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mapStatus(status: string | undefined, deadline: Date | null): OpportunityStatus {
  const normalized = status?.trim().toLowerCase();
  if (normalized === 'closed' || normalized === 'archived') return 'CLOSED';
  if (normalized === 'forecasted') return 'PAUSED';
  if (normalized === 'posted') {
    if (deadline && deadline.getTime() < Date.now()) return 'EXPIRED';
    return 'ACTIVE';
  }
  return 'UNKNOWN';
}

function mapApplicantAudiences(applicantTypes: any[]): OpportunityAudience[] {
  const audiences = new Set<OpportunityAudience>();
  for (const applicant of applicantTypes) {
    const id = String(applicant?.id || '');
    if (id === '21') audiences.add('INDIVIDUAL');
    if (id === '23') audiences.add('SMALL_BUSINESS');
    if (id === '12' || id === '13') audiences.add('NONPROFIT');
  }
  return [...audiences];
}

export class GrantsGovSource implements IOpportunitySource {
  private readonly baseUrl = 'https://www.grants.gov';
  private readonly httpClient: ResilientHttpClient;

  constructor(
    private readonly apiUrl: string = config.GRANTS_GOV_API_URL,
    httpClient?: ResilientHttpClient
  ) {
    this.httpClient =
      httpClient ||
      new ResilientHttpClient({
        timeoutMs: config.GRANTS_GOV_TIMEOUT_MS,
        maxRetries: config.GRANTS_GOV_MAX_RETRIES,
        retryBaseMs: config.GRANTS_GOV_RETRY_BASE_MS,
        minRequestIntervalMs: config.GRANTS_GOV_MIN_INTERVAL_MS,
      });
  }

  public getSourceMetadata(): SourceMetadata {
    return {
      id: 'grants-gov',
      name: 'Grants.gov',
      organization: 'U.S. Department of Health and Human Services',
      type: 'API',
      baseUrl: this.baseUrl,
      apiUrl: this.apiUrl,
      documentationUrl: 'https://www.grants.gov/api',
      authType: 'NONE',
      sourceRole: 'OPPORTUNITY_FEED',
      jurisdictionScope: 'UNKNOWN',
      trustLevel: 'OFFICIAL_GOVERNMENT',
      official: true,
      priority: 100,
      defaultPageSize: config.GRANTS_GOV_PAGE_SIZE,
      maxPages: config.GRANTS_GOV_MAX_PAGES,
    };
  }

  public async validateConnection(): Promise<{
    healthy: boolean;
    message: string;
    latencyMs: number;
  }> {
    const start = Date.now();
    try {
      await this.fetchOpportunities({ keyword: 'assistance', rows: 1, startRecordNum: 0 });
      return {
        healthy: true,
        message: 'Grants.gov search2 endpoint is reachable and returned a valid contract',
        latencyMs: Date.now() - start,
      };
    } catch (error: unknown) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - start,
      };
    }
  }

  public async fetchOpportunities(params: SourceFetchParams): Promise<SourceFetchResult> {
    const rows = Math.max(
      1,
      Math.min(params.rows || config.GRANTS_GOV_PAGE_SIZE, config.MAX_OPPORTUNITY_FETCH_ROWS)
    );
    const startRecordNum = Math.max(0, params.startRecordNum || 0);
    const requestPayload = {
      rows,
      startRecordNum,
      keyword: params.keyword || '',
      oppNum: params.opportunityNumber || '',
      eligibilities: params.eligibility || '',
      agencies: params.agency || '',
      oppStatuses: params.oppStatuses || 'posted',
      aln: params.assistanceListingNumber || '',
      fundingCategories: params.fundingCategory || '',
      fundingInstruments: params.fundingInstrument || '',
      ...(params.dateRange ? { dateRange: params.dateRange } : {}),
    };

    const json = await this.httpClient.requestJson<GrantsGovSearchResponse>(
      `${this.apiUrl}/search2`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      }
    );

    if (
      json.errorcode !== 0 ||
      !json.data ||
      !Array.isArray(json.data.oppHits) ||
      typeof json.data.hitCount !== 'number'
    ) {
      const sourceErrors = json.data?.errorMsgs?.join('; ');
      throw new Error(
        `Grants.gov search2 contract error: ${sourceErrors || json.msg || 'missing response data'}`
      );
    }

    const items: RawOpportunityItem[] = json.data.oppHits.map((hit) => ({
      sourceOpportunityId: String(hit.id),
      sourceOpportunityNumber: hit.number,
      sourceUrl: `${this.baseUrl}/search-results-detail/${hit.id}`,
      title: cleanText(hit.title),
      agencyOrProvider: cleanText(hit.agency || hit.agencyName || hit.agencyCode),
      agencyCode: hit.agencyCode,
      openDate: hit.openDate,
      closeDate: hit.closeDate,
      oppStatus: hit.oppStatus,
      docType: hit.docType,
      cfdaList: hit.cfdaList || hit.alnist || [],
      description: cleanText(hit.description),
      rawPayload: hit,
    }));

    const nextStart = startRecordNum + items.length;
    const hasMore = items.length > 0 && nextStart < json.data.hitCount;
    return {
      sourceId: 'grants-gov',
      totalHits: json.data.hitCount,
      startRecord: json.data.startRecord ?? startRecordNum,
      nextStartRecord: hasMore ? nextStart : null,
      hasMore,
      items,
      rawResponse: json,
    };
  }

  public async fetchOpportunityDetail(
    sourceOpportunityId: string
  ): Promise<RawOpportunityDetail | null> {
    const numericId = Number(sourceOpportunityId);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      throw new Error(`Invalid Grants.gov opportunity ID: ${sourceOpportunityId}`);
    }

    const json = await this.httpClient.requestJson<GrantsGovDetailResponse>(
      `${this.apiUrl}/fetchOpportunity`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId: numericId }),
      }
    );
    if (json.errorcode !== 0 || !json.data || !json.data.id) {
      throw new Error(
        `Grants.gov fetchOpportunity contract error: ${json.msg || 'missing opportunity detail'}`
      );
    }

    const data = json.data;
    const synopsis = data.synopsis || {};
    const deadline =
      parseDate(synopsis.responseDateStr) || parseDate(synopsis.responseDate);
    const sourceStatus = data.docType === 'forecast' ? 'forecasted' : 'posted';
    const status = mapStatus(sourceStatus, deadline);
    const applicantTypes = Array.isArray(synopsis.applicantTypes)
      ? synopsis.applicantTypes
      : [];
    const fundingInstruments = Array.isArray(synopsis.fundingInstruments)
      ? synopsis.fundingInstruments
      : [];
    const fundingCategories = Array.isArray(synopsis.fundingActivityCategories)
      ? synopsis.fundingActivityCategories
      : [];
    const packages = Array.isArray(data.opportunityPkgs) ? data.opportunityPkgs : [];
    const alns = Array.isArray(data.alns) ? data.alns : [];
    const assistUrl =
      typeof data.assistURL === 'string' && /^https?:\/\//i.test(data.assistURL)
        ? data.assistURL
        : undefined;
    const assistHost = assistUrl ? new URL(assistUrl).hostname.toLowerCase() : '';
    const officialApplication = Boolean(
      assistUrl && (assistHost.endsWith('.gov') || assistHost === 'grants.gov')
    );
    const agencyDetails =
      synopsis.topAgencyDetails || synopsis.agencyDetails || data.topAgencyDetails || data.agencyDetails;

    return {
      sourceOpportunityId: String(data.id),
      title: cleanText(data.opportunityTitle),
      description: cleanText(synopsis.synopsisDesc),
      providerName: cleanText(agencyDetails?.agencyName || synopsis.agencyName),
      sourceUrl: `${this.baseUrl}/search-results-detail/${data.id}`,
      applicationUrl: assistUrl,
      applicationUrlType: assistUrl
        ? officialApplication
          ? 'OFFICIAL_APPLICATION'
          : 'THIRD_PARTY'
        : 'UNKNOWN',
      applicationUrlVerified: officialApplication,
      amountMin: parseNumber(synopsis.awardFloor),
      amountMax: parseNumber(synopsis.awardCeiling),
      currency: 'USD',
      deadline,
      rollingDeadline: false,
      status,
      programType: 'GRANT',
      locationScope: 'UNKNOWN',
      countryCode: null,
      states: [],
      counties: [],
      cities: [],
      zipCodes: [],
      regions: [],
      category: 'grants',
      subcategories: [
        ...alns.map((aln: any) => `ALN-${aln.alnNumber}`).filter(Boolean),
        ...fundingCategories
          .map((category: any) => cleanText(category.description))
          .filter(Boolean),
      ],
      audiences: mapApplicantAudiences(applicantTypes),
      fundingPurposes: [],
      requiredDocuments: [],
      eligibilitySummary: cleanText(synopsis.applicantEligibilityDesc) || undefined,
      eligibilityRules: {
        applicantTypes: applicantTypes.map((item: any) => ({
          id: String(item.id || ''),
          description: cleanText(item.description),
        })),
        fundingInstruments: fundingInstruments.map((item: any) => ({
          id: String(item.id || ''),
          description: cleanText(item.description),
        })),
        costSharing: typeof synopsis.costSharing === 'boolean' ? synopsis.costSharing : null,
      },
      contactInfo: {
        name: cleanText(synopsis.agencyContactName),
        email: cleanText(synopsis.agencyContactEmail),
        phone: cleanText(synopsis.agencyContactPhone),
        description: cleanText(synopsis.agencyContactDesc),
      },
      sourceMetadata: {
        opportunityNumber: data.opportunityNumber,
        owningAgencyCode: data.owningAgencyCode,
        opportunityCategory: data.opportunityCategory,
        postingDate: synopsis.postingDateStr || synopsis.postingDate,
        archiveDate: synopsis.archiveDateStr || synopsis.archiveDate,
        estimatedFunding: parseNumber(synopsis.estimatedFunding),
        numberOfAwards: parseNumber(synopsis.numberOfAwards),
        assistanceListings: alns.map((aln: any) => ({
          number: aln.alnNumber,
          title: cleanText(aln.programTitle),
        })),
        packages: packages.map((pkg: any) => ({
          packageId: pkg.packageId,
          openingDate: pkg.openingDate,
          closingDate: pkg.closingDate,
          electronicRequired: pkg.electronicRequired,
          workspaceCompatible: pkg.workspaceCompatibleFlag,
        })),
        docType: data.docType,
        lastUpdatedDate: synopsis.lastUpdatedDate,
        geographicScopeVerified: false,
        documentsSourceVerified: false,
      },
      rawPayload: json,
    };
  }
}

export { cleanText as cleanGrantsGovText, mapStatus as mapGrantsGovStatus };
