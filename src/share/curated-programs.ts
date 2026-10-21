/**
 * Evergreen, nationally available programs run by official U.S. government agencies
 * (or their designated official portals). Every URL is checked live by the link checker
 * before it is shown; anything that stops resolving is hidden automatically.
 * Do not add ended, temporary, or pandemic-era programs here.
 */
export interface CuratedProgram {
  id: string;
  title: string;
  provider: string;
  url: string;
  description: string;
  categories: string[];
  audiences?: string[];
  stateLookupUrl?: string;
}

export const CURATED_PROGRAMS: CuratedProgram[] = [
  { id: 'hud-rental-assistance', title: 'HUD rental assistance (public housing & subsidized apartments)', provider: 'U.S. Department of Housing and Urban Development', url: 'https://www.hud.gov/topics/rental_assistance', description: 'Find help paying rent through public housing, Housing Choice Vouchers, and privately owned subsidized housing for low-income renters.', categories: ['rent-housing'] },
  { id: 'hud-public-housing', title: 'Public housing', provider: 'U.S. Department of Housing and Urban Development', url: 'https://www.hud.gov/helping-americans/public-housing', description: 'Affordable rental homes for eligible low-income families, older adults, and people with disabilities, applied for through your local public housing agency.', categories: ['rent-housing'] },
  { id: 'hud-housing-counseling', title: 'HUD-approved housing counseling (rent, eviction, foreclosure)', provider: 'U.S. Department of Housing and Urban Development', url: 'https://www.hud.gov/counseling', description: 'Free or low-cost counseling from HUD-approved agencies on rental problems, avoiding eviction or foreclosure, and finding housing assistance.', categories: ['rent-housing'] },
  { id: 'va-homeless', title: 'VA homeless programs and housing help for veterans', provider: 'U.S. Department of Veterans Affairs', url: 'https://www.va.gov/homeless/', description: 'Housing assistance, rent help, and services for veterans who are homeless or at risk of losing their housing.', categories: ['rent-housing', 'veterans'], audiences: ['VETERAN'] },
  { id: 'liheap', title: 'Low Income Home Energy Assistance Program (LIHEAP)', provider: 'U.S. Department of Health and Human Services', url: 'https://www.acf.hhs.gov/ocs/programs/liheap', description: 'Help paying utility bills for heating and cooling (electric, gas, oil) energy bills, energy crisis assistance, and weatherization, run through your state or tribal LIHEAP office.', categories: ['utilities'], stateLookupUrl: 'https://acf.gov/ocs/data/map/liheap-map-state-and-territory-contact-listing' },
  { id: 'weatherization', title: 'Weatherization Assistance Program', provider: 'U.S. Department of Energy', url: 'https://www.energy.gov/scep/wap/weatherization-assistance-program', description: 'Free home energy upgrades for low-income households to permanently lower utility and energy bills.', categories: ['utilities', 'rent-housing'] },
  { id: 'lifeline', title: 'Lifeline phone and internet discount', provider: 'Federal Communications Commission (Universal Service Administrative Co.)', url: 'https://www.lifelinesupport.org/', description: 'Monthly discount on phone or internet service bills for eligible low-income households.', categories: ['utilities'] },
  { id: 'usa-help-with-bills', title: 'USA.gov: help with bills (utilities, rent, phone)', provider: 'U.S. General Services Administration', url: 'https://www.usa.gov/help-with-bills', description: 'Official directory of government help paying utility, energy, phone, internet, and rent bills.', categories: ['utilities', 'rent-housing'] },
  { id: 'snap', title: 'Supplemental Nutrition Assistance Program (SNAP / food stamps)', provider: 'U.S. Department of Agriculture', url: 'https://www.fns.usda.gov/snap/recipient/eligibility', description: 'Monthly benefits on an EBT card to buy groceries and food for eligible low-income individuals and families.', categories: ['food'] },
  { id: 'wic', title: 'WIC (Women, Infants, and Children) nutrition program', provider: 'U.S. Department of Agriculture', url: 'https://www.fns.usda.gov/wic', description: 'Healthy food, nutrition education, and breastfeeding support for pregnant women, new mothers, infants, and children under 5.', categories: ['food'], audiences: ['FAMILY'] },
  { id: 'school-meals', title: 'Free and reduced-price school meals', provider: 'U.S. Department of Agriculture', url: 'https://www.fns.usda.gov/nslp', description: 'Free or low-cost breakfast and lunch for children at participating schools.', categories: ['food'], audiences: ['FAMILY', 'STUDENT'] },
  { id: 'tefap', title: 'The Emergency Food Assistance Program (TEFAP / food banks)', provider: 'U.S. Department of Agriculture', url: 'https://www.fns.usda.gov/tefap', description: 'Free emergency food distributed through local food banks and food pantries.', categories: ['food'] },
  { id: 'sun-bucks', title: 'SUN Bucks (Summer EBT) grocery benefits for kids', provider: 'U.S. Department of Agriculture', url: 'https://www.fns.usda.gov/summer/sunbucks', description: 'Summer grocery benefits for school-age children in participating states.', categories: ['food'], audiences: ['FAMILY'] },
  { id: 'usa-food-help', title: 'USA.gov: food assistance', provider: 'U.S. General Services Administration', url: 'https://www.usa.gov/food-help', description: 'Official directory of government food and nutrition assistance programs.', categories: ['food'] },
  { id: 'medicaid-chip', title: 'Medicaid and CHIP health coverage', provider: 'Centers for Medicare & Medicaid Services', url: 'https://www.healthcare.gov/medicaid-chip/', description: 'Free or low-cost health coverage for eligible low-income adults, children, pregnant women, older adults, and people with disabilities.', categories: ['medical-assistance'] },
  { id: 'health-centers', title: 'Find a low-cost community health center', provider: 'Health Resources and Services Administration', url: 'https://findahealthcenter.hrsa.gov/', description: 'Medical, dental, and mental health care on a sliding fee scale based on income.', categories: ['medical-assistance'] },
  { id: 'tanf', title: 'Temporary Assistance for Needy Families (TANF)', provider: 'U.S. Department of Health and Human Services', url: 'https://www.acf.hhs.gov/ofa/programs/tanf', description: 'Cash assistance and support services for low-income families with children, run by your state.', categories: ['cash-assistance', 'rent-housing', 'utilities'], audiences: ['FAMILY'] },
  { id: 'childcare', title: 'Child care financial assistance', provider: 'U.S. Department of Health and Human Services', url: 'https://www.childcare.gov/', description: 'Find help paying for child care and daycare through your state.', categories: ['childcare'], audiences: ['FAMILY'] },
  { id: 'pell', title: 'Federal Pell Grant', provider: 'U.S. Department of Education', url: 'https://studentaid.gov/understand-aid/types/grants/pell', description: 'Need-based grant for undergraduate college students that usually does not have to be repaid. Apply with the FAFSA.', categories: ['education-scholarships'], audiences: ['STUDENT'] },
  { id: 'sba-funding', title: 'SBA funding programs (loans, grants, investment)', provider: 'U.S. Small Business Administration', url: 'https://www.sba.gov/funding-programs', description: 'Official overview of SBA-backed small business loans, grants, and investment capital.', categories: ['business-grants', 'small-business', 'startup-funding'], audiences: ['SMALL_BUSINESS'] },
  { id: 'sba-microloans', title: 'SBA microloans', provider: 'U.S. Small Business Administration', url: 'https://www.sba.gov/funding-programs/loans/microloans', description: 'Small business loans up to $50,000 to start or expand a business, offered through nonprofit intermediaries.', categories: ['small-business', 'startup-funding', 'business-grants'], audiences: ['SMALL_BUSINESS'] },
  { id: 'sbir', title: 'SBIR/STTR small business research grants', provider: 'U.S. Small Business Administration', url: 'https://www.sbir.gov/', description: 'Competitive federal research and development grants for small businesses.', categories: ['business-grants', 'small-business'], audiences: ['SMALL_BUSINESS'] },
  { id: 'sba-local', title: 'Free small business counseling (SBDCs, SCORE, VBOCs)', provider: 'U.S. Small Business Administration', url: 'https://www.sba.gov/local-assistance', description: 'Free business advising and training, including help finding grants and loans, with Veterans Business Outreach Centers for veteran owners.', categories: ['small-business', 'business-grants', 'startup-funding'], audiences: ['SMALL_BUSINESS'] },
];

export const FALLBACK_RESOURCES = [
  { title: '211 (call or text 211)', url: 'https://www.211.org/', description: 'Free, confidential referrals to local help with rent, utilities, food, and more.' },
  { title: 'USA.gov Benefit Finder', url: 'https://www.usa.gov/benefit-finder', description: 'Official federal tool to find benefits you may be eligible for.' },
  { title: 'USA.gov: government benefits', url: 'https://www.usa.gov/benefits', description: 'Official directory of government benefit programs.' },
];
