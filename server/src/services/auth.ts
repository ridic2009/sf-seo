import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback);

export interface AuthSession {
  sessionId: string;
  username: string;
  createdAt: number;
  expiresAt: number;
}

interface AuthConfig {
  username: string;
  passwordHash: string | null;
  fallbackPassword: string | null;
  sessionSecret: string;
  cookieName: string;
  sessionTtlMs: number;
  maxLoginAttempts: number;
  loginBlockMs: number;
  loginWindowMs: number;
  secureCookies: boolean;
}

interface LoginAttemptState {
  attempts: number;
  firstAttemptAt: number;
  blockedUntil: number | null;
}

const sessions = new Map<string, AuthSession>();
const loginAttempts = new Map<string, LoginAttemptState>();

let cachedConfig: AuthConfig | null = null;

function parseNumber(rawValue: string | undefined, fallback: number) {
  const parsed = Number.parseInt(rawValue ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(sessionId);
    }
  }
}

function cleanupExpiredAttempts() {
  const now = Date.now();
  const config = getAuthConfig();

  for (const [ip, state] of loginAttempts.entries()) {
    const isBlocked = state.blockedUntil && state.blockedUntil > now;
    const isWindowExpired = now - state.firstAttemptAt > config.loginWindowMs;

    if (!isBlocked && isWindowExpired) {
      loginAttempts.delete(ip);
    }
  }
}

export function getAuthConfig(): AuthConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const username = process.env.ADMIN_USERNAME?.trim() || 'admin';
  const passwordHash = process.env.ADMIN_PASSWORD_HASH?.trim() || null;
  const fallbackPassword = process.env.ADMIN_PASSWORD?.trim() || (!isProduction ? 'change-me-now' : null);
  const sessionSecret = process.env.AUTH_SESSION_SECRET?.trim() || (!isProduction ? 'dev-insecure-session-secret-change-me' : '');

  if (!passwordHash && isProduction) {
    throw new Error('ADMIN_PASSWORD_HASH is required in production. Generate it with npm run hash-password in server/.');
  }

  if (!sessionSecret && isProduction) {
    throw new Error('AUTH_SESSION_SECRET is required in production. Use a long random string.');
  }

  if (!passwordHash && !isProduction) {
    console.warn('[auth] ADMIN_PASSWORD_HASH is not set. Falling back to ADMIN_PASSWORD for development only.');
  }

  cachedConfig = {
    username,
    passwordHash,
    fallbackPassword,
    sessionSecret,
    cookieName: process.env.AUTH_COOKIE_NAME?.trim() || 'sf_session',
    sessionTtlMs: parseNumber(process.env.AUTH_SESSION_TTL_HOURS, 12) * 60 * 60 * 1000,
    maxLoginAttempts: parseNumber(process.env.AUTH_MAX_LOGIN_ATTEMPTS, 5),
    loginBlockMs: parseNumber(process.env.AUTH_LOGIN_BLOCK_MINUTES, 15) * 60 * 1000,
    loginWindowMs: parseNumber(process.env.AUTH_LOGIN_WINDOW_MINUTES, 15) * 60 * 1000,
    secureCookies: isProduction || process.env.AUTH_SECURE_COOKIE === 'true',
  };

  return cachedConfig;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, passwordHash: string) {
  if (!passwordHash.startsWith('scrypt$')) {
    return false;
  }

  const [, salt, expectedHash] = passwordHash.split('$');
  if (!salt || !expectedHash) {
    return false;
  }

  const derived = await scrypt(password, salt, 64) as Buffer;
  const expectedBuffer = Buffer.from(expectedHash, 'hex');

  if (derived.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(derived, expectedBuffer);
}

export async function verifyAdminCredentials(username: string, password: string) {
  const config = getAuthConfig();

  if (!safeEqual(username, config.username)) {
    return false;
  }

  if (config.passwordHash) {
    return verifyPassword(password, config.passwordHash);
  }

  if (!config.fallbackPassword) {
    return false;
  }

  return safeEqual(password, config.fallbackPassword);
}

export function getAuthenticatedSession(request: FastifyRequest): AuthSession | null {
  cleanupExpiredSessions();

  const config = getAuthConfig();
  const rawCookie = request.cookies[config.cookieName];
  if (!rawCookie) {
    return null;
  }

  const unsigned = request.unsignCookie(rawCookie);
  if (!unsigned.valid) {
    return null;
  }

  const session = sessions.get(unsigned.value);
  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    sessions.delete(session.sessionId);
    return null;
  }

  return session;
}

export function createSession(username: string) {
  cleanupExpiredSessions();

  const config = getAuthConfig();
  const now = Date.now();
  const session: AuthSession = {
    sessionId: randomBytes(32).toString('hex'),
    username,
    createdAt: now,
    expiresAt: now + config.sessionTtlMs,
  };

  sessions.set(session.sessionId, session);
  return session;
}

export function attachSessionCookie(reply: FastifyReply, session: AuthSession) {
  const config = getAuthConfig();

  reply.setCookie(config.cookieName, session.sessionId, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: config.secureCookies,
    signed: true,
    maxAge: Math.floor(config.sessionTtlMs / 1000),
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  const config = getAuthConfig();

  reply.clearCookie(config.cookieName, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: config.secureCookies,
  });
}

export function destroySession(request: FastifyRequest) {
  const session = getAuthenticatedSession(request);
  if (!session) {
    return;
  }

  sessions.delete(session.sessionId);
}

export function getLoginBlockState(request: FastifyRequest) {
  cleanupExpiredAttempts();

  const current = loginAttempts.get(request.ip);
  if (!current || !current.blockedUntil) {
    return { isBlocked: false, retryAfterSeconds: 0 };
  }

  const retryMs = current.blockedUntil - Date.now();
  if (retryMs <= 0) {
    loginAttempts.delete(request.ip);
    return { isBlocked: false, retryAfterSeconds: 0 };
  }

  return { isBlocked: true, retryAfterSeconds: Math.ceil(retryMs / 1000) };
}

export function registerFailedLoginAttempt(request: FastifyRequest) {
  const config = getAuthConfig();
  const now = Date.now();
  const current = loginAttempts.get(request.ip);

  if (!current || now - current.firstAttemptAt > config.loginWindowMs) {
    loginAttempts.set(request.ip, {
      attempts: 1,
      firstAttemptAt: now,
      blockedUntil: null,
    });
    return;
  }

  current.attempts += 1;

  if (current.attempts >= config.maxLoginAttempts) {
    current.blockedUntil = now + config.loginBlockMs;
  }

  loginAttempts.set(request.ip, current);
}

export function clearLoginAttempts(request: FastifyRequest) {
  loginAttempts.delete(request.ip);
}

export function isPublicApiPath(requestPath: string) {
  return requestPath === '/api/health'
    || requestPath === '/api/auth/session'
    || requestPath === '/api/auth/login'
    || requestPath === '/api/auth/logout';
}