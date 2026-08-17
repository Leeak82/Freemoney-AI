import { config } from '../config/index.js';
import { query } from '../db/index.js';
import { Opportunity } from '../types/index.js';
import { GrantsGovSource } from './grants-gov.js';
import { SourceHttpError } from './http-client.js';
import { OpportunityNormalizer } from './normalizer.js';
import {
  IOpportunitySource,
  RawOpportunityItem,
  SourceFetchParams,
  sourceRegistry,
} from './registry.js';
import { TreasuryFiscalDataSource } from './treasury.js';
import { OpportunityValidator } from './validator.js';

export type SyncRunStatus = 'SUCCESS' | 'FAILED' | 'PARTIAL';

export interface SyncRunResult {
  syncRunId: string;
  sourceId: string;
  status: SyncRunStatus;
  found: number;
  created: number;
  updated: number;
  deactivated: number;
  rejected: number;
  errors: number;
  pages: number;
  complete: boolean;
  fetched: number;
  inserted: number;
  skipped: number;
  errorMessage?: string;
}

interface UpsertResult {
  id: string;
  created: boolean;
  deduplicated: boolean;
}

export class SyncEngine {
  constructor() {
    sourceRegistry.register(new GrantsGovSource());
    sourceRegistry.register(new TreasuryFiscalDataSource());
  }

  public registerSource(source: IOpportunitySource): void {
    sourceRegistry.register(source);
  }

  public async syncSource(
    sourceId: string,
    params: SourceFetchParams = {}
  ): Promise<SyncRunResult> {
    const source = sourceRegistry.get(sourceId);
    if (!source) throw new Error(`Source '${sourceId}' is not registered in sync engine`);
    const sourceRecord = await sourceRegistry.getDbSourceById(sourceId);
    if (sourceRecord && !sourceRecord.enabled) {
      throw new Error(`Source '${sourceId}' is disabled`);
    }

    const metadata = source.getSourceMetadata();
    const pageSize = Math.max(
      1,
      Math.min(params.rows || metadata.defaultPageSize, config.MAX_OPPORTUNITY_FETCH_ROWS)
    );
    const maxPages = Math.max(1, Math.min(params.maxPages || metadata.maxPages, 100));
    const includeDetails =
      params.includeDetails ?? (sourceId === 'grants-gov' && config.GRANTS_GOV_FETCH_DETAILS);
    const requestParams = { ...params, rows: pageSize, maxPages, includeDetails };
    const run = await query<{ id: string }>(
      `INSERT INTO sync_runs (source_id, status, started_at, request_parameters)
       VALUES ($1, 'RUNNING', CURRENT_TIMESTAMP, $2)
       RETURNING id;`,
      [sourceId, JSON.stringify(requestParams)]
    );
    const syncRunId = run.rows[0].id;

    let found = 0;
    let fetched = 0;
    let created = 0;
    let updated = 0;
    let deactivated = 0;
    let rejected = 0;
    let errors = 0;
    let pages = 0;
    let complete = true;
    let nextStartRecord = Math.max(0, params.startRecordNum || 0);
    let hasMore = true;
    let fatalMessage: string | undefined;
    const seenSourceIds = new Set<string>();

    console.log(`[SyncEngine] Starting sync for source: ${sourceId}`);

    try {
      while (hasMore && pages < maxPages) {
        let page;
        try {
          page = await source.fetchOpportunities({
            ...params,
            rows: pageSize,
            startRecordNum: nextStartRecord,
          });
        } catch (error: unknown) {
          if (pages === 0) throw error;
          errors++;
          complete = false;
          fatalMessage = this.errorMessage(error);
          await this.recordSyncError(
            syncRunId,
            sourceId,
            `page:${nextStartRecord}`,
            this.errorCode(error, 'PAGINATION_FAILED'),
            fatalMessage,
            { startRecordNum: nextStartRecord, pageSize }
          );
          break;
        }

        pages++;
        found = page.totalHits;
        fetched += page.items.length;

        for (const rawItem of page.items) {
          seenSourceIds.add(rawItem.sourceOpportunityId);
          if (includeDetails) {
            try {
              rawItem.detail = await source.fetchOpportunityDetail(
                rawItem.sourceOpportunityId
              );
              if (!rawItem.detail) {
                throw new Error('Opportunity detail was not returned');
              }
            } catch (error: unknown) {
              errors++;
              await this.recordSyncError(
                syncRunId,
                sourceId,
                rawItem.sourceOpportunityId,
                this.errorCode(error, 'DETAIL_FETCH_FAILED'),
                this.errorMessage(error),
                rawItem.rawPayload
              );
            }
          }

          try {
            const normalized = OpportunityNormalizer.normalizeFromRaw(
              rawItem,
              sourceId,
              metadata.official,
              rawItem.detail
            );
            const validation = OpportunityValidator.validate(normalized);
            if (!validation.valid) {
              rejected++;
              errors++;
              await this.recordSyncError(
                syncRunId,
                sourceId,
                rawItem.sourceOpportunityId,
                'VALIDATION_FAILED',
                validation.errors.join('; '),
                { raw: rawItem.rawPayload, warnings: validation.warnings }
              );
              continue;
            }

            const upsert = await this.upsertOpportunity(
              normalized as Opportunity,
              rawItem
            );
            if (upsert.created) created++;
            else updated++;
            await this.upsertClassifications(
              upsert.id,
              normalized as Opportunity,
              Boolean(rawItem.detail)
            );
          } catch (error: unknown) {
            rejected++;
            errors++;
            await this.recordSyncError(
              syncRunId,
              sourceId,
              rawItem.sourceOpportunityId,
              this.errorCode(error, 'ITEM_PROCESSING_ERROR'),
              this.errorMessage(error),
              rawItem.rawPayload
            );
          }
        }

        hasMore = page.hasMore;
        if (page.nextStartRecord === null) break;
        nextStartRecord = page.nextStartRecord;
      }

      if (hasMore) complete = false;
      deactivated += await this.expirePastDeadlines(sourceId);

      if (this.canDeactivateUnseen(params, complete, errors, seenSourceIds.size)) {
        deactivated += await this.deactivateUnseen(sourceId, [...seenSourceIds]);
      }

      const status: SyncRunStatus = errors > 0 || !complete ? 'PARTIAL' : 'SUCCESS';
      await this.finishRun(syncRunId, status, {
        found,
        fetched,
        created,
        updated,
        deactivated,
        rejected,
        errors,
        errorMessage: fatalMessage,
      });
      await sourceRegistry.updateSourceStatus(sourceId, {
        last_sync_at: new Date(),
        ...(status === 'SUCCESS' ? { last_success_at: new Date() } : {}),
        ...(status === 'PARTIAL'
          ? {
              last_error_at: new Date(),
              last_error_message:
                fatalMessage || `${errors} source record or detail error(s)`,
            }
          : { last_error_message: null }),
      });

      return this.result(syncRunId, sourceId, status, {
        found,
        fetched,
        created,
        updated,
        deactivated,
        rejected,
        errors,
        pages,
        complete,
        errorMessage: fatalMessage,
      });
    } catch (error: unknown) {
      fatalMessage = this.errorMessage(error);
      errors++;
      await this.recordSyncError(
        syncRunId,
        sourceId,
        `page:${nextStartRecord}`,
        this.errorCode(error, 'SOURCE_FETCH_FAILED'),
        fatalMessage,
        { startRecordNum: nextStartRecord, pageSize }
      );
      await this.finishRun(syncRunId, 'FAILED', {
        found,
        fetched,
        created,
        updated,
        deactivated,
        rejected,
        errors,
        errorMessage: fatalMessage,
      });
      await sourceRegistry.updateSourceStatus(sourceId, {
        last_sync_at: new Date(),
        last_error_at: new Date(),
        last_error_message: fatalMessage,
      });
      return this.result(syncRunId, sourceId, 'FAILED', {
        found,
        fetched,
        created,
        updated,
        deactivated,
        rejected,
        errors,
        pages,
        complete: false,
        errorMessage: fatalMessage,
      });
    }
  }

  private async upsertOpportunity(
    opportunity: Opportunity,
    rawItem: RawOpportunityItem
  ): Promise<UpsertResult> {
    const primary = await query<{ id: string }>(
      `SELECT id FROM opportunities
       WHERE source_id = $1 AND source_opportunity_id = $2;`,
      [opportunity.source_id, opportunity.source_opportunity_id]
    );

    if (primary.rows[0]) {
      if (rawItem.detail) {
        await this.updateCanonical(primary.rows[0].id, opportunity);
      } else {
        await this.updateCanonicalSummary(primary.rows[0].id, opportunity);
      }
      await this.upsertProvenance(primary.rows[0].id, opportunity);
      return { id: primary.rows[0].id, created: false, deduplicated: false };
    }

    const fingerprintMatch = await query<{ id: string }>(
      `SELECT id FROM opportunities WHERE dedup_fingerprint = $1 LIMIT 1;`,
      [opportunity.dedup_fingerprint]
    );
    if (fingerprintMatch.rows[0]) {
      await query(
        `UPDATE opportunities SET last_verified_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP WHERE id = $1;`,
        [fingerprintMatch.rows[0].id]
      );
      await this.upsertProvenance(fingerprintMatch.rows[0].id, opportunity);
      return { id: fingerprintMatch.rows[0].id, created: false, deduplicated: true };
    }

    const inserted = await query<{ id: string }>(
      `INSERT INTO opportunities (
         title, description, provider_name, source_id, source_url, application_url,
         application_url_type, application_url_verified, category, subcategories,
         program_type, amount_min, amount_max, currency, deadline, rolling_deadline,
         location_scope, country_code, regions, states, counties, cities, zip_codes,
         eligibility_summary, eligibility_rules, required_documents,
         contact_information, official_source, source_provider, source_metadata,
         raw_source_identifier, source_opportunity_id, dedup_fingerprint,
         last_verified_at, retrieved_at, status, active
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
         $20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37
       )
       RETURNING id;`,
      this.opportunityParams(opportunity)
    );
    await this.upsertProvenance(inserted.rows[0].id, opportunity);
    await this.upsertApplicationLink(inserted.rows[0].id, opportunity);
    return { id: inserted.rows[0].id, created: true, deduplicated: false };
  }

  private async updateCanonical(id: string, opportunity: Opportunity): Promise<void> {
    await query(
      `UPDATE opportunities SET
         title=$2, description=$3, provider_name=$4, source_url=$5,
         application_url=$6, application_url_type=$7, application_url_verified=$8,
         category=$9, subcategories=$10, program_type=$11, amount_min=$12,
         amount_max=$13, currency=$14, deadline=$15, rolling_deadline=$16,
         location_scope=$17, country_code=$18, regions=$19, states=$20,
         counties=$21, cities=$22, zip_codes=$23, eligibility_summary=$24,
         eligibility_rules=$25, required_documents=$26, contact_information=$27,
         official_source=$28, source_provider=$29, source_metadata=$30,
         raw_source_identifier=$31, dedup_fingerprint=$32,
         last_verified_at=$33, retrieved_at=$34, status=$35, active=$36,
         updated_at=CURRENT_TIMESTAMP
       WHERE id=$1;`,
      [
        id,
        opportunity.title,
        opportunity.description,
        opportunity.provider_name,
        opportunity.source_url,
        opportunity.application_url,
        opportunity.application_url_type || 'UNKNOWN',
        opportunity.application_url_verified || false,
        opportunity.category,
        opportunity.subcategories,
        opportunity.program_type,
        opportunity.amount_min,
        opportunity.amount_max,
        opportunity.currency,
        opportunity.deadline,
        opportunity.rolling_deadline,
        opportunity.location_scope,
        opportunity.country_code || null,
        opportunity.regions || [],
        opportunity.states,
        opportunity.counties,
        opportunity.cities,
        opportunity.zip_codes,
        opportunity.eligibility_summary,
        JSON.stringify(opportunity.eligibility_rules || {}),
        opportunity.required_documents,
        JSON.stringify(opportunity.contact_information || {}),
        opportunity.official_source,
        opportunity.source_provider || opportunity.provider_name,
        JSON.stringify(opportunity.source_metadata || {}),
        opportunity.raw_source_identifier,
        opportunity.dedup_fingerprint,
        opportunity.last_verified_at,
        opportunity.retrieved_at,
        opportunity.status || 'UNKNOWN',
        opportunity.active,
      ]
    );
    await this.upsertApplicationLink(id, opportunity);
  }

  private async updateCanonicalSummary(
    id: string,
    opportunity: Opportunity
  ): Promise<void> {
    await query(
      `UPDATE opportunities SET
         title=$2, provider_name=$3, source_url=$4, category=$5,
         deadline=$6, official_source=$7, source_provider=$8,
         source_metadata=COALESCE(source_metadata, '{}'::jsonb) || $9::jsonb,
         raw_source_identifier=$10, dedup_fingerprint=$11,
         last_verified_at=$12, retrieved_at=$13, status=$14, active=$15,
         updated_at=CURRENT_TIMESTAMP
       WHERE id=$1;`,
      [
        id,
        opportunity.title,
        opportunity.provider_name,
        opportunity.source_url,
        opportunity.category,
        opportunity.deadline,
        opportunity.official_source,
        opportunity.source_provider || opportunity.provider_name,
        JSON.stringify(opportunity.source_metadata || {}),
        opportunity.raw_source_identifier,
        opportunity.dedup_fingerprint,
        opportunity.last_verified_at,
        opportunity.retrieved_at,
        opportunity.status || 'UNKNOWN',
        opportunity.active,
      ]
    );
  }

  private opportunityParams(opportunity: Opportunity): unknown[] {
    return [
      opportunity.title,
      opportunity.description,
      opportunity.provider_name,
      opportunity.source_id,
      opportunity.source_url,
      opportunity.application_url,
      opportunity.application_url_type || 'UNKNOWN',
      opportunity.application_url_verified || false,
      opportunity.category,
      opportunity.subcategories,
      opportunity.program_type,
      opportunity.amount_min,
      opportunity.amount_max,
      opportunity.currency,
      opportunity.deadline,
      opportunity.rolling_deadline,
      opportunity.location_scope,
      opportunity.country_code || null,
      opportunity.regions || [],
      opportunity.states,
      opportunity.counties,
      opportunity.cities,
      opportunity.zip_codes,
      opportunity.eligibility_summary,
      JSON.stringify(opportunity.eligibility_rules || {}),
      opportunity.required_documents,
      JSON.stringify(opportunity.contact_information || {}),
      opportunity.official_source,
      opportunity.source_provider || opportunity.provider_name,
      JSON.stringify(opportunity.source_metadata || {}),
      opportunity.raw_source_identifier,
      opportunity.source_opportunity_id,
      opportunity.dedup_fingerprint,
      opportunity.last_verified_at,
      opportunity.retrieved_at,
      opportunity.status || 'UNKNOWN',
      opportunity.active,
    ];
  }

  private async upsertProvenance(
    opportunityId: string,
    opportunity: Opportunity
  ): Promise<void> {
    await query(
      `INSERT INTO opportunity_source_records (
         opportunity_id, source_id, source_opportunity_id, source_url,
         source_provider, official_source, retrieved_at, last_verified_at,
         source_metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (source_id, source_opportunity_id) DO UPDATE SET
         opportunity_id=EXCLUDED.opportunity_id,
         source_url=EXCLUDED.source_url,
         source_provider=EXCLUDED.source_provider,
         official_source=EXCLUDED.official_source,
         retrieved_at=EXCLUDED.retrieved_at,
         last_verified_at=EXCLUDED.last_verified_at,
         source_metadata=EXCLUDED.source_metadata;`,
      [
        opportunityId,
        opportunity.source_id,
        opportunity.source_opportunity_id,
        opportunity.source_url,
        opportunity.source_provider || opportunity.provider_name,
        opportunity.official_source,
        opportunity.retrieved_at,
        opportunity.last_verified_at,
        JSON.stringify(opportunity.source_metadata || {}),
      ]
    );
  }

  private async upsertClassifications(
    opportunityId: string,
    opportunity: Opportunity,
    detailVerified: boolean
  ): Promise<void> {
    for (const audience of opportunity.audiences || []) {
      await query(
        `INSERT INTO opportunity_audiences (
           opportunity_id, audience, source_verified
         ) VALUES ($1, $2, $3)
         ON CONFLICT (opportunity_id, audience) DO UPDATE SET
           source_verified = opportunity_audiences.source_verified OR EXCLUDED.source_verified;`,
        [opportunityId, audience, detailVerified]
      );
    }
    for (const purpose of opportunity.funding_purposes || []) {
      await query(
        `INSERT INTO opportunity_funding_purposes (
           opportunity_id, funding_purpose, source_verified
         ) VALUES ($1, $2, FALSE)
         ON CONFLICT (opportunity_id, funding_purpose) DO NOTHING;`,
        [opportunityId, purpose]
      );
    }
  }

  private async upsertApplicationLink(
    opportunityId: string,
    opportunity: Opportunity
  ): Promise<void> {
    if (!opportunity.application_url) return;
    await query(
      `INSERT INTO application_links (
         opportunity_id, portal_name, url, portal_type, official, verified_at,
         source_id, is_direct_apply
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT DO NOTHING;`,
      [
        opportunityId,
        opportunity.application_url_verified
          ? 'Official application'
          : 'Application information',
        opportunity.application_url,
        opportunity.application_url_type || 'UNKNOWN',
        opportunity.application_url_verified || false,
        opportunity.application_url_verified ? opportunity.last_verified_at : null,
        opportunity.source_id,
        opportunity.application_url_type === 'OFFICIAL_APPLICATION',
      ]
    );
  }

  private async expirePastDeadlines(sourceId: string): Promise<number> {
    const result = await query(
      `UPDATE opportunities SET status='EXPIRED', active=FALSE,
         updated_at=CURRENT_TIMESTAMP
       WHERE source_id=$1 AND status='ACTIVE'
         AND deadline IS NOT NULL AND deadline < CURRENT_TIMESTAMP
       RETURNING id;`,
      [sourceId]
    );
    return result.rowCount || 0;
  }

  private canDeactivateUnseen(
    params: SourceFetchParams,
    complete: boolean,
    errors: number,
    seenCount: number
  ): boolean {
    return Boolean(
      complete &&
        errors === 0 &&
        seenCount > 0 &&
        !params.keyword &&
        !params.opportunityNumber &&
        !params.agency &&
        !params.eligibility &&
        !params.fundingCategory &&
        !params.fundingInstrument &&
        !params.assistanceListingNumber &&
        !params.dateRange &&
        (params.startRecordNum || 0) === 0 &&
        (!params.oppStatuses || params.oppStatuses === 'posted')
    );
  }

  private async deactivateUnseen(sourceId: string, seenIds: string[]): Promise<number> {
    const result = await query(
      `UPDATE opportunities SET status='CLOSED', active=FALSE,
         updated_at=CURRENT_TIMESTAMP
       WHERE source_id=$1 AND status='ACTIVE'
         AND NOT (source_opportunity_id = ANY($2::text[]))
       RETURNING id;`,
      [sourceId, seenIds]
    );
    return result.rowCount || 0;
  }

  private async finishRun(
    syncRunId: string,
    status: SyncRunStatus,
    counts: {
      found: number;
      fetched: number;
      created: number;
      updated: number;
      deactivated: number;
      rejected: number;
      errors: number;
      errorMessage?: string;
    }
  ): Promise<void> {
    await query(
      `UPDATE sync_runs SET status=$2, finished_at=CURRENT_TIMESTAMP,
         completed_at=CURRENT_TIMESTAMP, records_found=$3, records_fetched=$4,
         records_created=$5, records_inserted=$5, records_updated=$6,
         records_deactivated=$7, records_rejected=$8, records_skipped=$8,
         errors_count=$9, error_message=$10
       WHERE id=$1;`,
      [
        syncRunId,
        status,
        counts.found,
        counts.fetched,
        counts.created,
        counts.updated,
        counts.deactivated,
        counts.rejected,
        counts.errors,
        counts.errorMessage || null,
      ]
    );
  }

  private async recordSyncError(
    syncRunId: string,
    sourceId: string,
    recordId: string,
    errorCode: string,
    errorMessage: string,
    rawPayload: unknown
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO sync_errors (
           sync_run_id, source_id, record_identifier, error_code,
           error_message, raw_payload
         ) VALUES ($1,$2,$3,$4,$5,$6);`,
        [
          syncRunId,
          sourceId,
          recordId,
          errorCode,
          errorMessage,
          JSON.stringify(rawPayload || {}),
        ]
      );
    } catch (error) {
      console.error('[SyncEngine] Failed to write sync error log:', error);
    }
  }

  private errorCode(error: unknown, fallback: string): string {
    return error instanceof SourceHttpError ? error.code : fallback;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private result(
    syncRunId: string,
    sourceId: string,
    status: SyncRunStatus,
    values: Omit<SyncRunResult, 'syncRunId' | 'sourceId' | 'status' | 'inserted' | 'skipped'>
  ): SyncRunResult {
    return {
      syncRunId,
      sourceId,
      status,
      ...values,
      inserted: values.created,
      skipped: values.rejected,
    };
  }
}

export interface SourceSchedule {
  sourceId: string;
  frequency: 'EVERY_6_HOURS' | 'DAILY' | 'WEEKLY' | 'MANUAL';
  enabled: boolean;
}

export interface ISyncScheduleProvider {
  getSchedules(): Promise<SourceSchedule[]>;
}

export class DatabaseSyncScheduleProvider implements ISyncScheduleProvider {
  public async getSchedules(): Promise<SourceSchedule[]> {
    const result = await query<{
      id: string;
      sync_frequency: SourceSchedule['frequency'] | null;
      enabled: boolean;
    }>(
      `SELECT id, sync_frequency, enabled FROM sources
       WHERE source_role = 'OPPORTUNITY_FEED';`
    );
    return result.rows.map((row) => ({
      sourceId: row.id,
      frequency: row.sync_frequency || 'MANUAL',
      enabled: row.enabled,
    }));
  }
}

export class SourceSyncCoordinator {
  constructor(private readonly engine: SyncEngine) {}

  public async syncEnabledSources(): Promise<SyncRunResult[]> {
    const sources = await query<{ id: string }>(
      `SELECT id FROM sources
       WHERE enabled=TRUE AND discovery_status='ACTIVE'
         AND source_role='OPPORTUNITY_FEED'
       ORDER BY priority DESC;`
    );
    const results: SyncRunResult[] = [];
    for (const source of sources.rows) {
      try {
        results.push(await this.engine.syncSource(source.id));
      } catch (error: unknown) {
        console.error(`Source ${source.id} could not start:`, error);
      }
    }
    return results;
  }
}

export const syncEngine = new SyncEngine();
export const sourceSyncCoordinator = new SourceSyncCoordinator(syncEngine);
