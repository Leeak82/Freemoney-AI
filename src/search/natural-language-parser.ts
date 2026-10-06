import {
  BusinessProfile,
  FundingPurpose,
  OpportunityAudience,
  SearchQuery,
  UserProfile,
} from '../types/index.js';

export interface NaturalLanguageInterpretation {
  original_text: string;
  search: SearchQuery;
  inferred_profile: Partial<UserProfile>;
  inferred_business_profile: Partial<BusinessProfile>;
  detected: {
    categories: string[];
    audiences: OpportunityAudience[];
    funding_purposes: FundingPurpose[];
    urgency: 'URGENT' | 'NORMAL';
    location: { state?: string; county?: string; city?: string; zip?: string };
    signals: string[];
  };
  warnings: string[];
}

const STATE_CODES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS',
  kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA',
  michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT',
  nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
  ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX',
  utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
};
const VALID_STATE_CODES = new Set(Object.values(STATE_CODES));

const CATEGORY_RULES: Array<[string, RegExp]> = [
  ['rent-housing', /\b(rent|rental|housing|evict(?:ion|ed)?|shelter|homeless|mortgage|landlord)\b/i],
  ['utilities', /\b(utilit(?:y|ies)|electric(?:ity)?|power bill|water bill|gas bill|heat(?:ing)?|liheap|internet|broadband)\b/i],
  ['food', /\b(food|grocer(?:y|ies)|snap|ebt|wic|meal|pantry)\b/i],
  ['transportation', /\b(transport(?:ation)?|bus (?:pass|fare)|fuel (?:voucher|card|assistance|help)|gas (?:voucher|card|money|assistance|help)|gasoline (?:voucher|card|assistance|help)|vehicle repair|car repair|transit|mileage (?:assistance|reimbursement)|ride (?:assistance|help))\b/i],
  ['veterans', /\b(veteran|military|service member|servicemember|dd-?214)\b/i],
  ['disability', /\b(disab(?:led|ility)|ssi|ssdi|accessib(?:le|ility)|assistive)\b/i],
  ['education-scholarships', /\b(scholarship|tuition|college|school|student|pell|training program)\b/i],
  ['medical-assistance', /\b(medical|health care|healthcare|medicaid|prescription|dental|vision|copay)\b/i],
  ['child-family', /\b(child ?care|daycare|single (?:mom|mother|dad|father|parent)|tanf|family assistance)\b/i],
  ['emergency-assistance', /\b(emergency|urgent|crisis|asap|today|now|past due|shut ?off|disconnect(?:ion)?|eviction)\b/i],
  ['debt-financial', /\b(debt|credit card|foreclosure|financial counseling|loan relief|behind on bills)\b/i],
  ['tax-credits', /\b(tax credit|tax refund|eitc|earned income|child tax credit|vita)\b/i],
  ['disaster-assistance', /\b(disaster|flood|wildfire|earthquake|hurricane|fema)\b/i],
  ['llc-formation', /\b(llc|limited liability company|form(?:ing)? (?:a )?company|business formation)\b/i],
  ['business-grants', /\b(business grant|grant for (?:my )?business|small business grant)\b/i],
  ['startup-funding', /\b(?:startup|pre-?revenue|seed funding)\b|\b(?:start(?:ing)?|launch(?:ing)?|form(?:ing)?)\b[^.!?]{0,30}\b(?:a|an)?\s*(?:business|company|llc)\b/i],
  ['small-business-loans', /\b(business loan|sba loan|working capital loan)\b/i],
  ['microloans', /\b(microloan|micro loan)\b/i],
  ['business-assistance', /\b(business help|business assistance|entrepreneur(?:ship)?|small business)\b/i],
  ['business-licenses', /\b(business license|occupational license)\b/i],
  ['permits', /\bpermit(?:s)?\b/i],
  ['government-contracts', /\b(government contract|federal contract|procurement)\b/i],
  ['veteran-owned-business', /\b(veteran[- ]owned|veteran owned business|vob)\b/i],
  ['disability-owned-business', /\b(disability[- ]owned|disabled[- ]owned business)\b/i],
  ['equipment-assistance', /\b(equipment|machinery|tools? funding)\b/i],
  ['technology-assistance', /\b(technology|software|computer|digital adoption|tech funding)\b/i],
  ['employee-training', /\b(employee training|workforce training|training reimbursement)\b/i],
  ['existing-business-assistance', /\b(expand(?:ing)? (?:my )?business|business expansion|existing business)\b/i],
];

const BUSINESS_CUES = /\b(business|company|llc|startup|entrepreneur|self-employed|sole proprietor|employees?|inventory|payroll|commercial)\b/i;
const URGENT_CUES = /\b(asap|today|right now|urgent|emergency|crisis|eviction|evicted|past due|shut ?off|disconnect(?:ed|ion)?|homeless|no food|behind on rent)\b/i;

function titleCase(value: string): string {
  return value.trim().replace(/\s+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function addUnique<T>(items: T[], item: T): void {
  if (!items.includes(item)) items.push(item);
}

function detectState(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const [name, code] of Object.entries(STATE_CODES)) {
    if (new RegExp(`\\b${name.replace(/ /g, '\\s+')}\\b`, 'i').test(lower)) return code;
  }
  const commaCode = text.match(/,\s*([A-Za-z]{2})\b/);
  if (commaCode && VALID_STATE_CODES.has(commaCode[1].toUpperCase())) return commaCode[1].toUpperCase();
  const explicitCode = text.match(/\b(?:state of|in)\s+([A-Za-z]{2})\b/i);
  if (explicitCode && VALID_STATE_CODES.has(explicitCode[1].toUpperCase())) return explicitCode[1].toUpperCase();
  return undefined;
}

function detectCounty(text: string): string | undefined {
  const located = [...text.matchAll(/\b(?:in|near|around|within)\s+([^,.!?]{1,60}?)\s+County\b/gi)];
  if (located.length) {
    const candidate = located[located.length - 1][1].trim();
    const words = candidate.split(/\s+/).slice(-3);
    return titleCase(words.join(' '));
  }
  const named = text.match(/\b([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,2})\s+County\b/);
  return named ? titleCase(named[1]) : undefined;
}

function detectCity(text: string): string | undefined {
  const match = text.match(/\b(?:in|near|around)\s+([A-Za-z][A-Za-z .'-]{1,35}?)(?:,\s*[A-Za-z]{2}|\s+[A-Z]{2}\b)/);
  if (!match) return undefined;
  const candidate = titleCase(match[1]);
  return /county$/i.test(candidate) ? undefined : candidate;
}

function detectZip(text: string): string | undefined {
  return text.match(/\b\d{5}(?:-\d{4})?\b/)?.[0];
}

function detectFundingPurposes(text: string): FundingPurpose[] {
  const purposes: FundingPurpose[] = [];
  const rules: Array<[FundingPurpose, RegExp]> = [
    ['STARTUP_COSTS', /\b(startup costs?|start(?:ing)? (?:a )?business|launch costs?)\b/i],
    ['EQUIPMENT', /\b(equipment|machinery|tools?)\b/i],
    ['INVENTORY', /\binventory\b/i],
    ['WORKING_CAPITAL', /\bworking capital|cash flow\b/i],
    ['RENT', /\bcommercial rent|business rent|lease payment\b/i],
    ['UTILITIES', /\bbusiness utilit(?:y|ies)\b/i],
    ['PAYROLL', /\bpayroll|wages|employee pay\b/i],
    ['MARKETING', /\bmarketing|advertising|promotion\b/i],
    ['TECHNOLOGY', /\btechnology|software|computer|website|digital\b/i],
    ['TRAINING', /\btraining|certification|upskill\b/i],
    ['REAL_ESTATE', /\bcommercial real estate|business property\b/i],
    ['VEHICLE', /\bwork vehicle|business vehicle|commercial vehicle\b/i],
    ['EXPANSION', /\bexpansion|expand(?:ing)?\b/i],
    ['DISASTER_RECOVERY', /\bdisaster recovery|rebuild after\b/i],
    ['EXPORT', /\bexport|international market\b/i],
  ];
  for (const [purpose, regex] of rules) if (regex.test(text)) addUnique(purposes, purpose);
  return purposes;
}

export class NaturalLanguageSearchParser {
  public parse(text: string, requestedIntent?: SearchQuery['intent']): NaturalLanguageInterpretation {
    const clean = text.trim();
    if (!clean) throw new Error('Natural-language search text is required.');

    const categories: string[] = [];
    for (const [category, regex] of CATEGORY_RULES) if (regex.test(clean)) addUnique(categories, category);
    const audiences: OpportunityAudience[] = [];
    const inferredProfile: Partial<UserProfile> = {};
    const inferredBusinessProfile: Partial<BusinessProfile> = { user_id: '' };
    const signals: string[] = [];

    const firstPersonVeteran = /\b(?:i(?:'m| am)|im)\b[^.!?]{0,30}\b(veteran|service member|military)\b/i.test(clean);
    const firstPersonDisabled = /\b(?:i(?:'m| am)|im)\b[^.!?]{0,30}\b(disabled|disability)\b/i.test(clean);
    const firstPersonStudent = /\b(?:i(?:'m| am)|im)\b[^.!?]{0,30}\b(student|in college|in school)\b/i.test(clean);
    if (/\b(veteran|military|service member|servicemember)\b/i.test(clean)) addUnique(audiences, 'VETERAN');
    if (/\b(disabled|disability|ssdi|ssi)\b/i.test(clean)) addUnique(audiences, 'DISABLED');
    if (/\b(student|college|school|scholarship)\b/i.test(clean)) addUnique(audiences, 'STUDENT');
    if (/\b(single (?:mom|mother|dad|father|parent)|family|children|childcare|daycare)\b/i.test(clean)) addUnique(audiences, 'FAMILY');
    if (firstPersonVeteran) inferredProfile.is_veteran = true;
    if (firstPersonDisabled) inferredProfile.is_disabled = true;
    if (firstPersonStudent) inferredProfile.is_student = true;
    if (/\b(behind on rent|my rent|renter|rental)\b/i.test(clean)) inferredProfile.housing_status = 'RENTER';

    const intent = requestedIntent || (BUSINESS_CUES.test(clean) ? 'BUSINESS_ASSISTANCE' : 'PERSONAL_ASSISTANCE');
    if (intent === 'BUSINESS_ASSISTANCE') {
      addUnique(audiences, 'SMALL_BUSINESS');
      if (/\b(start|starting|startup|idea|planning|form(?:ing)?|llc)\b/i.test(clean)) inferredBusinessProfile.business_stage = 'PLANNING';
      if (/\bllc\b/i.test(clean)) inferredBusinessProfile.business_structure = 'LLC';
      if (/\b(veteran[- ]owned|my business[^.!?]{0,20}veteran|i(?:'m| am) a veteran[^.!?]{0,40}business)\b/i.test(clean)) inferredBusinessProfile.veteran_owned = true;
      if (/\b(disability[- ]owned|disabled[- ]owned)\b/i.test(clean)) inferredBusinessProfile.disability_owned = true;
    }

    const state = detectState(clean);
    const county = detectCounty(clean);
    const city = detectCity(clean);
    const zip = detectZip(clean);
    if (state) signals.push(`State: ${state}`);
    if (county) signals.push(`County: ${county}`);
    if (city) signals.push(`City: ${city}`);
    if (zip) signals.push(`ZIP: ${zip}`);

    const fundingPurposes = detectFundingPurposes(clean);
    const urgency = URGENT_CUES.test(clean) ? 'URGENT' : 'NORMAL';
    if (urgency === 'URGENT') signals.push('Urgent need language detected');

    const warnings: string[] = [
      'This interpretation is based only on the words you entered; it does not prove eligibility.',
    ];
    if (!state && !zip && !county && !city) warnings.push('No location was confidently detected.');
    if (categories.length === 0) warnings.push('No specific assistance category was confidently detected, so search remains broad.');

    const search: SearchQuery = {
      categories: categories.length ? categories : undefined,
      state,
      county,
      city,
      zip,
      audiences: audiences.length ? audiences : undefined,
      intent,
      funding_purposes: fundingPurposes.length ? fundingPurposes : undefined,
      user_profile: intent === 'PERSONAL_ASSISTANCE' ? inferredProfile : undefined,
      business_profile: intent === 'BUSINESS_ASSISTANCE' ? inferredBusinessProfile : undefined,
      active_only: true,
      include_unknown_status: true,
    };

    return {
      original_text: clean,
      search,
      inferred_profile: inferredProfile,
      inferred_business_profile: inferredBusinessProfile,
      detected: { categories, audiences, funding_purposes: fundingPurposes, urgency, location: { state, county, city, zip }, signals },
      warnings,
    };
  }
}

export const naturalLanguageSearchParser = new NaturalLanguageSearchParser();
