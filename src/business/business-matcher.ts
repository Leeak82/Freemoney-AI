import {
  BusinessProfile,
  BusinessStage,
  FundingPurpose,
  MatchConfidence,
  MatchStatus,
  Opportunity,
  OpportunityAudience,
} from '../types/index.js';
import { geographicMatcher } from '../geography/geographic-matcher.js';
import { EligibilityMatchResult } from '../matching/eligibility-matcher.js';

export interface IBusinessEligibilityMatcher {
  evaluateBusinessEligibility(
    opportunity: Opportunity,
    profile?: Partial<BusinessProfile>
  ): Promise<EligibilityMatchResult>;
}

/**
 * Deterministic business matcher. It evaluates only normalized opportunity
 * attributes and optional user-provided business facts.
 */
export class BusinessEligibilityMatcher implements IBusinessEligibilityMatcher {
  public async evaluateBusinessEligibility(
    opportunity: Opportunity,
    profile?: Partial<BusinessProfile>
  ): Promise<EligibilityMatchResult> {
    if (!profile || !this.hasUsefulProfile(profile)) {
      return {
        matchScore: null,
        confidence: 'INSUFFICIENT_DATA',
        status: 'NEEDS_VERIFICATION',
        matchedFactors: [],
        missingInformation: [
          'Business location',
          'Business stage',
          'Industry',
          'Funding purpose and amount',
        ],
        potentialDisqualifiers: [],
        explanation:
          'Complete the optional business profile to improve matching. No eligibility determination has been made.',
        requiredDocuments: opportunity.required_documents || [],
      };
    }

    let score = 40;
    const matchedFactors: string[] = [];
    const missingInformation: string[] = [];
    const potentialDisqualifiers: string[] = [];

    const geo = geographicMatcher.matchOpportunity(
      {
        country_code: profile.country,
        state: profile.state,
        county: profile.county,
        city: profile.city,
        postal_code: profile.postal_code,
      },
      opportunity
    );

    if (geo.matched) {
      score += Math.round((geo.score || 0) * 0.2);
      matchedFactors.push(geo.explanation);
    } else if (geo.level === 'NO_MATCH') {
      potentialDisqualifiers.push(geo.explanation);
      score -= 50;
    } else {
      missingInformation.push(...geo.missingInformation);
    }

    const audiences = opportunity.audiences || [];
    if (audiences.length > 0) {
      const audienceResult = this.matchAudience(audiences, profile);
      matchedFactors.push(...audienceResult.matched);
      potentialDisqualifiers.push(...audienceResult.disqualifiers);
      missingInformation.push(...audienceResult.missing);
      score += audienceResult.score;
    } else {
      missingInformation.push('Verified opportunity audience');
    }

    const verifiedRules = opportunity.eligibility_rules || {};
    const allowedStages = Array.isArray(verifiedRules.businessStages)
      ? (verifiedRules.businessStages as BusinessStage[])
      : [];
    if (allowedStages.length > 0) {
      if (!profile.business_stage) {
        missingInformation.push('Business stage');
      } else if (allowedStages.includes(profile.business_stage)) {
        matchedFactors.push(`Business stage ${profile.business_stage} is listed by the program.`);
        score += 12;
      } else {
        potentialDisqualifiers.push(
          `Program lists these business stages: ${allowedStages.join(', ')}.`
        );
        score -= 30;
      }
    }

    const allowedIndustries = Array.isArray(verifiedRules.industries)
      ? (verifiedRules.industries as string[]).map((value) => value.toUpperCase())
      : [];
    if (allowedIndustries.length > 0) {
      if (!profile.industry) {
        missingInformation.push('Industry');
      } else if (allowedIndustries.includes(profile.industry.toUpperCase())) {
        matchedFactors.push(`Industry ${profile.industry} is listed by the program.`);
        score += 12;
      } else {
        potentialDisqualifiers.push('Industry is not among the program’s listed industries.');
        score -= 30;
      }
    }

    if (profile.funding_purpose && opportunity.funding_purposes?.length) {
      if (opportunity.funding_purposes.includes(profile.funding_purpose)) {
        matchedFactors.push(
          `Funding purpose ${profile.funding_purpose.replace(/_/g, ' ')} matches the program.`
        );
        score += 12;
      } else {
        missingInformation.push('Program support for the selected funding purpose');
      }
    }

    if (profile.funding_needed != null) {
      if (
        opportunity.amount_max != null &&
        profile.funding_needed > opportunity.amount_max
      ) {
        potentialDisqualifiers.push(
          `Requested funding exceeds the program’s verified maximum of ${opportunity.amount_max}.`
        );
        score -= 20;
      } else if (
        opportunity.amount_min != null &&
        profile.funding_needed < opportunity.amount_min
      ) {
        potentialDisqualifiers.push(
          `Requested funding is below the program’s verified minimum of ${opportunity.amount_min}.`
        );
        score -= 15;
      } else if (opportunity.amount_min != null || opportunity.amount_max != null) {
        matchedFactors.push('Funding amount is within the published award range.');
        score += 8;
      } else {
        missingInformation.push('Published award amount');
      }
    }

    const finalScore = Math.max(0, Math.min(100, Math.round(score)));
    let status: MatchStatus;
    let confidence: MatchConfidence;
    if (potentialDisqualifiers.length > 0) {
      status = 'DISQUALIFIED';
      confidence = 'HIGH';
    } else if (finalScore >= 80 && missingInformation.length <= 1) {
      status = 'LIKELY_MATCH';
      confidence = 'HIGH';
    } else if (finalScore >= 60) {
      status = 'POTENTIAL_MATCH';
      confidence = 'MEDIUM';
    } else {
      status = 'MAY_QUALIFY';
      confidence = 'LOW';
    }

    return {
      matchScore: finalScore,
      confidence,
      status,
      matchedFactors,
      missingInformation: [...new Set(missingInformation)],
      potentialDisqualifiers,
      explanation:
        potentialDisqualifiers.length > 0
          ? 'One or more published factors may disqualify this business. Verify with the program administrator.'
          : 'This is a potential business match based only on verified program data and the supplied business profile.',
      requiredDocuments: opportunity.required_documents || [],
    };
  }

  private hasUsefulProfile(profile: Partial<BusinessProfile>): boolean {
    return Boolean(
      profile.state ||
        profile.postal_code ||
        profile.business_stage ||
        profile.industry ||
        profile.funding_purpose ||
        profile.funding_needed != null
    );
  }

  private matchAudience(
    audiences: OpportunityAudience[],
    profile: Partial<BusinessProfile>
  ): { score: number; matched: string[]; missing: string[]; disqualifiers: string[] } {
    const matched: string[] = [];
    const missing: string[] = [];
    const disqualifiers: string[] = [];
    let score = 0;

    const businessAudiences: OpportunityAudience[] = [
      'ENTREPRENEUR',
      'STARTUP',
      'SMALL_BUSINESS',
      'EXISTING_BUSINESS',
      'NONPROFIT',
      'EMPLOYER',
    ];
    if (audiences.some((audience) => businessAudiences.includes(audience))) {
      matched.push('Program explicitly lists a business or entrepreneur audience.');
      score += 10;
    }
    if (audiences.includes('STARTUP')) {
      if (
        profile.business_stage &&
        ['IDEA', 'PLANNING', 'FORMATION', 'PRE_REVENUE'].includes(profile.business_stage)
      ) {
        matched.push('Business stage aligns with the program’s startup audience.');
        score += 10;
      } else if (!profile.business_stage) {
        missing.push('Business stage');
      }
    }
    if (audiences.includes('EXISTING_BUSINESS')) {
      if (
        profile.business_stage &&
        ['OPERATING', 'GROWING', 'EXPANDING', 'DISTRESSED'].includes(
          profile.business_stage
        )
      ) {
        matched.push('Business stage aligns with the program’s existing-business audience.');
        score += 10;
      } else if (!profile.business_stage) {
        missing.push('Business stage');
      }
    }
    if (audiences.includes('VETERAN')) {
      if (profile.veteran_owned === true) {
        matched.push('User reports that the business is veteran-owned.');
        score += 10;
      } else if (profile.veteran_owned === false) {
        disqualifiers.push('Program is classified for a veteran audience.');
      } else {
        missing.push('Veteran-owned status');
      }
    }

    return { score, matched, missing, disqualifiers };
  }
}

export const businessEligibilityMatcher = new BusinessEligibilityMatcher();
