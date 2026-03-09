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
import { isEditableTextFile, normalizeEditorFileList, resolveLocalEditorPath, replaceLocalFiles, searchLocalFiles, validateSearchQuery } from '../services/codeEditor.js';

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

function isSearchInputError(message?: string): boolean {
  return Boolean(message && (message.includes('Invalid regular expression') || message.includes('Regex must not match empty strings')));
}

function getMimeType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
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
    return { files: normalizeEditorFileList(files) };
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

    const syncUpdatedAt = new Date().toISOString();
    const updated = db
      .update(templates)
      .set({
        syncId: template.syncId ?? randomUUID(),
        syncUpdatedAt,
        updatedAt: syncUpdatedAt,
      })
      .where(eq(templates.id, id))
      .returning()
      .get();

    syncTemplateToRegistry(updated);
    return { success: true };
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

    const syncUpdatedAt = new Date().toISOString();
    const updated = db
      .update(templates)
      .set({
        syncId: template.syncId ?? randomUUID(),
        syncUpdatedAt,
        updatedAt: syncUpdatedAt,
      })
      .where(eq(templates.id, id))
      .returning()
      .get();

    syncTemplateToRegistry(updated);
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
