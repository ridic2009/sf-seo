import { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index.js';
import { sites, templates, servers } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { processTemplate } from '../services/templater.js';
import { uploadDirectory, executeSSHCommand, clearRemoteDirectory, type DeployProgressEvent } from '../services/deployer.js';
import { getPanelAdapter } from '../panels/index.js';
import { captureSitePreview, getSitePreviewImagePath, readSitePreviewMeta } from '../services/sitePreview.js';
import { listRemoteEditableFiles, readRemoteTextFile, writeRemoteTextFile, searchRemoteFiles, replaceRemoteFiles } from '../services/remoteFiles.js';
import { validateSearchQuery } from '../services/codeEditor.js';
import { waitForHestiaDomain } from '../services/hestia.js';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function isSearchInputError(message?: string): boolean {
  return Boolean(message && (message.includes('Invalid regular expression') || message.includes('Regex must not match empty strings')));
}

function isMissingRemoteDomainError(message?: string): boolean {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return normalized.includes("doesn't exist")
    || normalized.includes('does not exist')
    || normalized.includes('not found')
    || normalized.includes('already removed');
}

function appendDeployLog(siteId: number, step: string, message: string, status: 'pending' | 'deploying' | 'deployed' | 'error' = 'deploying') {
  const existing = db.select({ deployLog: sites.deployLog }).from(sites).where(eq(sites.id, siteId)).get();
  const line = `[${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] ${message}`;
  const deployLog = existing?.deployLog ? `${existing.deployLog}\n${line}` : line;

  db.update(sites)
    .set({ status, deployStep: step, deployLog })
    .where(eq(sites.id, siteId))
    .run();
}

function formatProgressBar(percent?: number): string {
  const normalized = Math.max(0, Math.min(100, percent ?? 0));
  const filled = Math.round(normalized / 10);
  return `[${'#'.repeat(filled)}${'·'.repeat(10 - filled)}] ${normalized}%`;
}

function formatBytes(size?: number): string {
  if (size == null || Number.isNaN(size)) {
    return '0 B';
  }

  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function checkHestiaDomainRegistration(server: typeof servers.$inferSelect, domain: string) {
  const panelUser = server.panelUser || server.username;
  return waitForHestiaDomain(
    {
      host: server.host,
      port: server.port,
      username: server.username,
      authType: server.authType as 'password' | 'key',
      password: server.password ?? undefined,
      privateKey: server.privateKey ?? undefined,
    },
    panelUser,
    domain,
  );
}

async function refreshSitePreview(siteId: number) {
  const site = db.select().from(sites).where(eq(sites.id, siteId)).get();
  if (!site) {
    throw new Error('Site not found');
  }

  try {
    const meta = await captureSitePreview({ id: site.id, domain: site.domain });
    db.update(sites)
      .set({
        previewStatus: meta.statusCode,
        previewUpdatedAt: meta.capturedAt,
        previewError: meta.errorMessage,
      })
      .where(eq(sites.id, siteId))
      .run();

    return meta;
  } catch (error: any) {
    const existingMeta = readSitePreviewMeta(siteId);
    const probeMeta = error?.previewMeta as { statusCode?: number | null; capturedAt?: string; errorMessage?: string | null } | undefined;

    db.update(sites)
      .set({
        previewStatus: probeMeta?.statusCode ?? existingMeta?.statusCode ?? null,
        previewUpdatedAt: probeMeta?.capturedAt ?? existingMeta?.capturedAt ?? site.previewUpdatedAt ?? new Date().toISOString(),
        previewError: error?.message || 'Не удалось обновить превью сайта',
      })
      .where(eq(sites.id, siteId))
      .run();

    throw error;
  }
}

interface DeploySiteOptions {
  overrideServerId?: number;
  overrideTemplateId?: number;
  skipPreview?: boolean;
}

async function deploySiteById(siteId: number, app: any, options: DeploySiteOptions = {}) {
  const site = db.select().from(sites).where(eq(sites.id, siteId)).get();
  if (!site) {
    throw new Error('Site not found');
  }
  const targetServerId = options.overrideServerId ?? site.serverId;
  const targetTemplateId = options.overrideTemplateId ?? site.templateId;

  if (!targetTemplateId || !targetServerId) {
    throw new Error('Site must have templateId and serverId');
  }

  const template = db.select().from(templates).where(eq(templates.id, targetTemplateId)).get();
  const server = db.select().from(servers).where(eq(servers.id, targetServerId)).get();
  if (!template || !server) {
    throw new Error('Template or server not found');
  }

  const sourceTemplate = site.templateId
    ? db.select().from(templates).where(eq(templates.id, site.templateId)).get()
    : null;
  const sourceServer = site.serverId
    ? db.select().from(servers).where(eq(servers.id, site.serverId)).get()
    : null;
  const isTransfer = Boolean(options.overrideServerId && options.overrideServerId !== site.serverId);
  const isTemplateReplacement = Boolean(options.overrideTemplateId && options.overrideTemplateId !== site.templateId);

  db.update(sites)
    .set({ status: 'deploying', deployStep: 'Подготовка', deployLog: null, errorMessage: null })
    .where(eq(sites.id, siteId))
    .run();

  let tmpDir: string | null = null;
  let lastUploadPercent = -10;
  let lastExtractPercent = -10;
  let stopProgressLogging = false;
  try {
    if (isTransfer) {
      appendDeployLog(
        siteId,
        'Подготовка переноса',
        `Запущен перенос ${site.domain} с сервера ${sourceServer?.name || sourceServer?.host || 'неизвестно'} на ${server.name || server.host}`,
      );
    }

    if (isTemplateReplacement) {
      appendDeployLog(
        siteId,
        'Подготовка замены шаблона',
        `Запущена замена шаблона ${site.domain}: ${sourceTemplate?.name || `#${site.templateId}`} -> ${template.name}`,
      );
    }

    appendDeployLog(
      siteId,
      'Подготовка шаблона',
      isTemplateReplacement
        ? `Начата обработка нового шаблона "${template.name}" для ${site.domain}`
        : `Начата обработка шаблона для ${site.domain}`,
    );

    tmpDir = path.join(os.tmpdir(), `site-factory-${siteId}-${Date.now()}`);
    processTemplate(template.dirPath, tmpDir, {
      originalBusinessName: template.originalBusinessName,
      originalDomain: template.originalDomain,
      newBusinessName: site.businessName,
      newDomain: site.domain,
    });

    appendDeployLog(siteId, 'Создание домена', `Пробую создать домен ${site.domain} в панели`);
    const panel = getPanelAdapter(server);
    try {
      await panel.createSite(site.domain);
      appendDeployLog(siteId, 'Создание домена', `Домен ${site.domain} создан или уже существовал`);
      if (server.panelType === 'hestia') {
        appendDeployLog(siteId, 'Создание домена', 'Запрос Let\'s Encrypt отправлен в фоне и больше не блокирует деплой');
      }
    } catch (err: any) {
      app.log.warn(`Panel createSite failed (may already exist): ${err.message}`);
      appendDeployLog(siteId, 'Создание домена', `Панель вернула предупреждение: ${err.message}`);

      if (server.panelType === 'hestia') {
        try {
          const registration = await checkHestiaDomainRegistration(server, site.domain);

          if (!registration.exists) {
            const details = registration.diagnostics.join(' | ') || 'нет диагностического вывода';
            appendDeployLog(siteId, 'Создание домена', `Диагностика Hestia: ${details}`);
            throw new Error(`Домен ${site.domain} не зарегистрирован в Hestia после ошибки панели: ${details}`);
          }

          appendDeployLog(siteId, 'Создание домена', `Домен ${site.domain} найден в Hestia после повторной проверки`);
        } catch (error: any) {
          throw new Error(error?.message || `Домен ${site.domain} не появился в Hestia. Загрузка файлов остановлена, чтобы не пометить сайт как развёрнутый ошибочно.`);
        }
      }
    }

    const remoteDir = server.webRootPattern
      .replace('{{USER}}', server.panelUser || server.username)
      .replace('{{DOMAIN}}', site.domain);

    appendDeployLog(siteId, 'Подготовка директории', `Очищаю старые файлы в ${remoteDir} перед загрузкой нового шаблона`);
    await clearRemoteDirectory(
      {
        host: server.host,
        port: server.port,
        username: server.username,
        authType: server.authType as 'password' | 'key',
        password: server.password ?? undefined,
        privateKey: server.privateKey ?? undefined,
      },
      remoteDir,
    );

    appendDeployLog(siteId, 'Загрузка файлов', `Начата загрузка файлов в ${remoteDir}`);

    const handleDeployProgress = (event: DeployProgressEvent) => {
      if (stopProgressLogging) {
        return;
      }

      if (event.phase === 'info') {
        appendDeployLog(siteId, 'Загрузка файлов', event.message);
        return;
      }

      if (event.phase === 'upload') {
        const percent = event.percent ?? 0;
        if (percent < 100 && percent - lastUploadPercent < 10) {
          return;
        }

        lastUploadPercent = percent;
        appendDeployLog(
          siteId,
          'Загрузка файлов',
          `Отправка архива ${formatProgressBar(percent)}${event.transferredBytes != null && event.totalBytes != null ? ` (${formatBytes(event.transferredBytes)} / ${formatBytes(event.totalBytes)})` : ''}`,
        );
        return;
      }

      if (event.phase === 'extract') {
        const percent = event.percent ?? 0;
        if (percent < 100 && percent - lastExtractPercent < 10) {
          return;
        }

        lastExtractPercent = percent;
        appendDeployLog(
          siteId,
          'Распаковка файлов',
          `${formatProgressBar(percent)}${event.processedEntries != null && event.totalEntries != null ? ` (${event.processedEntries}/${event.totalEntries})` : ''}${event.message ? ` ${event.message}` : ''}`,
        );
      }
    };

    await uploadDirectory({
      localDir: tmpDir,
      remoteDir,
      server: {
        host: server.host,
        port: server.port,
        username: server.username,
        authType: server.authType as 'password' | 'key',
        password: server.password ?? undefined,
        privateKey: server.privateKey ?? undefined,
      },
      onProgress: handleDeployProgress,
    });

    stopProgressLogging = true;

    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    const deployedAt = new Date().toISOString();
    const existing = db.select({ deployLog: sites.deployLog }).from(sites).where(eq(sites.id, siteId)).get();
    const finalLog = `${existing?.deployLog ? `${existing.deployLog}\n` : ''}[${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] Деплой успешно завершён`;

    db.update(sites)
      .set({
        status: 'deployed',
        deployStep: 'Завершено',
        deployLog: finalLog,
        deployedAt,
        errorMessage: null,
        serverId: targetServerId,
        templateId: targetTemplateId,
      })
      .where(eq(sites.id, siteId))
      .run();

    if (options.skipPreview) {
      appendDeployLog(
        siteId,
        'Ожидает проверки',
        'Автопроверка сайта пропущена до обновления DNS/IP. Логи деплоя завершены, сайт готов на новом сервере.',
        'deployed',
      );
    } else {
      appendDeployLog(siteId, 'Проверка сайта', `Обновляю превью и проверяю ответ сайта ${site.domain}`);
      try {
        const previewMeta = await refreshSitePreview(siteId);
        appendDeployLog(
          siteId,
          'Проверка сайта',
          previewMeta.statusCode
            ? `Сайт ответил со статусом HTTP ${previewMeta.statusCode}, превью обновлено`
            : `Превью обновлено, но HTTP-статус не получен${previewMeta.errorMessage ? `: ${previewMeta.errorMessage}` : ''}`,
          'deployed',
        );
      } catch (previewError: any) {
        appendDeployLog(siteId, 'Проверка сайта', `Не удалось обновить превью сайта: ${previewError.message}`, 'deployed');
      }
    }

    return { success: true, domain: site.domain };
  } catch (err: any) {
    stopProgressLogging = true;
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    appendDeployLog(siteId, 'Ошибка', err.message, 'error');
    db.update(sites)
      .set({ status: 'error', deployStep: 'Ошибка', errorMessage: err.message })
      .where(eq(sites.id, siteId))
      .run();
    throw err;
  }
}

function buildSiteRemoteContext(siteId: number) {
  const site = db.select().from(sites).where(eq(sites.id, siteId)).get();
  if (!site) {
    throw new Error('Site not found');
  }

  if (!site.serverId) {
    throw new Error('Site has no server');
  }

  const server = db.select().from(servers).where(eq(servers.id, site.serverId)).get();
  if (!server) {
    throw new Error('Server not found');
  }

  const remoteRoot = server.webRootPattern
    .replace('{{USER}}', server.panelUser || server.username)
    .replace('{{DOMAIN}}', site.domain);

  return {
    site,
    server,
    remoteRoot,
    connection: {
      host: server.host,
      port: server.port,
      username: server.username,
      authType: server.authType as 'password' | 'key',
      password: server.password ?? undefined,
      privateKey: server.privateKey ?? undefined,
    },
    ownerUser: server.panelUser || server.username,
  };
}

export const siteRoutes: FastifyPluginAsync = async (app) => {
  // List all sites
  app.get('/', async () => {
    const rows = db
      .select({
        id: sites.id,
        domain: sites.domain,
        businessName: sites.businessName,
        templateId: sites.templateId,
        serverId: sites.serverId,
        language: sites.language,
        status: sites.status,
        deployStep: sites.deployStep,
        deployLog: sites.deployLog,
        errorMessage: sites.errorMessage,
        previewStatus: sites.previewStatus,
        previewUpdatedAt: sites.previewUpdatedAt,
        previewError: sites.previewError,
        deployedAt: sites.deployedAt,
        notes: sites.notes,
        createdAt: sites.createdAt,
        templateName: templates.name,
        serverName: servers.name,
        serverHost: servers.host,
      })
      .from(sites)
      .leftJoin(templates, eq(sites.templateId, templates.id))
      .leftJoin(servers, eq(sites.serverId, servers.id))
      .all();
    return rows;
  });

  // Get single site
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });
    const site = db.select().from(sites).where(eq(sites.id, id)).get();
    if (!site) return reply.code(404).send({ error: 'Site not found' });
    return site;
  });

  app.get<{ Params: { id: string }; Querystring: { refresh?: string } }>('/:id/preview', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });

    const site = db.select().from(sites).where(eq(sites.id, id)).get();
    if (!site) return reply.code(404).send({ error: 'Site not found' });

    const imagePath = getSitePreviewImagePath(id);
    const shouldRefresh = request.query.refresh === '1' || !fs.existsSync(imagePath);

    if (shouldRefresh) {
      try {
        await refreshSitePreview(id);
      } catch (error: any) {
        if (!fs.existsSync(imagePath)) {
          return reply.code(502).send({ error: error.message });
        }
      }
    }

    if (!fs.existsSync(imagePath)) {
      return reply.code(404).send({ error: 'Preview not found' });
    }

    reply.header('Cache-Control', 'public, max-age=300');
    reply.type('image/png');
    return reply.send(fs.createReadStream(imagePath));
  });

  app.get<{ Params: { id: string } }>('/:id/editor/files', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });

    try {
      const context = buildSiteRemoteContext(id);
      const files = await listRemoteEditableFiles(context.connection, context.remoteRoot);
      return { files };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  app.get<{ Params: { id: string }; Querystring: { path?: string } }>('/:id/editor/file', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });
    if (!request.query.path) return reply.code(400).send({ error: 'Path is required' });

    try {
      const context = buildSiteRemoteContext(id);
      const content = await readRemoteTextFile(context.connection, context.remoteRoot, request.query.path);
      return { path: request.query.path, content };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  app.put<{ Params: { id: string } }>('/:id/editor/file', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });

    const body = request.body as { path?: string; content?: string };
    if (!body.path) return reply.code(400).send({ error: 'Path is required' });
    if (typeof body.content !== 'string') return reply.code(400).send({ error: 'Content must be a string' });

    try {
      const context = buildSiteRemoteContext(id);
      await writeRemoteTextFile(context.connection, context.remoteRoot, body.path, body.content, context.ownerUser);
      return { success: true };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  app.post<{ Params: { id: string } }>('/:id/editor/search', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });

    const body = request.body as { query?: string; ignoreCase?: boolean; useRegex?: boolean };
    const query = body.query?.trim() || '';
    if (!query) return reply.code(400).send({ error: 'Search query is required' });
    const searchOptions = {
      ignoreCase: body.ignoreCase ?? true,
      useRegex: body.useRegex ?? false,
    };

    try {
      validateSearchQuery(query, searchOptions);
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }

    try {
      const context = buildSiteRemoteContext(id);
      const results = await searchRemoteFiles(context.connection, context.remoteRoot, query, searchOptions);
      return {
        results,
        files: results.length,
        matches: results.reduce((sum, item) => sum + item.matchCount, 0),
      };
    } catch (error: any) {
      return reply.code(isSearchInputError(error?.message) ? 400 : 500).send({ error: error.message });
    }
  });

  app.post<{ Params: { id: string } }>('/:id/editor/replace', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });

    const body = request.body as { query?: string; replaceWith?: string; ignoreCase?: boolean; useRegex?: boolean };
    const query = body.query?.trim() || '';
    if (!query) return reply.code(400).send({ error: 'Search query is required' });
    const searchOptions = {
      ignoreCase: body.ignoreCase ?? true,
      useRegex: body.useRegex ?? false,
    };

    try {
      validateSearchQuery(query, searchOptions);
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }

    try {
      const context = buildSiteRemoteContext(id);
      const result = await replaceRemoteFiles(
        context.connection,
        context.remoteRoot,
        query,
        body.replaceWith ?? '',
        context.ownerUser,
        searchOptions,
      );
      return result;
    } catch (error: any) {
      return reply.code(isSearchInputError(error?.message) ? 400 : 500).send({ error: error.message });
    }
  });

  // Create site record (without deploying)
  app.post('/', async (request, reply) => {
    const body = request.body as Record<string, any>;

    if (!body.domain || !body.businessName) {
      return reply.code(400).send({ error: 'Required: domain, businessName' });
    }

    const existing = db.select().from(sites).where(eq(sites.domain, body.domain)).get();

    if (existing) {
      const updated = db
        .update(sites)
        .set({
          businessName: body.businessName,
          templateId: body.templateId ?? existing.templateId,
          serverId: body.serverId ?? existing.serverId,
          language: body.language ?? existing.language,
          notes: body.notes ?? existing.notes,
          status: body.status ?? 'pending',
          deployStep: 'Ожидает запуска',
          deployLog: null,
          errorMessage: null,
          deployedAt: null,
        })
        .where(eq(sites.id, existing.id))
        .returning()
        .get();

      return reply.send(updated);
    }

    const inserted = db
      .insert(sites)
      .values({
        domain: body.domain,
        businessName: body.businessName,
        templateId: body.templateId ?? null,
        serverId: body.serverId ?? null,
        language: body.language ?? 'en',
        notes: body.notes ?? null,
        status: 'pending',
        deployStep: 'Ожидает запуска',
      })
      .returning()
      .get();

    return reply.code(201).send(inserted);
  });

  // Update site
  app.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });
    const body = request.body as Record<string, any>;

    const existing = db.select().from(sites).where(eq(sites.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'Site not found' });

    const updateData: Record<string, any> = {};
    const fields = [
      'domain', 'businessName', 'templateId', 'serverId',
      'language', 'status', 'notes',
    ];
    for (const f of fields) {
      if (body[f] !== undefined) updateData[f] = body[f];
    }

    const updated = db.update(sites).set(updateData).where(eq(sites.id, id)).returning().get();
    return updated;
  });

  // Deploy a single site
  app.post<{ Params: { id: string } }>('/:id/deploy', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });

    try {
      return await deploySiteById(id, app);
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });

  app.post<{ Params: { id: string } }>('/:id/replace-template', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });

    const body = request.body as { templateId?: number };
    if (!body.templateId || !Number.isInteger(body.templateId)) {
      return reply.code(400).send({ error: 'Required: templateId' });
    }

    const site = db.select().from(sites).where(eq(sites.id, id)).get();
    if (!site) {
      return reply.code(404).send({ error: 'Site not found' });
    }

    if (!site.serverId) {
      return reply.code(400).send({ error: 'Site has no server' });
    }

    if (site.templateId === body.templateId) {
      return reply.code(400).send({ error: 'Этот шаблон уже привязан к сайту' });
    }

    const targetTemplate = db.select().from(templates).where(eq(templates.id, body.templateId)).get();
    if (!targetTemplate) {
      return reply.code(404).send({ error: 'Template not found' });
    }

    try {
      const result = await deploySiteById(id, app, { overrideTemplateId: body.templateId });
      return {
        ...result,
        templateId: body.templateId,
        templateName: targetTemplate.name,
      };
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // Batch deploy: create + deploy multiple sites at once
  app.post('/batch-deploy', async (request, reply) => {
    const body = request.body as {
      templateId: number;
      serverId: number;
      language?: string;
      autoDeploy?: boolean;
      sites: Array<{ domain: string; businessName: string; notes?: string }>;
    };

    if (!body.templateId || !body.serverId || !body.sites?.length) {
      return reply.code(400).send({ error: 'Required: templateId, serverId, sites[]' });
    }

    const results: Array<{ domain: string; status: string; siteId?: number; error?: string }> = [];

    for (const siteData of body.sites) {
      try {
        const existing = db.select().from(sites).where(eq(sites.domain, siteData.domain)).get();

        const created = existing
          ? db
              .update(sites)
              .set({
                businessName: siteData.businessName,
                templateId: body.templateId,
                serverId: body.serverId,
                language: body.language ?? 'en',
                notes: siteData.notes ?? null,
                status: 'pending',
                deployStep: body.autoDeploy ? 'В очереди на деплой' : 'Ожидает запуска',
                deployLog: null,
                errorMessage: null,
                deployedAt: null,
              })
              .where(eq(sites.id, existing.id))
              .returning()
              .get()
          : db
              .insert(sites)
              .values({
                domain: siteData.domain,
                businessName: siteData.businessName,
                templateId: body.templateId,
                serverId: body.serverId,
                language: body.language ?? 'en',
                notes: siteData.notes ?? null,
                status: 'pending',
                deployStep: body.autoDeploy ? 'В очереди на деплой' : 'Ожидает запуска',
              })
              .returning()
              .get();

        if (body.autoDeploy) {
          try {
            await deploySiteById(created.id, app);
            results.push({ domain: siteData.domain, status: 'deployed', siteId: created.id });
          } catch (deployErr: any) {
            results.push({ domain: siteData.domain, status: 'error', siteId: created.id, error: deployErr.message });
          }
        } else {
          results.push({ domain: siteData.domain, status: 'created', siteId: created.id });
        }
      } catch (err: any) {
        results.push({ domain: siteData.domain, status: 'error', error: err.message });
      }
    }

    return { results };
  });

  app.post('/batch-transfer', async (request, reply) => {
    const body = request.body as {
      siteIds: number[];
      targetServerId: number;
      concurrency?: number;
    };

    const siteIds = Array.from(new Set((body.siteIds || []).filter((value) => Number.isInteger(value) && value > 0)));
    const concurrency = Math.min(Math.max(body.concurrency ?? 3, 1), 5);

    if (!body.targetServerId || siteIds.length === 0) {
      return reply.code(400).send({ error: 'Required: targetServerId, siteIds[]' });
    }

    const targetServer = db.select().from(servers).where(eq(servers.id, body.targetServerId)).get();
    if (!targetServer) {
      return reply.code(404).send({ error: 'Target server not found' });
    }

    const results: Array<{ siteId: number; domain?: string; status: 'transferred' | 'skipped' | 'error'; error?: string; message?: string }> = new Array(siteIds.length);
    let cursor = 0;

    const worker = async () => {
      while (true) {
        const currentIndex = cursor;
        cursor += 1;

        if (currentIndex >= siteIds.length) {
          return;
        }

        const siteId = siteIds[currentIndex];
        const site = db.select().from(sites).where(eq(sites.id, siteId)).get();

        if (!site) {
          results[currentIndex] = { siteId, status: 'error', error: 'Site not found' };
          continue;
        }

        if (!site.templateId) {
          results[currentIndex] = { siteId, domain: site.domain, status: 'error', error: 'Site has no template' };
          continue;
        }

        if (site.serverId === body.targetServerId) {
          results[currentIndex] = {
            siteId,
            domain: site.domain,
            status: 'skipped',
            message: 'Сайт уже привязан к выбранному серверу',
          };
          continue;
        }

        try {
          await deploySiteById(siteId, app, { overrideServerId: body.targetServerId, skipPreview: true });
          results[currentIndex] = { siteId, domain: site.domain, status: 'transferred' };
        } catch (error: any) {
          results[currentIndex] = {
            siteId,
            domain: site.domain,
            status: 'error',
            error: error.message,
          };
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, siteIds.length) }, () => worker()),
    );

    return {
      targetServerId: body.targetServerId,
      targetServerName: targetServer.name,
      results,
    };
  });

  // Delete site
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });

    const existing = db.select().from(sites).where(eq(sites.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'Site not found' });

    if (existing.serverId) {
      const server = db.select().from(servers).where(eq(servers.id, existing.serverId)).get();

      if (!server) {
        return reply.code(409).send({ error: 'Сервер для этой воронки не найден. Удаление домена на сервере невозможно, запись не удалена.' });
      }

      try {
        const panel = getPanelAdapter(server);
        await panel.deleteSite(existing.domain);
      } catch (error: any) {
        if (!isMissingRemoteDomainError(error?.message)) {
          return reply.code(502).send({ error: `Не удалось удалить домен на сервере: ${error?.message || 'unknown error'}` });
        }
      }
    }

    const previewPath = getSitePreviewImagePath(existing.id);
    fs.rmSync(previewPath, { force: true });

    db.delete(sites).where(eq(sites.id, id)).run();
    return { success: true };
  });
};
