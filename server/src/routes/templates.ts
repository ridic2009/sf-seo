import { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index.js';
import { templates } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import {
  TEMPLATE_MANIFEST_NAME,
  assignTemplateSyncFields,
  getTemplateSyncStatus,
  markTemplateDeletedInRegistry,
  syncTemplateToRegistry,
  syncTemplatesFromRegistry,
} from '../services/templateSync.js';
import { captureTemplatePreview, getTemplatePreviewImagePath, invalidateTemplatePreview } from '../services/templatePreview.js';
import { describeEditorFiles, isEditableTextFile, resolveLocalEditorPath, replaceLocalFiles, searchLocalFiles, validateSearchQuery } from '../services/codeEditor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../../data/templates');

interface TemplatePackageManifest {
  format: 'site-factory-template';
  version: 1;
  syncId?: string;
  syncUpdatedAt?: string;
  name: string;
  description: string;
  languages: string[];
  originalBusinessName: string;
  originalDomain: string;
}

const PREVIEW_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const LIVE_PREVIEW_INDEX_FILES = ['index.html', 'index.htm', 'index.php'];
const TEXT_LIVE_PREVIEW_EXTENSIONS = new Set([
  '.html', '.htm', '.css', '.js', '.mjs', '.cjs', '.json', '.svg', '.txt', '.xml', '.php', '.map', '.webmanifest', '.ico',
]);

function isSearchInputError(message?: string): boolean {
  return Boolean(message && (message.includes('Invalid regular expression') || message.includes('Regex must not match empty strings')));
}

function getMimeType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.html':
    case '.htm':
    case '.php':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
    case '.mjs':
    case '.cjs':
      return 'application/javascript; charset=utf-8';
    case '.json':
    case '.map':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.txt':
      return 'text/plain; charset=utf-8';
    case '.xml':
      return 'application/xml; charset=utf-8';
    case '.ico':
      return 'image/x-icon';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    case '.ttf':
      return 'font/ttf';
    case '.otf':
      return 'font/otf';
    case '.eot':
      return 'application/vnd.ms-fontobject';
    case '.webmanifest':
      return 'application/manifest+json; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

function isTextLivePreviewFile(filePath: string) {
  return TEXT_LIVE_PREVIEW_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function collectTemplateImages(dir: string, prefix = ''): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') {
        continue;
      }
      files.push(...collectTemplateImages(fullPath, relPath));
      continue;
    }

    if (PREVIEW_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(relPath);
    }
  }

  return files;
}

function getTemplatePreviewFile(templateDir: string): string | null {
  const candidates = collectTemplateImages(templateDir);
  if (candidates.length === 0) {
    return null;
  }

  const score = (candidate: string) => {
    const lower = candidate.toLowerCase();
    let total = 0;

    if (lower.includes('preview') || lower.includes('screenshot')) total += 100;
    if (lower.includes('og-image') || lower.includes('og_image') || lower.includes('meta')) total += 80;
    if (lower.includes('hero') || lower.includes('cover')) total += 60;
    if (lower.includes('logo')) total += 20;
    if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp')) total += 10;
    total -= lower.split('/').length * 2;

    return total;
  };

  return candidates.sort((left, right) => score(right) - score(left))[0] ?? null;
}

function getTemplateLiveEntryPath(templateDir: string, requestedPath = ''): string | null {
  const normalizedPath = decodeURIComponent(requestedPath).replace(/\\/g, '/').replace(/^\/+/, '');
  const resolvedPath = normalizedPath ? resolveLocalEditorPath(templateDir, normalizedPath) : templateDir;

  if (!fs.existsSync(resolvedPath)) {
    return null;
  }

  if (fs.statSync(resolvedPath).isDirectory()) {
    for (const fileName of LIVE_PREVIEW_INDEX_FILES) {
      const candidate = path.join(resolvedPath, fileName);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
    return null;
  }

  return resolvedPath;
}

function getTemplateLiveBasePath(templateId: number) {
  return `/api/templates/${templateId}/live/`;
}

function rewriteRootRelativeValue(value: string, liveBasePath: string) {
  if (!value.startsWith('/') || value.startsWith('//')) {
    return value;
  }

  return `${liveBasePath}${value.slice(1)}`;
}

function rewriteSrcsetValue(value: string, liveBasePath: string) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [url, ...descriptor] = entry.split(/\s+/);
      return [rewriteRootRelativeValue(url, liveBasePath), ...descriptor].filter(Boolean).join(' ');
    })
    .join(', ');
}

function injectIntoHtmlDocument(content: string, snippet: string) {
  if (/<head(\s[^>]*)?>/i.test(content)) {
    return content.replace(/<head(\s[^>]*)?>/i, (match) => `${match}${snippet}`);
  }

  if (/<html(\s[^>]*)?>/i.test(content)) {
    return content.replace(/<html(\s[^>]*)?>/i, (match) => `${match}<head>${snippet}</head>`);
  }

  return `${snippet}${content}`;
}

function createLivePreviewRuntimeScript(templateId: number) {
  const liveBasePath = getTemplateLiveBasePath(templateId);
  const escapedBasePath = JSON.stringify(liveBasePath);

  return `<script>(function(){
  var liveBasePath=${escapedBasePath};
  function rewrite(value){
    if(typeof value!=="string") return value;
    if(!value.startsWith("/")||value.startsWith("//")) return value;
    return liveBasePath+value.slice(1);
  }
  var originalFetch=window.fetch;
  if(typeof originalFetch==="function"){
    window.fetch=function(input, init){
      if(typeof input==="string") return originalFetch.call(this, rewrite(input), init);
      if(input instanceof URL) return originalFetch.call(this, rewrite(input.toString()), init);
      if(typeof Request!=="undefined"&&input instanceof Request){
        var nextUrl=rewrite(input.url);
        if(nextUrl!==input.url) return originalFetch.call(this, new Request(nextUrl, input), init);
      }
      return originalFetch.call(this, input, init);
    };
  }
  var originalOpen=XMLHttpRequest&&XMLHttpRequest.prototype&&XMLHttpRequest.prototype.open;
  if(typeof originalOpen==="function"){
    XMLHttpRequest.prototype.open=function(method, url){
      arguments[1]=typeof url==="string"?rewrite(url):url;
      return originalOpen.apply(this, arguments);
    };
  }
  var originalWindowOpen=window.open;
  if(typeof originalWindowOpen==="function"){
    window.open=function(url){
      arguments[0]=typeof url==="string"?rewrite(url):url;
      return originalWindowOpen.apply(window, arguments);
    };
  }
})();</script>`;
}

function rewriteLivePreviewHtml(content: string, templateId: number) {
  const liveBasePath = getTemplateLiveBasePath(templateId);
  const baseTag = `<base href="${liveBasePath}">`;
  const runtimeScript = createLivePreviewRuntimeScript(templateId);
  const contentWithBase = /<base\s/i.test(content)
    ? content.replace(/<base\b[^>]*href=(['"])[^'"]*\1[^>]*>/i, baseTag)
    : injectIntoHtmlDocument(content, baseTag);
  const withHeadInjection = injectIntoHtmlDocument(contentWithBase, runtimeScript);

  return withHeadInjection
    .replace(/\b(href|src|poster|data|action|formaction)=(["'])(.*?)\2/gi, (match, attribute, quote, value) => {
      return `${attribute}=${quote}${rewriteRootRelativeValue(value, liveBasePath)}${quote}`;
    })
    .replace(/\bsrcset=(["'])(.*?)\1/gi, (match, quote, value) => {
      return `srcset=${quote}${rewriteSrcsetValue(value, liveBasePath)}${quote}`;
    })
    .replace(/\bstyle=(["'])(.*?)\1/gi, (match, quote, value) => {
      return `style=${quote}${rewriteLivePreviewCss(value, templateId)}${quote}`;
    })
    .replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (match, attributes, cssContent) => {
      return `<style${attributes}>${rewriteLivePreviewCss(cssContent, templateId)}</style>`;
    });
}

function rewriteLivePreviewCss(content: string, templateId: number) {
  const liveBasePath = getTemplateLiveBasePath(templateId);
  return content
    .replace(/url\((['"]?)\/(?!\/)/gi, `url($1${liveBasePath}`)
    .replace(/(@import\s+(?:url\()?["'])\/(?!\/)/gi, `$1${liveBasePath}`);
}

function sendLivePreviewError(reply: any, statusCode: number, title: string, description: string) {
  reply.code(statusCode).type('text/html; charset=utf-8');
  return reply.send(`<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: radial-gradient(circle at top, #172033, #050816 60%);
        color: #e5edf8;
        font-family: Segoe UI, sans-serif;
      }
      main {
        width: min(560px, calc(100vw - 32px));
        border: 1px solid rgba(148, 163, 184, 0.18);
        border-radius: 24px;
        background: rgba(11, 18, 32, 0.88);
        padding: 28px;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
      }
      h1 { margin: 0 0 12px; font-size: 24px; }
      p { margin: 0; color: #94a3b8; line-height: 1.6; }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>${description}</p>
    </main>
  </body>
</html>`);
}

function parseLanguages(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : ['en'];
  } catch {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function buildTemplateManifest(template: typeof templates.$inferSelect): TemplatePackageManifest {
  return {
    format: 'site-factory-template',
    version: 1,
    syncId: template.syncId ?? undefined,
    syncUpdatedAt: template.syncUpdatedAt ?? undefined,
    name: template.name,
    description: template.description ?? '',
    languages: parseLanguages(template.languages),
    originalBusinessName: template.originalBusinessName,
    originalDomain: template.originalDomain,
  };
}

function sanitizeTemplateFilename(name: string): string {
  const safe = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return safe || 'template';
}

function syncTemplateAfterContentChange(template: typeof templates.$inferSelect) {
  const syncUpdatedAt = new Date().toISOString();
  const updated = db
    .update(templates)
    .set({
      syncId: template.syncId ?? randomUUID(),
      syncUpdatedAt,
      updatedAt: syncUpdatedAt,
    })
    .where(eq(templates.id, template.id))
    .returning()
    .get();

  syncTemplateToRegistry(updated);
  return updated;
}

function removeEmptyLocalParentDirs(rootDir: string, startDir: string) {
  const rootResolved = path.resolve(rootDir);
  let currentDir = path.resolve(startDir);

  while (currentDir !== rootResolved && currentDir.startsWith(`${rootResolved}${path.sep}`)) {
    if (!fs.existsSync(currentDir) || fs.readdirSync(currentDir).length > 0) {
      break;
    }

    fs.rmdirSync(currentDir);
    currentDir = path.dirname(currentDir);
  }
}

function extractTemplateArchive(zip: AdmZip, templateDir: string, manifestEntry?: AdmZip.IZipEntry | null) {
  fs.mkdirSync(templateDir, { recursive: true });

  for (const entry of fs.readdirSync(templateDir)) {
    fs.rmSync(path.join(templateDir, entry), { recursive: true, force: true });
  }

  zip.extractAllTo(templateDir, true);

  if (manifestEntry) {
    const manifestFilePath = path.join(templateDir, ...manifestEntry.entryName.split('/'));
    if (fs.existsSync(manifestFilePath)) {
      fs.rmSync(manifestFilePath, { force: true });
    }
  }

  const entries = fs.readdirSync(templateDir);
  if (entries.length === 1) {
    const singleEntry = path.join(templateDir, entries[0]);
    if (fs.statSync(singleEntry).isDirectory()) {
      const subEntries = fs.readdirSync(singleEntry);
      for (const sub of subEntries) {
        fs.renameSync(path.join(singleEntry, sub), path.join(templateDir, sub));
      }
      fs.rmdirSync(singleEntry);
    }
  }
}

export const templateRoutes: FastifyPluginAsync = async (app) => {
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });

  app.get('/sync-status', async () => {
    return getTemplateSyncStatus();
  });

  app.post('/sync', async (_request, reply) => {
    const status = getTemplateSyncStatus();
    if (!status.enabled) {
      return reply.code(400).send({
        error: 'Template sync is not configured. Set TEMPLATE_SYNC_DIR on both installations.',
      });
    }

    const allTemplates = db.select().from(templates).all();
    for (const template of allTemplates) {
      const syncedTemplate = template.syncId && template.syncUpdatedAt
        ? template
        : assignTemplateSyncFields(template);
      syncTemplateToRegistry(syncedTemplate);
    }

    return syncTemplatesFromRegistry(TEMPLATES_DIR);
  });

  // List all templates
  app.get('/', async () => {
    syncTemplatesFromRegistry(TEMPLATES_DIR);
    return db.select().from(templates).all();
  });

  // Get single template
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });
    const template = db.select().from(templates).where(eq(templates.id, id)).get();
    if (!template) return reply.code(404).send({ error: 'Template not found' });
    return template;
  });

  app.get<{ Params: { id: string } }>('/:id/preview', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });

    const template = db.select().from(templates).where(eq(templates.id, id)).get();
    if (!template) return reply.code(404).send({ error: 'Template not found' });

    const screenshotPath = getTemplatePreviewImagePath(id);
    if (!fs.existsSync(screenshotPath)) {
      try {
        await captureTemplatePreview(id, template.dirPath);
      } catch {
        // Fall back to static asset heuristic below.
      }
    }

    if (fs.existsSync(screenshotPath)) {
      reply.header('Cache-Control', 'public, max-age=300');
      reply.type('image/png');
      return reply.send(fs.createReadStream(screenshotPath));
    }

    const previewFile = getTemplatePreviewFile(template.dirPath);
    if (!previewFile) {
      return reply.code(404).send({ error: 'Preview not found' });
    }

    const filePath = path.join(template.dirPath, ...previewFile.split('/'));
    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({ error: 'Preview not found' });
    }

    reply.header('Cache-Control', 'public, max-age=300');
    reply.type(getMimeType(filePath));
    return reply.send(fs.createReadStream(filePath));
  });

  app.get<{ Params: { id: string } }>('/:id/live', async (request, reply) => {
    const requestPath = request.url.split('?')[0];
    return reply.redirect(302, `${requestPath}/`);
  });

  const serveTemplateLivePreview = async (
    request: { params: { id: string; '*': string } },
    reply: any,
  ) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });

    const template = db.select().from(templates).where(eq(templates.id, id)).get();
    if (!template) {
      return sendLivePreviewError(reply, 404, 'Шаблон не найден', 'Не удалось открыть live-preview, потому что шаблон отсутствует в базе.');
    }

    let filePath: string | null = null;
    try {
      filePath = getTemplateLiveEntryPath(template.dirPath, request.params['*'] || '');
    } catch {
      return sendLivePreviewError(reply, 400, 'Некорректный путь', 'Live-preview запросил путь за пределами директории шаблона.');
    }

    if (!filePath || !fs.existsSync(filePath)) {
      return sendLivePreviewError(
        reply,
        404,
        'Точка входа не найдена',
        'В шаблоне нет index.html, index.htm или index.php в запрошенной директории, поэтому live-preview открыть нельзя.',
      );
    }

    reply.header('Cache-Control', 'no-store');

    if (!isTextLivePreviewFile(filePath)) {
      reply.type(getMimeType(filePath));
      return reply.send(fs.createReadStream(filePath));
    }

    const mimeType = getMimeType(filePath);
    let content = fs.readFileSync(filePath, 'utf-8');

    if (mimeType.startsWith('text/html')) {
      content = rewriteLivePreviewHtml(content, template.id);
    } else if (mimeType.startsWith('text/css')) {
      content = rewriteLivePreviewCss(content, template.id);
    }

    reply.type(mimeType);
    return reply.send(content);
  };

  app.get<{ Params: { id: string; '*': string } }>('/:id/live/', async (request, reply) => {
    return serveTemplateLivePreview({ params: { id: request.params.id, '*': '' } }, reply);
  });

  app.get<{ Params: { id: string; '*': string } }>('/:id/live/*', serveTemplateLivePreview);

  // Get template file tree (for preview)
  app.get<{ Params: { id: string } }>('/:id/files', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });
    const template = db.select().from(templates).where(eq(templates.id, id)).get();
    if (!template) return reply.code(404).send({ error: 'Template not found' });

    const files: string[] = [];
    function walk(dir: string, prefix: string) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          walk(path.join(dir, entry.name), rel);
        } else {
          files.push(rel);
        }
      }
    }
    walk(template.dirPath, '');
    return { files: describeEditorFiles(files) };
  });

  app.post<{ Params: { id: string }; Querystring: { dir?: string } }>('/:id/files', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });

    const template = db.select().from(templates).where(eq(templates.id, id)).get();
    if (!template) return reply.code(404).send({ error: 'Template not found' });

    const targetDir = (request.query.dir || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

    try {
      if (targetDir) {
        const resolvedDir = resolveLocalEditorPath(template.dirPath, targetDir);
        fs.mkdirSync(resolvedDir, { recursive: true });
      }

      let uploaded = 0;
      for await (const part of request.parts()) {
        if (part.type !== 'file') {
          continue;
        }

        const incomingPath = path.posix.normalize((part.filename || '').replace(/\\/g, '/')).replace(/^\/+/, '');
        if (!incomingPath || incomingPath === '.' || incomingPath.endsWith('/')) {
          continue;
        }

        const relativePath = targetDir ? `${targetDir}/${incomingPath}` : incomingPath;
        const filePath = resolveLocalEditorPath(template.dirPath, relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, await part.toBuffer());
        uploaded += 1;
      }

      if (uploaded === 0) {
        return reply.code(400).send({ error: 'No files uploaded' });
      }

      invalidateTemplatePreview(template.id);
      syncTemplateAfterContentChange(template);
      return { success: true, uploaded };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  app.get<{ Params: { id: string }; Querystring: { path?: string } }>('/:id/file', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });

    const relativePath = request.query.path;
    if (!relativePath) return reply.code(400).send({ error: 'Path is required' });

    const template = db.select().from(templates).where(eq(templates.id, id)).get();
    if (!template) return reply.code(404).send({ error: 'Template not found' });
    if (!isEditableTextFile(relativePath)) return reply.code(400).send({ error: 'File type is not editable' });

    const filePath = resolveLocalEditorPath(template.dirPath, relativePath);
    if (!fs.existsSync(filePath)) return reply.code(404).send({ error: 'File not found' });

    return {
      path: relativePath,
      content: fs.readFileSync(filePath, 'utf-8'),
    };
  });

  app.put<{ Params: { id: string } }>('/:id/file', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });

    const body = request.body as { path?: string; content?: string };
    if (!body.path) return reply.code(400).send({ error: 'Path is required' });
    if (typeof body.content !== 'string') return reply.code(400).send({ error: 'Content must be a string' });

    const template = db.select().from(templates).where(eq(templates.id, id)).get();
    if (!template) return reply.code(404).send({ error: 'Template not found' });
    if (!isEditableTextFile(body.path)) return reply.code(400).send({ error: 'File type is not editable' });

    const filePath = resolveLocalEditorPath(template.dirPath, body.path);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, body.content, 'utf-8');
    invalidateTemplatePreview(template.id);

    syncTemplateAfterContentChange(template);
    return { success: true };
  });

  app.delete<{ Params: { id: string }; Querystring: { path?: string } }>('/:id/file', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });

    const relativePath = request.query.path;
    if (!relativePath) return reply.code(400).send({ error: 'Path is required' });

    const template = db.select().from(templates).where(eq(templates.id, id)).get();
    if (!template) return reply.code(404).send({ error: 'Template not found' });

    try {
      const filePath = resolveLocalEditorPath(template.dirPath, relativePath);
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return reply.code(404).send({ error: 'File not found' });
      }

      fs.rmSync(filePath, { force: true });
      removeEmptyLocalParentDirs(template.dirPath, path.dirname(filePath));
      invalidateTemplatePreview(template.id);
      syncTemplateAfterContentChange(template);
      return { success: true };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  app.post<{ Params: { id: string } }>('/:id/search', async (request, reply) => {
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

    const template = db.select().from(templates).where(eq(templates.id, id)).get();
    if (!template) return reply.code(404).send({ error: 'Template not found' });

    try {
      const results = searchLocalFiles(template.dirPath, query, searchOptions);
      return {
        results,
        files: results.length,
        matches: results.reduce((sum, item) => sum + item.matchCount, 0),
      };
    } catch (error: any) {
      return reply.code(isSearchInputError(error?.message) ? 400 : 500).send({ error: error.message });
    }
  });

  app.post<{ Params: { id: string } }>('/:id/replace', async (request, reply) => {
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

    const template = db.select().from(templates).where(eq(templates.id, id)).get();
    if (!template) return reply.code(404).send({ error: 'Template not found' });

    let result;
    try {
      result = replaceLocalFiles(template.dirPath, query, body.replaceWith ?? '', searchOptions);
    } catch (error: any) {
      return reply.code(isSearchInputError(error?.message) ? 400 : 500).send({ error: error.message });
    }

    invalidateTemplatePreview(template.id);

    syncTemplateAfterContentChange(template);
    return result;
  });

  // Export template as portable package with metadata manifest
  app.get<{ Params: { id: string } }>('/:id/export', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });
    const template = db.select().from(templates).where(eq(templates.id, id)).get();
    if (!template) return reply.code(404).send({ error: 'Template not found' });

    const zip = new AdmZip();
    zip.addFile(
      TEMPLATE_MANIFEST_NAME,
      Buffer.from(JSON.stringify(buildTemplateManifest(template), null, 2), 'utf-8'),
    );
    zip.addLocalFolder(template.dirPath);

    const filename = `${sanitizeTemplateFilename(template.name)}.site-factory-template.zip`;
    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(zip.toBuffer());
  });

  // Upload new template (multipart: zip file + metadata fields)
  app.post('/', async (request, reply) => {
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: 'No file uploaded' });

    const fields = data.fields as Record<string, any>;
    const buffer = await data.toBuffer();
    const zip = new AdmZip(buffer);
    const manifestEntry = zip
      .getEntries()
      .find((entry) => !entry.isDirectory && path.posix.basename(entry.entryName) === TEMPLATE_MANIFEST_NAME);

    let manifest: TemplatePackageManifest | null = null;
    if (manifestEntry) {
      try {
        manifest = JSON.parse(manifestEntry.getData().toString('utf-8')) as TemplatePackageManifest;
      } catch {
        return reply.code(400).send({ error: 'Invalid template package manifest' });
      }
    }

    const name = fields.name?.value?.trim() || manifest?.name;
    const description = fields.description?.value?.trim() || manifest?.description || '';
    const languages = fields.languages?.value || JSON.stringify(manifest?.languages || ['en']);
    const originalBusinessName = fields.originalBusinessName?.value?.trim() || manifest?.originalBusinessName || '{{NAME}}';
    const originalDomain = fields.originalDomain?.value?.trim() || manifest?.originalDomain || '{{DOMAIN}}';
    const syncId = manifest?.syncId ?? randomUUID();
    const syncUpdatedAt = manifest?.syncUpdatedAt ?? new Date().toISOString();

    if (!name) {
      return reply.code(400).send({
        error: 'Required fields: name or template package manifest',
      });
    }

    const existingBySyncId = db.select().from(templates).where(eq(templates.syncId, syncId)).get();
    const templateId = randomUUID();
    const templateDir = existingBySyncId?.dirPath ?? path.join(TEMPLATES_DIR, templateId);
    extractTemplateArchive(zip, templateDir, manifestEntry);

    if (existingBySyncId) {
      invalidateTemplatePreview(existingBySyncId.id);
      const updated = db
        .update(templates)
        .set({
          name,
          description,
          languages,
          originalBusinessName,
          originalDomain,
          dirPath: templateDir,
          syncId,
          syncUpdatedAt,
          updatedAt: syncUpdatedAt,
        })
        .where(eq(templates.id, existingBySyncId.id))
        .returning()
        .get();

      syncTemplateToRegistry(updated);
      return reply.send(updated);
    }

    const inserted = db
      .insert(templates)
      .values({
        name,
        description,
        languages,
        originalBusinessName,
        originalDomain,
        dirPath: templateDir,
        syncId,
        syncUpdatedAt,
        updatedAt: syncUpdatedAt,
      })
      .returning()
      .get();

    syncTemplateToRegistry(inserted);
    return reply.code(201).send(inserted);
  });

  // Update template metadata
  app.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });
    const body = request.body as Record<string, any>;

    const existing = db.select().from(templates).where(eq(templates.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'Template not found' });

    const syncUpdatedAt = new Date().toISOString();
    const updated = db
      .update(templates)
      .set({
        name: body.name ?? existing.name,
        description: body.description ?? existing.description,
        languages: body.languages ?? existing.languages,
        originalBusinessName: body.originalBusinessName ?? existing.originalBusinessName,
        originalDomain: body.originalDomain ?? existing.originalDomain,
        syncId: existing.syncId ?? randomUUID(),
        syncUpdatedAt,
        updatedAt: syncUpdatedAt,
      })
      .where(eq(templates.id, id))
      .returning()
      .get();

    syncTemplateToRegistry(updated);
    return updated;
  });

  app.post<{ Params: { id: string } }>('/:id/archive', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });

    const existing = db.select().from(templates).where(eq(templates.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'Template not found' });

    const data = await request.file();
    if (!data) return reply.code(400).send({ error: 'No file uploaded' });

    const fields = data.fields as Record<string, any>;
    const buffer = await data.toBuffer();
    const zip = new AdmZip(buffer);
    const manifestEntry = zip
      .getEntries()
      .find((entry) => !entry.isDirectory && path.posix.basename(entry.entryName) === TEMPLATE_MANIFEST_NAME);

    const syncUpdatedAt = new Date().toISOString();
    extractTemplateArchive(zip, existing.dirPath, manifestEntry);
    invalidateTemplatePreview(existing.id);

    const updated = db
      .update(templates)
      .set({
        name: fields.name?.value?.trim() || existing.name,
        description: fields.description?.value?.trim() ?? existing.description,
        languages: fields.languages?.value || existing.languages,
        originalBusinessName: fields.originalBusinessName?.value?.trim() || existing.originalBusinessName,
        originalDomain: fields.originalDomain?.value?.trim() || existing.originalDomain,
        syncId: existing.syncId ?? randomUUID(),
        syncUpdatedAt,
        updatedAt: syncUpdatedAt,
      })
      .where(eq(templates.id, id))
      .returning()
      .get();

    syncTemplateToRegistry(updated);
    return updated;
  });

  // Delete template
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });

    const existing = db.select().from(templates).where(eq(templates.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'Template not found' });

    if (fs.existsSync(existing.dirPath)) {
      fs.rmSync(existing.dirPath, { recursive: true, force: true });
    }

    markTemplateDeletedInRegistry(existing);
    db.delete(templates).where(eq(templates.id, id)).run();
    return { success: true };
  });
};
