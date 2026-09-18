import { describe, expect, it } from 'vitest';
import { NaturalLanguageSearchParser } from '../src/search/natural-language-parser.js';

const parser = new NaturalLanguageSearchParser();

describe('Natural-language assistance search parser', () => {
  it('parses urgent rent help in Pierce County', () => {
    const result = parser.parse("I'm behind on rent in Pierce County, Washington and need help now.");
    expect(result.search.intent).toBe('PERSONAL_ASSISTANCE');
    expect(result.detected.categories).toContain('rent-housing');
    expect(result.detected.categories).toContain('emergency-assistance');
    expect(result.detected.location.county).toBe('Pierce');
    expect(result.detected.location.state).toBe('WA');
    expect(result.detected.urgency).toBe('URGENT');
    expect(result.inferred_profile.housing_status).toBe('RENTER');
  });

  it('parses disabled veteran utility assistance in Tacoma', () => {
    const result = parser.parse("I'm a disabled veteran in Tacoma, WA looking for help with utilities.");
    expect(result.detected.categories).toContain('utilities');
    expect(result.detected.audiences).toEqual(expect.arrayContaining(['VETERAN', 'DISABLED']));
    expect(result.inferred_profile.is_veteran).toBe(true);
    expect(result.inferred_profile.is_disabled).toBe(true);
    expect(result.detected.location.city).toBe('Tacoma');
    expect(result.detected.location.state).toBe('WA');
  });

  it('parses an Alaska LLC equipment-funding request', () => {
    const result = parser.parse('I want to start an LLC in Alaska and need equipment funding.');
    expect(result.search.intent).toBe('BUSINESS_ASSISTANCE');
    expect(result.detected.categories).toEqual(expect.arrayContaining(['llc-formation', 'startup-funding', 'equipment-assistance']));
    expect(result.detected.funding_purposes).toContain('EQUIPMENT');
    expect(result.detected.location.state).toBe('AK');
    expect(result.inferred_business_profile.business_structure).toBe('LLC');
    expect(result.inferred_business_profile.business_stage).toBe('PLANNING');
  });

  it('parses family food and childcare help by ZIP without inventing a state', () => {
    const result = parser.parse('Single mom in 98409 needs food and childcare assistance.');
    expect(result.search.intent).toBe('PERSONAL_ASSISTANCE');
    expect(result.detected.categories).toEqual(expect.arrayContaining(['food', 'child-family']));
    expect(result.detected.audiences).toContain('FAMILY');
    expect(result.detected.location.zip).toBe('98409');
    expect(result.detected.location.state).toBeUndefined();
  });

  it('does not claim veteran status from a generic veteran-program query', () => {
    const result = parser.parse('Show me veteran grants in Washington.');
    expect(result.detected.audiences).toContain('VETERAN');
    expect(result.inferred_profile.is_veteran).toBeUndefined();
  });
});
