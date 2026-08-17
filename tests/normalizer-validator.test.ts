import { describe, it, expect } from 'vitest';
import { OpportunityNormalizer } from '../src/sources/normalizer.js';
import { OpportunityValidator } from '../src/sources/validator.js';

describe('Opportunity Normalization, Validation, and Deduplication', () => {
  it('generates consistent deterministic fingerprints', () => {
    const fp1 = OpportunityNormalizer.generateFingerprint(
      'Department of Health',
      'Title X Family Planning',
      'NATIONWIDE',
      'https://www.grants.gov/search-results-detail/361754'
    );

    const fp2 = OpportunityNormalizer.generateFingerprint(
      'department of health ',
      'Title X Family Planning',
      'nationwide',
      'http://www.grants.gov/search-results-detail/361754/'
    );

    expect(fp1).toBe(fp2);
  });

  it('correctly infers categories from titles and agencies', () => {
    expect(OpportunityNormalizer.inferCategory('Section 8 Housing Voucher', 'HUD')).toBe('rent-housing');
    expect(OpportunityNormalizer.inferCategory('LIHEAP Energy Assistance', 'HHS')).toBe('utilities');
    expect(OpportunityNormalizer.inferCategory('SNAP Nutrition Aid', 'USDA')).toBe('food');
    expect(OpportunityNormalizer.inferCategory('Veterans Stand Down Grant', 'VA')).toBe('veterans');
    expect(OpportunityNormalizer.inferCategory('SBIR Phase I Innovation', 'SBA')).toBe('small-business');
  });

  it('validates opportunity integrity and rejects invalid entries', () => {
    const validOpp = {
      title: 'Valid Grant Opportunity',
      source_id: 'grants-gov',
      source_opportunity_id: '12345',
      source_url: 'https://www.grants.gov/12345',
      amount_min: 1000,
      amount_max: 5000,
      last_verified_at: new Date(),
      retrieved_at: new Date(),
    };

    const validResult = OpportunityValidator.validate(validOpp);
    expect(validResult.valid).toBe(true);
    expect(validResult.errors.length).toBe(0);

    const invalidOpp = {
      title: '', // Missing title
      source_id: 'grants-gov',
      source_opportunity_id: '12345',
      source_url: 'not-a-url',
      amount_min: 10000,
      amount_max: 5000, // min > max
    };

    const invalidResult = OpportunityValidator.validate(invalidOpp);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors.length).toBeGreaterThanOrEqual(3);
  });
});
