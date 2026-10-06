import crypto from 'node:crypto';
import { query } from '../db/index.js';

const GUEST_DAYS = 30;

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export class SessionService {
  async createGuest(): Promise<{ token: string; userId: string; expiresAt: string }> {
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashSessionToken(token);
    const expiresAt = new Date(Date.now() + GUEST_DAYS * 86400000);
    const user = await query<{ id: string }>(
      `INSERT INTO users (account_type, guest_expires_at, last_seen_at)
       VALUES ('GUEST',$1,CURRENT_TIMESTAMP) RETURNING id`,
      [expiresAt]
    );
    await query(
      `INSERT INTO user_sessions (user_id, token_hash, session_type, expires_at)
       VALUES ($1,$2,'GUEST',$3)`,
      [user.rows[0].id, tokenHash, expiresAt]
    );
    return { token, userId: user.rows[0].id, expiresAt: expiresAt.toISOString() };
  }

  async resolve(token: string): Promise<{ userId: string; sessionType: string } | null> {
    if (!token) return null;
    const result = await query<{ user_id: string; session_type: string }>(
      `UPDATE user_sessions
       SET last_seen_at=CURRENT_TIMESTAMP
       WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
       RETURNING user_id, session_type`,
      [hashSessionToken(token)]
    );
    if (!result.rows[0]) return null;
    await query(`UPDATE users SET last_seen_at=CURRENT_TIMESTAMP WHERE id=$1`, [result.rows[0].user_id]);
    return { userId: result.rows[0].user_id, sessionType: result.rows[0].session_type };
  }
}

export const sessionService = new SessionService();
