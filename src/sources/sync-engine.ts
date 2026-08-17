import { query, getClient } from '../db/index.js';
import { IOpportunitySource, SourceFetchParams } from './registry.js';
import { OpportunityNormalizer } from './normalizer.js';
import { OpportunityValidator } from './validator.js';
import { sourceRegistry } from './registry.js';
import { GrantsGovSource } from './grants-gov.js';
import { TreasuryFiscalDataSource } from './treasury.js';

export interface SyncRunResult {
  syncRunId: string;
  sourceId: string;
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL';
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  errorMessage?: string;
}

export class SyncEngine {
  constructor() {
    // Register active opportunity sources
    sourceRegistry.register(new GrantsGovSource());
    sourceRegistry.register(new TreasuryFiscalDataSource());
  }

  /**
   * Run synchronization for a specific source
   */
  public async syncSource(
    sourceId: string,
    params: SourceFetchParams = {}
  ): Promise<SyncRunResult> {
    const source = sourceRegistry.get(sourceId);
    if (!source) {
      throw new Error(`Source '${sourceId}' is not registered in sync engine`);
    }

    const meta = source.getSourceMetadata();

    // 1. Create a Sync Run entry in database
    const syncRunRes = await query<{ id: string }>(
      `INSERT INTO sync_runs (source_id, status, started_at)
       VALUES ($1, 'RUNNING', CURRENT_TIMESTAMP)
       RETURNING id;`,
      [sourceId]
    );
    const syncRunId = syncRunRes.rows[0].id;

    let fetchedCount = 0;
    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    try {
      console.log(`[SyncEngine] Starting sync for source: ${sourceId}...`);
      const fetchResult = await source.fetchOpportunities(params);
      fetchedCount = fetchResult.items.length;
      console.log(`[SyncEngine] Fetched ${fetchedCount} items from ${sourceId}`);

      for (const rawItem of fetchResult.items) {
        try {
          const normalized = OpportunityNormalizer.normalizeFromRaw(
            rawItem,
            sourceId,
            meta.official
          );

          // Validation
          const validation = OpportunityValidator.validate(normalized);
          if (!validation.valid) {
            skippedCount++;
            await this.recordSyncError(
              syncRunId,
              sourceId,
              rawItem.sourceOpportunityId,
              'VALIDATION_FAILED',
              validation.errors.join('; '),
              rawItem.rawPayload
            );
            continue;
          }

          // Upsert with deterministic deduplication on (source_id, source_opportunity_id)
          const upsertRes = await query<{ id: string; xmax: string }>(
            `INSERT INTO opportunities (
               title, description, provider_name, source_id, source_url, application_url,
               category, subcategories, program_type, amount_min, amount_max, currency,
               deadline, rolling_deadline, location_scope, states, counties, cities, zip_codes,
               eligibility_summary, eligibility_rules, required_documents, contact_information,
               official_source, raw_source_identifier, source_opportunity_id, dedup_fingerprint,
               last_verified_at, retrieved_at, active
             )
             VALUES (
               $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
               $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30
             )
             ON CONFLICT (source_id, source_opportunity_id) DO UPDATE
             SET title = EXCLUDED.title,
                 description = EXCLUDED.description,
                 provider_name = EXCLUDED.provider_name,
                 source_url = EXCLUDED.source_url,
                 application_url = EXCLUDED.application_url,
                 category = EXCLUDED.category,
                 subcategories = EXCLUDED.subcategories,
                 deadline = EXCLUDED.deadline,
                 rolling_deadline = EXCLUDED.rolling_deadline,
                 eligibility_summary = EXCLUDED.eligibility_summary,
                 eligibility_rules = EXCLUDED.eligibility_rules,
                 required_documents = EXCLUDED.required_documents,
                 contact_information = EXCLUDED.contact_information,
                 dedup_fingerprint = EXCLUDED.dedup_fingerprint,
                 last_verified_at = CURRENT_TIMESTAMP,
                 active = EXCLUDED.active,
                 updated_at = CURRENT_TIMESTAMP
             RETURNING id, (xmax = 0) AS is_insert;`,
            [
              normalized.title,
              normalized.description,
              normalized.provider_name,
              normalized.source_id,
              normalized.source_url,
              normalized.application_url,
              normalized.category,
              normalized.subcategories,
              normalized.program_type,
              normalized.amount_min,
              normalized.amount_max,
              normalized.currency,
              normalized.deadline,
              normalized.rolling_deadline,
              normalized.location_scope,
              normalized.states,
              normalized.counties,
              normalized.cities,
              normalized.zip_codes,
              normalized.eligibility_summary,
              JSON.stringify(normalized.eligibility_rules || {}),
              normalized.required_documents,
              JSON.stringify(normalized.contact_information || {}),
              normalized.official_source,
              normalized.raw_source_identifier,
              normalized.source_opportunity_id,
              normalized.dedup_fingerprint,
              normalized.last_verified_at,
              normalized.retrieved_at,
              normalized.active,
            ]
          );

          if (upsertRes.rows.length > 0) {
            const row = upsertRes.rows[0];
            const isInsert = (row as any).is_insert;
            if (isInsert) {
              insertedCount++;
            } else {
              updatedCount++;
            }
          }
        } catch (itemErr: any) {
          skippedCount++;
          await this.recordSyncError(
            syncRunId,
            sourceId,
            rawItem.sourceOpportunityId,
            'ITEM_PROCESSING_ERROR',
            itemErr.message,
            rawItem.rawPayload
          );
        }
      }

      // 3. Mark Sync Run as SUCCESS
      await query(
        `UPDATE sync_runs
         SET status = 'SUCCESS',
             finished_at = CURRENT_TIMESTAMP,
             records_fetched = $1,
             records_inserted = $2,
             records_updated = $3,
             records_skipped = $4
         WHERE id = $5;`,
        [fetchedCount, insertedCount, updatedCount, skippedCount, syncRunId]
      );

      // 4. Update Source health record
      await sourceRegistry.updateSourceStatus(sourceId, {
        last_sync_at: new Date(),
        last_success_at: new Date(),
        last_error_at: undefined,
        last_error_message: null,
      });

      return {
        syncRunId,
        sourceId,
        status: 'SUCCESS',
        fetched: fetchedCount,
        inserted: insertedCount,
        updated: updatedCount,
        skipped: skippedCount,
      };
    } catch (err: any) {
      console.error(`[SyncEngine] Sync failed for ${sourceId}:`, err);

      await query(
        `UPDATE sync_runs
         SET status = 'FAILED',
             finished_at = CURRENT_TIMESTAMP,
             records_fetched = $1,
             records_inserted = $2,
             records_updated = $3,
             records_skipped = $4,
             error_message = $5
         WHERE id = $6;`,
        [fetchedCount, insertedCount, updatedCount, skippedCount, err.message, syncRunId]
      );

      await sourceRegistry.updateSourceStatus(sourceId, {
        last_sync_at: new Date(),
        last_error_at: new Date(),
        last_error_message: err.message,
      });

      return {
        syncRunId,
        sourceId,
        status: 'FAILED',
        fetched: fetchedCount,
        inserted: insertedCount,
        updated: updatedCount,
        skipped: skippedCount,
        errorMessage: err.message,
      };
    }
  }

  private async recordSyncError(
    syncRunId: string,
    sourceId: string,
    recordId: string,
    errorCode: string,
    errorMessage: string,
    rawPayload: any
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO sync_errors (sync_run_id, source_id, record_identifier, error_code, error_message, raw_payload)
         VALUES ($1, $2, $3, $4, $5, $6);`,
        [syncRunId, sourceId, recordId, errorCode, errorMessage, JSON.stringify(rawPayload || {})]
      );
    } catch (err) {
      console.error('[SyncEngine] Failed to write sync error log:', err);
    }
  }
}

export const syncEngine = new SyncEngine();
