import { query, closePool } from './index.js';
import { INITIAL_CATEGORIES, INITIAL_SOURCES } from './seed-data.js';

export async function seedDatabase() {
  console.log('Seeding initial categories and sources...');

  // 1. Seed Categories
  for (const cat of INITIAL_CATEGORIES) {
    await query(
      `INSERT INTO categories (slug, name, description, sort_order)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE
       SET name = EXCLUDED.name,
           description = EXCLUDED.description,
           sort_order = EXCLUDED.sort_order;`,
      [cat.slug, cat.name, cat.description, cat.sort_order]
    );
  }
  console.log(`Seeded ${INITIAL_CATEGORIES.length} categories.`);

  // 2. Seed Sources
  for (const src of INITIAL_SOURCES) {
    await query(
      `INSERT INTO sources (
         id, name, organization, type, base_url, api_url, documentation_url,
         authentication_type, trust_level, discovery_status, enabled, official, priority
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           organization = EXCLUDED.organization,
           type = EXCLUDED.type,
           base_url = EXCLUDED.base_url,
           api_url = EXCLUDED.api_url,
           documentation_url = EXCLUDED.documentation_url,
           authentication_type = EXCLUDED.authentication_type,
           trust_level = EXCLUDED.trust_level,
           discovery_status = EXCLUDED.discovery_status,
           enabled = EXCLUDED.enabled,
           official = EXCLUDED.official,
           priority = EXCLUDED.priority,
           updated_at = CURRENT_TIMESTAMP;`,
      [
        src.id,
        src.name,
        src.organization,
        src.type,
        src.base_url,
        src.api_url,
        src.documentation_url,
        src.authentication_type,
        src.trust_level,
        src.discovery_status,
        src.enabled,
        src.official,
        src.priority,
      ]
    );
  }
  console.log(`Seeded ${INITIAL_SOURCES.length} sources.`);
}

// Auto-run if invoked directly via CLI
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seedDatabase()
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
