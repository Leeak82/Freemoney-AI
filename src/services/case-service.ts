import { query } from '../db/index.js';

export class CaseService {
  async createCase(userId: string, input: { title?: string; intent?: string; userFacts?: unknown; interpretations?: unknown }) {
    const result = await query(
      `INSERT INTO assistance_cases (user_id,title,intent,user_facts,system_interpretations)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb) RETURNING *`,
      [userId, input.title || null, input.intent || null, JSON.stringify(input.userFacts || {}), JSON.stringify(input.interpretations || {})]
    );
    return result.rows[0];
  }

  async listCases(userId: string) {
    const result = await query(
      `SELECT id,title,status,intent,user_facts,system_interpretations,created_at,updated_at
       FROM assistance_cases WHERE user_id=$1 AND status <> 'DELETED'
       ORDER BY updated_at DESC`, [userId]
    );
    return result.rows;
  }

  async getOwnedCase(userId: string, caseId: string) {
    const result = await query(`SELECT * FROM assistance_cases WHERE id=$1 AND user_id=$2 AND status <> 'DELETED'`, [caseId,userId]);
    return result.rows[0] || null;
  }

  async getCaseHistory(userId: string, caseId: string) {
    const owned = await this.getOwnedCase(userId, caseId);
    if (!owned) return null;
    const searches = await query(
      `SELECT s.id,s.query_text,s.results_count,s.interpretation,s.created_at,
              COALESCE(jsonb_agg(jsonb_build_object(
                'opportunity_id',csr.opportunity_id,
                'rank',csr.rank,
                'match_classification',csr.match_classification,
                'match_reasons',csr.match_reasons,
                'missing_facts',csr.missing_facts,
                'research_snapshot',csr.research_snapshot
              ) ORDER BY csr.rank) FILTER (WHERE csr.id IS NOT NULL),'[]'::jsonb) AS results
       FROM searches s
       LEFT JOIN case_search_results csr ON csr.search_id=s.id AND csr.case_id=$2
       WHERE s.user_id=$1 AND s.case_id=$2
       GROUP BY s.id ORDER BY s.created_at DESC`, [userId,caseId]
    );
    return { case: owned, searches: searches.rows };
  }

  async recordSearch(userId: string, caseId: string, queryText: string, interpretation: unknown, results: any[]) {
    const owned = await this.getOwnedCase(userId, caseId);
    if (!owned) throw new Error('Case not found');
    const search = await query<{ id: string }>(
      `INSERT INTO searches (user_id,case_id,query_text,results_count,interpretation)
       VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING id`,
      [userId,caseId,queryText,results.length,JSON.stringify(interpretation || {})]
    );
    for (let i=0;i<results.length;i++) {
      const item=results[i];
      const opportunityId=item?.opportunity?.id;
      if (!opportunityId) continue;
      await query(
        `INSERT INTO case_search_results
         (case_id,search_id,opportunity_id,rank,match_classification,match_reasons,missing_facts,research_snapshot)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)
         ON CONFLICT (search_id,opportunity_id) DO NOTHING`,
        [caseId,search.rows[0].id,opportunityId,i+1,item.match_status || 'NEEDS_VERIFICATION',JSON.stringify(item.why_you_may_qualify || []),JSON.stringify(item.missing_information || []),JSON.stringify({
          opportunity: item.opportunity,
          source_provenance: item.source_provenance,
          requirements: item.requirements || [],
          documents: item.documents || [],
          application_links: item.application_links || [],
          confidence: item.confidence,
          match_score: item.match_score,
        })]
      );
    }
    await query(`UPDATE assistance_cases SET updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND user_id=$2`, [caseId,userId]);
    return search.rows[0].id;
  }
}

export const caseService = new CaseService();
