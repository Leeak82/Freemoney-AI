import { SourceTrustLevel, DiscoveryStatus } from '../types/index.js';
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
      trustLevel = 'OFFICIAL_GOVERNMENT';
      relevanceScore += 40;
    }

    if (text.includes('grant') || text.includes('funding') || text.includes('fellowship')) {
      category = 'GRANTS';
      relevanceScore += 50;
    } else if (text.includes('benefit') || text.includes('welfare') || text.includes('social security') || text.includes('tanf')) {
      category = 'BENEFITS';
      relevanceScore += 50;
    } else if (text.includes('hous') || text.includes('rent') || text.includes('shelter') || text.includes('homeless')) {
      category = 'HOUSING';
      relevanceScore += 45;
    } else if (text.includes('food') || text.includes('snap') || text.includes('nutrition') || text.includes('ebt')) {
      category = 'FOOD';
      relevanceScore += 45;
    } else if (text.includes('utilit') || text.includes('energy') || text.includes('liheap') || text.includes('water')) {
      category = 'UTILITY';
      relevanceScore += 40;
    } else if (text.includes('veteran') || text.includes('military') || text.includes('va ')) {
      category = 'VETERANS';
      relevanceScore += 45;
    } else if (text.includes('disab') || text.includes('accessibility') || text.includes('assistive')) {
      category = 'DISABILITY';
      relevanceScore += 40;
    } else if (text.includes('scholarship') || text.includes('tuition') || text.includes('student aid') || text.includes('education')) {
      category = 'EDUCATION';
      relevanceScore += 40;
    } else if (text.includes('transit') || text.includes('transportation') || text.includes('bus') || text.includes('subway')) {
      category = 'TRANSPORTATION';
      relevanceScore += 30;
    } else if (text.includes('business') || text.includes('sba') || text.includes('startup') || text.includes('commerce')) {
      category = 'BUSINESS';
      relevanceScore += 35;
    } else if (text.includes('tax') || text.includes('irs') || text.includes('refund') || text.includes('credit')) {
      category = 'TAX';
      relevanceScore += 35;
    } else if (section.toLowerCase().includes('government')) {
      category = 'GOVERNMENT';
      relevanceScore += 25;
    }

    return { category, trustLevel, relevanceScore };
  }

  /**
   * Fetch and parse public APIs catalogs
   */
  public async fetchAndDiscover(url: string): Promise<DiscoveredApiCandidate[]> {
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`Failed to fetch catalog: ${resp.statusText}`);
      }
      const markdown = await resp.text();
      return this.parseMarkdown(markdown);
    } catch (err: any) {
      console.error(`Error in discovery parser for ${url}:`, err.message);
      return [];
    }
  }
}
