import { closePool } from '../db/index.js';
import { PublicApisDiscoveryParser } from '../sources/discovery.js';

const catalogs = {
  'public-api-lists':
    'https://raw.githubusercontent.com/public-api-lists/public-api-lists/master/README.md',
  'n0shake-public-apis':
    'https://raw.githubusercontent.com/n0shake/Public-APIs/master/README.md',
} as const;

async function main(): Promise<void> {
  const requested = process.argv[2] || 'all';
  if (requested !== 'all' && !(requested in catalogs)) {
    throw new Error(
      `Unknown catalog '${requested}'. Use all, public-api-lists, or n0shake-public-apis.`
    );
  }

  const parser = new PublicApisDiscoveryParser();
  const entries =
    requested === 'all'
      ? Object.entries(catalogs)
      : [[requested, catalogs[requested as keyof typeof catalogs]]];

  for (const [sourceId, url] of entries) {
    const result = await parser.discoverAndPersist(sourceId, url);
    console.log(
      `${sourceId}: parsed ${result.discovered}, persisted ${result.persisted} review candidates`
    );
  }
}

main()
  .catch((error) => {
    console.error('Source discovery failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
