import crypto from 'crypto';
import {
  FundingPurpose,
  LocationScope,
  Opportunity,
  OpportunityAudience,
  OpportunityStatus,
  ProgramType,
} from '../types/index.js';
import { RawOpportunityItem, RawOpportunityDetail } from './registry.js';

export class OpportunityNormalizer {
  /**
   * Generates a deterministic SHA-256 fingerprint for secondary deduplication
   */
  public static generateFingerprint(
    provider: string,
    title: string,
    locationScope: string,
    applicationUrl?: string | null,
    deadline?: Date | string | null
  ): string {
    const normProvider = (provider || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    const normTitle = (title || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    const normLoc = (locationScope || 'nationwide').toLowerCase().trim();
    const normUrl = (applicationUrl || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    const normDeadline = deadline
      ? new Date(deadline).toISOString().slice(0, 10)
      : '';

    const seed = `${normProvider}:${normTitle}:${normLoc}:${normDeadline}:${normUrl}`;
    return crypto.createHash('sha256').update(seed).digest('hex');
  }

  /**
   * Infer primary category slug based on title, description, and agency keywords
   */
  public static inferCategory(title: string, agency: string, desc?: string): string {
    const text = `${title} ${agency} ${desc || ''}`.toLowerCase();

    if (text.includes('housing') || text.includes('rent') || text.includes('homeless') || text.includes('shelter') || text.includes('hud')) {
      return 'rent-housing';
    }
    if (text.includes('utility') || text.includes('energy') || text.includes('liheap') || text.includes('water') || text.includes('weatherization')) {
      return 'utilities';
    }
    if (text.includes('food') || text.includes('nutrition') || text.includes('snap') || text.includes('wic') || text.includes('hunger')) {
      return 'food';
    }
    if (text.includes('veteran') || text.includes('military') || text.includes('va-') || text.includes('armed forces')) {
      return 'veterans';
    }
    if (text.includes('disab') || text.includes('assistive') || text.includes('rehabilitation') || text.includes('special needs')) {
      return 'disability';
    }
    if (text.includes('scholarship') || text.includes('fellowship') || text.includes('education') || text.includes('tuition') || text.includes('stem')) {
      return 'education-scholarships';
    }
    if (text.includes('health') || text.includes('medical') || text.includes('nih') || text.includes('cdc') || text.includes('biomedical') || text.includes('nursing')) {
      return 'medical-assistance';
    }
    if (text.includes('child') || text.includes('family') || text.includes('youth') || text.includes('tanf') || text.includes('infant')) {
      return 'child-family';
    }
    if (text.includes('disaster') || text.includes('fema') || text.includes('flood') || text.includes('hurricane') || text.includes('emergency')) {
      return 'emergency-assistance';
    }
    if (text.includes('small business') || text.includes('sbir') || text.includes('sttr') || text.includes('sba') || text.includes('entrepreneur')) {
      return 'small-business';
    }
    if (text.includes('transportation') || text.includes('transit') || text.includes('dot ') || text.includes('highway') || text.includes('aviation')) {
      return 'transportation';
    }
    if (text.includes('tax') || text.includes('eitc') || text.includes('irs')) {
      return 'tax-credits';
    }
    if (text.includes('debt') || text.includes('counseling') || text.includes('credit')) {
      return 'debt-financial';
    }

    return 'grants';
  }

  public static inferAudiences(
    title: string,
    agency: string,
    description?: string
  ): OpportunityAudience[] {
    const text = `${title} ${agency} ${description || ''}`.toLowerCase();
    const audiences = new Set<OpportunityAudience>();
    if (text.includes('small business') || text.includes('sbir') || text.includes('sttr')) {
      audiences.add('SMALL_BUSINESS');
    }
    if (text.includes('startup') || text.includes('entrepreneur')) {
      audiences.add('STARTUP');
      audiences.add('ENTREPRENEUR');
    }
    if (text.includes('veteran')) audiences.add('VETERAN');
    if (text.includes('student') || text.includes('scholarship')) audiences.add('STUDENT');
    if (text.includes('nonprofit') || text.includes('non-profit')) audiences.add('NONPROFIT');
    return [...audiences];
  }

  public static inferFundingPurposes(
    title: string,
    description?: string
  ): FundingPurpose[] {
    const text = `${title} ${description || ''}`.toLowerCase();
    const purposes = new Set<FundingPurpose>();
    if (text.includes('equipment')) purposes.add('EQUIPMENT');
    if (text.includes('working capital')) purposes.add('WORKING_CAPITAL');
    if (text.includes('training') || text.includes('workforce')) purposes.add('TRAINING');
    if (text.includes('technology') || text.includes('innovation')) purposes.add('TECHNOLOGY');
    if (text.includes('export')) purposes.add('EXPORT');
    if (text.includes('disaster')) purposes.add('DISASTER_RECOVERY');
    if (text.includes('expansion')) purposes.add('EXPANSION');
    return [...purposes];
  }

  /**
   * Parse date string safely into Date object or null
   */
  public static parseDate(dateStr?: string | null): Date | null {
    if (!dateStr || dateStr.trim() === '') return null;
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) return null;
    return parsed;
  }

  /**
   * Normalizes a RawOpportunityItem into an Opportunity domain model
   */
  public static normalizeFromRaw(
    raw: RawOpportunityItem,
    sourceId: string,
    officialSource: boolean,
    detail: RawOpportunityDetail | null = raw.detail || null
  ): Partial<Opportunity> {
    const title = (detail?.title || raw.title || '').trim();
    const provider = (
      detail?.providerName ||
      raw.agencyOrProvider ||
      raw.agencyCode ||
      ''
    ).trim();
    const deadline = detail?.deadline ?? this.parseDate(raw.closeDate);
    const description = detail?.description || raw.description || '';
    const category = this.inferCategory(title, provider, description);
    const sourceUrl = `https://www.grants.gov/search-results-detail/${raw.sourceOpportunityId}`;
    const applicationUrl = detail?.applicationUrl || null;
    const locationScope: LocationScope = detail?.locationScope || 'UNKNOWN';
    const fingerprint = this.generateFingerprint(
      provider,
      title,
      locationScope,
      applicationUrl || sourceUrl,
      deadline
    );

    let programType: ProgramType = detail?.programType || 'GRANT';
    if (title.toLowerCase().includes('scholarship') || title.toLowerCase().includes('fellowship')) {
      programType = 'SCHOLARSHIP';
    } else if (title.toLowerCase().includes('benefit') || title.toLowerCase().includes('assistance')) {
      programType = 'ASSISTANCE';
    }

    const rawStatus = raw.oppStatus?.toLowerCase();
    let status: OpportunityStatus = detail?.status || 'UNKNOWN';
    if (rawStatus === 'closed' || rawStatus === 'archived') status = 'CLOSED';
    else if (rawStatus === 'forecasted') status = 'PAUSED';
    else if (rawStatus === 'posted') {
      status = deadline && deadline.getTime() < Date.now() ? 'EXPIRED' : 'ACTIVE';
    }
    const inferredAudiences = this.inferAudiences(title, provider, description);
    const audiences = [...new Set([...(detail?.audiences || []), ...inferredAudiences])];
    const fundingPurposes = [
      ...new Set([
        ...(detail?.fundingPurposes || []),
        ...this.inferFundingPurposes(title, description),
      ]),
    ];

    return {
      title,
      description,
      provider_name: provider,
      source_id: sourceId,
      source_url: detail?.sourceUrl || sourceUrl,
      application_url: applicationUrl,
      application_url_type: detail?.applicationUrlType || 'UNKNOWN',
      application_url_verified: detail?.applicationUrlVerified || false,
      category,
      subcategories:
        detail?.subcategories ||
        (raw.cfdaList ? raw.cfdaList.map((value) => `ALN-${value}`) : []),
      program_type: programType,
      amount_min: detail?.amountMin ?? null,
      amount_max: detail?.amountMax ?? null,
      currency: detail?.currency || 'USD',
      deadline,
      rolling_deadline: detail?.rollingDeadline || false,
      location_scope: locationScope,
      country_code: detail?.countryCode ?? null,
      regions: detail?.regions || [],
      states: detail?.states || [],
      counties: detail?.counties || [],
      cities: detail?.cities || [],
      zip_codes: detail?.zipCodes || [],
      eligibility_summary:
        detail?.eligibilitySummary ||
        (raw.eligibilities ? raw.eligibilities.join(', ') : null),
      eligibility_rules: {
        ...(detail?.eligibilityRules || {}),
        sourceStatus: raw.oppStatus || null,
      },
      required_documents: detail?.requiredDocuments || [],
      contact_information: detail?.contactInfo || {
        agencyCode: raw.agencyCode || null,
      },
      official_source: officialSource,
      source_provider: provider,
      source_metadata: {
        ...(detail?.sourceMetadata || {}),
        opportunityNumber: raw.sourceOpportunityNumber || null,
        sourceDocumentType: raw.docType || null,
        openDate: raw.openDate || null,
        rawSummary: raw.rawPayload,
      },
      raw_source_identifier: raw.sourceOpportunityId,
      source_opportunity_id: raw.sourceOpportunityId,
      dedup_fingerprint: fingerprint,
      last_verified_at: new Date(),
      retrieved_at: new Date(),
      status,
      active: status === 'ACTIVE',
      audiences,
      funding_purposes: fundingPurposes,
    };
  }
}
