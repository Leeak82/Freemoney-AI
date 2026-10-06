import { describe, expect, it } from 'vitest';
import { NaturalLanguageSearchParser } from '../src/search/natural-language-parser.js';

const parser = new NaturalLanguageSearchParser();

// All jurisdictions and applicants in this file are deliberately synthetic test fixtures.
describe('Natural-language assistance search parser', () => {
  it('parses urgent rent help in a synthetic Ohio fixture', () => {
    const result = parser.parse("I'm behind on rent in Cuyahoga County, Ohio and need help now.");
    expect(result.search.intent).toBe('PERSONAL_ASSISTANCE');
    expect(result.detected.categories).toContain('rent-housing');
    expect(result.detected.categories).toContain('emergency-assistance');
    expect(result.detected.location.county).toBe('Cuyahoga');
    expect(result.detected.location.state).toBe('OH');
    expect(result.detected.urgency).toBe('URGENT');
    expect(result.inferred_profile.housing_status).toBe('RENTER');
  });

  it('parses a synthetic disabled veteran utility request', () => {
    const result = parser.parse("I'm a disabled veteran in Cleveland, OH looking for help with utilities.");
    expect(result.detected.categories).toContain('utilities');
    expect(result.detected.audiences).toEqual(expect.arrayContaining(['VETERAN', 'DISABLED']));
    expect(result.inferred_profile.is_veteran).toBe(true);
    expect(result.inferred_profile.is_disabled).toBe(true);
    expect(result.detected.location.city).toBe('Cleveland');
    expect(result.detected.location.state).toBe('OH');
  });

  it('parses a synthetic Arizona LLC equipment-funding request', () => {
    const result = parser.parse('I want to start an LLC in Arizona and need equipment funding.');
    expect(result.search.intent).toBe('BUSINESS_ASSISTANCE');
    expect(result.detected.categories).toEqual(expect.arrayContaining(['llc-formation', 'startup-funding', 'equipment-assistance']));
    expect(result.detected.funding_purposes).toContain('EQUIPMENT');
    expect(result.detected.location.state).toBe('AZ');
    expect(result.inferred_business_profile.business_structure).toBe('LLC');
    expect(result.inferred_business_profile.business_stage).toBe('PLANNING');
  });

  it('parses family food and childcare help by synthetic ZIP without inventing a state', () => {
    const result = parser.parse('Single mom in 44114 needs food and childcare assistance.');
    expect(result.search.intent).toBe('PERSONAL_ASSISTANCE');
    expect(result.detected.categories).toEqual(expect.arrayContaining(['food', 'child-family']));
    expect(result.detected.audiences).toContain('FAMILY');
    expect(result.detected.location.zip).toBe('44114');
    expect(result.detected.location.state).toBeUndefined();
  });

  it('does not claim veteran status from a generic veteran-program query', () => {
    const result = parser.parse('Show me veteran grants in Ohio.');
    expect(result.detected.audiences).toContain('VETERAN');
    expect(result.inferred_profile.is_veteran).toBeUndefined();
  });

  it('does not invent location when none was supplied', () => {
    const result = parser.parse('I need help paying rent.');
    expect(result.detected.location).toEqual({ state: undefined, county: undefined, city: undefined, zip: undefined });
    expect(result.search.state).toBeUndefined();
    expect(result.search.county).toBeUndefined();
    expect(result.search.city).toBeUndefined();
    expect(result.search.zip).toBeUndefined();
  });
});
