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
import { businessEligibilityMatcher } from '../business/business-matcher.js';
import { geographicMatcher } from '../geography/geographic-matcher.js';

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

    const conditions: string[] = [
      `s.enabled = TRUE`,
      `s.discovery_status = 'ACTIVE'`,
    ];
    if (sq.active_only !== false) {
      conditions.push(`o.status = 'ACTIVE'`, `o.active = TRUE`);
    }
    const params: any[] = [];
    let idx = 1;
    let categoryRankSql = '0';
    let keywordRankSql = '0';
    let geographicRankSql = '0';
    let audienceRankSql = '0';

    // 1. Categories
    const requestedCategories = sq.categories || (sq.category ? [sq.category] : []);
    const businessCategoryAliases = new Set([
      'business-grants',
      'startup-funding',
      'small-business-loans',
      'microloans',
      'business-assistance',
      'veteran-owned-business',
      'women-owned-business',
      'rural-business',
      'disability-owned-business',
      'minority-owned-business',
      'workforce-assistance',
      'employee-training',
      'equipment-assistance',
      'technology-assistance',
      'export-assistance',
      'existing-business-assistance',
    ]);
    const categoriesToMatch = [
      ...new Set([
        ...requestedCategories,
        ...(requestedCategories.some((category) => businessCategoryAliases.has(category))
          ? ['small-business']
          : []),
      ]),
    ];
    if (categoriesToMatch.length > 0 && !categoriesToMatch.includes('all')) {
      const categoryIndex = idx++;
      conditions.push(`o.category = ANY($${categoryIndex})`);
      params.push(categoriesToMatch);
      categoryRankSql = `CASE WHEN o.category = ANY($${categoryIndex}) THEN 100 ELSE 0 END`;
    }
    if (sq.subcategories && sq.subcategories.length > 0) {
      conditions.push(`o.subcategories && $${idx++}::text[]`);
      params.push(sq.subcategories);
    }

    // 2. Keyword Search
    if (sq.keyword && sq.keyword.trim().length > 0) {
      const kw = `%${sq.keyword.trim()}%`;
      const keywordIndex = idx;
      conditions.push(`(o.title ILIKE $${keywordIndex} OR o.description ILIKE $${keywordIndex} OR o.provider_name ILIKE $${keywordIndex})`);
      params.push(kw);
      idx++;
      keywordRankSql = `CASE WHEN o.title ILIKE $${keywordIndex} THEN 100 WHEN o.provider_name ILIKE $${keywordIndex} THEN 70 WHEN o.description ILIKE $${keywordIndex} THEN 40 ELSE 0 END`;
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
    if (sq.zip && sq.zip.trim().length > 0) {
      const zipIndex = idx;
      conditions.push(
        `(o.location_scope IN ('NATIONWIDE', 'ONLINE', 'UNKNOWN')
          OR (o.location_scope = 'COUNTRY' AND COALESCE(o.country_code, '') = 'US')
          OR (o.location_scope = 'ZIP' AND $${idx} = ANY(o.zip_codes)))`
      );
      params.push(sq.zip.trim().toUpperCase());
      idx++;
      geographicRankSql = `CASE
        WHEN o.location_scope='ZIP' AND $${zipIndex}=ANY(o.zip_codes) THEN 100
        WHEN o.location_scope='NATIONWIDE' THEN 50
        WHEN o.location_scope='ONLINE' THEN 40
        WHEN o.location_scope='COUNTRY' AND COALESCE(o.country_code, '')='US' THEN 30
        ELSE 0 END`;
    } else if (sq.city && sq.city.trim().length > 0) {
      const cityIndex = idx;
      const stateIndex = sq.state ? idx + 1 : null;
      conditions.push(
        `(o.location_scope IN ('NATIONWIDE', 'ONLINE', 'UNKNOWN')
          OR (o.location_scope = 'COUNTRY' AND COALESCE(o.country_code, '') = 'US')
          OR (o.location_scope = 'CITY'
            AND EXISTS (SELECT 1 FROM unnest(o.cities) city WHERE UPPER(city) = $${idx})
            ${sq.state ? `AND EXISTS (SELECT 1 FROM unnest(o.states) st WHERE UPPER(st) = $${idx + 1})` : ''}))`
      );
      params.push(sq.city.trim().toUpperCase());
      idx++;
      if (sq.state) {
        params.push(sq.state.trim().toUpperCase());
        idx++;
      }
      geographicRankSql = `CASE
        WHEN o.location_scope='CITY'
          AND EXISTS (SELECT 1 FROM unnest(o.cities) city WHERE UPPER(city)=$${cityIndex})
          ${stateIndex ? `AND EXISTS (SELECT 1 FROM unnest(o.states) st WHERE UPPER(st)=$${stateIndex})` : ''}
          THEN 100
        WHEN o.location_scope='NATIONWIDE' THEN 50
        WHEN o.location_scope='ONLINE' THEN 40
        WHEN o.location_scope='COUNTRY' AND COALESCE(o.country_code, '')='US' THEN 30
        ELSE 0 END`;
    } else if (sq.county && sq.county.trim().length > 0) {
      const countyIndex = idx;
      const stateIndex = sq.state ? idx + 1 : null;
      conditions.push(
        `(o.location_scope IN ('NATIONWIDE', 'ONLINE', 'UNKNOWN')
          OR (o.location_scope = 'COUNTRY' AND COALESCE(o.country_code, '') = 'US')
          OR (o.location_scope = 'COUNTY'
            AND EXISTS (
              SELECT 1 FROM unnest(o.counties) county
              WHERE REGEXP_REPLACE(UPPER(county), '\\s+COUNTY$', '') = $${idx}
            )
            ${sq.state ? `AND EXISTS (SELECT 1 FROM unnest(o.states) st WHERE UPPER(st) = $${idx + 1})` : ''}))`
      );
      params.push(sq.county.trim().toUpperCase().replace(/\s+COUNTY$/, ''));
      idx++;
      if (sq.state) {
        params.push(sq.state.trim().toUpperCase());
        idx++;
      }
      geographicRankSql = `CASE
        WHEN o.location_scope='COUNTY'
          AND EXISTS (SELECT 1 FROM unnest(o.counties) county
            WHERE REGEXP_REPLACE(UPPER(county), '\\s+COUNTY$', '')=$${countyIndex})
          ${stateIndex ? `AND EXISTS (SELECT 1 FROM unnest(o.states) st WHERE UPPER(st)=$${stateIndex})` : ''}
          THEN 100
        WHEN o.location_scope='NATIONWIDE' THEN 50
        WHEN o.location_scope='ONLINE' THEN 40
        WHEN o.location_scope='COUNTRY' AND COALESCE(o.country_code, '')='US' THEN 30
        ELSE 0 END`;
    } else if (sq.state && sq.state.trim().length > 0) {
      const stateIndex = idx;
      conditions.push(
        `(o.location_scope IN ('NATIONWIDE', 'ONLINE', 'UNKNOWN')
          OR (o.location_scope = 'COUNTRY' AND COALESCE(o.country_code, '') = 'US')
          OR (o.location_scope = 'STATE'
            AND EXISTS (SELECT 1 FROM unnest(o.states) st WHERE UPPER(st) = $${idx})) )`
      );
      params.push(sq.state.trim().toUpperCase());
      idx++;
      geographicRankSql = `CASE
        WHEN o.location_scope='STATE'
          AND EXISTS (SELECT 1 FROM unnest(o.states) st WHERE UPPER(st)=$${stateIndex}) THEN 100
        WHEN o.location_scope='NATIONWIDE' THEN 50
        WHEN o.location_scope='ONLINE' THEN 40
        WHEN o.location_scope='COUNTRY' AND COALESCE(o.country_code, '')='US' THEN 30
        ELSE 0 END`;
    } else if (sq.location_scope === 'NATIONWIDE') {
      conditions.push(`o.location_scope IN ('NATIONWIDE', 'ONLINE')`);
      geographicRankSql = `CASE WHEN o.location_scope='NATIONWIDE' THEN 100 ELSE 80 END`;
    }

    // 6. Program Type
    if (sq.program_type) {
      conditions.push(`o.program_type = $${idx++}`);
      params.push(sq.program_type);
    }

    // 7. Amount Filters
    if (sq.min_amount !== undefined) {
      conditions.push(`o.amount_max >= $${idx++}`);
      params.push(sq.min_amount);
    }
    if (sq.max_amount !== undefined) {
      conditions.push(`o.amount_min <= $${idx++}`);
      params.push(sq.max_amount);
    }

    // 8. Deadline Filter
    if (sq.deadline_before) {
      conditions.push(`o.deadline <= $${idx++}`);
      params.push(sq.deadline_before);
    }

    const requestedAudiences = sq.audiences || (sq.audience as any) || [];
    if (requestedAudiences.length > 0) {
      const audienceIndex = idx++;
      conditions.push(
        `EXISTS (
          SELECT 1 FROM opportunity_audiences oa
          WHERE oa.opportunity_id = o.id AND oa.source_verified=TRUE
            AND oa.audience = ANY($${audienceIndex})
        )`
      );
      params.push(requestedAudiences);
      audienceRankSql = `CASE WHEN EXISTS (
        SELECT 1 FROM opportunity_audiences oa
        WHERE oa.opportunity_id=o.id AND oa.source_verified=TRUE
          AND oa.audience=ANY($${audienceIndex})
      ) THEN 100 ELSE 0 END`;
    }

    if (sq.funding_purposes && sq.funding_purposes.length > 0) {
      conditions.push(
        `EXISTS (
          SELECT 1 FROM opportunity_funding_purposes ofp
          WHERE ofp.opportunity_id = o.id AND ofp.source_verified=TRUE
            AND ofp.funding_purpose = ANY($${idx++})
        )`
      );
      params.push(sq.funding_purposes);
    }

    if (sq.intent === 'BUSINESS_ASSISTANCE' && requestedCategories.length === 0) {
      conditions.push(
        `(o.category = 'small-business' OR EXISTS (
          SELECT 1 FROM opportunity_audiences oa
          WHERE oa.opportunity_id = o.id
            AND oa.source_verified=TRUE
            AND oa.audience IN ('ENTREPRENEUR', 'STARTUP', 'SMALL_BUSINESS', 'EXISTING_BUSINESS', 'NONPROFIT', 'EMPLOYER')
        ))`
      );
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
        s.documentation_url AS source_documentation_url,
        COALESCE((
          SELECT array_agg(oa.audience ORDER BY oa.audience)
          FROM opportunity_audiences oa
          WHERE oa.opportunity_id = o.id AND oa.source_verified=TRUE
        ), ARRAY[]::text[]) AS audiences,
        COALESCE((
          SELECT array_agg(ofp.funding_purpose ORDER BY ofp.funding_purpose)
          FROM opportunity_funding_purposes ofp
          WHERE ofp.opportunity_id = o.id AND ofp.source_verified=TRUE
        ), ARRAY[]::text[]) AS funding_purposes,
        COALESCE((
          SELECT json_agg(json_build_object(
            'source_id', osr.source_id,
            'source_url', osr.source_url,
            'source_opportunity_id', osr.source_opportunity_id,
            'source_provider', osr.source_provider,
            'official_source', osr.official_source,
            'last_verified_at', osr.last_verified_at
          ) ORDER BY osr.last_verified_at DESC)
          FROM opportunity_source_records osr WHERE osr.opportunity_id=o.id
        ), '[]'::json) AS additional_sources,
        COALESCE((
          SELECT json_agg(json_build_object(
            'url', al.url, 'type', al.portal_type, 'official', al.official,
            'verified_at', al.verified_at
          ) ORDER BY al.official DESC, al.created_at)
          FROM application_links al WHERE al.opportunity_id=o.id
        ), '[]'::json) AS verified_application_links,
        (
          (${categoryRankSql}) * 8 +
          (${geographicRankSql}) * 7 +
          (${audienceRankSql}) * 6 +
          CASE WHEN o.deadline IS NULL THEN 10
               WHEN o.deadline >= CURRENT_TIMESTAMP THEN 100 ELSE 0 END * 4 +
          CASE s.trust_level
               WHEN 'OFFICIAL_GOVERNMENT' THEN 100
               WHEN 'OFFICIAL_ORGANIZATION' THEN 90
               WHEN 'VERIFIED_PARTNER' THEN 80
               WHEN 'COMMUNITY' THEN 50 ELSE 20 END * 3 +
          (
            (CASE WHEN o.description <> '' THEN 1 ELSE 0 END) +
            (CASE WHEN o.eligibility_summary IS NOT NULL THEN 1 ELSE 0 END) +
            (CASE WHEN o.deadline IS NOT NULL THEN 1 ELSE 0 END) +
            (CASE WHEN o.application_url_verified THEN 1 ELSE 0 END)
          ) * 25 +
          (${keywordRankSql})
        ) AS deterministic_rank
      FROM opportunities o
      JOIN sources s ON o.source_id = s.id
      ${whereClause}
      ORDER BY 
        deterministic_rank DESC,
        s.priority DESC,
        o.last_verified_at DESC,
        o.id ASC
      LIMIT $${idx++} OFFSET $${idx++};
    `;
    params.push(limit, offset);

    const rowsRes = await query(fetchSql, params);

    // AI Evaluation and Ranking Enrichment
    const items: SearchResultItem[] = [];
    const deterministicRanks = new Map<string, number>();

    for (const row of rowsRes.rows) {
      deterministicRanks.set(row.id, Number(row.deterministic_rank) || 0);
      const opp: Opportunity = {
        id: row.id,
        title: row.title,
        description: row.description,
        provider_name: row.provider_name,
        source_id: row.source_id,
        source_url: row.source_url,
        application_url: row.application_url,
        application_url_type: row.application_url_type,
        application_url_verified: row.application_url_verified,
        category: row.category,
        subcategories: row.subcategories || [],
        program_type: row.program_type,
        amount_min: row.amount_min ? parseFloat(row.amount_min) : null,
        amount_max: row.amount_max ? parseFloat(row.amount_max) : null,
        currency: row.currency,
        deadline: row.deadline ? new Date(row.deadline) : null,
        rolling_deadline: row.rolling_deadline,
        location_scope: row.location_scope,
        country_code: row.country_code,
        regions: row.regions || [],
        states: row.states || [],
        counties: row.counties || [],
        cities: row.cities || [],
        zip_codes: row.zip_codes || [],
        eligibility_summary: row.eligibility_summary,
        eligibility_rules: row.eligibility_rules,
        required_documents: row.required_documents || [],
        contact_information: row.contact_information,
        official_source: row.official_source,
        source_provider: row.source_provider,
        source_metadata: row.source_metadata,
        raw_source_identifier: row.raw_source_identifier,
        source_opportunity_id: row.source_opportunity_id,
        dedup_fingerprint: row.dedup_fingerprint,
        last_verified_at: new Date(row.last_verified_at),
        retrieved_at: new Date(row.retrieved_at),
        status: row.status,
        active: row.active,
        audiences: row.audiences || [],
        funding_purposes: row.funding_purposes || [],
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
      };

      const trustLevel: SourceTrustLevel = row.source_trust_level || 'COMMUNITY';

      // Match evaluation
      const matchEvaluation =
        sq.intent === 'BUSINESS_ASSISTANCE' || sq.business_profile
          ? await businessEligibilityMatcher.evaluateBusinessEligibility(
              opp,
              sq.business_profile
            )
          : await eligibilityMatcher.evaluateEligibility(opp, sq.user_profile);
      const geographicMatch = geographicMatcher.matchOpportunity(
        sq.business_profile
          ? {
              country_code: sq.business_profile.country,
              state: sq.business_profile.state,
              county: sq.business_profile.county,
              city: sq.business_profile.city,
              postal_code: sq.business_profile.postal_code,
            }
          : sq.user_profile || sq.state || sq.county || sq.city || sq.zip
            ? {
                country_code: 'US',
                state: sq.user_profile?.state || sq.state,
                county: sq.county,
                city: sq.city,
                postal_code: sq.user_profile?.zip_code || sq.zip,
              }
            : undefined,
        opp
      );

      // Extract requirement and document summaries
      const requirements: string[] = [];
      if (opp.eligibility_summary) {
        requirements.push(opp.eligibility_summary);
      }
      if (opp.states.length > 0) {
        requirements.push(`Eligible states: ${opp.states.join(', ')}`);
      }

      const documents = opp.required_documents;

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
        geographic_match: {
          level: geographicMatch.level,
          matched: geographicMatch.matched,
          score: geographicMatch.score,
          explanation: geographicMatch.explanation,
        },
        source_provenance: {
          source_name: row.source_name,
          source_url: opp.source_url,
          official_source: opp.official_source,
          trust_level: trustLevel,
          last_verified: opp.last_verified_at.toISOString().split('T')[0],
          retrieved_at: opp.retrieved_at.toISOString().split('T')[0],
          source_opportunity_id: opp.source_opportunity_id,
          source_provider: opp.source_provider || opp.provider_name,
          additional_sources: row.additional_sources || [],
        },
        application_links: row.verified_application_links || [],
      });
    }

    // Rank results based on match score + source trust
    items.sort((a, b) => {
      const rankA =
        (deterministicRanks.get(a.opportunity.id) || 0) +
        (a.match_score ?? 0) * 5;
      const rankB =
        (deterministicRanks.get(b.opportunity.id) || 0) +
        (b.match_score ?? 0) * 5;
      return rankB - rankA || a.opportunity.id.localeCompare(b.opportunity.id);
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
        s.documentation_url AS source_documentation_url,
        COALESCE((
          SELECT array_agg(oa.audience ORDER BY oa.audience)
          FROM opportunity_audiences oa
          WHERE oa.opportunity_id = o.id AND oa.source_verified=TRUE
        ), ARRAY[]::text[]) AS audiences,
        COALESCE((
          SELECT array_agg(ofp.funding_purpose ORDER BY ofp.funding_purpose)
          FROM opportunity_funding_purposes ofp
          WHERE ofp.opportunity_id = o.id AND ofp.source_verified=TRUE
        ), ARRAY[]::text[]) AS funding_purposes,
        COALESCE((
          SELECT json_agg(json_build_object(
            'source_id', osr.source_id,
            'source_url', osr.source_url,
            'source_opportunity_id', osr.source_opportunity_id,
            'source_provider', osr.source_provider,
            'official_source', osr.official_source,
            'last_verified_at', osr.last_verified_at
          ) ORDER BY osr.last_verified_at DESC)
          FROM opportunity_source_records osr WHERE osr.opportunity_id=o.id
        ), '[]'::json) AS additional_sources,
        COALESCE((
          SELECT json_agg(json_build_object(
            'url', al.url, 'type', al.portal_type, 'official', al.official,
            'verified_at', al.verified_at
          ) ORDER BY al.official DESC, al.created_at)
          FROM application_links al WHERE al.opportunity_id=o.id
        ), '[]'::json) AS verified_application_links
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
      application_url_type: row.application_url_type,
      application_url_verified: row.application_url_verified,
      category: row.category,
      subcategories: row.subcategories || [],
      program_type: row.program_type,
      amount_min: row.amount_min ? parseFloat(row.amount_min) : null,
      amount_max: row.amount_max ? parseFloat(row.amount_max) : null,
      currency: row.currency,
      deadline: row.deadline ? new Date(row.deadline) : null,
      rolling_deadline: row.rolling_deadline,
      location_scope: row.location_scope,
      country_code: row.country_code,
      regions: row.regions || [],
      states: row.states || [],
      counties: row.counties || [],
      cities: row.cities || [],
      zip_codes: row.zip_codes || [],
      eligibility_summary: row.eligibility_summary,
      eligibility_rules: row.eligibility_rules,
      required_documents: row.required_documents || [],
      contact_information: row.contact_information,
      official_source: row.official_source,
      source_provider: row.source_provider,
      source_metadata: row.source_metadata,
      raw_source_identifier: row.raw_source_identifier,
      source_opportunity_id: row.source_opportunity_id,
      dedup_fingerprint: row.dedup_fingerprint,
      last_verified_at: new Date(row.last_verified_at),
      retrieved_at: new Date(row.retrieved_at),
      status: row.status,
      active: row.active,
      audiences: row.audiences || [],
      funding_purposes: row.funding_purposes || [],
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
      documents: opp.required_documents,
      missing_information: matchEval.missingInformation,
      potential_disqualifiers: matchEval.potentialDisqualifiers,
      geographic_match: {
        level: 'UNKNOWN',
        matched: false,
        score: null,
        explanation: 'Provide a location to evaluate geographic eligibility.',
      },
      source_provenance: {
        source_name: row.source_name,
        source_url: opp.source_url,
        official_source: opp.official_source,
        trust_level: row.source_trust_level,
        last_verified: opp.last_verified_at.toISOString().split('T')[0],
        retrieved_at: opp.retrieved_at.toISOString().split('T')[0],
        source_opportunity_id: opp.source_opportunity_id,
        source_provider: opp.source_provider || opp.provider_name,
        additional_sources: row.additional_sources || [],
      },
      application_links: row.verified_application_links || [],
    };
  }
}

export const searchEngine = new SearchEngine();
