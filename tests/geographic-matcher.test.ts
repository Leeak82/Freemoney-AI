import { describe, expect, it } from 'vitest';
import { GeographicMatcher } from '../src/geography/geographic-matcher.js';
import { Opportunity } from '../src/types/index.js';

function opportunity(overrides: Partial<Opportunity>): Opportunity {
  return {
    id: '00000000-0000-0000-0000-000000000010',
    title: 'Verified program',
    description: 'Source-backed assistance.',
    provider_name: 'Official Agency',
    source_id: 'grants-gov',
    source_url: 'https://www.grants.gov',
    application_url: null,
    category: 'grants',
    subcategories: [],
    program_type: 'GRANT',
    amount_min: null,
    amount_max: null,
    currency: 'USD',
    deadline: null,
    rolling_deadline: true,
    location_scope: 'UNKNOWN',
    country_code: 'US',
    regions: [],
    states: [],
    counties: [],
    cities: [],
    zip_codes: [],
    eligibility_summary: null,
    eligibility_rules: {},
    required_documents: [],
    contact_information: {},
    official_source: true,
    raw_source_identifier: 'geo-test',
    source_opportunity_id: 'geo-test',
    dedup_fingerprint: 'geo-test',
    last_verified_at: new Date(),
    retrieved_at: new Date(),
    active: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('Universal geographic intelligence', () => {
  const matcher = new GeographicMatcher();

  it('matches a nationwide US opportunity to a user in any US state', () => {
    const result = matcher.matchOpportunity(
      { country_code: 'US', state: 'TX' },
      opportunity({ location_scope: 'NATIONWIDE' })
    );
    expect(result.level).toBe('NATIONWIDE');
    expect(result.matched).toBe(true);
  });

  it('does not match a state-only program to another state', () => {
    const result = matcher.matchOpportunity(
      { country_code: 'US', state: 'TX' },
      opportunity({ location_scope: 'STATE', states: ['WA'] })
    );
    expect(result.level).toBe('NO_MATCH');
    expect(result.matched).toBe(false);
  });

  it('requires matching county data for a county opportunity', () => {
    const missing = matcher.matchOpportunity(
      { country_code: 'US', state: 'CO' },
      opportunity({
        location_scope: 'COUNTY',
        states: ['CO'],
        counties: ['Denver County'],
      })
    );
    expect(missing.level).toBe('UNKNOWN');

    const exact = matcher.matchOpportunity(
      { country_code: 'US', state: 'CO', county: 'Denver' },
      opportunity({
        location_scope: 'COUNTY',
        states: ['CO'],
        counties: ['Denver County'],
      })
    );
    expect(exact.level).toBe('COUNTY');
    expect(exact.matched).toBe(true);
  });

  it('never silently treats unknown geography as nationwide', () => {
    const result = matcher.matchOpportunity(
      { country_code: 'US', state: 'WA' },
      opportunity({ location_scope: 'UNKNOWN' })
    );
    expect(result.level).toBe('UNKNOWN');
    expect(result.matched).toBe(false);
    expect(result.score).toBeNull();
  });
});
