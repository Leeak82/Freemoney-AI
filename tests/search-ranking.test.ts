import { describe, it, expect } from 'vitest';
import { SearchEngine } from '../src/search/search-engine.js';
import { OpportunityValidator } from '../src/sources/validator.js';

describe('Search Filters, Trust Ranking, and Data Quality Guard', () => {
  it('validates and rejects corrupt opportunities with bad numbers and URLs', () => {
    const corruptOpp = {
      title: 'Corrupt Grant',
      source_id: 'grants-gov',
      source_opportunity_id: '999',
      source_url: 'javascript:alert(1)', // Malicious / invalid URL protocol
      amount_min: -500, // Negative amount
      amount_max: -100,
      deadline: 'invalid-date-string',
    };

    const res = OpportunityValidator.validate(corruptOpp);
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('calculates trust-weighted deterministic ranking correctly', () => {
    const govMultiplier = (SearchEngine as any).TRUST_MULTIPLIERS['OFFICIAL_GOVERNMENT'];
    const communityMultiplier = (SearchEngine as any).TRUST_MULTIPLIERS['COMMUNITY'];
    const unknownMultiplier = (SearchEngine as any).TRUST_MULTIPLIERS['UNKNOWN'];

    expect(govMultiplier).toBe(1.0);
    expect(communityMultiplier).toBe(0.5);
    expect(unknownMultiplier).toBe(0.2);
    expect(govMultiplier).toBeGreaterThan(communityMultiplier);
  });
});
