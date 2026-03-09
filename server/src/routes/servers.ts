import { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index.js';
import { servers, sites } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { createServerBackup, deleteServerBackup, discoverAllServerSites, getServerBackupPath, initializeServerBackup, listServerBackups, markServerBackupError } from '../services/serverBackup.js';
import type { ServerBackupSite } from '../services/serverBackup.js';
import { applyBulkRemoteSiteReplace, previewBulkRemoteSiteReplace } from '../services/remoteFiles.js';
import { validateSearchQuery } from '../services/codeEditor.js';

function isSearchInputError(message?: string): boolean {
  return Boolean(message && (message.includes('Invalid regular expression') || message.includes('Regex must not match empty strings')));
}

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

async function collectServerSites(server: typeof servers.$inferSelect) {
  const managedSites = db
    .select({ domain: sites.domain })
    .from(sites)
    .where(eq(sites.serverId, server.id))
    .all()
    .map((site) => ({
      domain: site.domain,
      remoteDir: resolveRemoteDir(server, site.domain),
    }));

  const discoveredSites = await discoverAllServerSites({
    panelType: server.panelType,
    username: server.username,
    panelUser: server.panelUser,
    webRootPattern: server.webRootPattern,
    server: buildServerConnection(server),
  }).catch(() => [] as ServerBackupSite[]);

  return [...managedSites, ...discoveredSites]
    .filter((site, index, array) => array.findIndex((item) => item.domain === site.domain && item.remoteDir === site.remoteDir) === index)
    .sort((left, right) => left.domain.localeCompare(right.domain));
}

export const serverRoutes: FastifyPluginAsync = async (app) => {
  app.get('/backups', async () => {
    return listServerBackups();
  });

  // List all servers
  app.get('/', async () => {
    const rows = db.select().from(servers).all();
    // Don't expose passwords/keys in list view
    return rows.map((s) => ({
      ...s,
      password: s.password ? '***' : null,
      privateKey: s.privateKey ? '***' : null,
      panelPassword: s.panelPassword ? '***' : null,
    }));
  });

  // Get single server
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });
    const server = db.select().from(servers).where(eq(servers.id, id)).get();
    if (!server) return reply.code(404).send({ error: 'Server not found' });
    return {
      ...server,
      password: server.password ? '***' : null,
      privateKey: server.privateKey ? '***' : null,
      panelPassword: server.panelPassword ? '***' : null,
    };
  });

  // Create server
  app.post('/', async (request, reply) => {
    const body = request.body as Record<string, any>;

    if (!body.name || !body.host || !body.username || !body.panelType) {
      return reply.code(400).send({
        error: 'Required fields: name, host, username, panelType',
      });
    }

    const inserted = db
      .insert(servers)
      .values({
        name: body.name,
        host: body.host,
        port: body.port ?? 22,
        panelType: body.panelType,
        panelPort: body.panelPort ?? null,
        username: body.username,
        authType: body.authType ?? 'password',
        password: body.password ?? null,
        privateKey: body.privateKey ?? null,
        webRootPattern: body.webRootPattern ?? '/home/{{USER}}/web/{{DOMAIN}}/public_html',
        panelUser: body.panelUser ?? null,
        panelPassword: body.panelPassword ?? null,
        isActive: body.isActive ?? true,
      })
      .returning()
      .get();

    return reply.code(201).send(inserted);
  });

  // Update server
  app.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });
    const body = request.body as Record<string, any>;

    const existing = db.select().from(servers).where(eq(servers.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'Server not found' });

    const updateData: Record<string, any> = {};
    const fields = [
      'name', 'host', 'port', 'panelType', 'panelPort', 'username',
      'authType', 'webRootPattern', 'panelUser', 'isActive',
    ];
    for (const f of fields) {
      if (body[f] !== undefined) updateData[f] = body[f];
    }
    // Only update credentials if explicitly provided (not '***')
    if (body.password && body.password !== '***') updateData.password = body.password;
    if (body.privateKey && body.privateKey !== '***') updateData.privateKey = body.privateKey;
    if (body.panelPassword && body.panelPassword !== '***') updateData.panelPassword = body.panelPassword;

    const updated = db
      .update(servers)
      .set(updateData)
      .where(eq(servers.id, id))
      .returning()
      .get();

    return updated;
  });

  // Test server connection
  app.post<{ Params: { id: string } }>('/:id/test', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });
    const server = db.select().from(servers).where(eq(servers.id, id)).get();
    if (!server) return reply.code(404).send({ error: 'Server not found' });

    try {
      const { getPanelAdapter } = await import('../panels/index.js');
      const adapter = getPanelAdapter(server);
      const ok = await adapter.testConnection();
      if (!ok) {
        return reply.code(502).send({ success: false, error: 'Connection test failed' });
      }
      return { success: true };
    } catch (err: any) {
      return reply.code(502).send({ success: false, error: err.message });
    }
  });

  app.get<{ Params: { id: string } }>('/:id/backups', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });

    return listServerBackups(id);
  });

  app.post('/bulk-replace/preview', async (request, reply) => {
    const body = (request.body as {
      serverIds?: number[];
      query?: string;
      relativePath?: string;
      ignoreCase?: boolean;
      useRegex?: boolean;
    } | undefined) ?? {};
    const query = body.query?.trim() || '';

    if (!query) {
      return reply.code(400).send({ error: 'Search query is required' });
    }

    const searchOptions = {
      ignoreCase: body.ignoreCase ?? true,
      useRegex: body.useRegex ?? false,
    };

    try {
      validateSearchQuery(query, searchOptions);
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }

    const normalizedPath = body.relativePath?.trim().replace(/\\/g, '/').replace(/^\/+/, '') || null;
    const requestedIds = Array.isArray(body.serverIds)
      ? body.serverIds.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)
      : [];
    const selectedServers = requestedIds.length > 0
      ? db.select().from(servers).all().filter((server) => requestedIds.includes(server.id))
      : db.select().from(servers).where(eq(servers.isActive, true)).all();

    if (selectedServers.length === 0) {
      return reply.code(400).send({ error: 'Нет выбранных серверов для массовой операции' });
    }

    const serverResults = [] as Array<{
      serverId: number;
      serverName: string;
      scannedSites: number;
      matchedSites: number;
      matchedFiles: number;
      matches: number;
      sites: Awaited<ReturnType<typeof previewBulkRemoteSiteReplace>>['sites'];
      error?: string;
    }>;

    for (const server of selectedServers) {
      try {
        const targetSites = await collectServerSites(server);
        const result = await previewBulkRemoteSiteReplace(
          buildServerConnection(server),
          targetSites.map((site) => ({ domain: site.domain, remoteRoot: site.remoteDir })),
          query,
          {
            ...searchOptions,
            relativePath: normalizedPath,
          },
        );

        serverResults.push({
          serverId: server.id,
          serverName: server.name,
          scannedSites: result.scannedSites,
          matchedSites: result.matchedSites,
          matchedFiles: result.matchedFiles,
          matches: result.matches,
          sites: result.sites,
        });
      } catch (error: any) {
        serverResults.push({
          serverId: server.id,
          serverName: server.name,
          scannedSites: 0,
          matchedSites: 0,
          matchedFiles: 0,
          matches: 0,
          sites: [],
          error: error.message,
        });
      }
    }

    return {
      relativePath: normalizedPath,
      query,
      servers: serverResults,
      totals: {
        scannedServers: serverResults.length,
        scannedSites: serverResults.reduce((sum, item) => sum + item.scannedSites, 0),
        matchedServers: serverResults.filter((item) => item.matches > 0).length,
        matchedSites: serverResults.reduce((sum, item) => sum + item.matchedSites, 0),
        matchedFiles: serverResults.reduce((sum, item) => sum + item.matchedFiles, 0),
        matches: serverResults.reduce((sum, item) => sum + item.matches, 0),
        errors: serverResults.filter((item) => item.error).length,
      },
    };
  });

  app.post('/bulk-replace/apply', async (request, reply) => {
    const body = (request.body as {
      serverIds?: number[];
      query?: string;
      replaceWith?: string;
      relativePath?: string;
      ignoreCase?: boolean;
      useRegex?: boolean;
    } | undefined) ?? {};
    const query = body.query?.trim() || '';

    if (!query) {
      return reply.code(400).send({ error: 'Search query is required' });
    }

    const searchOptions = {
      ignoreCase: body.ignoreCase ?? true,
      useRegex: body.useRegex ?? false,
    };

    try {
      validateSearchQuery(query, searchOptions);
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }

    const normalizedPath = body.relativePath?.trim().replace(/\\/g, '/').replace(/^\/+/, '') || null;
    const requestedIds = Array.isArray(body.serverIds)
      ? body.serverIds.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)
      : [];
    const selectedServers = requestedIds.length > 0
      ? db.select().from(servers).all().filter((server) => requestedIds.includes(server.id))
      : db.select().from(servers).where(eq(servers.isActive, true)).all();

    if (selectedServers.length === 0) {
      return reply.code(400).send({ error: 'Нет выбранных серверов для массовой операции' });
    }

    const serverResults = [] as Array<{
      serverId: number;
      serverName: string;
      scannedSites: number;
      updatedSites: number;
      updatedFiles: number;
      replacements: number;
      sites: Awaited<ReturnType<typeof applyBulkRemoteSiteReplace>>['sites'];
      error?: string;
    }>;

    for (const server of selectedServers) {
      try {
        const targetSites = await collectServerSites(server);
        const result = await applyBulkRemoteSiteReplace(
          buildServerConnection(server),
          targetSites.map((site) => ({ domain: site.domain, remoteRoot: site.remoteDir })),
          query,
          body.replaceWith ?? '',
          {
            ...searchOptions,
            relativePath: normalizedPath,
          },
        );

        serverResults.push({
          serverId: server.id,
          serverName: server.name,
          scannedSites: result.scannedSites,
          updatedSites: result.updatedSites,
          updatedFiles: result.updatedFiles,
          replacements: result.replacements,
          sites: result.sites,
        });
      } catch (error: any) {
        serverResults.push({
          serverId: server.id,
          serverName: server.name,
          scannedSites: 0,
          updatedSites: 0,
          updatedFiles: 0,
          replacements: 0,
          sites: [],
          error: error.message,
        });
      }
    }

    return {
      relativePath: normalizedPath,
      query,
      replaceWith: body.replaceWith ?? '',
      servers: serverResults,
      totals: {
        scannedServers: serverResults.length,
        scannedSites: serverResults.reduce((sum, item) => sum + item.scannedSites, 0),
        updatedServers: serverResults.filter((item) => item.replacements > 0).length,
        updatedSites: serverResults.reduce((sum, item) => sum + item.updatedSites, 0),
        updatedFiles: serverResults.reduce((sum, item) => sum + item.updatedFiles, 0),
        replacements: serverResults.reduce((sum, item) => sum + item.replacements, 0),
        errors: serverResults.filter((item) => item.error).length,
      },
    };
  });

  app.post<{ Params: { id: string } }>('/:id/backup', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });
    const body = (request.body as Record<string, any> | undefined) ?? {};
    const mode = body.mode === 'all' ? 'all' : 'managed';

    const server = db.select().from(servers).where(eq(servers.id, id)).get();
    if (!server) return reply.code(404).send({ error: 'Server not found' });

    const managedSites = db
      .select({ domain: sites.domain })
      .from(sites)
      .where(eq(sites.serverId, id))
      .all();

    const managedBackupSites = managedSites.map((site) => ({
      domain: site.domain,
      remoteDir: resolveRemoteDir(server, site.domain),
      source: 'managed' as const,
    }));

    let backupSites: ServerBackupSite[] = managedBackupSites;

    if (mode === 'all') {
      const discoveredSites = await discoverAllServerSites({
        panelType: server.panelType,
        username: server.username,
        panelUser: server.panelUser,
        webRootPattern: server.webRootPattern,
        server: {
          host: server.host,
          port: server.port,
          username: server.username,
          authType: server.authType as 'password' | 'key',
          password: server.password ?? undefined,
          privateKey: server.privateKey ?? undefined,
        },
      });

      backupSites = [...managedBackupSites, ...discoveredSites].filter(
        (site, index, array) => array.findIndex((item) => item.domain === site.domain && item.remoteDir === site.remoteDir) === index,
      );
    }

    if (backupSites.length === 0) {
      return reply.code(400).send({
        error: mode === 'all'
          ? 'Не удалось найти сайты на сервере для полного бэкапа'
          : 'На этом сервере нет сайтов, привязанных в приложении',
      });
    }

    try {
      const backup = initializeServerBackup({
        serverId: server.id,
        serverName: server.name,
        server: {
          host: server.host,
          port: server.port,
          username: server.username,
          authType: server.authType as 'password' | 'key',
          password: server.password ?? undefined,
          privateKey: server.privateKey ?? undefined,
        },
        sites: backupSites,
        mode,
      });

      void createServerBackup(backup, {
        serverId: server.id,
        serverName: server.name,
        server: {
          host: server.host,
          port: server.port,
          username: server.username,
          authType: server.authType as 'password' | 'key',
          password: server.password ?? undefined,
          privateKey: server.privateKey ?? undefined,
        },
        sites: backupSites,
        mode,
      }).catch((err: any) => {
        markServerBackupError(backup, err?.message || 'Не удалось создать архив');
        app.log.error(err, `Backup job failed for server ${server.id}`);
      });

      return reply.code(202).send(backup);
    } catch (err: any) {
      return reply.code(isSearchInputError(err?.message) ? 400 : 502).send({ success: false, error: err.message });
    }
  });

  app.get<{ Params: { id: string; fileName: string } }>('/:id/backups/:fileName', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });

    const server = db.select({ id: servers.id, name: servers.name }).from(servers).where(eq(servers.id, id)).get();
    if (!server) return reply.code(404).send({ error: 'Server not found' });

    const fileName = path.basename(request.params.fileName);
    const filePath = getServerBackupPath(id, fileName);

    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({ error: 'Backup not found' });
    }

    reply.header('Content-Type', 'application/gzip');
    reply.header('Content-Disposition', `attachment; filename="${fileName}"`);
    return reply.send(fs.createReadStream(filePath));
  });

  app.delete<{ Params: { id: string; fileName: string } }>('/:id/backups/:fileName', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });

    const fileName = path.basename(request.params.fileName);
    const filePath = getServerBackupPath(id, fileName);
    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({ error: 'Backup not found' });
    }

    deleteServerBackup(id, fileName);
    return { success: true };
  });

  // Delete server
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });

    const existing = db.select().from(servers).where(eq(servers.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'Server not found' });

    db.delete(servers).where(eq(servers.id, id)).run();
    return { success: true };
  });
};
