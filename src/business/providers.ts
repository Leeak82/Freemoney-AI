import { BusinessStructure } from '../types/index.js';

export type RequirementVerificationStatus = 'VERIFIED' | 'NEEDS_VERIFICATION';

export interface BusinessRequirementInput {
  countryCode: string;
  state?: string;
  county?: string;
  city?: string;
  industry?: string;
  businessType?: string;
}

export interface BusinessRequirementResult {
  requirementType: 'LICENSE' | 'PERMIT' | 'TAX_REGISTRATION' | 'EMPLOYER' | 'FORMATION' | 'OTHER';
  title: string;
  agency: string;
  description: string;
  officialUrl: string;
  required: boolean | null;
  status: RequirementVerificationStatus;
  sourceIdentifier: string;
  official: boolean;
  lastVerifiedAt: string;
}

export interface IBusinessRequirementProvider {
  readonly id: string;
  supports(input: BusinessRequirementInput): boolean;
  findRequirements(input: BusinessRequirementInput): Promise<BusinessRequirementResult[]>;
}

export interface FormationRequirementInput {
  countryCode: string;
  state?: string;
  structure: BusinessStructure;
}

export interface FormationRequirement {
  key: string;
  title: string;
  description: string;
  required: boolean | null;
  status: RequirementVerificationStatus;
  officialUrl: string;
  organization: string;
  fee: number | null;
  documents: string[];
  lastVerifiedAt: string;
}

export interface FormationGuidance {
  supported: boolean;
  jurisdiction: string;
  structure: BusinessStructure;
  officialAgency: string | null;
  officialUrl: string | null;
  requirements: FormationRequirement[];
  ongoingRequirements: FormationRequirement[];
  disclaimer: string;
  missingInformation: string[];
}

export interface IFormationRequirementProvider {
  readonly id: string;
  supports(input: FormationRequirementInput): boolean;
  getFormationRequirements(input: FormationRequirementInput): Promise<FormationGuidance>;
}

const VERIFIED_DATE = '2026-08-17';

/**
 * Federal resources are applicable throughout the United States, but do not
 * decide whether a state/local registration, license, or permit is required.
 */
export class FederalBusinessRequirementProvider implements IBusinessRequirementProvider {
  public readonly id = 'federal-business-resources';

  public supports(input: BusinessRequirementInput): boolean {
    return input.countryCode.trim().toUpperCase() === 'US';
  }

  public async findRequirements(
    _input: BusinessRequirementInput
  ): Promise<BusinessRequirementResult[]> {
    return [
      {
        requirementType: 'LICENSE',
        title: 'Research licenses and permits by jurisdiction and activity',
        agency: 'U.S. Small Business Administration',
        description:
          'License and permit obligations vary by business activity and location. Use the official SBA guide as a starting point, then verify with state and local agencies.',
        officialUrl:
          'https://www.sba.gov/business-guide/launch-your-business/apply-licenses-permits',
        required: null,
        status: 'NEEDS_VERIFICATION',
        sourceIdentifier: 'sba-licenses-permits-guide',
        official: true,
        lastVerifiedAt: VERIFIED_DATE,
      },
      {
        requirementType: 'TAX_REGISTRATION',
        title: 'Determine federal tax responsibilities',
        agency: 'Internal Revenue Service',
        description:
          'Federal tax responsibilities depend on business structure, activities, and employees. Review the official IRS business portal.',
        officialUrl: 'https://www.irs.gov/businesses',
        required: null,
        status: 'NEEDS_VERIFICATION',
        sourceIdentifier: 'irs-businesses',
        official: true,
        lastVerifiedAt: VERIFIED_DATE,
      },
      {
        requirementType: 'EMPLOYER',
        title: 'Review federal employer responsibilities',
        agency: 'Internal Revenue Service',
        description:
          'Businesses with employees may have federal employer tax responsibilities. Verify applicability with the IRS.',
        officialUrl: 'https://www.irs.gov/businesses/small-businesses-self-employed/businesses-with-employees',
        required: null,
        status: 'NEEDS_VERIFICATION',
        sourceIdentifier: 'irs-businesses-with-employees',
        official: true,
        lastVerifiedAt: VERIFIED_DATE,
      },
    ];
  }
}

/**
 * Provides only country-level verified guidance. State filing facts, fees,
 * registered-agent rules, and annual reports intentionally remain unverified
 * until a state-specific provider is installed.
 */
export class FederalFormationGuidanceProvider implements IFormationRequirementProvider {
  public readonly id = 'federal-formation-guidance';

  public supports(input: FormationRequirementInput): boolean {
    return input.countryCode.trim().toUpperCase() === 'US';
  }

  public async getFormationRequirements(
    input: FormationRequirementInput
  ): Promise<FormationGuidance> {
    const stateMissing = !input.state;
    const llc = input.structure === 'LLC';
    return {
      supported: !llc,
      jurisdiction: input.state ? `${input.state.toUpperCase()}, US` : 'United States',
      structure: input.structure,
      officialAgency: null,
      officialUrl: null,
      requirements: [
        {
          key: 'choose-structure',
          title: 'Choose a business structure',
          description:
            'Review structure differences with official SBA guidance. FreeMoney-AI does not provide legal or tax advice.',
          required: null,
          status: 'NEEDS_VERIFICATION',
          officialUrl:
            'https://www.sba.gov/business-guide/launch-your-business/choose-business-structure',
          organization: 'U.S. Small Business Administration',
          fee: null,
          documents: [],
          lastVerifiedAt: VERIFIED_DATE,
        },
        {
          key: 'ein',
          title: 'Determine whether an Employer Identification Number is needed',
          description:
            'Use the official IRS service to determine eligibility and apply directly. An EIN is not assumed to be required for every business.',
          required: null,
          status: 'NEEDS_VERIFICATION',
          officialUrl:
            'https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number',
          organization: 'Internal Revenue Service',
          fee: 0,
          documents: [],
          lastVerifiedAt: VERIFIED_DATE,
        },
      ],
      ongoingRequirements: [],
      disclaimer:
        'General educational guidance only, not legal or tax advice. State formation facts are shown only when a verified state provider is available.',
      missingInformation: [
        ...(stateMissing ? ['State of formation'] : []),
        ...(llc
          ? [
              `Verified LLC filing agency, requirements, fees, registered-agent rules, and ongoing compliance for ${input.state?.toUpperCase() || 'the selected state'}`,
            ]
          : []),
      ],
    };
  }
}

export class BusinessProviderRegistry {
  private readonly requirementProviders: IBusinessRequirementProvider[] = [
    new FederalBusinessRequirementProvider(),
  ];
  private readonly formationProviders: IFormationRequirementProvider[] = [
    new FederalFormationGuidanceProvider(),
  ];

  public async findRequirements(
    input: BusinessRequirementInput
  ): Promise<BusinessRequirementResult[]> {
    const providers = this.requirementProviders.filter((provider) => provider.supports(input));
    return (await Promise.all(providers.map((provider) => provider.findRequirements(input)))).flat();
  }

  public async getFormationGuidance(
    input: FormationRequirementInput
  ): Promise<FormationGuidance> {
    const provider = this.formationProviders.find((candidate) => candidate.supports(input));
    if (!provider) {
      return {
        supported: false,
        jurisdiction: `${input.state || 'Unknown'}, ${input.countryCode || 'Unknown'}`,
        structure: input.structure,
        officialAgency: null,
        officialUrl: null,
        requirements: [],
        ongoingRequirements: [],
        disclaimer: 'Information not verified. Consult the official government business registry.',
        missingInformation: ['Verified government formation provider for this jurisdiction'],
      };
    }
    return provider.getFormationRequirements(input);
  }
}

export const businessProviderRegistry = new BusinessProviderRegistry();
