import { AuthType, SourceTrustLevel, DiscoveryStatus } from '../types/index.js';
import { query } from '../db/index.js';

export interface DiscoveredApiCandidate {
  name: string;
  description: string;
  url: string;
  auth: string;
  https: boolean;
  cors: string;
  category: string;
  classifiedCategory: string;
  trustLevel: SourceTrustLevel;
  status: DiscoveryStatus;
  relevanceScore: number;
}

export type DiscoveryCategory =
  | 'GRANTS' | 'HOUSING' | 'RENT' | 'UTILITIES' | 'FOOD'
  | 'TRANSPORTATION' | 'VETERANS' | 'DISABILITY' | 'EDUCATION'
  | 'SCHOLARSHIPS' | 'MEDICAL' | 'FAMILY' | 'EMERGENCY' | 'TAX'
  | 'BUSINESS' | 'STARTUP' | 'LOANS' | 'MICROLOANS'
  | 'GOVERNMENT_CONTRACTING' | 'LICENSES' | 'PERMITS' | 'TRAINING'
  | 'DISASTER' | 'OTHER';

export class PublicApisDiscoveryParser {
  private static CATEGORY_MAPPINGS: Record<string, string> = {
    government: 'GOVERNMENT',
    finance: 'TAX',
    jobs: 'BENEFITS',
    education: 'EDUCATION',
    environment: 'OTHER',
    health: 'GRANTS',
    housing: 'HOUSING',
    transportation: 'TRANSPORTATION',
    social: 'NONPROFIT',
  };

  /**
   * Parse markdown tables from public-apis README format
   */
  public parseMarkdown(markdown: string): DiscoveredApiCandidate[] {
    const candidates: DiscoveredApiCandidate[] = [];
    const lines = markdown.split('\n');

    let currentSection = 'General';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Detect section header: e.g. "### Government" or "## Finance"
      if (line.startsWith('### ') || line.startsWith('## ')) {
        currentSection = line.replace(/^#+\s*/, '').trim();
        continue;
      }

      // Check for table row: | [API Name](url) | Description | Auth | HTTPS | CORS |
      if (line.startsWith('|') && line.endsWith('|')) {
        const parts = line.split('|').map((p) => p.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        if (parts.length >= 2) {
          const apiCell = parts[0];
          const descCell = parts[1];
          const authCell = parts[2] || 'No';
          const httpsCell = parts[3] || 'Yes';
          const corsCell = parts[4] || 'Unknown';

          // Ignore header/separator lines
          if (apiCell === 'API' || apiCell.startsWith(':---') || apiCell.startsWith('---')) {
            continue;
          }

          // Extract link: [Name](url)
          const linkMatch = apiCell.match(/\[(.*?)\]\((.*?)\)/);
          const name = linkMatch ? linkMatch[1] : apiCell;
          const url = linkMatch ? linkMatch[2] : '';

          if (name && url && (url.startsWith('http://') || url.startsWith('https://'))) {
            const classified = this.classifyApi(currentSection, name, descCell);
            candidates.push({
              name,
              description: descCell,
              url,
              auth: authCell,
              https: httpsCell.toLowerCase() === 'yes',
              cors: corsCell,
              category: currentSection,
              classifiedCategory: classified.category,
              trustLevel: classified.trustLevel,
              status: 'DISCOVERED',
              relevanceScore: classified.relevanceScore,
            });
          }
        }
      }
    }

    return candidates;
  }

  /**
   * Classify API into assistance domain taxonomy
   */
  public classifyApi(
    section: string,
    name: string,
    description: string
  ): { category: string; trustLevel: SourceTrustLevel; relevanceScore: number } {
    const text = `${section} ${name} ${description}`.toLowerCase();

    let category = 'OTHER';
    let relevanceScore = 10;
    let trustLevel: SourceTrustLevel = 'COMMUNITY';

    if (text.includes('.gov') || text.includes('census.gov') || text.includes('government') || text.includes('official')) {
      // A directory entry is never promoted to official merely from its text.
      trustLevel = 'UNKNOWN';
      relevanceScore += 40;
    }

    if (text.includes('microloan')) {
      category = 'MICROLOANS';
      relevanceScore += 50;
    } else if (text.includes('loan') || text.includes('lending')) {
      category = 'LOANS';
      relevanceScore += 45;
    } else if (text.includes('government contract') || text.includes('procurement')) {
      category = 'GOVERNMENT_CONTRACTING';
      relevanceScore += 45;
    } else if (text.includes('license')) {
      category = 'LICENSES';
      relevanceScore += 40;
    } else if (text.includes('permit')) {
      category = 'PERMITS';
      relevanceScore += 40;
    } else if (text.includes('scholarship')) {
      category = 'SCHOLARSHIPS';
      relevanceScore += 50;
    } else if (text.includes('grant') || text.includes('funding') || text.includes('fellowship')) {
      category = 'GRANTS';
      relevanceScore += 50;
    } else if (text.includes('rent') || text.includes('rental')) {
      category = 'RENT';
      relevanceScore += 45;
    } else if (text.includes('hous') || text.includes('shelter') || text.includes('homeless')) {
      category = 'HOUSING';
      relevanceScore += 45;
    } else if (text.includes('food') || text.includes('snap') || text.includes('nutrition') || text.includes('ebt')) {
      category = 'FOOD';
      relevanceScore += 45;
    } else if (text.includes('utilit') || text.includes('energy') || text.includes('liheap') || text.includes('water')) {
      category = 'UTILITIES';
      relevanceScore += 40;
    } else if (text.includes('veteran') || text.includes('military') || text.includes('va ')) {
      category = 'VETERANS';
      relevanceScore += 45;
    } else if (text.includes('disab') || text.includes('accessibility') || text.includes('assistive')) {
      category = 'DISABILITY';
      relevanceScore += 40;
    } else if (text.includes('tuition') || text.includes('student aid') || text.includes('education')) {
      category = 'EDUCATION';
      relevanceScore += 40;
    } else if (text.includes('medical') || text.includes('health')) {
      category = 'MEDICAL';
      relevanceScore += 40;
    } else if (text.includes('family') || text.includes('child care')) {
      category = 'FAMILY';
      relevanceScore += 40;
    } else if (text.includes('disaster') || text.includes('fema')) {
      category = 'DISASTER';
      relevanceScore += 45;
    } else if (text.includes('emergency') || text.includes('crisis')) {
      category = 'EMERGENCY';
      relevanceScore += 40;
    } else if (text.includes('transit') || text.includes('transportation') || text.includes('bus') || text.includes('subway')) {
      category = 'TRANSPORTATION';
      relevanceScore += 30;
    } else if (text.includes('startup') || text.includes('entrepreneur')) {
      category = 'STARTUP';
      relevanceScore += 40;
    } else if (text.includes('business') || text.includes('sba') || text.includes('commerce')) {
      category = 'BUSINESS';
      relevanceScore += 35;
    } else if (text.includes('training') || text.includes('workforce')) {
      category = 'TRAINING';
      relevanceScore += 35;
    } else if (text.includes('tax') || text.includes('irs') || text.includes('refund') || text.includes('credit')) {
      category = 'TAX';
      relevanceScore += 35;
    }

    return { category, trustLevel, relevanceScore };
  }

  /**
   * Fetch and parse public APIs catalogs
   */
  public async fetchAndDiscover(url: string): Promise<DiscoveredApiCandidate[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      if (!resp.ok) throw new Error(`Failed to fetch catalog: HTTP ${resp.status}`);
      return this.parseMarkdown(await resp.text());
    } finally {
      clearTimeout(timeout);
    }
  }

  public async discoverAndPersist(
    catalogSourceId: string,
    url: string
  ): Promise<{ discovered: number; persisted: number }> {
    const candidates = await this.fetchAndDiscover(url);
    let persisted = 0;
    for (const candidate of candidates) {
      const result = await query(
        `INSERT INTO source_candidates (
           catalog_source_id, name, description, candidate_url,
           authentication_type, discovery_category, trust_level,
           lifecycle_status, relevance_score, https, cors, metadata
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'DISCOVERED',$8,$9,$10,$11)
         ON CONFLICT (catalog_source_id, candidate_url) DO UPDATE SET
           name=EXCLUDED.name, description=EXCLUDED.description,
           authentication_type=EXCLUDED.authentication_type,
           discovery_category=EXCLUDED.discovery_category,
           relevance_score=EXCLUDED.relevance_score,
           https=EXCLUDED.https, cors=EXCLUDED.cors,
           metadata=source_candidates.metadata || EXCLUDED.metadata
         RETURNING id;`,
        [
          catalogSourceId,
          candidate.name.replace(/\*/g, ''),
          candidate.description,
          candidate.url,
          this.mapAuth(candidate.auth),
          candidate.classifiedCategory,
          candidate.trustLevel,
          candidate.relevanceScore,
          candidate.https,
          candidate.cors,
          JSON.stringify({
            catalogCategory: candidate.category,
            reviewRequired: true,
          }),
        ]
      );
      if (result.rows.length > 0) persisted++;
    }
    return { discovered: candidates.length, persisted };
  }

  private mapAuth(value: string): AuthType {
    const normalized = value.replace(/`|\*/g, '').trim().toLowerCase();
    if (normalized === 'no' || normalized === 'none' || normalized === 'n/a') return 'NONE';
    if (normalized.includes('oauth')) return 'OAUTH';
    if (normalized.includes('key')) return 'API_KEY';
    return 'OTHER';
  }
}
