import { Pool, QueryResult, QueryResultRow } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { config } from '../config/index.js';

let pool: Pool | null = null;
let embeddedDb: PGlite | null = null;

export interface DbClient {
  query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
  release(): void;
}

function usesEmbeddedDb(): boolean {
  return config.DATABASE_URL.startsWith('pglite://');
}

function getEmbeddedDb(): PGlite {
  if (!embeddedDb) {
    const rawPath = config.DATABASE_URL.slice('pglite://'.length);
    embeddedDb = !rawPath || rawPath === 'memory'
      ? new PGlite()
      : new PGlite(rawPath);
  }
  return embeddedDb;
}

export function getDbPool(): Pool {
  if (usesEmbeddedDb()) {
    throw new Error('getDbPool is not available when using embedded PGlite');
  }

  if (!pool) {
    pool = new Pool({
      connectionString: config.DATABASE_URL,
      max: config.DB_MAX_CONNECTIONS,
      idleTimeoutMillis: config.DB_IDLE_TIMEOUT_MS,
    });

    pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client', err);
    });
  }
  return pool;
}

function asQueryResult<T extends QueryResultRow>(result: any): QueryResult<T> {
  const rows = (result?.rows || []) as T[];
  return {
    command: result?.command || '',
    rowCount: result?.affectedRows ?? rows.length,
    oid: 0,
    fields: result?.fields || [],
    rows,
  } as QueryResult<T>;
}

export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  if (usesEmbeddedDb()) {
    const result = await getEmbeddedDb().query<T>(text, params || []);
    return asQueryResult<T>(result);
  }
  return getDbPool().query<T>(text, params);
}

export async function execSql(text: string): Promise<void> {
  if (usesEmbeddedDb()) {
    await getEmbeddedDb().exec(text);
    return;
  }
  await getDbPool().query(text);
}

export async function getClient(): Promise<DbClient> {
  if (usesEmbeddedDb()) {
    return {
      query: async <T extends QueryResultRow = any>(text: string, params?: any[]) =>
        query<T>(text, params),
      release: () => undefined,
    };
  }
  return (await getDbPool().connect()) as DbClient;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
  if (embeddedDb) {
    await embeddedDb.close();
    embeddedDb = null;
  }
}
