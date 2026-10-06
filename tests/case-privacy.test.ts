import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../src/db/index.js', () => ({ query: db.query }));

import { CaseService } from '../src/services/case-service.js';

const USER_A = '00000000-0000-4000-8000-0000000000a1';
const USER_B = '00000000-0000-4000-8000-0000000000b2';
const CASE_ID = '00000000-0000-4000-8000-0000000000c3';

describe('private assistance case ownership', () => {
  beforeEach(() => db.query.mockReset());

  it('scopes direct case reads to both case id and current user', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const service = new CaseService();
    expect(await service.getOwnedCase(USER_B, CASE_ID)).toBeNull();
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('id=$1 AND user_id=$2'),
      [CASE_ID, USER_B]
    );
  });

  it('refuses to record a search when the case is not owned by the current user', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const service = new CaseService();
    await expect(service.recordSearch(USER_B, CASE_ID, 'help with rent', {}, [])).rejects.toThrow('Case not found');
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('does not expose another user case history', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const service = new CaseService();
    expect(await service.getCaseHistory(USER_B, CASE_ID)).toBeNull();
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('stores the actual opportunity id and evidence-bearing result snapshot', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: CASE_ID, user_id: USER_A }] })
      .mockResolvedValueOnce({ rows: [{ id: '00000000-0000-4000-8000-0000000000d4' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const service = new CaseService();
    await service.recordSearch(USER_A, CASE_ID, 'help with rent', { category: 'housing' }, [{
      opportunity: { id: '00000000-0000-4000-8000-0000000000e5', title: 'Verified Program' },
      match_status: 'POSSIBLE_MATCH',
      why_you_may_qualify: ['Housing need matches published purpose'],
      missing_information: ['Income not provided'],
      requirements: ['Requirement from source'],
      documents: [],
      source_provenance: { source_url: 'https://example.gov/program', official_source: true },
      application_links: [],
      confidence: 'MEDIUM',
      match_score: 0.7,
    }]);
    const insert = db.query.mock.calls[2];
    expect(insert[1][2]).toBe('00000000-0000-4000-8000-0000000000e5');
    expect(insert[1][4]).toBe('POSSIBLE_MATCH');
    expect(insert[1][7]).toContain('source_provenance');
  });
});
