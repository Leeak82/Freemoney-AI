import { execSql, closePool } from './index.js';
import { SCHEMA_SQL } from './schema.js';
import { RESEARCH_SCHEMA_SQL } from './research-schema.js';

export async function runMigrations() {
  console.log('Running database migrations...');
  try {
    await execSql(SCHEMA_SQL);
    await execSql(RESEARCH_SCHEMA_SQL);
    console.log('Database migrations completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  }
}

if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  runMigrations()
    .then(async () => {
      await closePool();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(err);
      await closePool();
      process.exit(1);
    });
}
