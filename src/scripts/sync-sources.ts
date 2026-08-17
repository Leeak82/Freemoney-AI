import { syncEngine } from '../sources/sync-engine.js';
import { closePool } from '../db/index.js';

async function main() {
  console.log('--- FreeMoney-AI Source Ingestion Script ---');
  try {
    const sourceId = process.argv[2] || 'grants-gov';
    const result = await syncEngine.syncSource(sourceId, {
      rows: sourceId === 'grants-gov' ? 25 : 100,
    });
    console.log('Sync completed with result:', result);
  } catch (err) {
    console.error('Sync failed:', err);
  } finally {
    await closePool();
  }
}

main();
