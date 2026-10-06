import { describe, expect, it } from 'vitest';
import { deriveResearchUnknowns } from '../src/research/research-service.js';

describe('program research read model', () => {
  it('keeps missing research explicitly unknown instead of inventing requirements', () => {
    const unknowns = deriveResearchUnknowns(
      {},
      'STATUS_NOT_CONFIRMED',
      0,
      0,
      0
    );

    expect(unknowns).toEqual(expect.arrayContaining([
      'Current application availability is not confirmed.',
      'Complete eligibility requirements have not been verified.',
      'The complete application process has not been verified.',
      'Required application documents were not found in verified sources.',
    ]));
  });

  it('does not manufacture unknowns when authoritative research sections are present', () => {
    const unknowns = deriveResearchUnknowns(
      {
        eligibility: 'VERIFIED',
        application_process: 'VERIFIED',
        required_documents: 'VERIFIED',
      },
      'ACCEPTING_APPLICATIONS',
      3,
      2,
      4
    );

    expect(unknowns).toEqual([]);
  });

  it('preserves partial research as an explicit verification gap', () => {
    const unknowns = deriveResearchUnknowns(
      {
        eligibility: 'PARTIAL',
        application_process: 'VERIFIED',
        required_documents: 'NOT_FOUND',
      },
      'WAITLIST_OPEN',
      2,
      1,
      0
    );

    expect(unknowns).toContain('Complete eligibility requirements have not been verified.');
    expect(unknowns).toContain('Required application documents were not found in verified sources.');
    expect(unknowns).not.toContain('The complete application process has not been verified.');
  });
});
