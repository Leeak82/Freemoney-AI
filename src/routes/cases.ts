import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { sessionService } from '../services/session-service.js';
import { caseService } from '../services/case-service.js';
import { requireUserSession } from '../middleware/user-session.js';

export const caseRouter = Router();

caseRouter.post('/session/guest', async (_req: Request, res: Response) => {
  try {
    const session = await sessionService.createGuest();
    res.status(201).json({
      session_type: 'GUEST',
      token: session.token,
      expires_at: session.expiresAt,
      notice: 'This private guest session can be used without providing a name, email, or password.',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to start guest session', details: err.message });
  }
});

caseRouter.get('/cases', requireUserSession, async (req: Request, res: Response) => {
  res.json({ cases: await caseService.listCases(req.actor!.userId) });
});

caseRouter.post('/cases', requireUserSession, async (req: Request, res: Response) => {
  try {
    const input = z.object({
      title: z.string().trim().max(255).optional(),
      intent: z.string().trim().max(50).optional(),
      user_facts: z.record(z.unknown()).optional(),
      system_interpretations: z.record(z.unknown()).optional(),
    }).parse(req.body || {});
    const item = await caseService.createCase(req.actor!.userId, {
      title: input.title,
      intent: input.intent,
      userFacts: input.user_facts,
      interpretations: input.system_interpretations,
    });
    res.status(201).json({ case: item });
  } catch (err: any) {
    const details = err instanceof z.ZodError ? err.flatten() : err.message;
    res.status(err instanceof z.ZodError ? 400 : 500).json({ error: 'Failed to create case', details });
  }
});

caseRouter.get('/cases/:id', requireUserSession, async (req: Request, res: Response) => {
  const item = await caseService.getOwnedCase(req.actor!.userId, req.params.id);
  if (!item) {
    res.status(404).json({ error: 'Case not found' });
    return;
  }
  res.json({ case: item });
});
