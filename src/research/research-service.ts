import { query } from '../db/index.js';

export interface ProgramResearchSnapshot {
  lifecycle_status: string;
  research_completeness: Record<string, unknown>;
  human_review_required: boolean;
  conflict_present: boolean;
  stale_after: string | null;
  availability: {
    state: string;
    verified_at: string | null;
    stale_after: string | null;
    source: EvidenceSummary | null;
  };
  verified_requirements: Array<{
    key: string;
    description: string;
    operator: string | null;
    target_value: unknown;
    source: EvidenceSummary;
  }>;
  documents: Array<{
    name: string;
    state: string;
    source_wording: string | null;
    source: EvidenceSummary;
  }>;
  application_steps: Array<{
    step: number;
    instruction: string;
    method: string | null;
    source: EvidenceSummary;
  }>;
  conflicts: Array<{
    fact_type: string;
    fact_key: string;
    status: string;
  }>;
  unknowns: string[];
}

export interface EvidenceSummary {
  source_url: string;
  source_title: string | null;
  source_organization: string;
  source_kind: string;
  authoritative: boolean;
  retrieved_at: string;
  verified_at: string | null;
  confidence: number | null;
}

function evidence(row: any, prefix = ''): EvidenceSummary {
  const get = (key: string) => row[`${prefix}${key}`];
  return {
    source_url: get('source_url'),
    source_title: get('source_title') || null,
    source_organization: get('source_organization'),
    source_kind: get('source_kind'),
    authoritative: Boolean(get('authoritative')),
    retrieved_at: new Date(get('retrieved_at')).toISOString(),
    verified_at: get('verified_at') ? new Date(get('verified_at')).toISOString() : null,
    confidence: get('confidence') == null ? null : Number(get('confidence')),
  };
}

export function deriveResearchUnknowns(
  completeness: Record<string, unknown> | null | undefined,
  availabilityState: string,
  requirementCount: number,
  applicationStepCount: number,
  documentCount: number
): string[] {
  const unknowns: string[] = [];
  const c = completeness || {};
  const missing = (label: string, ...keys: string[]) =>
    keys.some((key) => c[key] === 'NOT_FOUND' || c[key] === 'PARTIAL' || c[key] === false);

  if (availabilityState === 'STATUS_NOT_CONFIRMED') unknowns.push('Current application availability is not confirmed.');
  if (requirementCount === 0 || missing('eligibility', 'eligibility', 'eligibility_rules')) {
    unknowns.push('Complete eligibility requirements have not been verified.');
  }
  if (applicationStepCount === 0 || missing('application', 'application_process')) {
    unknowns.push('The complete application process has not been verified.');
  }
  if (documentCount === 0 || missing('documents', 'required_documents')) {
    unknowns.push('Required application documents were not found in verified sources.');
  }
  return [...new Set(unknowns)];
}

export class ProgramResearchService {
  async getSnapshot(opportunityId: string): Promise<ProgramResearchSnapshot | null> {
    const research = await query(
      `SELECT lifecycle_status, research_completeness, human_review_required,
              conflict_present, stale_after
       FROM program_research WHERE opportunity_id=$1`,
      [opportunityId]
    );
    if (!research.rows[0]) return null;

    const availabilityRes = await query(
      `SELECT pa.availability_state, pa.verified_at AS availability_verified_at,
              pa.stale_after AS availability_stale_after,
              er.source_url, er.source_title, er.source_organization, er.source_kind,
              er.authoritative, er.retrieved_at, er.verified_at, er.confidence
       FROM program_availability pa
       LEFT JOIN evidence_records er ON er.id=pa.evidence_record_id
       WHERE pa.opportunity_id=$1
       ORDER BY pa.created_at DESC LIMIT 1`,
      [opportunityId]
    );

    const requirementsRes = await query(
      `SELECT rer.rule_key, rer.description, rer.operator, rer.target_value,
              er.source_url, er.source_title, er.source_organization, er.source_kind,
              er.authoritative, er.retrieved_at, er.verified_at, er.confidence
       FROM researched_eligibility_rules rer
       JOIN evidence_records er ON er.id=rer.evidence_record_id
       WHERE rer.opportunity_id=$1 AND er.superseded_at IS NULL AND er.authoritative=TRUE
       ORDER BY rer.created_at, rer.rule_key`,
      [opportunityId]
    );

    const documentsRes = await query(
      `SELECT rd.document_name, rd.requirement_state, rd.source_wording,
              er.source_url, er.source_title, er.source_organization, er.source_kind,
              er.authoritative, er.retrieved_at, er.verified_at, er.confidence
       FROM researched_documents rd
       JOIN evidence_records er ON er.id=rd.evidence_record_id
       WHERE rd.opportunity_id=$1 AND er.superseded_at IS NULL AND er.authoritative=TRUE
       ORDER BY rd.created_at, rd.document_name`,
      [opportunityId]
    );

    const stepsRes = await query(
      `SELECT aps.step_number, aps.instruction, aps.method,
              er.source_url, er.source_title, er.source_organization, er.source_kind,
              er.authoritative, er.retrieved_at, er.verified_at, er.confidence
       FROM application_steps aps
       JOIN evidence_records er ON er.id=aps.evidence_record_id
       WHERE aps.opportunity_id=$1 AND er.superseded_at IS NULL AND er.authoritative=TRUE
       ORDER BY aps.step_number`,
      [opportunityId]
    );

    const conflictsRes = await query(
      `SELECT fact_type, fact_key, status
       FROM source_conflicts
       WHERE opportunity_id=$1 AND status='OPEN'
       ORDER BY created_at DESC`,
      [opportunityId]
    );

    const base = research.rows[0];
    const availabilityRow = availabilityRes.rows[0];
    const availabilityState = availabilityRow?.availability_state || 'STATUS_NOT_CONFIRMED';
    const completeness = base.research_completeness || {};

    return {
      lifecycle_status: base.lifecycle_status,
      research_completeness: completeness,
      human_review_required: Boolean(base.human_review_required),
      conflict_present: Boolean(base.conflict_present || conflictsRes.rows.length),
      stale_after: base.stale_after ? new Date(base.stale_after).toISOString() : null,
      availability: {
        state: availabilityState,
        verified_at: availabilityRow?.availability_verified_at
          ? new Date(availabilityRow.availability_verified_at).toISOString()
          : null,
        stale_after: availabilityRow?.availability_stale_after
          ? new Date(availabilityRow.availability_stale_after).toISOString()
          : null,
        source: availabilityRow?.source_url ? evidence(availabilityRow) : null,
      },
      verified_requirements: requirementsRes.rows.map((row: any) => ({
        key: row.rule_key,
        description: row.description,
        operator: row.operator || null,
        target_value: row.target_value ?? null,
        source: evidence(row),
      })),
      documents: documentsRes.rows.map((row: any) => ({
        name: row.document_name,
        state: row.requirement_state,
        source_wording: row.source_wording || null,
        source: evidence(row),
      })),
      application_steps: stepsRes.rows.map((row: any) => ({
        step: row.step_number,
        instruction: row.instruction,
        method: row.method || null,
        source: evidence(row),
      })),
      conflicts: conflictsRes.rows,
      unknowns: deriveResearchUnknowns(
        completeness,
        availabilityState,
        requirementsRes.rows.length,
        stepsRes.rows.length,
        documentsRes.rows.length
      ),
    };
  }

  async reportOutdated(
    opportunityId: string,
    reportType: string,
    reportText?: string
  ): Promise<{ id: string; status: string }> {
    const result = await query<{ id: string; status: string }>(
      `INSERT INTO user_program_reports (opportunity_id, report_type, report_text)
       VALUES ($1,$2,$3)
       RETURNING id, status`,
      [opportunityId, reportType, reportText || null]
    );
    await query(
      `INSERT INTO verification_events (opportunity_id, event_type, outcome, details)
       VALUES ($1,'USER_REPORT_RECEIVED','REVERIFICATION_REQUIRED',$2::jsonb)`,
      [opportunityId, JSON.stringify({ report_type: reportType })]
    );
    await query(
      `UPDATE program_research
       SET lifecycle_status='REVIEW_REQUIRED', human_review_required=TRUE,
           updated_at=CURRENT_TIMESTAMP
       WHERE opportunity_id=$1 AND lifecycle_status NOT IN ('CONFLICT','INACTIVE')`,
      [opportunityId]
    );
    return result.rows[0];
  }

  async getResearchQueue(limit = 100): Promise<any[]> {
    const result = await query(
      `SELECT o.id AS opportunity_id, o.title, o.provider_name,
              pr.lifecycle_status, pr.human_review_required, pr.conflict_present,
              pr.stale_after, pr.updated_at,
              COUNT(upr.id) FILTER (WHERE upr.status='PENDING_REVERIFICATION')::int AS pending_reports
       FROM program_research pr
       JOIN opportunities o ON o.id=pr.opportunity_id
       LEFT JOIN user_program_reports upr ON upr.opportunity_id=o.id
       WHERE pr.lifecycle_status IN ('DISCOVERED','RESEARCHING','REVIEW_REQUIRED','STALE','CONFLICT')
          OR pr.human_review_required=TRUE
          OR pr.conflict_present=TRUE
          OR pr.stale_after < CURRENT_TIMESTAMP
       GROUP BY o.id, o.title, o.provider_name, pr.lifecycle_status,
                pr.human_review_required, pr.conflict_present, pr.stale_after, pr.updated_at
       ORDER BY
         CASE WHEN pr.lifecycle_status='CONFLICT' THEN 0
              WHEN pr.human_review_required THEN 1
              WHEN pr.lifecycle_status='STALE' OR pr.stale_after < CURRENT_TIMESTAMP THEN 2
              ELSE 3 END,
         pending_reports DESC, pr.updated_at ASC
       LIMIT $1`,
      [Math.max(1, Math.min(limit, 250))]
    );
    return result.rows;
  }
}

export const programResearchService = new ProgramResearchService();
