import express from 'express';
import { criarRotas } from './rotas';
import { criarIntegracaoMobile, type MobileOptions } from './mobile';

/** Actual Express API, also mounted unchanged by HTTP integration tests. */
export function criarApi(options: MobileOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  const allowed = new Set(['https://localhost', 'http://localhost', 'capacitor://localhost', ...(process.env.ONCOFLOW_ALLOWED_ORIGINS ?? '').split(',').map(x => x.trim()).filter(Boolean)]);
  app.use((req, res, next) => {
    const origin = req.header('origin');
    if (origin && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,Idempotency-Key,x-demo-usuario');
    }
    if (req.method === 'OPTIONS') { res.sendStatus(origin && !allowed.has(origin) ? 403 : 204); return; }
    next();
  });
  const json = express.json({ limit: '256kb' });
  app.use((req, res, next) => req.path === '/api/transcrever-audio' ? next() : json(req, res, next));
  const mobile = criarIntegracaoMobile(options);
  app.use(mobile.router);
  app.use(criarRotas());
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // Never echo submitted text, tokens, codes or exception details.
    const status = error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : 500;
    res.status(status >= 400 && status < 600 ? status : 500).json({ erro: 'erro_api', mensagem: status === 500 ? 'Falha ao salvar ou processar a demonstração.' : 'Requisição inválida.' });
  });
  return { app, ...mobile };
}
