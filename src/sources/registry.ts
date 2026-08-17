import { Source, SourceTrustLevel, DiscoveryStatus, SourceType, AuthType } from '../types/index.js';
import { query } from '../db/index.js';

export interface IOpportunitySource {
  getSourceMetadata(): SourceMetadata;
  validateConnection(): Promise<{ healthy: boolean; message: string; latencyMs: number }>;
  fetchOpportunities(params: SourceFetchParams): Promise<SourceFetchResult>;
  fetchOpportunityDetail(sourceOpportunityId: string): Promise<RawOpportunityDetail | null>;
}

export interface SourceMetadata {
  id: string;
  name: string;
  organization: string;
  type: SourceType;
  baseUrl: string;
  apiUrl: string | null;
  documentationUrl: string | null;
  authType: AuthType;
  trustLevel: SourceTrustLevel;
  official: boolean;
  priority: number;
}

export interface SourceFetchParams {
  keyword?: string;
  category?: string;
  rows?: number;
  startRecordNum?: number;
  oppStatuses?: string; // 'posted|forecasted'
  dateRange?: string;
}

export interface SourceFetchResult {
  sourceId: string;
  totalHits: number;
  items: RawOpportunityItem[];
  rawResponse?: any;
}

export interface RawOpportunityItem {
  sourceOpportunityId: string;
  title: string;
  agencyOrProvider: string;
  agencyCode?: string;
  openDate?: string;
  closeDate?: string;
  oppStatus?: string;
  docType?: string;
  cfdaList?: string[];
  description?: string;
  fundingCategories?: string[];
  eligibilities?: string[];
  rawPayload: any;
}

export interface RawOpportunityDetail {
  sourceOpportunityId: string;
  title: string;
  description: string;
  providerName: string;
  sourceUrl: string;
  applicationUrl?: string;
  amountMin?: number;
  amountMax?: number;
  currency?: string;
  deadline?: Date | null;
  rollingDeadline?: boolean;
  category: string;
  subcategories: string[];
  requiredDocuments: string[];
  eligibilitySummary?: string;
  eligibilityRules?: Record<string, any>;
  contactInfo?: Record<string, any>;
  rawPayload: any;
}

export class SourceRegistry {
  private sources: Map<string, IOpportunitySource> = new Map();

  public register(source: IOpportunitySource): void {
    const meta = source.getSourceMetadata();
    this.sources.set(meta.id, source);
  }

  public get(sourceId: string): IOpportunitySource | undefined {
    return this.sources.get(sourceId);
  }

  public getAll(): IOpportunitySource[] {
    return Array.from(this.sources.values());
  }

  public async getDbSources(): Promise<Source[]> {
    const res = await query<Source>(
      `SELECT * FROM sources ORDER BY priority DESC, name ASC;`
    );
    return res.rows;
  }

  public async getDbSourceById(sourceId: string): Promise<Source | null> {
    const res = await query<Source>(
      `SELECT * FROM sources WHERE id = $1;`,
      [sourceId]
    );
    return res.rows[0] || null;
  }

  public async updateSourceStatus(
    sourceId: string,
    update: {
      enabled?: boolean;
      discovery_status?: DiscoveryStatus;
      last_sync_at?: Date;
      last_success_at?: Date;
      last_error_at?: Date;
      last_error_message?: string | null;
    }
  ): Promise<void> {
    const sets: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const values: any[] = [sourceId];
    let idx = 2;

    if (update.enabled !== undefined) {
      sets.push(`enabled = $${idx++}`);
      values.push(update.enabled);
    }
    if (update.discovery_status !== undefined) {
      sets.push(`discovery_status = $${idx++}`);
      values.push(update.discovery_status);
    }
    if (update.last_sync_at !== undefined) {
      sets.push(`last_sync_at = $${idx++}`);
      values.push(update.last_sync_at);
    }
    if (update.last_success_at !== undefined) {
      sets.push(`last_success_at = $${idx++}`);
      values.push(update.last_success_at);
    }
    if (update.last_error_at !== undefined) {
      sets.push(`last_error_at = $${idx++}`);
      values.push(update.last_error_at);
    }
    if (update.last_error_message !== undefined) {
      sets.push(`last_error_message = $${idx++}`);
      values.push(update.last_error_message);
    }

    await query(
      `UPDATE sources SET ${sets.join(', ')} WHERE id = $1;`,
      values
    );
  }
}

export const sourceRegistry = new SourceRegistry();
