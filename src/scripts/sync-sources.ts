import { syncEngine } from '../sources/sync-engine.js';
import { closePool } from '../db/index.js';

async function main() {
  console.log('--- FreeMoney-AI Source Ingestion Script ---');
  try {
    const result = await syncEngine.syncSource('grants-gov', { rows: 25 });
    console.log('Sync completed with result:', result);
  } catch (err) {
    console.error('Sync failed:', err);
  } finally {
    await closePool();
  }
}

main();
