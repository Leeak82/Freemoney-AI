import { query } from '../db/index.js';
import { UserProfile } from '../types/index.js';

import { v4 as uuidv4, validate as validateUuid } from 'uuid';

export class ProfileService {
  /**
   * Get user profile by user_id
   */
  public async getProfile(userId: string): Promise<UserProfile | null> {
    const validUserId = validateUuid(userId) ? userId : '00000000-0000-0000-0000-000000000000';
    const res = await query<UserProfile>(
      `SELECT * FROM profiles WHERE user_id = $1;`,
      [validUserId]
    );
    return res.rows[0] || null;
  }

  /**
   * Upsert optional profile information
   */
  public async upsertProfile(
    userId: string,
    data: Partial<UserProfile>
  ): Promise<UserProfile> {
    const validUserId = validateUuid(userId) ? userId : uuidv4();
    // Ensure user row exists
    await query(
      `INSERT INTO users (id, email, full_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING;`,
      [validUserId, `user-${validUserId.substring(0, 8)}@freemoney.local`, 'FreeMoney User']
    );

    const res = await query<UserProfile>(
      `INSERT INTO profiles (
         user_id, zip_code, state, household_size, income_range,
         employment_status, age_range, is_veteran, is_disabled, is_student,
         housing_status, is_business_owner, dependents_count, additional_attributes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (user_id) DO UPDATE
       SET zip_code = COALESCE(EXCLUDED.zip_code, profiles.zip_code),
           state = COALESCE(EXCLUDED.state, profiles.state),
           household_size = COALESCE(EXCLUDED.household_size, profiles.household_size),
           income_range = COALESCE(EXCLUDED.income_range, profiles.income_range),
           employment_status = COALESCE(EXCLUDED.employment_status, profiles.employment_status),
           age_range = COALESCE(EXCLUDED.age_range, profiles.age_range),
           is_veteran = COALESCE(EXCLUDED.is_veteran, profiles.is_veteran),
           is_disabled = COALESCE(EXCLUDED.is_disabled, profiles.is_disabled),
           is_student = COALESCE(EXCLUDED.is_student, profiles.is_student),
           housing_status = COALESCE(EXCLUDED.housing_status, profiles.housing_status),
           is_business_owner = COALESCE(EXCLUDED.is_business_owner, profiles.is_business_owner),
           dependents_count = COALESCE(EXCLUDED.dependents_count, profiles.dependents_count),
           additional_attributes = COALESCE(EXCLUDED.additional_attributes, profiles.additional_attributes),
           updated_at = CURRENT_TIMESTAMP
       RETURNING *;`,
      [
        validUserId,
        data.zip_code || null,
        data.state || null,
        data.household_size || null,
        data.income_range || null,
        data.employment_status || null,
        data.age_range || null,
        data.is_veteran ?? null,
        data.is_disabled ?? null,
        data.is_student ?? null,
        data.housing_status || null,
        data.is_business_owner ?? null,
        data.dependents_count ?? null,
        JSON.stringify(data.additional_attributes || {}),
      ]
    );

    return res.rows[0];
  }
}

export const profileService = new ProfileService();
