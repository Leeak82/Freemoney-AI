import {
  Opportunity,
  UserProfile,
  MatchConfidence,
  MatchStatus,
} from '../types/index.js';
import { config } from '../config/index.js';

export interface EligibilityMatchResult {
  matchScore: number | null; // Null if insufficient user profile
  confidence: MatchConfidence;
  status: MatchStatus;
  matchedFactors: string[];
  missingInformation: string[];
  potentialDisqualifiers: string[];
  explanation: string;
  requiredDocuments: string[];
}

export interface IEligibilityMatcher {
  evaluateEligibility(
    opportunity: Opportunity,
    profile?: Partial<UserProfile>
  ): Promise<EligibilityMatchResult>;
}

/**
 * Deterministic Rule-Based Eligibility Matcher
 * Strictly follows rules:
 * - Never invents facts or missing criteria
 * - Preserves uncertainty when profile data is incomplete
 * - Does not turn missing info into a false positive
 */
export class RuleBasedEligibilityMatcher implements IEligibilityMatcher {
  public async evaluateEligibility(
    opportunity: Opportunity,
    profile?: Partial<UserProfile>
  ): Promise<EligibilityMatchResult> {
    const matchedFactors: string[] = [];
    const missingInformation: string[] = [];
    const potentialDisqualifiers: string[] = [];
    const requiredDocuments: string[] = [...(opportunity.required_documents || [])];

    // Check if user profile is present with sufficient attributes
    const hasProfile =
      profile &&
      (profile.state ||
        profile.zip_code ||
        profile.income_range ||
        profile.is_veteran !== undefined ||
        profile.is_disabled !== undefined ||
        profile.is_student !== undefined ||
        profile.is_business_owner !== undefined);

    if (!hasProfile) {
      // Return uncalculated state requiring profile completion
      return {
        matchScore: null,
        confidence: 'INSUFFICIENT_DATA',
        status: 'NEEDS_VERIFICATION',
        matchedFactors: [
          'Program is currently open and accepting applications from eligible parties.',
          opportunity.location_scope === 'NATIONWIDE'
            ? 'Open nationwide across all US states and territories.'
            : 'Program has specific geographic eligibility boundaries.',
        ],
        missingInformation: [
          'State and ZIP code location',
          'Household income and size',
          'Demographic details (veteran, disability, student, or business status)',
        ],
        potentialDisqualifiers: [],
        explanation:
          'Complete your optional profile to improve matching and calculate your qualification score.',
        requiredDocuments:
          requiredDocuments.length > 0 ? requiredDocuments : ['Standard Application Form'],
      };
    }

    let scorePoints = 50; // Base score for open opportunity
    let totalPossible = 100;

    // 1. Geographic Location Evaluation
    if (opportunity.location_scope === 'NATIONWIDE') {
      matchedFactors.push('You qualify geographically: Program is open nationwide.');
      scorePoints += 20;
    } else if (profile.state && opportunity.states && opportunity.states.length > 0) {
      if (opportunity.states.map((s) => s.toUpperCase()).includes(profile.state.toUpperCase())) {
        matchedFactors.push(`You match the geographic state requirement (${profile.state.toUpperCase()}).`);
        scorePoints += 25;
      } else {
        potentialDisqualifiers.push(
          `Program is restricted to: ${opportunity.states.join(', ')}. Your profile state is ${profile.state}.`
        );
        scorePoints -= 40;
      }
    } else {
      missingInformation.push('Specific state or county residency verification');
    }

    // 2. Audience & Demographic Matching
    const cat = (opportunity.category || '').toLowerCase();
    const title = (opportunity.title || '').toLowerCase();
    const desc = (opportunity.description || '').toLowerCase();

    // Veteran Programs
    if (cat === 'veterans' || title.includes('veteran') || desc.includes('veteran')) {
      if (profile.is_veteran === true) {
        matchedFactors.push('Veteran status verified: Matches program focus for military veterans.');
        scorePoints += 25;
        if (!requiredDocuments.includes('DD-214 or Veteran Verification Document')) {
          requiredDocuments.push('DD-214 or Veteran Verification Document');
        }
      } else if (profile.is_veteran === false) {
        potentialDisqualifiers.push('Program is designated specifically for military veterans.');
        scorePoints -= 50;
      } else {
        missingInformation.push('Military or veteran service status');
      }
    }

    // Disability Programs
    if (cat === 'disability' || title.includes('disability') || desc.includes('disability')) {
      if (profile.is_disabled === true) {
        matchedFactors.push('Matches criteria for individuals with disabilities or accessibility needs.');
        scorePoints += 25;
        if (!requiredDocuments.includes('Proof of Disability or Medical Certification')) {
          requiredDocuments.push('Proof of Disability or Medical Certification');
        }
      } else if (profile.is_disabled === false) {
        potentialDisqualifiers.push('Program targets individuals with documented disabilities.');
        scorePoints -= 30;
      } else {
        missingInformation.push('Disability or special assistance eligibility');
      }
    }

    // Student / Education
    if (cat === 'education-scholarships' || title.includes('scholarship') || title.includes('student')) {
      if (profile.is_student === true) {
        matchedFactors.push('Student enrollment status matches educational grant criteria.');
        scorePoints += 20;
        if (!requiredDocuments.includes('Proof of Enrollment / Transcript')) {
          requiredDocuments.push('Proof of Enrollment / Transcript');
        }
      } else if (profile.is_student === false) {
        missingInformation.push('Educational enrollment verification');
      } else {
        missingInformation.push('Current student enrollment status');
      }
    }

    // Small Business
    if (cat === 'small-business' || title.includes('business') || title.includes('sbir')) {
      if (profile.is_business_owner === true) {
        matchedFactors.push('Small business or commercial entity ownership matches grant focus.');
        scorePoints += 20;
        if (!requiredDocuments.includes('Business Registration / EIN Certificate')) {
          requiredDocuments.push('Business Registration / EIN Certificate');
        }
      } else if (profile.is_business_owner === false) {
        potentialDisqualifiers.push('Program is restricted to registered small businesses or commercial entities.');
        scorePoints -= 35;
      } else {
        missingInformation.push('Business registration or ownership status');
      }
    }

    // Housing / Rent
    if (cat === 'rent-housing') {
      if (profile.housing_status === 'RENTER') {
        matchedFactors.push('Renter status matches rental assistance requirements.');
        scorePoints += 20;
        if (!requiredDocuments.includes('Lease Agreement & Rent Ledger')) {
          requiredDocuments.push('Lease Agreement & Rent Ledger');
        }
      } else if (profile.housing_status === 'HOMEOWNER') {
        matchedFactors.push('Homeowner status evaluated for housing repair/rehabilitation programs.');
      } else {
        missingInformation.push('Housing status (Renter vs. Homeowner)');
      }
    }

    // Income evaluation
    if (profile.income_range) {
      matchedFactors.push(`Income profile (${profile.income_range}) is recorded.`);
      if (!requiredDocuments.includes('Proof of Income (Paystubs / Tax Return)')) {
        requiredDocuments.push('Proof of Income (Paystubs / Tax Return)');
      }
    } else {
      missingInformation.push('Household income verification (W-2, tax return, or pay stubs)');
    }

    // Bound final score between 0 and 100
    const finalScore = Math.max(0, Math.min(100, Math.round(scorePoints)));

    let status: MatchStatus = 'NEEDS_VERIFICATION';
    let confidence: MatchConfidence = 'MEDIUM';

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

    let explanation = `Based on your profile, you are evaluated as a ${status.replace(/_/g, ' ').toLowerCase()}.`;
    if (potentialDisqualifiers.length > 0) {
      explanation = `Potential disqualifier identified: ${potentialDisqualifiers.join('. ')}.`;
    } else if (missingInformation.length > 0) {
      explanation += ` Please note that ${missingInformation.length} factor(s) still require verification.`;
    }

    return {
      matchScore: finalScore,
      confidence,
      status,
      matchedFactors,
      missingInformation,
      potentialDisqualifiers,
      explanation,
      requiredDocuments,
    };
  }
}

export class ConfigurableEligibilityMatcher implements IEligibilityMatcher {
  private activeMatcher: IEligibilityMatcher;

  constructor() {
    // Configurable provider: defaults to robust deterministic rule matcher
    this.activeMatcher = new RuleBasedEligibilityMatcher();
  }

  public async evaluateEligibility(
    opportunity: Opportunity,
    profile?: Partial<UserProfile>
  ): Promise<EligibilityMatchResult> {
    return this.activeMatcher.evaluateEligibility(opportunity, profile);
  }
}

export const eligibilityMatcher = new ConfigurableEligibilityMatcher();
