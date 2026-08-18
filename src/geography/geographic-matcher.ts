import {
  GeographicLocation,
  GeographicMatchLevel,
  LocationScope,
  Opportunity,
} from '../types/index.js';

export interface OpportunityLocation {
  scope: LocationScope;
  country_code?: string | null;
  state?: string | null;
  county?: string | null;
  city?: string | null;
  postal_code?: string | null;
  region?: string | null;
  tribal_area?: string | null;
  online_only?: boolean;
}

export interface GeographicMatchResult {
  level: GeographicMatchLevel;
  matched: boolean;
  score: number | null;
  explanation: string;
  missingInformation: string[];
}

export interface IGeographicMatcher {
  match(
    subject: GeographicLocation | undefined,
    opportunity: OpportunityLocation
  ): GeographicMatchResult;
  matchOpportunity(
    subject: GeographicLocation | undefined,
    opportunity: Opportunity
  ): GeographicMatchResult;
}

const LEVEL_SCORES: Record<Exclude<GeographicMatchLevel, 'NO_MATCH' | 'UNKNOWN'>, number> = {
  EXACT: 100,
  CITY: 95,
  COUNTY: 90,
  STATE: 80,
  REGION: 70,
  COUNTRY: 60,
  NATIONWIDE: 55,
  ONLINE: 50,
};

function normalize(value?: string | null): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized || null;
}

function normalizeCounty(value?: string | null): string | null {
  return normalize(value)?.replace(/\s+COUNTY$/, '') || null;
}

function inferredCountry(location?: GeographicLocation): string | null {
  const explicit = normalize(location?.country_code);
  if (explicit) return explicit;
  return location?.state || location?.postal_code ? 'US' : null;
}

export class GeographicMatcher implements IGeographicMatcher {
  public match(
    subject: GeographicLocation | undefined,
    opportunity: OpportunityLocation
  ): GeographicMatchResult {
    const scope = opportunity.scope || 'UNKNOWN';

    if (scope === 'ONLINE' || opportunity.online_only) {
      return this.success('ONLINE', 'Program is explicitly available online.');
    }

    if (scope === 'UNKNOWN' || scope === 'OTHER') {
      return this.unknown('Program geography is not verified.');
    }

    if (!subject) {
      return this.unknown('Location is needed to verify geographic eligibility.');
    }

    const subjectCountry = inferredCountry(subject);
    const opportunityCountry = normalize(opportunity.country_code);

    if (opportunityCountry && subjectCountry && opportunityCountry !== subjectCountry) {
      return this.noMatch(
        `Program is restricted to ${opportunityCountry}; the supplied location is in ${subjectCountry}.`
      );
    }

    if (scope === 'NATIONWIDE') {
      if (!subjectCountry) {
        return this.unknown('Country is needed to verify nationwide eligibility.');
      }
      if ((opportunityCountry || 'US') !== subjectCountry) {
        return this.noMatch('The nationwide program is outside the supplied country.');
      }
      return this.success('NATIONWIDE', `Program is available nationwide in ${subjectCountry}.`);
    }

    if (scope === 'COUNTRY') {
      if (!opportunityCountry || !subjectCountry) {
        return this.unknown('Country coverage is incomplete.');
      }
      return opportunityCountry === subjectCountry
        ? this.success('COUNTRY', `Country matches ${subjectCountry}.`)
        : this.noMatch('Country does not match.');
    }

    if (scope === 'REGION') {
      const expected = normalize(opportunity.region);
      const actual = normalize(subject.region);
      if (!expected || !actual) return this.unknown('Region information is incomplete.');
      return expected === actual
        ? this.success('REGION', `Region matches ${opportunity.region}.`)
        : this.noMatch('Region does not match.');
    }

    if (scope === 'STATE') {
      const expected = normalize(opportunity.state);
      const actual = normalize(subject.state);
      if (!expected || !actual) return this.unknown('State information is incomplete.');
      return expected === actual
        ? this.success('STATE', `State matches ${expected}.`)
        : this.noMatch(`Program is restricted to ${expected}.`);
    }

    if (scope === 'COUNTY') {
      const expectedState = normalize(opportunity.state);
      const actualState = normalize(subject.state);
      const expectedCounty = normalizeCounty(opportunity.county);
      const actualCounty = normalizeCounty(subject.county);
      if (!expectedCounty || !actualCounty) {
        return this.unknown('County is needed to verify this program.');
      }
      if (expectedState && (!actualState || expectedState !== actualState)) {
        return actualState ? this.noMatch(`Program is restricted to ${expectedState}.`) : this.unknown('State is needed to verify county eligibility.');
      }
      return expectedCounty === actualCounty
        ? this.success('COUNTY', `County matches ${opportunity.county}.`)
        : this.noMatch(`Program is restricted to ${opportunity.county}.`);
    }

    if (scope === 'CITY') {
      const expectedCity = normalize(opportunity.city);
      const actualCity = normalize(subject.city);
      const expectedState = normalize(opportunity.state);
      const actualState = normalize(subject.state);
      if (!expectedCity || !actualCity) return this.unknown('City is needed to verify this program.');
      if (expectedState && (!actualState || expectedState !== actualState)) {
        return actualState ? this.noMatch(`Program is restricted to ${expectedState}.`) : this.unknown('State is needed to verify city eligibility.');
      }
      return expectedCity === actualCity
        ? this.success('CITY', `City matches ${opportunity.city}.`)
        : this.noMatch(`Program is restricted to ${opportunity.city}.`);
    }

    if (scope === 'ZIP') {
      const expected = normalize(opportunity.postal_code);
      const actual = normalize(subject.postal_code);
      if (!expected || !actual) return this.unknown('Postal code is needed to verify this program.');
      return expected === actual
        ? this.success('EXACT', `Postal code exactly matches ${expected}.`)
        : this.noMatch(`Program is restricted to postal code ${expected}.`);
    }

    if (scope === 'TRIBAL') {
      const expected = normalize(opportunity.tribal_area);
      const actual = normalize(subject.tribal_area);
      if (!expected || !actual) {
        return this.unknown('Tribal jurisdiction information is needed to verify this program.');
      }
      return expected === actual
        ? this.success('EXACT', `Tribal jurisdiction matches ${opportunity.tribal_area}.`)
        : this.noMatch('Tribal jurisdiction does not match.');
    }

    return this.unknown('Geographic eligibility is not verified.');
  }

  public matchOpportunity(
    subject: GeographicLocation | undefined,
    opportunity: Opportunity
  ): GeographicMatchResult {
    const alternatives: OpportunityLocation[] = [];

    if (opportunity.location_scope === 'STATE' && opportunity.states.length > 0) {
      alternatives.push(
        ...opportunity.states.map((state) => ({
          scope: 'STATE' as const,
          country_code: opportunity.country_code,
          state,
        }))
      );
    } else if (opportunity.location_scope === 'COUNTY' && opportunity.counties.length > 0) {
      alternatives.push(
        ...opportunity.counties.map((county) => ({
          scope: 'COUNTY' as const,
          country_code: opportunity.country_code,
          state: opportunity.states[0],
          county,
        }))
      );
    } else if (opportunity.location_scope === 'CITY' && opportunity.cities.length > 0) {
      alternatives.push(
        ...opportunity.cities.map((city) => ({
          scope: 'CITY' as const,
          country_code: opportunity.country_code,
          state: opportunity.states[0],
          city,
        }))
      );
    } else if (opportunity.location_scope === 'ZIP' && opportunity.zip_codes.length > 0) {
      alternatives.push(
        ...opportunity.zip_codes.map((postal_code) => ({
          scope: 'ZIP' as const,
          country_code: opportunity.country_code,
          postal_code,
        }))
      );
    } else if (opportunity.location_scope === 'REGION' && opportunity.regions?.length) {
      alternatives.push(
        ...opportunity.regions.map((region) => ({
          scope: 'REGION' as const,
          country_code: opportunity.country_code,
          region,
        }))
      );
    } else {
      alternatives.push({
        scope: opportunity.location_scope,
        country_code: opportunity.country_code,
      });
    }

    const results = alternatives.map((location) => this.match(subject, location));
    const match = results
      .filter((result) => result.matched)
      .sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    if (match) return match;
    if (results.some((result) => result.level === 'UNKNOWN')) {
      return results.find((result) => result.level === 'UNKNOWN')!;
    }
    return results[0] || this.unknown('No geographic coverage is defined.');
  }

  private success(
    level: Exclude<GeographicMatchLevel, 'NO_MATCH' | 'UNKNOWN'>,
    explanation: string
  ): GeographicMatchResult {
    return { level, matched: true, score: LEVEL_SCORES[level], explanation, missingInformation: [] };
  }

  private noMatch(explanation: string): GeographicMatchResult {
    return { level: 'NO_MATCH', matched: false, score: 0, explanation, missingInformation: [] };
  }

  private unknown(explanation: string): GeographicMatchResult {
    return {
      level: 'UNKNOWN',
      matched: false,
      score: null,
      explanation,
      missingInformation: ['Verified geographic eligibility'],
    };
  }
}

export const geographicMatcher = new GeographicMatcher();
