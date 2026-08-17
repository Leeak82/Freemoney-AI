import crypto from 'crypto';
import { Opportunity, ProgramType, LocationScope } from '../types/index.js';
import { RawOpportunityItem, RawOpportunityDetail } from './registry.js';

export class OpportunityNormalizer {
  /**
   * Generates a deterministic SHA-256 fingerprint for secondary deduplication
   */
  public static generateFingerprint(
    provider: string,
    title: string,
    locationScope: string,
    applicationUrl?: string | null
  ): string {
    const normProvider = (provider || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    const normTitle = (title || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    const normLoc = (locationScope || 'nationwide').toLowerCase().trim();
    const normUrl = (applicationUrl || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');

    const seed = `${normProvider}:${normTitle}:${normLoc}:${normUrl}`;
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
    officialSource: boolean
  ): Partial<Opportunity> {
    const title = (raw.title || '').trim();
    const provider = (raw.agencyOrProvider || raw.agencyCode || 'Federal Agency').trim();
    const deadline = this.parseDate(raw.closeDate);
    const category = this.inferCategory(title, provider, raw.description);
    const sourceUrl = `https://www.grants.gov/search-results-detail/${raw.sourceOpportunityId}`;
    const applicationUrl = `https://www.grants.gov/search-results-detail/${raw.sourceOpportunityId}`;
    const locationScope: LocationScope = 'NATIONWIDE';
    const fingerprint = this.generateFingerprint(provider, title, locationScope, applicationUrl);

    let programType: ProgramType = 'GRANT';
    if (title.toLowerCase().includes('scholarship') || title.toLowerCase().includes('fellowship')) {
      programType = 'SCHOLARSHIP';
    } else if (title.toLowerCase().includes('benefit') || title.toLowerCase().includes('assistance')) {
      programType = 'ASSISTANCE';
    }

    const requiredDocs: string[] = ['Standard Application Form'];
    if (raw.docType === 'synopsis') {
      requiredDocs.push('Project Narrative', 'Budget Detail');
    }

    return {
      title,
      description: raw.description || `Official grant opportunity #${raw.sourceOpportunityId} published by ${provider}. Document type: ${raw.docType || 'synopsis'}. Open date: ${raw.openDate || 'N/A'}.`,
      provider_name: provider,
      source_id: sourceId,
      source_url: sourceUrl,
      application_url: applicationUrl,
      category,
      subcategories: raw.cfdaList ? raw.cfdaList.map((c) => `CFDA-${c}`) : [],
      program_type: programType,
      amount_min: null,
      amount_max: null,
      currency: 'USD',
      deadline,
      rolling_deadline: !deadline,
      location_scope: locationScope,
      states: [],
      counties: [],
      cities: [],
      zip_codes: [],
      eligibility_summary: raw.eligibilities ? raw.eligibilities.join(', ') : 'Eligible applicants include entities specified by program guidelines.',
      eligibility_rules: {
        rawStatus: raw.oppStatus,
        cfdaList: raw.cfdaList,
        docType: raw.docType,
      },
      required_documents: requiredDocs,
      contact_information: {
        agency: provider,
        agencyCode: raw.agencyCode,
      },
      official_source: officialSource,
      raw_source_identifier: raw.sourceOpportunityId,
      source_opportunity_id: raw.sourceOpportunityId,
      dedup_fingerprint: fingerprint,
      last_verified_at: new Date(),
      retrieved_at: new Date(),
      active: raw.oppStatus !== 'closed' && raw.oppStatus !== 'archived',
    };
  }
}
