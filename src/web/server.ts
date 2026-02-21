import express from 'express';
import cors from 'cors';
import path from 'path';
import slotsRouter from './routes/slots';
import adminRouter from './routes/admin';
import { config } from '../config';

export function createServer() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.resolve(__dirname, '..', '..', 'src', 'web', 'public')));

  app.use('/api/partidos', slotsRouter);
  app.use('/api/admin', adminRouter);

  // SPA fallback
  app.get('*', (_req, res) => {
    res.sendFile(path.resolve(__dirname, '..', '..', 'src', 'web', 'public', 'index.html'));
  });

  return app;
}

export function startServer() {
  const app = createServer();
  app.listen(config.port, () => {
    console.log(`🌐 Web server running on ${config.baseUrl}`);
  });
  return app;
}
