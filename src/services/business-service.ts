import { validate as validateUuid } from 'uuid';
import { getClient, query } from '../db/index.js';
import {
  BusinessProfile,
  BusinessStage,
  BusinessStructure,
  FundingPurpose,
} from '../types/index.js';

export interface BusinessChecklistItem {
  id: string;
  item_key: string;
  title: string;
  description: string | null;
  sort_order: number;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'NEEDS_VERIFICATION';
  completion_source: 'USER' | 'TRUSTED_INTEGRATION';
  completed_at: Date | null;
}

const STARTUP_ITEMS = [
  ['define-concept', 'Define business concept', 'Describe the customer, problem, and proposed product or service.'],
  ['select-structure', 'Select business structure', 'Compare structures using official resources and professional advice when needed.'],
  ['research-name', 'Research business name', 'Check applicable official registries and trademark resources.'],
  ['form-business', 'Form business', 'Use the verified filing agency for the selected jurisdiction.'],
  ['obtain-ein', 'Determine EIN needs', 'Use the official IRS service when an EIN is required.'],
  ['tax-registration', 'Research applicable tax registrations', 'Verify federal, state, and local tax obligations.'],
  ['licenses', 'Research business licenses', 'Verify requirements for the activity and location.'],
  ['permits', 'Research permits', 'Verify industry and location-specific permits.'],
  ['bank-account', 'Prepare for a business bank account', 'Review institution requirements before opening an account.'],
  ['insurance', 'Review insurance needs', 'Evaluate insurance appropriate to the activity and jurisdiction.'],
  ['funding', 'Find funding', 'Search verified programs using the business profile and funding purpose.'],
  ['government-contracting', 'Explore government contracting', 'Review official registration and certification resources.'],
] as const;

const LLC_ITEMS = [
  ['choose-structure', 'Confirm LLC is the selected structure', 'Compare structures; this is not legal or tax advice.'],
  ['research-name', 'Research business name', 'Use the official state registry when available.'],
  ['registered-agent', 'Verify registered-agent requirements', 'Requirements are state-specific and must be verified.'],
  ['articles', 'Prepare Articles of Organization', 'Use the official state filing source when verified.'],
  ['state-filing', 'Complete state filing', 'The user must review and submit directly through the official state process.'],
  ['operating-agreement', 'Review operating agreement needs', 'Requirements and recommendations vary by state and circumstances.'],
  ['ein', 'Determine EIN needs', 'Use IRS guidance and the official IRS application.'],
  ['licenses-permits', 'Research licenses and permits', 'Verify requirements based on industry and location.'],
  ['bank-account', 'Prepare for a business bank account', 'Gather documents requested by the selected financial institution.'],
  ['insurance', 'Review insurance considerations', 'Evaluate coverage appropriate to the business.'],
  ['annual-reports', 'Verify annual report and compliance duties', 'State requirements must be verified.'],
  ['funding', 'Search for business funding', 'Match verified opportunities to business facts and funding purpose.'],
] as const;

export class BusinessService {
  public async upsertBusiness(
    userId: string,
    data: Partial<BusinessProfile>
  ): Promise<{ business: BusinessProfile; startupChecklist: any; llcChecklist: any | null }> {
    if (!validateUuid(userId)) throw new Error('A valid user UUID is required');
    this.validateNumbers(data);

    const client = await getClient();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO users (id, email, full_name)
         VALUES ($1, $2, 'FreeMoney User')
         ON CONFLICT (id) DO NOTHING;`,
        [userId, `user-${userId}@freemoney.local`]
      );

      let businessId = data.business_id;
      if (businessId) {
        const owned = await client.query(
          `SELECT id FROM businesses WHERE id = $1 AND user_id = $2;`,
          [businessId, userId]
        );
        if (owned.rowCount === 0) throw new Error('Business not found for this user');
      } else {
        const created = await client.query<{ id: string }>(
          `INSERT INTO businesses (user_id) VALUES ($1) RETURNING id;`,
          [userId]
        );
        businessId = created.rows[0].id;
      }

      const profile = await client.query<BusinessProfile>(
        `INSERT INTO business_profiles (
           business_id, user_id, business_name, business_description, industry,
           business_stage, country, state, county, city, postal_code,
           business_structure, formation_status, employee_count, annual_revenue,
           estimated_startup_cost, funding_needed, funding_purpose, veteran_owned,
           women_owned, disability_owned, minority_owned, rural_business,
           other_certifications
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
           $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
         )
         ON CONFLICT (business_id) DO UPDATE SET
           business_name = COALESCE(EXCLUDED.business_name, business_profiles.business_name),
           business_description = COALESCE(EXCLUDED.business_description, business_profiles.business_description),
           industry = COALESCE(EXCLUDED.industry, business_profiles.industry),
           business_stage = COALESCE(EXCLUDED.business_stage, business_profiles.business_stage),
           country = COALESCE(EXCLUDED.country, business_profiles.country),
           state = COALESCE(EXCLUDED.state, business_profiles.state),
           county = COALESCE(EXCLUDED.county, business_profiles.county),
           city = COALESCE(EXCLUDED.city, business_profiles.city),
           postal_code = COALESCE(EXCLUDED.postal_code, business_profiles.postal_code),
           business_structure = COALESCE(EXCLUDED.business_structure, business_profiles.business_structure),
           formation_status = COALESCE(EXCLUDED.formation_status, business_profiles.formation_status),
           employee_count = COALESCE(EXCLUDED.employee_count, business_profiles.employee_count),
           annual_revenue = COALESCE(EXCLUDED.annual_revenue, business_profiles.annual_revenue),
           estimated_startup_cost = COALESCE(EXCLUDED.estimated_startup_cost, business_profiles.estimated_startup_cost),
           funding_needed = COALESCE(EXCLUDED.funding_needed, business_profiles.funding_needed),
           funding_purpose = COALESCE(EXCLUDED.funding_purpose, business_profiles.funding_purpose),
           veteran_owned = COALESCE(EXCLUDED.veteran_owned, business_profiles.veteran_owned),
           women_owned = COALESCE(EXCLUDED.women_owned, business_profiles.women_owned),
           disability_owned = COALESCE(EXCLUDED.disability_owned, business_profiles.disability_owned),
           minority_owned = COALESCE(EXCLUDED.minority_owned, business_profiles.minority_owned),
           rural_business = COALESCE(EXCLUDED.rural_business, business_profiles.rural_business),
           other_certifications = COALESCE(EXCLUDED.other_certifications, business_profiles.other_certifications),
           updated_at = CURRENT_TIMESTAMP
         RETURNING *;`,
        [
          businessId,
          userId,
          data.business_name || null,
          data.business_description || null,
          data.industry || null,
          data.business_stage || null,
          data.country || 'US',
          data.state?.toUpperCase() || null,
          data.county || null,
          data.city || null,
          data.postal_code || null,
          data.business_structure || 'UNKNOWN',
          data.formation_status || null,
          data.employee_count ?? null,
          data.annual_revenue ?? null,
          data.estimated_startup_cost ?? null,
          data.funding_needed ?? null,
          data.funding_purpose || null,
          data.veteran_owned ?? null,
          data.women_owned ?? null,
          data.disability_owned ?? null,
          data.minority_owned ?? null,
          data.rural_business ?? null,
          data.other_certifications || [],
        ]
      );

      await this.ensureChecklist(client, businessId!, 'STARTUP', 'Business Startup Checklist', STARTUP_ITEMS);
      if ((profile.rows[0].business_structure || data.business_structure) === 'LLC') {
        await this.ensureChecklist(client, businessId!, 'LLC_FORMATION', 'LLC Formation Checklist', LLC_ITEMS);
      }

      await client.query('COMMIT');
      return {
        business: profile.rows[0],
        startupChecklist: await this.getChecklist(businessId!, 'STARTUP'),
        llcChecklist:
          (profile.rows[0].business_structure || data.business_structure) === 'LLC'
            ? await this.getChecklist(businessId!, 'LLC_FORMATION')
            : null,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async getBusinesses(userId: string): Promise<BusinessProfile[]> {
    if (!validateUuid(userId)) throw new Error('A valid user UUID is required');
    const result = await query<BusinessProfile>(
      `SELECT bp.* FROM business_profiles bp
       JOIN businesses b ON b.id = bp.business_id
       WHERE b.user_id = $1
       ORDER BY bp.updated_at DESC;`,
      [userId]
    );
    return result.rows;
  }

  public async getBusiness(businessId: string, userId: string): Promise<BusinessProfile | null> {
    if (!validateUuid(userId)) throw new Error('A valid user UUID is required');
    const result = await query<BusinessProfile>(
      `SELECT bp.* FROM business_profiles bp
       JOIN businesses b ON b.id = bp.business_id
       WHERE bp.business_id = $1 AND b.user_id = $2;`,
      [businessId, userId]
    );
    return result.rows[0] || null;
  }

  public async getChecklist(businessId: string, type?: string): Promise<any | null> {
    const result = await query(
      `SELECT bc.*, COALESCE(
         json_agg(
           json_build_object(
             'id', bci.id,
             'item_key', bci.item_key,
             'title', bci.title,
             'description', bci.description,
             'sort_order', bci.sort_order,
             'status', bci.status,
             'completion_source', bci.completion_source,
             'completed_at', bci.completed_at
           ) ORDER BY bci.sort_order
         ) FILTER (WHERE bci.id IS NOT NULL), '[]'::json
       ) AS items
       FROM business_checklists bc
       LEFT JOIN business_checklist_items bci ON bci.checklist_id = bc.id
       WHERE bc.business_id = $1 AND ($2::text IS NULL OR bc.checklist_type = $2)
       GROUP BY bc.id
       ORDER BY bc.created_at ASC
       LIMIT 1;`,
      [businessId, type || null]
    );
    return result.rows[0] || null;
  }

  public async getChecklists(businessId: string, userId: string): Promise<any[]> {
    if (!validateUuid(userId)) throw new Error('A valid user UUID is required');
    const result = await query(
      `SELECT bc.*, COALESCE(
         json_agg(
           json_build_object(
             'id', bci.id, 'item_key', bci.item_key, 'title', bci.title,
             'description', bci.description, 'sort_order', bci.sort_order,
             'status', bci.status, 'completion_source', bci.completion_source,
             'completed_at', bci.completed_at
           ) ORDER BY bci.sort_order
         ) FILTER (WHERE bci.id IS NOT NULL), '[]'::json
       ) AS items
       FROM business_checklists bc
       LEFT JOIN business_checklist_items bci ON bci.checklist_id = bc.id
       JOIN businesses b ON b.id = bc.business_id
       WHERE bc.business_id = $1 AND b.user_id = $2
       GROUP BY bc.id ORDER BY bc.created_at ASC;`,
      [businessId, userId]
    );
    return result.rows;
  }

  public async updateChecklistItem(
    businessId: string,
    itemId: string,
    status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED',
    userId: string
  ): Promise<BusinessChecklistItem> {
    if (!validateUuid(userId)) throw new Error('A valid user UUID is required');
    const result = await query<BusinessChecklistItem>(
      `UPDATE business_checklist_items bci SET
         status = $3::text,
         completion_source = 'USER',
         completed_at = CASE WHEN $3::text = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE NULL END,
         updated_at = CURRENT_TIMESTAMP
       FROM business_checklists bc
       JOIN businesses b ON b.id = bc.business_id
       WHERE bci.id = $2 AND bci.checklist_id = bc.id AND bc.business_id = $1
         AND b.user_id = $4
       RETURNING bci.*;`,
      [businessId, itemId, status, userId]
    );
    if (result.rowCount === 0) throw new Error('Checklist item not found');
    return result.rows[0];
  }

  private async ensureChecklist(
    client: any,
    businessId: string,
    type: string,
    title: string,
    items: readonly (readonly [string, string, string])[]
  ): Promise<void> {
    const checklist = await client.query(
      `INSERT INTO business_checklists (business_id, checklist_type, title)
       VALUES ($1, $2, $3)
       ON CONFLICT (business_id, checklist_type) DO UPDATE SET
         title = EXCLUDED.title, updated_at = CURRENT_TIMESTAMP
       RETURNING id;`,
      [businessId, type, title]
    );
    for (let index = 0; index < items.length; index++) {
      const [key, itemTitle, description] = items[index];
      await client.query(
        `INSERT INTO business_checklist_items (
           checklist_id, item_key, title, description, sort_order
         ) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (checklist_id, item_key) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           sort_order = EXCLUDED.sort_order,
           updated_at = CURRENT_TIMESTAMP;`,
        [checklist.rows[0].id, key, itemTitle, description, index + 1]
      );
    }
  }

  private validateNumbers(data: Partial<BusinessProfile>): void {
    const fields: Array<keyof BusinessProfile> = [
      'employee_count',
      'annual_revenue',
      'estimated_startup_cost',
      'funding_needed',
    ];
    for (const field of fields) {
      const value = data[field];
      if (value != null && (typeof value !== 'number' || value < 0)) {
        throw new Error(`${field} must be a non-negative number`);
      }
    }
  }
}

export const businessService = new BusinessService();
