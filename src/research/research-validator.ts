export type ResearchLifecycle = 'DISCOVERED'|'RESEARCHING'|'SOURCE_VERIFIED'|'REVIEW_REQUIRED'|'VERIFIED'|'STALE'|'CONFLICT'|'INACTIVE';
export type AvailabilityState = 'ACCEPTING_APPLICATIONS'|'APPLICATION_WINDOW_SCHEDULED'|'WAITLIST_OPEN'|'WAITLIST_CLOSED'|'TEMPORARILY_PAUSED'|'FUNDING_EXHAUSTED'|'CLOSED'|'EXPIRED'|'STATUS_NOT_CONFIRMED';

export interface EvidenceRef {
  source_url: string;
  source_organization: string;
  authoritative: boolean;
  retrieved_at: string | Date;
  verified_at?: string | Date | null;
}

export interface ProgramResearchClaim {
  lifecycle_status?: ResearchLifecycle;
  availability_state?: AvailabilityState;
  availability_evidence?: EvidenceRef | null;
  application_url?: string | null;
  application_url_evidence?: EvidenceRef | null;
  eligibility_rules?: Array<{ description: string; evidence?: EvidenceRef | null }>;
  documents?: Array<{ name: string; state: 'REQUIRED'|'REQUESTED_DURING_APPLICATION'|'MAY_BE_REQUESTED'|'NOT_CONFIRMED'; evidence?: EvidenceRef | null }>;
  benefit_amount?: unknown;
  benefit_amount_evidence?: EvidenceRef | null;
  deadline?: string | Date | null;
  deadline_evidence?: EvidenceRef | null;
  phone?: string | null;
  phone_evidence?: EvidenceRef | null;
  geography?: unknown;
  geography_evidence?: EvidenceRef | null;
}

export interface ResearchValidationResult { valid: boolean; errors: string[]; warnings: string[]; }

function hasAuthoritativeEvidence(e?: EvidenceRef | null): boolean {
  return Boolean(e?.authoritative && e.source_url && e.source_organization && e.retrieved_at);
}

export class ResearchClaimValidator {
  static validate(record: ProgramResearchClaim, now = new Date()): ResearchValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const rule of record.eligibility_rules || []) {
      if (!hasAuthoritativeEvidence(rule.evidence)) errors.push(`Eligibility requirement has no authoritative evidence: ${rule.description}`);
    }
    for (const doc of record.documents || []) {
      if (doc.state !== 'NOT_CONFIRMED' && !hasAuthoritativeEvidence(doc.evidence)) {
        errors.push(`Document marked ${doc.state} without authoritative evidence: ${doc.name}`);
      }
    }
    if (record.application_url && !hasAuthoritativeEvidence(record.application_url_evidence)) {
      errors.push('Application URL cannot be presented as actionable without authoritative evidence');
    }
    if (record.benefit_amount != null && !hasAuthoritativeEvidence(record.benefit_amount_evidence)) errors.push('Benefit amount has no authoritative evidence');
    if (record.deadline && !hasAuthoritativeEvidence(record.deadline_evidence)) errors.push('Deadline has no authoritative evidence');
    if (record.phone && !hasAuthoritativeEvidence(record.phone_evidence)) errors.push('Phone number has no authoritative evidence');
    if (record.geography != null && !hasAuthoritativeEvidence(record.geography_evidence)) errors.push('Geographic restriction has no authoritative evidence');

    const claimsOpen = record.availability_state === 'ACCEPTING_APPLICATIONS' || record.availability_state === 'WAITLIST_OPEN';
    if (claimsOpen && !hasAuthoritativeEvidence(record.availability_evidence)) {
      errors.push('Open/accepting availability requires recent authoritative evidence');
    }
    if (claimsOpen && record.availability_evidence?.verified_at) {
      const ageMs = now.getTime() - new Date(record.availability_evidence.verified_at).getTime();
      if (ageMs > 7 * 24 * 60 * 60 * 1000) errors.push('Open/accepting availability evidence is stale (>7 days)');
    } else if (claimsOpen) {
      errors.push('Open/accepting availability requires a verification timestamp');
    }

    if (record.lifecycle_status === 'VERIFIED') {
      const materialEvidence = [
        ...(record.eligibility_rules || []).map(x => x.evidence),
        ...(record.documents || []).filter(x => x.state !== 'NOT_CONFIRMED').map(x => x.evidence),
        record.application_url ? record.application_url_evidence : null,
      ].filter(Boolean);
      if (!materialEvidence.length) errors.push('Program cannot be VERIFIED without evidence-backed material facts');
    }

    if (!record.availability_state || record.availability_state === 'STATUS_NOT_CONFIRMED') warnings.push('Current application availability is not confirmed');
    return { valid: errors.length === 0, errors, warnings };
  }
}
