import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3000').transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_BASE_URL: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().default('postgresql://freemoney:freemoney@localhost:5432/freemoney_ai'),
  DB_MAX_CONNECTIONS: z.string().default('20').transform((val) => parseInt(val, 10)),
  DB_IDLE_TIMEOUT_MS: z.string().default('30000').transform((val) => parseInt(val, 10)),
  ADMIN_API_KEY: z.string().default('dev-admin-secret-key-change-in-production'),
  ENABLE_ADMIN_API: z.string().default('true').transform((val) => val === 'true'),
  GRANTS_GOV_API_URL: z.string().default('https://api.grants.gov/v1/api'),
  GRANTS_GOV_TIMEOUT_MS: z.string().default('15000').transform((val) => parseInt(val, 10)),
  GRANTS_GOV_MAX_RETRIES: z.string().default('3').transform((val) => parseInt(val, 10)),
  GRANTS_GOV_RETRY_BASE_MS: z.string().default('250').transform((val) => parseInt(val, 10)),
  GRANTS_GOV_MIN_INTERVAL_MS: z.string().default('100').transform((val) => parseInt(val, 10)),
  GRANTS_GOV_PAGE_SIZE: z.string().default('25').transform((val) => parseInt(val, 10)),
  GRANTS_GOV_MAX_PAGES: z.string().default('10').transform((val) => parseInt(val, 10)),
  GRANTS_GOV_FETCH_DETAILS: z.string().default('true').transform((val) => val === 'true'),
  USA_GOV_BENEFITS_URL: z.string().default(
    'https://www.usa.gov/s3/files/benefit-finder/api/life-event/all_benefits.json'
  ),
  USA_GOV_TIMEOUT_MS: z.string().default('15000').transform((val) => parseInt(val, 10)),
  USA_GOV_MAX_RETRIES: z.string().default('3').transform((val) => parseInt(val, 10)),
  TREASURY_API_URL: z.string().default('https://api.fiscaldata.treasury.gov/services/api/fiscal_service'),
  AI_MATCHER_PROVIDER: z.enum(['rule_based', 'openai', 'anthropic', 'mock']).default('rule_based'),
  AI_API_KEY: z.string().optional(),
  AI_MODEL_NAME: z.string().optional(),
  ENABLE_DISCOVERY_CRAWLER: z.string().default('true').transform((val) => val === 'true'),
  SYNC_CRON_ENABLED: z.string().default('false').transform((val) => val === 'true'),
  MAX_OPPORTUNITY_FETCH_ROWS: z.string().default('100').transform((val) => parseInt(val, 10)),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid configuration variables:', result.error.format());
    throw new Error('Invalid environment configuration');
  }
  return result.data;
}

export const config = loadConfig();
