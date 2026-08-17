import { describe, expect, it, vi } from 'vitest';
import { ResilientHttpClient } from '../src/sources/http-client.js';
import {
  UsaGovBenefitsSource,
  usaGovBenefitId,
} from '../src/sources/usa-gov-benefits.js';

const fixture = {
  status: 200,
  method: 'GET',
  data: {
    benefits: [
      {
        benefit: {
          title: 'Disability support benefit',
          summary: '<p>Source-published monthly support.</p>',
          SourceLink: 'https://www.ssa.gov/example',
          agency: { title: 'Social Security Administration' },
          eligibility: [
            {
              criteriaKey: 'applicant_disability',
              label: 'The applicant has a disability',
              acceptableValues: ['Yes'],
            },
          ],
        },
      },
      {
        benefit: {
          title: 'Veteran family benefit',
          summary: '<p>Source-published family support.</p>',
          SourceLink: 'https://www.va.gov/example',
          agency: { title: 'Department of Veterans Affairs' },
          eligibility: [
            {
              criteriaKey: 'applicant_veteran',
              label: 'The applicant is a veteran',
              acceptableValues: ['Yes'],
            },
          ],
        },
      },
    ],
  },
};

function sourceFromFixture() {
  const fetchImpl = vi.fn(async () =>
    new Response(JSON.stringify(fixture), { status: 200 })
  );
  const client = new ResilientHttpClient({
    timeoutMs: 1000,
    maxRetries: 0,
    retryBaseMs: 1,
    fetchImpl: fetchImpl as typeof fetch,
  });
  return {
    source: new UsaGovBenefitsSource(
      'https://www.usa.gov/example/all_benefits.json',
      client
    ),
    fetchImpl,
  };
}

describe('USA.gov Benefit Finder source', () => {
  it('parses, filters, and paginates first-party benefit records', async () => {
    const { source, fetchImpl } = sourceFromFixture();
    const first = await source.fetchOpportunities({ rows: 1 });
    expect(first).toMatchObject({
      totalHits: 2,
      startRecord: 0,
      nextStartRecord: 1,
      hasMore: true,
    });
    expect(first.items[0].detail).toMatchObject({
      title: 'Disability support benefit',
      description: 'Source-published monthly support.',
      sourceUrl: 'https://www.ssa.gov/example',
      applicationUrlVerified: false,
      status: 'UNKNOWN',
      programType: 'BENEFIT',
      locationScope: 'UNKNOWN',
      requiredDocuments: [],
    });
    expect(first.items[0].detail?.audiences).toEqual(
      expect.arrayContaining(['INDIVIDUAL', 'DISABLED'])
    );

    const filtered = await source.fetchOpportunities({
      keyword: 'veteran',
      rows: 100,
    });
    expect(filtered.totalHits).toBe(1);
    expect(filtered.items[0].title).toBe('Veteran family benefit');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('uses stable derived identifiers when the source publishes no ID', async () => {
    const benefit = fixture.data.benefits[0].benefit;
    const id = usaGovBenefitId(benefit);
    expect(id).toBe(usaGovBenefitId({ ...benefit }));

    const { source } = sourceFromFixture();
    const result = await source.fetchOpportunities({ rows: 10 });
    const detail = await source.fetchOpportunityDetail(
      result.items[0].sourceOpportunityId
    );
    expect(detail?.eligibilityRules).toEqual({
      criteria: [
        {
          criteriaKey: 'applicant_disability',
          label: 'The applicant has a disability',
          acceptableValues: ['Yes'],
        },
      ],
    });
  });

  it('rejects schema changes instead of fabricating records', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ status: 200, data: {} }), { status: 200 })
    );
    const source = new UsaGovBenefitsSource(
      'https://www.usa.gov/example/all_benefits.json',
      new ResilientHttpClient({
        timeoutMs: 1000,
        maxRetries: 0,
        retryBaseMs: 1,
        fetchImpl: fetchImpl as typeof fetch,
      })
    );
    await expect(source.fetchOpportunities({})).rejects.toThrow(/contract changed/);
  });
});
