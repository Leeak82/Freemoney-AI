import { query, useEmbeddedFallback, isEmbeddedDb } from './index.js';
import { runMigrations } from './migrate.js';

let ready: Promise<{ embedded: boolean }> | null = null;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timed out after ${ms}ms`)), ms))]);
}

/**
 * Makes sure guest sessions/cases have a working database. If the configured Postgres is
 * unreachable or missing tables, fall back to an in-memory embedded database so private
 * guest sessions still work (they reset when the free server restarts).
 */
export function ensureDatabaseReady(): Promise<{ embedded: boolean }> {
  if (!ready) {
    ready = (async () => {
      if (!isEmbeddedDb()) {
        try {
          await withTimeout(query('SELECT 1 FROM user_sessions LIMIT 1'), 6000);
          return { embedded: false };
        } catch (err: any) {
          console.error('[db] configured database unavailable, using embedded fallback:', err?.message || err);
          useEmbeddedFallback();
        }
      }
      await runMigrations();
      return { embedded: true };
    })().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}
