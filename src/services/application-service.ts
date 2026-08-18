import { query } from '../db/index.js';
import {
  ApplicationRecord,
  ApplicationStatus,
  ApplicationType,
} from '../types/index.js';
import { searchEngine } from '../search/search-engine.js';

import { validate as validateUuid } from 'uuid';

export interface CreateApplicationDTO {
  userId: string;
  opportunityId: string;
  businessId?: string | null;
  applicationType?: ApplicationType;
  notes?: string;
}

export interface UpdateApplicationDTO {
  status?: ApplicationStatus;
  notes?: string;
  checklist?: Array<{
    document_name: string;
    description?: string;
    required: boolean;
    collected: boolean;
  }>;
  userApproved?: boolean;
  confirmationNumber?: string;
}

export class ApplicationService {
  /**
   * Create or track a new application for a user
   */
  public async createApplication(dto: CreateApplicationDTO): Promise<ApplicationRecord> {
    if (!validateUuid(dto.userId)) throw new Error('A valid user UUID is required');
    const validUserId = dto.userId;
    // 1. Fetch opportunity to generate dynamic document checklist
    const oppResult = await searchEngine.getOpportunityById(dto.opportunityId);
    if (!oppResult) {
      throw new Error(`Opportunity with ID ${dto.opportunityId} not found`);
    }

    const opp = oppResult.opportunity;

    // Ensure user exists
    await query(
      `INSERT INTO users (id, email, full_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING;`,
      [validUserId, `user-${validUserId}@freemoney.local`, 'FreeMoney User']
    );

    // Initial Checklist derived strictly from opportunity requirements
    const checklist = (
      opp.required_documents.length > 0
        ? opp.required_documents
        : ['Standard Application Form']
    ).map((doc) => ({
      document_name: doc,
      required: true,
      collected: false,
    }));

    const applicationType =
      dto.applicationType || (dto.businessId ? 'BUSINESS_ASSISTANCE' : 'PERSONAL_ASSISTANCE');
    let res = await query<ApplicationRecord>(
      `INSERT INTO applications (
         user_id, opportunity_id, business_id, application_type, status, notes,
         checklist, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, 'DISCOVERED', $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT DO NOTHING
       RETURNING *;`,
      [
        validUserId,
        dto.opportunityId,
        dto.businessId || null,
        applicationType,
        dto.notes || null,
        JSON.stringify(checklist),
      ]
    );

    if (res.rows.length === 0) {
      res = await query<ApplicationRecord>(
        `UPDATE applications SET
           notes = COALESCE($5, notes),
           updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND opportunity_id = $2
           AND COALESCE(business_id, '00000000-0000-0000-0000-000000000000'::uuid)
             = COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND application_type = $4
         RETURNING *;`,
        [
          validUserId,
          dto.opportunityId,
          dto.businessId || null,
          applicationType,
          dto.notes || null,
        ]
      );
    }

    const app = res.rows[0];

    // Record initial event
    if (app.status === 'DISCOVERED') {
      await query(
        `INSERT INTO application_events (application_id, previous_status, new_status, actor_id, note)
         SELECT $1, NULL, 'DISCOVERED', $2, 'Application discovered and initialized in tracker'
         WHERE NOT EXISTS (
           SELECT 1 FROM application_events
           WHERE application_id = $1 AND new_status = 'DISCOVERED'
         );`,
        [app.id, validUserId]
      );
    }
    if (dto.businessId) {
      await query(
        `INSERT INTO business_applications (application_id, business_id)
         VALUES ($1, $2)
         ON CONFLICT (application_id) DO NOTHING;`,
        [app.id, dto.businessId]
      );
    }

    return app;
  }

  /**
   * Get user's application list with joined opportunity details
   */
  public async getUserApplications(userId: string): Promise<any[]> {
    if (!validateUuid(userId)) throw new Error('A valid user UUID is required');
    const validUserId = userId;
    const res = await query(
      `SELECT 
         a.*,
         o.title AS opportunity_title,
         o.provider_name,
         o.category,
         o.deadline,
         o.source_url,
         o.application_url,
         o.official_source,
         s.name AS source_name
       FROM applications a
       JOIN opportunities o ON a.opportunity_id = o.id
       JOIN sources s ON o.source_id = s.id
       WHERE a.user_id = $1
       ORDER BY a.updated_at DESC;`,
      [validUserId]
    );

    return res.rows;
  }

  /**
   * Get single application by ID
   */
  public async getApplicationById(id: string): Promise<any | null> {
    const res = await query(
      `SELECT 
         a.*,
         o.title AS opportunity_title,
         o.provider_name,
         o.category,
         o.deadline,
         o.source_url,
         o.application_url,
         o.official_source,
         s.name AS source_name
       FROM applications a
       JOIN opportunities o ON a.opportunity_id = o.id
       JOIN sources s ON o.source_id = s.id
       WHERE a.id = $1;`,
      [id]
    );

    return res.rows[0] || null;
  }

  /**
   * Update application status, notes, checklist, or explicit user approval
   */
  public async updateApplication(
    id: string,
    dto: UpdateApplicationDTO
  ): Promise<ApplicationRecord> {
    const existingRes = await query<ApplicationRecord>(
      `SELECT * FROM applications WHERE id = $1;`,
      [id]
    );
    if (existingRes.rows.length === 0) {
      throw new Error(`Application ${id} not found`);
    }
    const current = existingRes.rows[0];
    if (dto.status === 'SUBMITTED') {
      throw new Error(
        'Automatic submission is disabled in Phase 1. Record submission only after a user completes it through the official portal.'
      );
    }
    if (dto.status === 'APPROVED' && !dto.userApproved && !current.user_approved_at) {
      throw new Error('Explicit user approval is required before APPROVED status');
    }

    const sets: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const params: any[] = [id];
    let idx = 2;

    if (dto.status !== undefined) {
      sets.push(`status = $${idx++}`);
      params.push(dto.status);
    }
    if (dto.notes !== undefined) {
      sets.push(`notes = $${idx++}`);
      params.push(dto.notes);
    }
    if (dto.checklist !== undefined) {
      sets.push(`checklist = $${idx++}`);
      params.push(JSON.stringify(dto.checklist));
    }
    if (dto.userApproved) {
      sets.push(`user_approved_at = CURRENT_TIMESTAMP`);
    }
    if (dto.confirmationNumber !== undefined) {
      sets.push(`confirmation_number = $${idx++}`);
      params.push(dto.confirmationNumber);
      sets.push(`submitted_at = CURRENT_TIMESTAMP`);
    }

    const updateRes = await query<ApplicationRecord>(
      `UPDATE applications SET ${sets.join(', ')} WHERE id = $1 RETURNING *;`,
      params
    );

    const updated = updateRes.rows[0];

    // Audit state transition event
    if (dto.status && dto.status !== current.status) {
      await query(
        `INSERT INTO application_events (application_id, previous_status, new_status, note)
         VALUES ($1, $2, $3, $4);`,
        [id, current.status, dto.status, dto.notes || 'Status updated by user']
      );
    }

    return updated;
  }
}

export const applicationService = new ApplicationService();
