import { Pool, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config/index.js';

let pool: Pool | null = null;

export function getDbPool(): Pool {
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

export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const p = getDbPool();
  return p.query<T>(text, params);
}

export async function getClient() {
  const p = getDbPool();
  return p.connect();
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
