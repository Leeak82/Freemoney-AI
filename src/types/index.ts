export type SourceType = 'API' | 'JSON' | 'CSV' | 'RSS' | 'WEB' | 'MANUAL';

export type AuthType = 'NONE' | 'API_KEY' | 'OAUTH' | 'OTHER';

export type SourceTrustLevel = 
  | 'OFFICIAL_GOVERNMENT'
  | 'OFFICIAL_ORGANIZATION'
  | 'VERIFIED_PARTNER'
  | 'COMMUNITY'
  | 'UNKNOWN';

export type DiscoveryStatus = 'DISCOVERED' | 'VERIFIED' | 'ACTIVE' | 'REJECTED' | 'DISABLED';

export type ProgramType = 'GRANT' | 'BENEFIT' | 'SCHOLARSHIP' | 'ASSISTANCE' | 'TAX_CREDIT' | 'LOAN' | 'EMERGENCY' | 'OTHER';

export type LocationScope = 'NATIONWIDE' | 'STATE' | 'COUNTY' | 'CITY' | 'ZIP';

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

export interface ApplicationRecord {
  id: string;
  user_id: string;
  opportunity_id: string;
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
  source_id?: string;
  official_only?: boolean;
  active_only?: boolean;
  user_profile?: Partial<UserProfile>;
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
