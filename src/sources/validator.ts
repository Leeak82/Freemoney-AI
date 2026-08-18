export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class OpportunityValidator {
  public static validate(opp: Record<string, any>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Missing Title
    if (!opp.title || typeof opp.title !== 'string' || opp.title.trim().length === 0) {
      errors.push('Missing required opportunity title');
    }

    // 2. Missing Source ID / Raw Identifier
    if (!opp.source_id || typeof opp.source_id !== 'string') {
      errors.push('Missing source_id provenance link');
    }
    if (!opp.source_opportunity_id || typeof opp.source_opportunity_id !== 'string') {
      errors.push('Missing source_opportunity_id');
    }
    if (!opp.source_provider && !opp.provider_name) {
      errors.push('Missing source provider provenance');
    }

    // 3. Invalid URLs
    if (opp.source_url && !this.isValidUrl(opp.source_url)) {
      errors.push(`Invalid source_url: ${opp.source_url}`);
    }
    if (opp.application_url && !this.isValidUrl(opp.application_url)) {
      errors.push(`Invalid application_url: ${opp.application_url}`);
    }
    if (opp.application_url_verified && !opp.application_url) {
      errors.push('Application URL cannot be verified when no application URL is present');
    }

    // 4. Invalid or Inconsistent Amounts
    if (opp.amount_min !== null && opp.amount_min !== undefined) {
      if (typeof opp.amount_min !== 'number' || isNaN(opp.amount_min) || opp.amount_min < 0) {
        errors.push('amount_min must be a non-negative number');
      }
    }
    if (opp.amount_max !== null && opp.amount_max !== undefined) {
      if (typeof opp.amount_max !== 'number' || isNaN(opp.amount_max) || opp.amount_max < 0) {
        errors.push('amount_max must be a non-negative number');
      }
    }
    if (
      typeof opp.amount_min === 'number' &&
      typeof opp.amount_max === 'number' &&
      opp.amount_min > opp.amount_max
    ) {
      errors.push(`amount_min (${opp.amount_min}) cannot exceed amount_max (${opp.amount_max})`);
    }

    // 5. Expired Deadline Check
    if (opp.deadline) {
      const deadlineDate = new Date(opp.deadline);
      if (isNaN(deadlineDate.getTime())) {
        errors.push('Invalid deadline date format');
      } else if (deadlineDate.getTime() < Date.now() - 365 * 24 * 60 * 60 * 1000) {
        warnings.push('Opportunity deadline expired over one year ago');
      }
    }

    // 6. Missing Provenance
    if (!opp.retrieved_at || !opp.last_verified_at) {
      warnings.push('Opportunity lacks full timestamp verification metadata');
    }
    if (!opp.description || String(opp.description).trim().length === 0) {
      warnings.push('Opportunity description is missing from the source');
    }
    if (!opp.location_scope || opp.location_scope === 'UNKNOWN') {
      warnings.push('Opportunity geographic scope is unknown and requires verification');
    }
    if (
      opp.status === 'ACTIVE' &&
      opp.deadline &&
      new Date(opp.deadline).getTime() < Date.now()
    ) {
      errors.push('Expired opportunity cannot have ACTIVE status');
    }
    if (opp.status && opp.active !== (opp.status === 'ACTIVE')) {
      errors.push('Opportunity active flag contradicts normalized status');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private static isValidUrl(urlStr: string): boolean {
    try {
      const parsed = new URL(urlStr);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }
}
