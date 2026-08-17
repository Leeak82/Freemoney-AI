import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';

export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  if (!config.ENABLE_ADMIN_API) {
    res.status(403).json({ error: 'Admin API is disabled in configuration' });
    return;
  }

  const authHeader = req.headers.authorization;
  const adminKeyHeader = req.headers['x-admin-key'];

  let providedKey = '';
  if (adminKeyHeader && typeof adminKeyHeader === 'string') {
    providedKey = adminKeyHeader;
  } else if (authHeader && authHeader.startsWith('Bearer ')) {
    providedKey = authHeader.substring(7);
  }

  if (!providedKey || providedKey !== config.ADMIN_API_KEY) {
    res.status(401).json({
      error: 'Unauthorized: Valid Admin API key required',
      hint: 'Provide X-Admin-Key header or Bearer token',
    });
    return;
  }

  next();
}
