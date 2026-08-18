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
