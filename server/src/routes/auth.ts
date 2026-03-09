import type { FastifyPluginAsync } from 'fastify';
import {
  attachSessionCookie,
  clearLoginAttempts,
  clearSessionCookie,
  createSession,
  destroySession,
  getAuthenticatedSession,
  getAuthConfig,
  getLoginBlockState,
  registerFailedLoginAttempt,
  verifyAdminCredentials,
} from '../services/auth.js';

interface LoginBody {
  username?: string;
  password?: string;
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get('/session', async (request) => {
    const session = getAuthenticatedSession(request);
    if (!session) {
      return { authenticated: false, username: null };
    }

    return { authenticated: true, username: session.username };
  });

  app.post<{ Body: LoginBody }>('/login', async (request, reply) => {
    const blockState = getLoginBlockState(request);
    if (blockState.isBlocked) {
      reply.code(429);
      return {
        error: `Слишком много попыток входа. Повторите через ${blockState.retryAfterSeconds} сек.`,
        retryAfterSeconds: blockState.retryAfterSeconds,
      };
    }

    const username = request.body?.username?.trim() || '';
    const password = request.body?.password || '';

    if (!username || !password) {
      reply.code(400);
      return { error: 'Укажите логин и пароль' };
    }

    const config = getAuthConfig();
    const isValid = await verifyAdminCredentials(username, password);

    if (!isValid) {
      registerFailedLoginAttempt(request);

      const nextBlockState = getLoginBlockState(request);
      if (nextBlockState.isBlocked) {
        reply.code(429);
        return {
          error: `Слишком много попыток входа. Повторите через ${nextBlockState.retryAfterSeconds} сек.`,
          retryAfterSeconds: nextBlockState.retryAfterSeconds,
        };
      }

      reply.code(401);
      return { error: 'Неверный логин или пароль' };
    }

    clearLoginAttempts(request);
    const session = createSession(config.username);
    attachSessionCookie(reply, session);

    return { authenticated: true, username: config.username };
  });

  app.post('/logout', async (request, reply) => {
    destroySession(request);
    clearSessionCookie(reply);

    return { authenticated: false, username: null };
  });
};