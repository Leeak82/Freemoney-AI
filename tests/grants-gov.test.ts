import { describe, expect, it, vi } from 'vitest';
import { GrantsGovSource } from '../src/sources/grants-gov.js';
import { ResilientHttpClient } from '../src/sources/http-client.js';

function clientFor(payload: unknown, fetchSpy = vi.fn()) {
  fetchSpy.mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  );
  return {
    client: new ResilientHttpClient({
      timeoutMs: 1000,
      maxRetries: 0,
      retryBaseMs: 1,
      fetchImpl: fetchSpy as typeof fetch,
    }),
    fetchSpy,
  };
}

describe('Grants.gov documented API client', () => {
  it('parses search2 pagination and preserves source identifiers', async () => {
    const { client, fetchSpy } = clientFor({
      errorcode: 0,
      msg: 'Webservice Succeeds',
      data: {
        hitCount: 3,
        startRecord: 1,
        oppHits: [
          {
            id: '363437',
            number: 'OFFICIAL-2026-1',
            title: 'Official program title',
            agencyName: 'Department of Testing',
            agencyCode: 'DOT',
            openDate: '07/31/2026',
            closeDate: '08/30/2030',
            oppStatus: 'posted',
            docType: 'synopsis',
            alnist: ['20.910'],
          },
        ],
        errorMsgs: [],
      },
    });
    const source = new GrantsGovSource('https://api.grants.gov/v1/api', client);
    const result = await source.fetchOpportunities({
      keyword: 'transportation',
      assistanceListingNumber: '20.910',
      rows: 1,
      startRecordNum: 1,
    });

    expect(result.totalHits).toBe(3);
    expect(result.startRecord).toBe(1);
    expect(result.nextStartRecord).toBe(2);
    expect(result.hasMore).toBe(true);
    expect(result.items[0]).toMatchObject({
      sourceOpportunityId: '363437',
      sourceOpportunityNumber: 'OFFICIAL-2026-1',
      agencyOrProvider: 'Department of Testing',
      cfdaList: ['20.910'],
    });
    const request = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(request).toMatchObject({
      rows: 1,
      startRecordNum: 1,
      keyword: 'transportation',
      oppStatuses: 'posted',
      cfda: '20.910',
    });
    expect(request).not.toHaveProperty('aln');
  });

  it('uses opportunityId for fetchOpportunity and maps only published details', async () => {
    const { client, fetchSpy } = clientFor({
      errorcode: 0,
      msg: 'Webservice Succeeds',
      data: {
        id: 363437,
        opportunityNumber: 'OFFICIAL-2026-1',
        opportunityTitle: 'Official program title',
        owningAgencyCode: 'DOT-OSDBU',
        docType: 'synopsis',
        assistURL: 'https://apply.example.gov/workspace/363437',
        synopsis: {
          synopsisDesc: '<p>Published &amp; verified description.</p>',
          responseDateStr: '2030-08-30-00-00-00',
          postingDateStr: '2026-07-31-00-00-00',
          awardFloor: '1000',
          awardCeiling: '5000',
          applicantEligibilityDesc: 'Small businesses may apply.',
          applicantTypes: [{ id: '23', description: 'Small businesses' }],
          fundingInstruments: [{ id: 'G', description: 'Grant' }],
          fundingActivityCategories: [{ id: 'BC', description: 'Business' }],
          topAgencyDetails: { agencyName: 'Department of Transportation' },
        },
        alns: [{ alnNumber: '20.910', programTitle: 'Business Assistance' }],
        opportunityPkgs: [{ packageId: 'PKG1', workspaceCompatibleFlag: 'Y' }],
      },
    });
    const source = new GrantsGovSource('https://api.grants.gov/v1/api', client);
    const detail = await source.fetchOpportunityDetail('363437');

    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toEqual({
      opportunityId: 363437,
    });
    expect(detail).toMatchObject({
      title: 'Official program title',
      description: 'Published & verified description.',
      providerName: 'Department of Transportation',
      amountMin: 1000,
      amountMax: 5000,
      applicationUrlType: 'OFFICIAL_APPLICATION',
      applicationUrlVerified: true,
      locationScope: 'UNKNOWN',
      requiredDocuments: [],
      audiences: ['SMALL_BUSINESS'],
    });
    expect(detail?.subcategories).toContain('ALN-20.910');
  });

  it('rejects a changed or unsuccessful response contract', async () => {
    const { client } = clientFor({
      errorcode: 1,
      msg: 'Backend unavailable',
    });
    const source = new GrantsGovSource('https://api.grants.gov/v1/api', client);
    await expect(source.fetchOpportunities({ rows: 1 })).rejects.toThrow(
      /contract error/
    );
  });

  it('supports current cfdas and forecast detail fields', async () => {
    const { client } = clientFor({
      errorcode: 0,
      msg: 'Webservice Succeeds',
      data: {
        id: 400001,
        opportunityNumber: 'FORECAST-1',
        opportunityTitle: 'Forecasted official program',
        owningAgencyCode: 'HHS',
        docType: 'forecast',
        forecast: {
          forecastDesc: '<p>Forecast details from the source.</p>',
          estApplicationResponseDateStr: '2031-05-10-00-00-00',
          applicantTypes: [{ id: '21', description: 'Individuals' }],
          fundingInstruments: [{ id: 'G', description: 'Grant' }],
          fundingActivityCategories: [{ id: 'HL', description: 'Health' }],
          topAgencyDetails: { agencyName: 'Health and Human Services' },
        },
        cfdas: [{
          cfdaNumber: '93.001',
          programTitle: 'Forecast program',
        }],
        errorMessages: [],
      },
    });
    const source = new GrantsGovSource('https://api.grants.gov/v1/api', client);
    const detail = await source.fetchOpportunityDetail('400001');
    expect(detail).toMatchObject({
      description: 'Forecast details from the source.',
      status: 'PAUSED',
      audiences: ['INDIVIDUAL'],
    });
    expect(detail?.subcategories).toContain('ALN-93.001');
  });
});
