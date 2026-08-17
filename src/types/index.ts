export type SourceType = 'API' | 'JSON' | 'CSV' | 'RSS' | 'WEB' | 'MANUAL';

export type AuthType = 'NONE' | 'API_KEY' | 'OAUTH' | 'OTHER';

export type SourceTrustLevel = 
  | 'OFFICIAL_GOVERNMENT'
  | 'OFFICIAL_ORGANIZATION'
  | 'VERIFIED_PARTNER'
  | 'COMMUNITY'
  | 'UNKNOWN';

export type DiscoveryStatus =
  | 'DISCOVERED'
  | 'REVIEW'
  | 'VERIFIED'
  | 'ACTIVE'
  | 'REJECTED'
  | 'DISABLED';

export type ProgramType = 'GRANT' | 'BENEFIT' | 'SCHOLARSHIP' | 'ASSISTANCE' | 'TAX_CREDIT' | 'LOAN' | 'EMERGENCY' | 'OTHER';

export type LocationScope =
  | 'NATIONWIDE'
  | 'COUNTRY'
  | 'STATE'
  | 'COUNTY'
  | 'CITY'
  | 'REGION'
  | 'ZIP'
  | 'TRIBAL'
  | 'ONLINE'
  | 'OTHER'
  | 'UNKNOWN';

export type GeographicMatchLevel =
  | 'EXACT'
  | 'CITY'
  | 'COUNTY'
  | 'STATE'
  | 'REGION'
  | 'COUNTRY'
  | 'NATIONWIDE'
  | 'ONLINE'
  | 'NO_MATCH'
  | 'UNKNOWN';

export type OpportunityAudience =
  | 'INDIVIDUAL'
  | 'FAMILY'
  | 'STUDENT'
  | 'VETERAN'
  | 'DISABLED'
  | 'ENTREPRENEUR'
  | 'STARTUP'
  | 'SMALL_BUSINESS'
  | 'EXISTING_BUSINESS'
  | 'NONPROFIT'
  | 'EMPLOYER'
  | 'OTHER';

export type BusinessStage =
  | 'IDEA'
  | 'PLANNING'
  | 'FORMATION'
  | 'PRE_REVENUE'
  | 'OPERATING'
  | 'GROWING'
  | 'EXPANDING'
  | 'DISTRESSED';

export type BusinessStructure =
  | 'SOLE_PROPRIETORSHIP'
  | 'LLC'
  | 'PARTNERSHIP'
  | 'S_CORPORATION'
  | 'C_CORPORATION'
  | 'NONPROFIT'
  | 'OTHER'
  | 'UNKNOWN';

export type FundingPurpose =
  | 'STARTUP_COSTS'
  | 'EQUIPMENT'
  | 'INVENTORY'
  | 'WORKING_CAPITAL'
  | 'RENT'
  | 'UTILITIES'
  | 'PAYROLL'
  | 'MARKETING'
  | 'TECHNOLOGY'
  | 'TRAINING'
  | 'REAL_ESTATE'
  | 'VEHICLE'
  | 'EXPANSION'
  | 'DISASTER_RECOVERY'
  | 'EXPORT'
  | 'OTHER';

export type ApplicationType =
  | 'PERSONAL_ASSISTANCE'
  | 'BUSINESS_ASSISTANCE'
  | 'LLC_FORMATION'
  | 'LICENSE'
  | 'PERMIT'
  | 'FUNDING'
  | 'OTHER';

export type ApplicationStatus = 
  | 'DISCOVERED'
  | 'REVIEWING'
  | 'PREPARING'
  | 'READY_FOR_REVIEW'
  | 'APPROVED'
  | 'SUBMITTED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'COMPLETED';

export type MatchConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';

export type MatchStatus = 
  | 'LIKELY_MATCH'
  | 'POTENTIAL_MATCH'
  | 'MAY_QUALIFY'
  | 'NEEDS_VERIFICATION'
  | 'DISQUALIFIED';

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  icon: string | null;
  sort_order: number;
  created_at: Date;
}

export interface Source {
  id: string;
  name: string;
  organization: string;
  type: SourceType;
  base_url: string;
  api_url: string | null;
  documentation_url: string | null;
  authentication_type: AuthType;
  trust_level: SourceTrustLevel;
  discovery_status: DiscoveryStatus;
  enabled: boolean;
  official: boolean;
  priority: number;
  last_sync_at: Date | null;
  last_success_at: Date | null;
  last_error_at: Date | null;
  last_error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Opportunity {
  id: string;
  title: string;
  description: string;
  provider_name: string;
  source_id: string;
  source_url: string;
  application_url: string | null;
  category: string;
  subcategories: string[];
  program_type: ProgramType;
  amount_min: number | null;
  amount_max: number | null;
  currency: string;
  deadline: Date | null;
  rolling_deadline: boolean;
  location_scope: LocationScope;
  country_code?: string | null;
  regions?: string[];
  states: string[];
  counties: string[];
  cities: string[];
  zip_codes: string[];
  eligibility_summary: string | null;
  eligibility_rules: Record<string, any> | null;
  required_documents: string[];
  contact_information: Record<string, any> | null;
  official_source: boolean;
  raw_source_identifier: string;
  source_opportunity_id: string;
  dedup_fingerprint: string;
  last_verified_at: Date;
  retrieved_at: Date;
  active: boolean;
  audiences?: OpportunityAudience[];
  funding_purposes?: FundingPurpose[];
  created_at: Date;
  updated_at: Date;
}

export interface UserProfile {
  id: string;
  user_id: string;
  zip_code?: string | null;
  state?: string | null;
  household_size?: number | null;
  income_range?: string | null;
  employment_status?: string | null;
  age_range?: string | null;
  is_veteran?: boolean | null;
  is_disabled?: boolean | null;
  is_student?: boolean | null;
  housing_status?: 'RENTER' | 'HOMEOWNER' | 'UNHOUSED' | 'OTHER' | null;
  is_business_owner?: boolean | null;
  dependents_count?: number | null;
  additional_attributes?: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

export interface GeographicLocation {
  country_code?: string | null;
  state?: string | null;
  county?: string | null;
  city?: string | null;
  postal_code?: string | null;
  region?: string | null;
  tribal_area?: string | null;
}

export interface BusinessProfile {
  id?: string;
  business_id?: string;
  user_id: string;
  business_name?: string | null;
  business_description?: string | null;
  industry?: string | null;
  business_stage?: BusinessStage | null;
  country?: string | null;
  state?: string | null;
  county?: string | null;
  city?: string | null;
  postal_code?: string | null;
  business_structure?: BusinessStructure | null;
  formation_status?: string | null;
  employee_count?: number | null;
  annual_revenue?: number | null;
  estimated_startup_cost?: number | null;
  funding_needed?: number | null;
  funding_purpose?: FundingPurpose | null;
  veteran_owned?: boolean | null;
  women_owned?: boolean | null;
  disability_owned?: boolean | null;
  minority_owned?: boolean | null;
  rural_business?: boolean | null;
  other_certifications?: string[];
  created_at?: Date;
  updated_at?: Date;
}

export interface ApplicationRecord {
  id: string;
  user_id: string;
  opportunity_id: string;
  business_id?: string | null;
  application_type?: ApplicationType;
  status: ApplicationStatus;
  notes?: string | null;
  checklist?: Array<{
    document_name: string;
    description?: string;
    required: boolean;
    collected: boolean;
  }>;
  submitted_at?: Date | null;
  user_approved_at?: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface SearchQuery {
  category?: string;
  categories?: string[];
  subcategories?: string[];
  keyword?: string;
  state?: string;
  county?: string;
  city?: string;
  zip?: string;
  location_scope?: LocationScope;
  program_type?: ProgramType;
  deadline_before?: Date;
  min_amount?: number;
  max_amount?: number;
  audience?: string[];
  audiences?: OpportunityAudience[];
  intent?: 'PERSONAL_ASSISTANCE' | 'BUSINESS_ASSISTANCE';
  funding_purposes?: FundingPurpose[];
  source_id?: string;
  official_only?: boolean;
  active_only?: boolean;
  user_profile?: Partial<UserProfile>;
  business_profile?: Partial<BusinessProfile>;
  limit?: number;
  offset?: number;
}

export interface SearchResultItem {
  opportunity: Opportunity;
  source: Partial<Source>;
  match_score: number | null;
  confidence: MatchConfidence;
  match_status: MatchStatus;
  why_you_may_qualify: string[];
  requirements: string[];
  documents: string[];
  missing_information: string[];
  potential_disqualifiers: string[];
  geographic_match?: {
    level: GeographicMatchLevel;
    matched: boolean;
    score: number | null;
    explanation: string;
  };
  source_provenance: {
    source_name: string;
    source_url: string;
    official_source: boolean;
    trust_level: SourceTrustLevel;
    last_verified: string;
    retrieved_at: string;
    source_opportunity_id: string;
  };
}
