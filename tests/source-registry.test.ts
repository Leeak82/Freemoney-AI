import { describe, it, expect } from 'vitest';
import { SourceRegistry } from '../src/sources/registry.js';
import { GrantsGovSource } from '../src/sources/grants-gov.js';
import { TreasuryFiscalDataSource } from '../src/sources/treasury.js';
import { PublicApisDiscoveryParser } from '../src/sources/discovery.js';

describe('Source Registry & Discovery', () => {
  it('registers and retrieves sources correctly', () => {
    const registry = new SourceRegistry();
    const grantsGov = new GrantsGovSource();
    const treasury = new TreasuryFiscalDataSource();

    registry.register(grantsGov);
    registry.register(treasury);

    expect(registry.get('grants-gov')).toBeDefined();
    expect(registry.get('treasury-fiscal-data')).toBeDefined();
    expect(registry.getAll().length).toBe(2);

    const meta = registry.get('grants-gov')?.getSourceMetadata();
    expect(meta?.trustLevel).toBe('OFFICIAL_GOVERNMENT');
    expect(meta?.official).toBe(true);
  });

  it('parses markdown tables from public-apis repository', () => {
    const sampleMarkdown = `
### Government
| API | Description | Auth | HTTPS | CORS |
|:---|:---|:---|:---|:---|
| [Census.gov](https://www.census.gov/data/developers/data-sets.html) | Demographic data and grants statistics | No | Yes | Unknown |
| [Federal Grants Portal](https://grants.example.gov/api) | Federal funding opportunity search | apiKey | Yes | Yes |

### Housing
| API | Description | Auth | HTTPS | CORS |
|:---|:---|:---|:---|:---|
| [Housing Relief API](https://housing.example.org/api) | Rental assistance and voucher status | No | Yes | Yes |
    `;

    const parser = new PublicApisDiscoveryParser();
    const candidates = parser.parseMarkdown(sampleMarkdown);

    expect(candidates.length).toBe(3);
    expect(candidates[0].name).toBe('Census.gov');
    expect(candidates[0].trustLevel).toBe('UNKNOWN');
    expect(candidates[0].status).toBe('DISCOVERED');
    expect(candidates[1].classifiedCategory).toBe('GRANTS');
    expect(candidates[2].classifiedCategory).toBe('RENT');
  });
});
