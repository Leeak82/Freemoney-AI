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
    const classify = (value: string): string | null => {
      const text = value.toLowerCase();
      if (/\b(housing|rent(?:al)?|homeless(?:ness)?|shelter|hud)\b/.test(text)) return 'rent-housing';
      if (/\b(utility|utilities|energy|liheap|water|weatherization)\b/.test(text)) return 'utilities';
      if (/\b(food|nutrition|snap|wic|hunger)\b/.test(text)) return 'food';
      if (/\b(veteran|veterans|military|armed forces)\b|\bva-/.test(text)) return 'veterans';
      if (/\b(disab\w*|assistive|rehabilitation|special needs|ssi|ssdi)\b|social security disability/.test(text)) return 'disability';
      if (/\b(scholarship|fellowship|education|tuition|stem)\b/.test(text)) return 'education-scholarships';
      if (/\b(health|medical|nih|cdc|biomedical|nursing)\b/.test(text)) return 'medical-assistance';
      if (/\b(child|children|family|youth|tanf|infant)\b/.test(text)) return 'child-family';
      if (/\b(disaster|fema|flood|hurricane|emergency)\b|funeral assistance/.test(text)) return 'emergency-assistance';
      if (/\b(small business|sbir|sttr|sba|entrepreneur\w*)\b/.test(text)) return 'small-business';
      if (/\b(transportation|transit|highway|aviation)\b|\bdot\b/.test(text)) return 'transportation';
      if (/\b(tax|eitc|irs)\b/.test(text)) return 'tax-credits';
      if (/\b(debt|counseling|credit)\b/.test(text)) return 'debt-financial';
      return null;
    };

    // Strong title/provider signals beat incidental words buried in long descriptions.
    return classify(`${title} ${agency}`) || classify(desc || '') || 'grants';
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
    const inferredCategory = this.inferCategory(title, provider, description);
    const category = detail?.programType === 'BENEFIT' && inferredCategory === 'grants'
      ? 'other'
      : inferredCategory;
    const sourceUrl = detail?.sourceUrl || raw.sourceUrl || '';
    const applicationUrl = detail?.applicationUrl || null;
    const locationScope: LocationScope = detail?.locationScope || 'UNKNOWN';
    const fingerprintLocation = [
      locationScope,
      detail?.countryCode || '',
      ...(detail?.regions || []),
      ...(detail?.states || []),
      ...(detail?.counties || []),
      ...(detail?.cities || []),
      ...(detail?.zipCodes || []),
    ].join('|');
    const fingerprint = this.generateFingerprint(
      provider,
      title,
      fingerprintLocation,
      applicationUrl,
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
      source_url: sourceUrl,
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
