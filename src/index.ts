import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiRouter } from './routes/api.js';
import { config } from './config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(): express.Application {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Static Assets
  const publicDir = path.join(__dirname, '../public');
  app.use(express.static(publicDir));

  // Lightweight health endpoint must not touch the database.
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'freemoney-ai' });
  });


  const shareMode = process.env.SHARE_MODE === 'true';
  if (shareMode) {
    const categories = [
      { slug: 'rent-housing', name: 'Housing & Rent', audience_type: 'PERSONAL', sort_order: 10 },
      { slug: 'utilities', name: 'Utilities', audience_type: 'PERSONAL', sort_order: 20 },
      { slug: 'food', name: 'Food Assistance', audience_type: 'PERSONAL', sort_order: 30 },
      { slug: 'veterans', name: 'Veteran Assistance', audience_type: 'PERSONAL', sort_order: 40 },
      { slug: 'disability', name: 'Disability Assistance', audience_type: 'PERSONAL', sort_order: 50 },
      { slug: 'education-scholarships', name: 'Education & Scholarships', audience_type: 'BOTH', sort_order: 60 },
      { slug: 'llc-formation', name: 'LLC Formation', audience_type: 'BUSINESS', sort_order: 70 },
      { slug: 'business-grants', name: 'Business Grants', audience_type: 'BUSINESS', sort_order: 80 },
      { slug: 'startup-funding', name: 'Startup Funding', audience_type: 'BUSINESS', sort_order: 90 },
      { slug: 'business-licenses', name: 'Licenses & Permits', audience_type: 'BUSINESS', sort_order: 100 }
    ];

    app.get('/api/categories', (req, res) => {
      const path = String(req.query.path || '').toUpperCase();
      const filtered = path === 'PERSONAL' || path === 'BUSINESS'
        ? categories.filter((item) => item.audience_type === path || item.audience_type === 'BOTH')
        : categories;
      res.json({ categories: filtered });
    });
    app.get('/api/profile', (_req, res) => res.json({ profile: null }));
    app.get('/api/businesses', (_req, res) => res.json({ businesses: [] }));
    app.get('/api/applications', (_req, res) => res.json({ applications: [] }));

    const unavailable = (_req: express.Request, res: express.Response) => {
      res.status(503).json({
        error: 'Search upgrade in progress',
        details: 'The public app is online while live official-source search is being upgraded.'
      });
    };

    app.post('/api/search', unavailable);
    app.post('/api/search/natural-language', unavailable);
    app.get('/api/opportunities', unavailable);
    app.get('/api/opportunities/:id', unavailable);
    app.post('/api/profile', unavailable);
    app.post('/api/businesses', unavailable);
    app.post('/api/applications', unavailable);
  }

  // REST API Routes
  app.use('/api', apiRouter);

  // SPA Fallback for client-side routing
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}

// Start server if run directly
if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  const app = createApp();
  app.listen(config.PORT, () => {
    console.log(`FreeMoney-AI server running on port ${config.PORT} (${config.NODE_ENV})`);
    console.log(`Web App: ${config.API_BASE_URL}`);
  });
}
