import { describe, it, expect } from 'vitest';
import { RuleBasedEligibilityMatcher } from '../src/matching/eligibility-matcher.js';
import { Opportunity } from '../src/types/index.js';

describe('IEligibilityMatcher & Preserved Uncertainty', () => {
  const mockOpportunity: Opportunity = {
    id: 'test-opp-1',
    title: 'Veteran Small Business Innovation Grant',
    description: 'Grant program for military veteran entrepreneurs.',
    provider_name: 'Veterans Administration & SBA',
    source_id: 'grants-gov',
    source_url: 'https://www.grants.gov/test',
    application_url: 'https://www.grants.gov/test',
    category: 'veterans',
    subcategories: [],
    program_type: 'GRANT',
    amount_min: 5000,
    amount_max: 25000,
    currency: 'USD',
    deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    rolling_deadline: false,
    location_scope: 'NATIONWIDE',
    states: [],
    counties: [],
    cities: [],
    zip_codes: [],
    eligibility_summary: 'Must be an honorably discharged veteran and registered small business owner.',
    eligibility_rules: {},
    required_documents: ['Application Form', 'DD-214'],
    contact_information: {},
    official_source: true,
    raw_source_identifier: 'test-opp-1',
    source_opportunity_id: 'test-opp-1',
    dedup_fingerprint: 'fp-123',
    last_verified_at: new Date(),
    retrieved_at: new Date(),
    active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const matcher = new RuleBasedEligibilityMatcher();

  it('returns NEEDS_VERIFICATION and matchScore=null when no profile is provided', async () => {
    const result = await matcher.evaluateEligibility(mockOpportunity);

    expect(result.matchScore).toBeNull();
    expect(result.confidence).toBe('INSUFFICIENT_DATA');
    expect(result.status).toBe('NEEDS_VERIFICATION');
    expect(result.missingInformation.length).toBeGreaterThan(0);
  });

  it('calculates high match score for matching veteran business owner profile', async () => {
    const matchingProfile = {
      state: 'WA',
      is_veteran: true,
      is_business_owner: true,
      income_range: '25k-50k',
    };

    const result = await matcher.evaluateEligibility(mockOpportunity, matchingProfile);

    expect(result.matchScore).toBeGreaterThanOrEqual(80);
    expect(result.status).toBe('LIKELY_MATCH');
    expect(result.matchedFactors.some((f) => f.includes('Veteran'))).toBe(true);
    expect(result.requiredDocuments).toContain('DD-214 or Veteran Verification Document');
  });

  it('identifies disqualifiers when applicant does not meet target criteria', async () => {
    const nonVeteranProfile = {
      state: 'WA',
      is_veteran: false,
      is_business_owner: false,
    };

    const result = await matcher.evaluateEligibility(mockOpportunity, nonVeteranProfile);

    expect(result.status).toBe('DISQUALIFIED');
    expect(result.potentialDisqualifiers.length).toBeGreaterThan(0);
  });
});
