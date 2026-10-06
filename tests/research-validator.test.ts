import { describe, expect, it } from 'vitest';
import { ResearchClaimValidator } from '../src/research/research-validator.js';

const official = {
  source_url: 'https://agency.example.gov/program',
  source_organization: 'Synthetic Test Agency',
  authoritative: true,
  retrieved_at: '2026-10-05T12:00:00Z',
  verified_at: '2026-10-05T12:00:00Z',
};

describe('Evidence-backed program research validation', () => {
  it('rejects generic eligibility requirements with no program-specific evidence', () => {
    const result = ResearchClaimValidator.validate({ eligibility_rules: [{ description: 'Proof of income required' }] });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/Eligibility requirement/);
  });

  it('rejects required documents without evidence while allowing NOT_CONFIRMED', () => {
    expect(ResearchClaimValidator.validate({ documents: [{ name: 'Bank statements', state: 'REQUIRED' }] }).valid).toBe(false);
    expect(ResearchClaimValidator.validate({ documents: [{ name: 'Bank statements', state: 'NOT_CONFIRMED' }] }).valid).toBe(true);
  });

  it('rejects an actionable application URL without authoritative provenance', () => {
    const result = ResearchClaimValidator.validate({ application_url: 'https://example.com/apply' });
    expect(result.valid).toBe(false);
  });

  it('rejects OPEN status when evidence is stale', () => {
    const result = ResearchClaimValidator.validate({
      availability_state: 'ACCEPTING_APPLICATIONS',
      availability_evidence: { ...official, verified_at: '2026-09-01T00:00:00Z' },
    }, new Date('2026-10-06T00:00:00Z'));
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/stale/);
  });



  it('rejects malformed and future availability verification timestamps', () => {
    const malformed = ResearchClaimValidator.validate({
      availability_state: 'ACCEPTING_APPLICATIONS',
      availability_evidence: { ...official, verified_at: 'not-a-date' },
    }, new Date('2026-10-06T00:00:00Z'));
    expect(malformed.valid).toBe(false);
    expect(malformed.errors.join(' ')).toMatch(/timestamp is invalid/);

    const future = ResearchClaimValidator.validate({
      availability_state: 'WAITLIST_OPEN',
      availability_evidence: { ...official, verified_at: '2026-10-07T00:00:00Z' },
    }, new Date('2026-10-06T00:00:00Z'));
    expect(future.valid).toBe(false);
    expect(future.errors.join(' ')).toMatch(/future/);
  });

  it('accepts source-backed claims without inventing missing fields', () => {
    const result = ResearchClaimValidator.validate({
      lifecycle_status: 'SOURCE_VERIFIED',
      availability_state: 'ACCEPTING_APPLICATIONS',
      availability_evidence: official,
      eligibility_rules: [{ description: 'Applicant must meet the published synthetic criterion.', evidence: official }],
      documents: [{ name: 'Synthetic application form', state: 'REQUIRED', evidence: official }],
      application_url: 'https://agency.example.gov/program/apply',
      application_url_evidence: official,
    }, new Date('2026-10-06T00:00:00Z'));
    expect(result).toEqual({ valid: true, errors: [], warnings: [] });
  });
});
