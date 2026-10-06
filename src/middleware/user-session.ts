import { Request, Response, NextFunction } from 'express';
import { sessionService } from '../services/session-service.js';

declare global {
  namespace Express {
    interface Request {
      actor?: { userId: string; sessionType: string };
    }
  }
}

export async function requireUserSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const actor = await sessionService.resolve(token);
    if (!actor) {
      res.status(401).json({ error: 'A valid private guest or account session is required.' });
      return;
    }
    req.actor = actor;
    next();
  } catch (err: any) {
    res.status(500).json({ error: 'Session validation failed', details: err.message });
  }
}
