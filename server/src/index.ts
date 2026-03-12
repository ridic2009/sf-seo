import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { initializeDatabase } from './db/index.js';
import { authRoutes } from './routes/auth.js';
import { templateRoutes } from './routes/templates.js';
import { serverRoutes } from './routes/servers.js';
import { siteRoutes } from './routes/sites.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getAuthenticatedSession, getAuthConfig, isPublicApiPath } from './services/auth.js';
import { startBackupScheduler } from './services/backupScheduler.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');
const authConfig = getAuthConfig();

const app = Fastify({ logger: true, trustProxy: true });

function parseCorsOrigins(rawValue: string | undefined) {
  if (!rawValue) {
    return true;
  }

  const allowedOrigins = rawValue
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (allowedOrigins.length === 0) {
    return true;
  }

  return (origin: string | undefined, callback: (error: Error | null, allow: boolean) => void) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    callback(null, allowedOrigins.includes(origin));
  };
}

async function start() {
  initializeDatabase();

  await app.register(cookie, {
    secret: authConfig.sessionSecret,
    hook: 'onRequest',
  });
  await app.register(cors, { origin: parseCorsOrigins(process.env.CORS_ORIGIN) });
  await app.register(multipart, { limits: { fileSize: 500 * 1024 * 1024 } });

  app.addHook('onRequest', async (request, reply) => {
    const requestPath = request.url.split('?')[0];

    if (!requestPath.startsWith('/api') || isPublicApiPath(requestPath)) {
      return;
    }

    const session = getAuthenticatedSession(request);
    if (!session) {
      reply.code(401).send({ error: 'Требуется авторизация' });
      return reply;
    }

    request.authSession = session;
  });

  // API routes
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(templateRoutes, { prefix: '/api/templates' });
  await app.register(serverRoutes, { prefix: '/api/servers' });
  await app.register(siteRoutes, { prefix: '/api/sites' });

  app.get('/api/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  // Serve built client in production
  if (fs.existsSync(CLIENT_DIST)) {
    await app.register(fastifyStatic, {
      root: CLIENT_DIST,
      prefix: '/',
      wildcard: false,
    });
    app.setNotFoundHandler((_req, reply) => {
      reply.sendFile('index.html', CLIENT_DIST);
    });
  }

  const port = parseInt(process.env.PORT || '3001');
  const host = process.env.HOST || '0.0.0.0';
  await app.listen({ port, host });
  startBackupScheduler(app.log);
  app.log.info(`Auth enabled for admin user ${authConfig.username}`);
  console.log(`Site Factory server running at http://localhost:${port}`);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
