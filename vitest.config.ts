import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Database tests run against an in-memory embedded Postgres unless a real DATABASE_URL is provided.
    env: { DATABASE_URL: process.env.DATABASE_URL || 'pglite://memory' },
  },
});
