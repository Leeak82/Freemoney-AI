import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import {
  IOpportunitySource,
  RawOpportunityDetail,
  SourceFetchParams,
  SourceFetchResult,
  SourceMetadata,
} from '../src/sources/registry.js';
import { SyncEngine } from '../src/sources/sync-engine.js';

const SOURCE_IDS = [
  'test-sync-success',
  'test-sync-partial',
  'test-sync-failure',
  'test-sync-dedup-a',
  'test-sync-dedup-b',
];

class TestSource implements IOpportunitySource {
  constructor(
    private readonly id: string,
    private readonly pages: SourceFetchResult[],
    private readonly details: Record<string, RawOpportunityDetail | Error> = {},
    private readonly fetchError?: Error
  ) {}

  getSourceMetadata(): SourceMetadata {
    return {
      id: this.id,
      name: this.id,
      organization: 'Verified test organization',
      type: 'API',
      baseUrl: `https://${this.id}.example.gov`,
      apiUrl: `https://${this.id}.example.gov/api`,
      documentationUrl: `https://${this.id}.example.gov/docs`,
      authType: 'NONE',
      sourceRole: 'OPPORTUNITY_FEED',
      jurisdictionScope: 'STATE',
      trustLevel: 'OFFICIAL_GOVERNMENT',
      official: true,
      priority: 1,
      defaultPageSize: 1,
      maxPages: 5,
    };
  }

  async validateConnection() {
    return { healthy: true, message: 'ok', latencyMs: 1 };
  }

  async fetchOpportunities(params: SourceFetchParams): Promise<SourceFetchResult> {
    if (this.fetchError) throw this.fetchError;
    return this.pages[params.startRecordNum || 0] || this.pages.at(-1)!;
  }

  async fetchOpportunityDetail(id: string): Promise<RawOpportunityDetail | null> {
    const value = this.details[id];
    if (value instanceof Error) throw value;
    return value || null;
  }
}

function raw(id: string, title = `Program ${id}`) {
  return {
    sourceOpportunityId: id,
    sourceOpportunityNumber: `NUM-${id}`,
    sourceUrl: `https://test.example.gov/programs/${id}`,
    title,
    agencyOrProvider: 'Verified Agency',
    oppStatus: 'posted',
    closeDate: '2030-01-01',
    rawPayload: { id, title },
  };
}

function detail(
  id: string,
  overrides: Partial<RawOpportunityDetail> = {}
): RawOpportunityDetail {
  return {
    sourceOpportunityId: id,
    title: `Program ${id}`,
    description: 'Source-published description',
    providerName: 'Verified Agency',
    sourceUrl: `https://test.example.gov/programs/${id}`,
    deadline: new Date('2030-01-01T00:00:00Z'),
    rollingDeadline: false,
    status: 'ACTIVE',
    programType: 'GRANT',
    locationScope: 'STATE',
    countryCode: 'US',
    states: ['WA'],
    counties: [],
    cities: [],
    zipCodes: [],
    regions: [],
    category: 'grants',
    subcategories: [],
    requiredDocuments: [],
    rawPayload: { id },
    ...overrides,
  };
}

async function seedSource(id: string) {
  await query(
    `INSERT INTO sources (
       id, name, organization, type, base_url, api_url, documentation_url,
       authentication_type, source_role, jurisdiction_scope, trust_level,
       discovery_status, enabled, official, priority
     ) VALUES ($1,$1,'Test organization','API',$2,$3,$4,'NONE',
       'OPPORTUNITY_FEED','STATE','OFFICIAL_GOVERNMENT','ACTIVE',TRUE,TRUE,1)
     ON CONFLICT (id) DO UPDATE SET enabled=TRUE, discovery_status='ACTIVE';`,
    [
      id,
      `https://${id}.example.gov`,
      `https://${id}.example.gov/api`,
      `https://${id}.example.gov/docs`,
    ]
  );
}

describe('Synchronization engine states and deduplication', () => {
  beforeAll(async () => {
    await runMigrations();
    for (const id of SOURCE_IDS) {
      await query(`DELETE FROM opportunities WHERE source_id=$1;`, [id]);
      await query(`DELETE FROM sources WHERE id=$1;`, [id]);
      await seedSource(id);
    }
  });

  afterAll(async () => {
    for (const id of SOURCE_IDS) {
      await query(`DELETE FROM opportunities WHERE source_id=$1;`, [id]);
      await query(`DELETE FROM sources WHERE id=$1;`, [id]);
    }
    await closePool();
  });

  it('paginates a successful sync and retains expired history', async () => {
    const engine = new SyncEngine();
    const source = new TestSource(
      'test-sync-success',
      [
        {
          sourceId: 'test-sync-success',
          totalHits: 2,
          startRecord: 0,
          nextStartRecord: 1,
          hasMore: true,
          items: [raw('active')],
        },
        {
          sourceId: 'test-sync-success',
          totalHits: 2,
          startRecord: 1,
          nextStartRecord: null,
          hasMore: false,
          items: [raw('expired')],
        },
      ],
      {
        active: detail('active'),
        expired: detail('expired', {
          deadline: new Date('2020-01-01T00:00:00Z'),
          status: 'ACTIVE',
        }),
      }
    );
    engine.registerSource(source);
    const result = await engine.syncSource('test-sync-success', {
      rows: 1,
      maxPages: 2,
      includeDetails: true,
    });

    expect(result).toMatchObject({
      status: 'SUCCESS',
      found: 2,
      fetched: 2,
      created: 2,
      pages: 2,
      complete: true,
    });
    const statuses = await query<{ status: string; active: boolean }>(
      `SELECT status, active FROM opportunities
       WHERE source_id='test-sync-success' ORDER BY status;`
    );
    expect(statuses.rows).toEqual([
      { status: 'ACTIVE', active: true },
      { status: 'EXPIRED', active: false },
    ]);
  });

  it('records detail failures as PARTIAL while retaining valid summaries', async () => {
    const engine = new SyncEngine();
    engine.registerSource(
      new TestSource(
        'test-sync-partial',
        [{
          sourceId: 'test-sync-partial',
          totalHits: 1,
          startRecord: 0,
          nextStartRecord: null,
          hasMore: false,
          items: [raw('partial')],
        }],
        { partial: new Error('detail endpoint unavailable') }
      )
    );
    const result = await engine.syncSource('test-sync-partial', {
      includeDetails: true,
    });

    expect(result.status).toBe('PARTIAL');
    expect(result.errors).toBe(1);
    expect(result.created).toBe(1);
    const errors = await query<{ error_code: string }>(
      `SELECT error_code FROM sync_errors WHERE sync_run_id=$1;`,
      [result.syncRunId]
    );
    expect(errors.rows.map((row) => row.error_code)).toContain(
      'DETAIL_FETCH_FAILED'
    );
  });

  it('records a source failure without throwing or losing the run', async () => {
    const engine = new SyncEngine();
    engine.registerSource(
      new TestSource('test-sync-failure', [], {}, new Error('temporary outage'))
    );
    const result = await engine.syncSource('test-sync-failure');
    expect(result.status).toBe('FAILED');
    expect(result.errors).toBe(1);
    const run = await query<{ status: string; errors_count: number }>(
      `SELECT status, errors_count FROM sync_runs WHERE id=$1;`,
      [result.syncRunId]
    );
    expect(run.rows[0]).toEqual({ status: 'FAILED', errors_count: 1 });
  });

  it('uses the normalized fallback fingerprint across sources', async () => {
    const common = detail('canonical', {
      title: 'Shared verified program',
      sourceUrl: 'https://first.example.gov/shared',
    });
    const engine = new SyncEngine();
    for (const [id, url] of [
      ['test-sync-dedup-a', 'https://first.example.gov/shared'],
      ['test-sync-dedup-b', 'https://second.example.gov/shared'],
    ]) {
      const sourceDetail = { ...common, sourceUrl: url };
      engine.registerSource(
        new TestSource(
          id,
          [{
            sourceId: id,
            totalHits: 1,
            startRecord: 0,
            nextStartRecord: null,
            hasMore: false,
            items: [{ ...raw('canonical', 'Shared verified program'), sourceUrl: url }],
          }],
          { canonical: sourceDetail }
        )
      );
      const result = await engine.syncSource(id, { includeDetails: true });
      expect(result.status).toBe('SUCCESS');
    }

    const canonical = await query<{ count: string }>(
      `SELECT COUNT(DISTINCT o.id)::text AS count
       FROM opportunities o
       JOIN opportunity_source_records osr ON osr.opportunity_id=o.id
       WHERE osr.source_id = ANY($1::text[]);`,
      [['test-sync-dedup-a', 'test-sync-dedup-b']]
    );
    const provenance = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM opportunity_source_records
       WHERE source_id = ANY($1::text[]);`,
      [['test-sync-dedup-a', 'test-sync-dedup-b']]
    );
    expect(canonical.rows[0].count).toBe('1');
    expect(provenance.rows[0].count).toBe('2');
  });
});
