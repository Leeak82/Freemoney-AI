import {
  IOpportunitySource,
  SourceMetadata,
  SourceFetchParams,
  SourceFetchResult,
  RawOpportunityDetail,
} from './registry.js';
import { config } from '../config/index.js';

export class TreasuryFiscalDataSource implements IOpportunitySource {
  private readonly baseUrl: string;
  private readonly apiUrl: string;

  constructor(apiUrl: string = config.TREASURY_API_URL) {
    this.baseUrl = 'https://fiscaldata.treasury.gov';
    this.apiUrl = apiUrl;
  }

  public getSourceMetadata(): SourceMetadata {
    return {
      id: 'treasury-fiscal-data',
      name: 'U.S. Treasury Fiscal Data API',
      organization: 'U.S. Department of the Treasury',
      type: 'API',
      baseUrl: this.baseUrl,
      apiUrl: this.apiUrl,
      documentationUrl: 'https://fiscaldata.treasury.gov/api-documentation/',
      authType: 'NONE',
      trustLevel: 'OFFICIAL_GOVERNMENT',
      official: true,
      priority: 80,
    };
  }

  public async validateConnection(): Promise<{ healthy: boolean; message: string; latencyMs: number }> {
    const start = Date.now();
    try {
      const resp = await fetch(`${this.apiUrl}/v1/debt/mspd/mspd_table_1?page[size]=1`);
      const latencyMs = Date.now() - start;
      if (!resp.ok) {
        return {
          healthy: false,
          message: `Treasury Fiscal Data returned status ${resp.status}`,
          latencyMs,
        };
      }
      return {
        healthy: true,
        message: 'Treasury Fiscal Data API reachable and responsive',
        latencyMs,
      };
    } catch (err: any) {
      return {
        healthy: false,
        message: `Connection failed: ${err.message}`,
        latencyMs: Date.now() - start,
      };
    }
  }

  public async fetchOpportunities(_params: SourceFetchParams): Promise<SourceFetchResult> {
    // Treasury fiscal data is macroeconomic financial statistics, registered as government data source
    // Direct individual grants are not yielded from fiscal debt tables.
    return {
      sourceId: 'treasury-fiscal-data',
      totalHits: 0,
      items: [],
    };
  }

  public async fetchOpportunityDetail(_sourceOpportunityId: string): Promise<RawOpportunityDetail | null> {
    return null;
  }
}
