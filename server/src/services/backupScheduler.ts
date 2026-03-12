import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { servers, sites } from '../db/schema.js';
import { createServerBackup, discoverAllServerSites, hasRunningServerBackup, initializeServerBackup, markServerBackupError, purgeExpiredServerBackups, type ServerBackupSite } from './serverBackup.js';

const BACKUP_SCHEDULER_INTERVAL_MS = Math.max(30_000, Number(process.env.BACKUP_SCHEDULER_INTERVAL_MS || 60_000));
const activeScheduledBackups = new Set<number>();
let retentionCleanupCompletedAt = 0;

function resolveRemoteDir(server: typeof servers.$inferSelect, domain: string): string {
  return server.webRootPattern
    .replace('{{USER}}', server.panelUser || server.username)
    .replace('{{DOMAIN}}', domain);
}

function buildServerConnection(server: typeof servers.$inferSelect) {
  return {
    host: server.host,
    port: server.port,
    username: server.username,
    authType: server.authType as 'password' | 'key',
    password: server.password ?? undefined,
    privateKey: server.privateKey ?? undefined,
  };
}

function getBackupIntervalHours(server: typeof servers.$inferSelect): number {
  const parsed = Number(server.backupScheduleIntervalHours);
  if (!Number.isFinite(parsed)) {
    return 24;
  }

  return Math.min(24 * 30, Math.max(1, Math.round(parsed)));
}

function getNextRunAt(server: typeof servers.$inferSelect): number {
  const anchor = server.backupScheduleLastRunAt || server.createdAt;
  const anchorTime = Date.parse(anchor);
  const safeAnchor = Number.isFinite(anchorTime) ? anchorTime : Date.now();
  return safeAnchor + getBackupIntervalHours(server) * 60 * 60 * 1000;
}

async function collectBackupSites(server: typeof servers.$inferSelect): Promise<ServerBackupSite[]> {
  const managedSites = db
    .select({ domain: sites.domain })
    .from(sites)
    .where(eq(sites.serverId, server.id))
    .all()
    .map((site) => ({
      domain: site.domain,
      remoteDir: resolveRemoteDir(server, site.domain),
      source: 'managed' as const,
    }));

  if (server.backupScheduleMode !== 'all') {
    return managedSites;
  }

  const discoveredSites = await discoverAllServerSites({
    panelType: server.panelType,
    username: server.username,
    panelUser: server.panelUser,
    webRootPattern: server.webRootPattern,
    server: buildServerConnection(server),
  });

  return [...managedSites, ...discoveredSites].filter(
    (site, index, array) => array.findIndex((item) => item.domain === site.domain && item.remoteDir === site.remoteDir) === index,
  );
}

async function runScheduledBackup(server: typeof servers.$inferSelect, logger: { info: (message: string) => void; warn: (message: string) => void; error: (error: unknown, message?: string) => void }) {
  const startedAt = new Date().toISOString();

  db.update(servers)
    .set({ backupScheduleLastRunAt: startedAt })
    .where(eq(servers.id, server.id))
    .run();

  const refreshedServer = db.select().from(servers).where(eq(servers.id, server.id)).get();
  if (!refreshedServer) {
    return;
  }

  const backupSites = await collectBackupSites(refreshedServer);
  if (backupSites.length === 0) {
    logger.warn(`Backup scheduler skipped server ${refreshedServer.id}: no sites found`);
    return;
  }

  const backup = initializeServerBackup({
    serverId: refreshedServer.id,
    serverName: refreshedServer.name,
    server: buildServerConnection(refreshedServer),
    sites: backupSites,
    mode: refreshedServer.backupScheduleMode === 'all' ? 'all' : 'managed',
  });

  try {
    await createServerBackup(backup, {
      serverId: refreshedServer.id,
      serverName: refreshedServer.name,
      server: buildServerConnection(refreshedServer),
      sites: backupSites,
      mode: refreshedServer.backupScheduleMode === 'all' ? 'all' : 'managed',
    });
    logger.info(`Scheduled backup completed for server ${refreshedServer.id}`);
  } catch (error) {
    markServerBackupError(backup, error instanceof Error ? error.message : 'Не удалось создать архив по расписанию');
    logger.error(error, `Scheduled backup failed for server ${refreshedServer.id}`);
  }
}

async function checkScheduledBackups(logger: { info: (message: string) => void; warn: (message: string) => void; error: (error: unknown, message?: string) => void }) {
  if (Date.now() - retentionCleanupCompletedAt >= BACKUP_SCHEDULER_INTERVAL_MS) {
    const deletedCount = purgeExpiredServerBackups();
    retentionCleanupCompletedAt = Date.now();
    if (deletedCount > 0) {
      logger.info(`Backup retention removed ${deletedCount} archive(s) older than retention period`);
    }
  }

  const now = Date.now();
  const scheduledServers = db.select().from(servers).where(eq(servers.backupScheduleEnabled, true)).all();

  for (const server of scheduledServers) {
    if (!server.isActive || activeScheduledBackups.has(server.id) || hasRunningServerBackup(server.id)) {
      continue;
    }

    if (getNextRunAt(server) > now) {
      continue;
    }

    activeScheduledBackups.add(server.id);
    void runScheduledBackup(server, logger).finally(() => {
      activeScheduledBackups.delete(server.id);
    });
  }
}

export function startBackupScheduler(logger: { info: (message: string) => void; warn: (message: string) => void; error: (error: unknown, message?: string) => void }) {
  void checkScheduledBackups(logger);

  return setInterval(() => {
    void checkScheduledBackups(logger);
  }, BACKUP_SCHEDULER_INTERVAL_MS);
}