import {
  IOpportunitySource,
  SourceMetadata,
  SourceFetchParams,
  SourceFetchResult,
  RawOpportunityDetail,
  RawOpportunityItem,
} from './registry.js';
import { config } from '../config/index.js';

export interface GrantsGovSearchResponse {
  errorcode: number;
  msg: string;
  token?: string;
  data?: {
    searchParams?: any;
    hitCount: number;
    startRecord: number;
    oppHits: Array<{
      id: string; // e.g., "361754"
      number: string; // e.g., "PA-FPH-27-001"
      title: string;
      agencyCode?: string;
      agency: string;
      openDate?: string;
      closeDate?: string;
      oppStatus: string; // "posted", "forecasted", "closed", "archived"
      docType?: string;
      cfdaList?: string[];
      description?: string;
    }>;
  };
}

export class GrantsGovSource implements IOpportunitySource {
  private readonly baseUrl: string;
  private readonly apiUrl: string;

  constructor(apiUrl: string = config.GRANTS_GOV_API_URL) {
    this.baseUrl = 'https://www.grants.gov';
    this.apiUrl = apiUrl;
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
      trustLevel: 'OFFICIAL_GOVERNMENT',
      official: true,
      priority: 100,
    };
  }

  public async validateConnection(): Promise<{ healthy: boolean; message: string; latencyMs: number }> {
    const start = Date.now();
    try {
      const resp = await fetch(`${this.apiUrl}/search2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: 'test', rows: 1 }),
      });
      const latencyMs = Date.now() - start;
      if (!resp.ok) {
        return {
          healthy: false,
          message: `Grants.gov API returned HTTP status ${resp.status}`,
          latencyMs,
        };
      }
      const data = (await resp.json()) as GrantsGovSearchResponse;
      if (data.errorcode !== 0) {
        return {
          healthy: false,
          message: `Grants.gov error message: ${data.msg}`,
          latencyMs,
        };
      }
      return {
        healthy: true,
        message: 'Grants.gov Search2 endpoint reachable and operational',
        latencyMs,
      };
    } catch (err: any) {
      return {
        healthy: false,
        message: `Connection failed: ${err.message}`,
        latencyMs: Date.now() - start,
      };
    }
  }

  public async fetchOpportunities(params: SourceFetchParams): Promise<SourceFetchResult> {
    const requestPayload = {
      keyword: params.keyword || '',
      rows: params.rows || 50,
      startRecordNum: params.startRecordNum || 0,
      oppStatuses: params.oppStatuses || 'posted|forecasted',
      ...(params.dateRange ? { dateRange: params.dateRange } : {}),
    };

    const resp = await fetch(`${this.apiUrl}/search2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload),
    });

    if (!resp.ok) {
      throw new Error(`Grants.gov API request failed with status: ${resp.status} ${resp.statusText}`);
    }

    const json = (await resp.json()) as GrantsGovSearchResponse;
    if (json.errorcode !== 0) {
      throw new Error(`Grants.gov API error: ${json.msg}`);
    }

    const data = json.data;
    const items: RawOpportunityItem[] = (data?.oppHits || []).map((hit) => {
      return {
        sourceOpportunityId: String(hit.id),
        title: hit.title,
        agencyOrProvider: hit.agency,
        agencyCode: hit.agencyCode,
        openDate: hit.openDate,
        closeDate: hit.closeDate,
        oppStatus: hit.oppStatus,
        docType: hit.docType,
        cfdaList: hit.cfdaList,
        description: hit.description,
        rawPayload: hit,
      };
    });

    return {
      sourceId: 'grants-gov',
      totalHits: data?.hitCount || items.length,
      items,
      rawResponse: json,
    };
  }

  public async fetchOpportunityDetail(sourceOpportunityId: string): Promise<RawOpportunityDetail | null> {
    try {
      const resp = await fetch(`${this.apiUrl}/fetchOpportunity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oppId: sourceOpportunityId }),
      });

      if (!resp.ok) {
        return null;
      }

      const json = (await resp.json()) as any;
      if (json.errorcode !== 0 || !json.data) {
        return null;
      }

      const d = json.data;
      const synopsis = d.synopsis || {};

      const deadline = synopsis.responseDate ? new Date(synopsis.responseDate) : null;
      const amountMin = synopsis.awardCeiling ? parseFloat(synopsis.awardCeiling) : undefined;
      const amountMax = synopsis.awardCeiling ? parseFloat(synopsis.awardCeiling) : undefined;

      return {
        sourceOpportunityId,
        title: synopsis.opportunityTitle || d.title || `Grants.gov Opportunity #${sourceOpportunityId}`,
        description: synopsis.synopsisDesc || synopsis.synopsisExplanation || 'Official federal grant opportunity listed on Grants.gov.',
        providerName: synopsis.agencyName || d.agency || 'Federal Agency',
        sourceUrl: `https://www.grants.gov/search-results-detail/${sourceOpportunityId}`,
        applicationUrl: `https://www.grants.gov/search-results-detail/${sourceOpportunityId}`,
        amountMin,
        amountMax,
        currency: 'USD',
        deadline,
        rollingDeadline: !deadline,
        category: 'grants',
        subcategories: synopsis.fundingCategory ? [synopsis.fundingCategory] : [],
        requiredDocuments: synopsis.applicantEligibilityDesc ? ['Official Application Form', 'Project Proposal', 'Budget Narrative'] : ['Standard Application Package'],
        eligibilitySummary: synopsis.applicantEligibilityDesc || null,
        eligibilityRules: {
          cfdaNumber: synopsis.cfdaNumber,
          applicantTypes: synopsis.applicantTypes,
        },
        contactInfo: {
          agencyContactDesc: synopsis.agencyContactDesc,
          agencyContactEmail: synopsis.agencyContactEmail,
          agencyContactPhone: synopsis.agencyContactPhone,
        },
        rawPayload: json,
      };
    } catch {
      return null;
    }
  }
}
