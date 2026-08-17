import { query } from '../db/index.js';
import {
  Opportunity,
  Source,
  SearchQuery,
  SearchResultItem,
  SourceTrustLevel,
  MatchConfidence,
  MatchStatus,
  UserProfile,
} from '../types/index.js';
import { eligibilityMatcher } from '../matching/eligibility-matcher.js';

export interface SearchResultEnvelope {
  total: number;
  limit: number;
  offset: number;
  results: SearchResultItem[];
}

export class SearchEngine {
  /**
   * Trust level score multipliers
   */
  private static TRUST_MULTIPLIERS: Record<SourceTrustLevel, number> = {
    OFFICIAL_GOVERNMENT: 1.0,
    OFFICIAL_ORGANIZATION: 0.9,
    VERIFIED_PARTNER: 0.8,
    COMMUNITY: 0.5,
    UNKNOWN: 0.2,
  };

  public async search(sq: SearchQuery): Promise<SearchResultEnvelope> {
    const limit = Math.min(sq.limit || 20, 100);
    const offset = sq.offset || 0;

    const conditions: string[] = ['o.active = true'];
    const params: any[] = [];
    let idx = 1;

    // 1. Categories
    const categoriesToMatch = sq.categories || (sq.category ? [sq.category] : []);
    if (categoriesToMatch.length > 0 && !categoriesToMatch.includes('all')) {
      conditions.push(`o.category = ANY($${idx++})`);
      params.push(categoriesToMatch);
    }

    // 2. Keyword Search
    if (sq.keyword && sq.keyword.trim().length > 0) {
      const kw = `%${sq.keyword.trim()}%`;
      conditions.push(`(o.title ILIKE $${idx} OR o.description ILIKE $${idx} OR o.provider_name ILIKE $${idx})`);
      params.push(kw);
      idx++;
    }

    // 3. Official Only
    if (sq.official_only) {
      conditions.push(`o.official_source = true`);
    }

    // 4. Source Filter
    if (sq.source_id) {
      conditions.push(`o.source_id = $${idx++}`);
      params.push(sq.source_id);
    }

    // 5. Geographic location filter
    if (sq.state && sq.state.trim().length > 0) {
      conditions.push(
        `(o.location_scope = 'NATIONWIDE' OR $${idx} = ANY(o.states) OR o.states = '{}')`
      );
      params.push(sq.state.toUpperCase());
      idx++;
    }

    // 6. Program Type
    if (sq.program_type) {
      conditions.push(`o.program_type = $${idx++}`);
      params.push(sq.program_type);
    }

    // 7. Amount Filters
    if (sq.min_amount !== undefined) {
      conditions.push(`(o.amount_max IS NULL OR o.amount_max >= $${idx++})`);
      params.push(sq.min_amount);
    }
    if (sq.max_amount !== undefined) {
      conditions.push(`(o.amount_min IS NULL OR o.amount_min <= $${idx++})`);
      params.push(sq.max_amount);
    }

    // 8. Deadline Filter
    if (sq.deadline_before) {
      conditions.push(`(o.deadline IS NULL OR o.deadline <= $${idx++})`);
      params.push(sq.deadline_before);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count query
    const countSql = `
      SELECT COUNT(*) AS total
      FROM opportunities o
      JOIN sources s ON o.source_id = s.id
      ${whereClause};
    `;
    const countRes = await query<{ total: string }>(countSql, params);
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    // Fetch matching records
    const fetchSql = `
      SELECT 
        o.*,
        s.name AS source_name,
        s.trust_level AS source_trust_level,
        s.organization AS source_organization,
        s.type AS source_type,
        s.documentation_url AS source_documentation_url
      FROM opportunities o
      JOIN sources s ON o.source_id = s.id
      ${whereClause}
      ORDER BY 
        s.priority DESC,
        o.official_source DESC,
        (CASE WHEN o.deadline >= CURRENT_TIMESTAMP THEN 1 ELSE 0 END) DESC,
        o.last_verified_at DESC
      LIMIT $${idx++} OFFSET $${idx++};
    `;
    params.push(limit, offset);

    const rowsRes = await query(fetchSql, params);

    // AI Evaluation and Ranking Enrichment
    const items: SearchResultItem[] = [];

    for (const row of rowsRes.rows) {
      const opp: Opportunity = {
        id: row.id,
        title: row.title,
        description: row.description,
        provider_name: row.provider_name,
        source_id: row.source_id,
        source_url: row.source_url,
        application_url: row.application_url,
        category: row.category,
        subcategories: row.subcategories || [],
        program_type: row.program_type,
        amount_min: row.amount_min ? parseFloat(row.amount_min) : null,
        amount_max: row.amount_max ? parseFloat(row.amount_max) : null,
        currency: row.currency,
        deadline: row.deadline ? new Date(row.deadline) : null,
        rolling_deadline: row.rolling_deadline,
        location_scope: row.location_scope,
        states: row.states || [],
        counties: row.counties || [],
        cities: row.cities || [],
        zip_codes: row.zip_codes || [],
        eligibility_summary: row.eligibility_summary,
        eligibility_rules: row.eligibility_rules,
        required_documents: row.required_documents || [],
        contact_information: row.contact_information,
        official_source: row.official_source,
        raw_source_identifier: row.raw_source_identifier,
        source_opportunity_id: row.source_opportunity_id,
        dedup_fingerprint: row.dedup_fingerprint,
        last_verified_at: new Date(row.last_verified_at),
        retrieved_at: new Date(row.retrieved_at),
        active: row.active,
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
      };

      const trustLevel: SourceTrustLevel = row.source_trust_level || 'COMMUNITY';

      // Match evaluation
      const matchEvaluation = await eligibilityMatcher.evaluateEligibility(
        opp,
        sq.user_profile
      );

      // Extract requirement and document summaries
      const requirements: string[] = [];
      if (opp.eligibility_summary) {
        requirements.push(opp.eligibility_summary);
      }
      if (opp.location_scope === 'NATIONWIDE') {
        requirements.push('Open to eligible entities nationwide across all 50 states and territories.');
      } else if (opp.states.length > 0) {
        requirements.push(`Eligible states: ${opp.states.join(', ')}`);
      }

      const documents = opp.required_documents.length > 0
        ? opp.required_documents
        : ['Standard Application Form'];

      items.push({
        opportunity: opp,
        source: {
          id: opp.source_id,
          name: row.source_name,
          organization: row.source_organization,
          trust_level: trustLevel,
          official: opp.official_source,
        },
        match_score: matchEvaluation.matchScore,
        confidence: matchEvaluation.confidence,
        match_status: matchEvaluation.status,
        why_you_may_qualify: matchEvaluation.matchedFactors,
        requirements,
        documents,
        missing_information: matchEvaluation.missingInformation,
        potential_disqualifiers: matchEvaluation.potentialDisqualifiers,
        source_provenance: {
          source_name: row.source_name,
          source_url: opp.source_url,
          official_source: opp.official_source,
          trust_level: trustLevel,
          last_verified: opp.last_verified_at.toISOString().split('T')[0],
          retrieved_at: opp.retrieved_at.toISOString().split('T')[0],
          source_opportunity_id: opp.source_opportunity_id,
        },
      });
    }

    // Rank results based on match score + source trust
    items.sort((a, b) => {
      const scoreA = a.match_score ?? 50;
      const scoreB = b.match_score ?? 50;
      const trustA = SearchEngine.TRUST_MULTIPLIERS[a.source.trust_level || 'COMMUNITY'] || 0.5;
      const trustB = SearchEngine.TRUST_MULTIPLIERS[b.source.trust_level || 'COMMUNITY'] || 0.5;

      const rankA = scoreA * 0.7 + (trustA * 100) * 0.3;
      const rankB = scoreB * 0.7 + (trustB * 100) * 0.3;

      return rankB - rankA;
    });

    return {
      total,
      limit,
      offset,
      results: items,
    };
  }

  public async getOpportunityById(id: string): Promise<SearchResultItem | null> {
    const res = await query(
      `SELECT 
        o.*,
        s.name AS source_name,
        s.trust_level AS source_trust_level,
        s.organization AS source_organization,
        s.type AS source_type,
        s.documentation_url AS source_documentation_url
       FROM opportunities o
       JOIN sources s ON o.source_id = s.id
       WHERE o.id = $1;`,
      [id]
    );

    if (res.rows.length === 0) return null;
    const row = res.rows[0];

    const opp: Opportunity = {
      id: row.id,
      title: row.title,
      description: row.description,
      provider_name: row.provider_name,
      source_id: row.source_id,
      source_url: row.source_url,
      application_url: row.application_url,
      category: row.category,
      subcategories: row.subcategories || [],
      program_type: row.program_type,
      amount_min: row.amount_min ? parseFloat(row.amount_min) : null,
      amount_max: row.amount_max ? parseFloat(row.amount_max) : null,
      currency: row.currency,
      deadline: row.deadline ? new Date(row.deadline) : null,
      rolling_deadline: row.rolling_deadline,
      location_scope: row.location_scope,
      states: row.states || [],
      counties: row.counties || [],
      cities: row.cities || [],
      zip_codes: row.zip_codes || [],
      eligibility_summary: row.eligibility_summary,
      eligibility_rules: row.eligibility_rules,
      required_documents: row.required_documents || [],
      contact_information: row.contact_information,
      official_source: row.official_source,
      raw_source_identifier: row.raw_source_identifier,
      source_opportunity_id: row.source_opportunity_id,
      dedup_fingerprint: row.dedup_fingerprint,
      last_verified_at: new Date(row.last_verified_at),
      retrieved_at: new Date(row.retrieved_at),
      active: row.active,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };

    const matchEval = await eligibilityMatcher.evaluateEligibility(opp);

    return {
      opportunity: opp,
      source: {
        id: opp.source_id,
        name: row.source_name,
        organization: row.source_organization,
        trust_level: row.source_trust_level,
        official: opp.official_source,
      },
      match_score: matchEval.matchScore,
      confidence: matchEval.confidence,
      match_status: matchEval.status,
      why_you_may_qualify: matchEval.matchedFactors,
      requirements: opp.eligibility_summary ? [opp.eligibility_summary] : [],
      documents: opp.required_documents.length > 0 ? opp.required_documents : ['Standard Application Package'],
      missing_information: matchEval.missingInformation,
      potential_disqualifiers: matchEval.potentialDisqualifiers,
      source_provenance: {
        source_name: row.source_name,
        source_url: opp.source_url,
        official_source: opp.official_source,
        trust_level: row.source_trust_level,
        last_verified: opp.last_verified_at.toISOString().split('T')[0],
        retrieved_at: opp.retrieved_at.toISOString().split('T')[0],
        source_opportunity_id: opp.source_opportunity_id,
      },
    };
  }
}

export const searchEngine = new SearchEngine();
