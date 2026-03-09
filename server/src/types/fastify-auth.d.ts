import 'fastify';
import type { AuthSession } from '../services/auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    authSession?: AuthSession | null;
  }
}