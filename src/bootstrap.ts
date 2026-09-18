import { createApp } from './index.js';
import { config } from './config/index.js';
import { runMigrations } from './db/migrate.js';
import { seedDatabase } from './db/seed.js';
import { syncEngine } from './sources/sync-engine.js';

async function bootstrap() {
  await runMigrations();
  await seedDatabase();

  const app = createApp();
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'freemoney-ai' });
  });

  app.listen(config.PORT, () => {
    console.log(`FreeMoney-AI ready on port ${config.PORT}`);
  });

  void (async () => {
    for (const sourceId of ['grants-gov', 'usa-gov-benefits']) {
      try {
        const result = await syncEngine.syncSource(sourceId, {
          rows: sourceId === 'grants-gov' ? 25 : 100,
        });
        console.log(`[bootstrap] ${sourceId} sync:`, result.status);
      } catch (error) {
        console.error(`[bootstrap] ${sourceId} sync failed:`, error);
      }
    }
  })();
}

bootstrap().catch((error) => {
  console.error('FreeMoney-AI bootstrap failed:', error);
  process.exit(1);
});
