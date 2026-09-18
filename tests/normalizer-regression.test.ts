import { describe, expect, it } from 'vitest';
import { OpportunityNormalizer } from '../src/sources/normalizer.js';

describe('Normalizer regression coverage', () => {
  it('does not mistake words like parents for rent assistance', () => {
    const category = OpportunityNormalizer.inferCategory(
      'Survivors benefits for parents',
      'Social Security Administration',
      'Social Security survivors benefits to parents of eligible workers.'
    );
    expect(category).toBe('grants');
    expect(category).not.toBe('rent-housing');
  });
});
