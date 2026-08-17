import { describe, expect, it } from 'vitest';
import { BusinessEligibilityMatcher } from '../src/business/business-matcher.js';
import {
  BusinessProviderRegistry,
  FederalBusinessRequirementProvider,
} from '../src/business/providers.js';
import { Opportunity } from '../src/types/index.js';

const businessOpportunity: Opportunity = {
  id: '00000000-0000-0000-0000-000000000020',
  title: 'Veteran Startup Equipment Program',
  description: 'Verified support for eligible veteran-owned startups.',
  provider_name: 'Official Agency',
  source_id: 'grants-gov',
  source_url: 'https://www.grants.gov',
  application_url: null,
  category: 'small-business',
  subcategories: [],
  program_type: 'GRANT',
  amount_min: 10_000,
  amount_max: 50_000,
  currency: 'USD',
  deadline: null,
  rolling_deadline: true,
  location_scope: 'STATE',
  country_code: 'US',
  regions: [],
  states: ['WA'],
  counties: [],
  cities: [],
  zip_codes: [],
  eligibility_summary: 'Published program information.',
  eligibility_rules: { businessStages: ['IDEA', 'PLANNING', 'PRE_REVENUE'] },
  required_documents: ['Business plan'],
  contact_information: {},
  official_source: true,
  raw_source_identifier: 'business-test',
  source_opportunity_id: 'business-test',
  dedup_fingerprint: 'business-test',
  last_verified_at: new Date(),
  retrieved_at: new Date(),
  active: true,
  audiences: ['STARTUP', 'VETERAN', 'SMALL_BUSINESS'],
  funding_purposes: ['EQUIPMENT'],
  created_at: new Date(),
  updated_at: new Date(),
};

describe('Business eligibility and official providers', () => {
  it('matches location, stage, ownership, purpose, and amount', async () => {
    const matcher = new BusinessEligibilityMatcher();
    const result = await matcher.evaluateBusinessEligibility(businessOpportunity, {
      user_id: '00000000-0000-0000-0000-000000000001',
      country: 'US',
      state: 'WA',
      business_stage: 'IDEA',
      funding_purpose: 'EQUIPMENT',
      funding_needed: 25_000,
      veteran_owned: true,
    });

    expect(result.matchScore).toBeGreaterThanOrEqual(80);
    expect(result.potentialDisqualifiers).toEqual([]);
    expect(result.matchedFactors.some((factor) => factor.includes('EQUIPMENT'))).toBe(true);
  });

  it('rejects a verified state mismatch', async () => {
    const matcher = new BusinessEligibilityMatcher();
    const result = await matcher.evaluateBusinessEligibility(businessOpportunity, {
      user_id: '00000000-0000-0000-0000-000000000001',
      country: 'US',
      state: 'TX',
      business_stage: 'IDEA',
    });
    expect(result.status).toBe('DISQUALIFIED');
    expect(result.potentialDisqualifiers[0]).toContain('WA');
  });

  it('returns official federal resources without inventing local requirements', async () => {
    const provider = new FederalBusinessRequirementProvider();
    const requirements = await provider.findRequirements({
      countryCode: 'US',
      state: 'WA',
      industry: 'Food service',
    });
    expect(requirements.length).toBeGreaterThan(0);
    expect(requirements.every((item) => item.official)).toBe(true);
    expect(requirements.every((item) => item.status === 'NEEDS_VERIFICATION')).toBe(true);
    expect(requirements.every((item) => item.required === null)).toBe(true);
  });

  it('does not fabricate state LLC filing details without a state provider', async () => {
    const registry = new BusinessProviderRegistry();
    const guidance = await registry.getFormationGuidance({
      countryCode: 'US',
      state: 'WA',
      structure: 'LLC',
    });
    expect(guidance.supported).toBe(false);
    expect(guidance.officialAgency).toBeNull();
    expect(guidance.missingInformation.some((item) => item.includes('LLC filing agency'))).toBe(
      true
    );
  });
});
