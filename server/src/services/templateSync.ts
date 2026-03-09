import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { db } from '../db/index.js';
import { templates } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const TEMPLATE_MANIFEST_NAME = 'site-factory-template.json';

const TEMPLATE_SYNC_DIR = process.env.TEMPLATE_SYNC_DIR
  ? path.resolve(process.env.TEMPLATE_SYNC_DIR)
  : null;

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

interface TemplateSyncRecord {
  format: 'site-factory-template-sync';
  version: 1;
  syncId: string;
  syncUpdatedAt: string;
  deleted: boolean;
  name?: string;
  packageFileName?: string;
}

type TemplateSyncRow = typeof templates.$inferSelect;

function ensureSyncDir(): string | null {
  if (!TEMPLATE_SYNC_DIR) {
    return null;
  }
  fs.mkdirSync(TEMPLATE_SYNC_DIR, { recursive: true });
  return TEMPLATE_SYNC_DIR;
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

function sanitizeFilePart(value: string): string {
  const safe = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return safe || 'template';
}

function buildTemplateManifest(template: TemplateSyncRow): TemplatePackageManifest {
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

function flattenSingleRootDirectory(templateDir: string): void {
  const entries = fs.readdirSync(templateDir);
  if (entries.length !== 1) {
    return;
  }

  const singleEntry = path.join(templateDir, entries[0]);
  if (!fs.statSync(singleEntry).isDirectory()) {
    return;
  }

  const subEntries = fs.readdirSync(singleEntry);
  for (const sub of subEntries) {
    fs.renameSync(path.join(singleEntry, sub), path.join(templateDir, sub));
  }
  fs.rmdirSync(singleEntry);
}

function removeManifestFile(templateDir: string): void {
  const manifestPath = path.join(templateDir, TEMPLATE_MANIFEST_NAME);
  if (fs.existsSync(manifestPath)) {
    fs.rmSync(manifestPath, { force: true });
  }
}

function buildPackageFileName(template: Pick<TemplateSyncRow, 'syncId' | 'name'>): string {
  return `${template.syncId}-${sanitizeFilePart(template.name)}.site-factory-template.zip`;
}

function getRecordPath(syncId: string): string | null {
  const dir = ensureSyncDir();
  return dir ? path.join(dir, `${syncId}.json`) : null;
}

function getPackagePath(syncId: string, packageFileName?: string): string | null {
  const dir = ensureSyncDir();
  if (!dir) {
    return null;
  }
  return path.join(dir, packageFileName || `${syncId}.site-factory-template.zip`);
}

export function getTemplateSyncStatus() {
  return {
    enabled: Boolean(TEMPLATE_SYNC_DIR),
    directory: TEMPLATE_SYNC_DIR,
  };
}

export function assignTemplateSyncFields(template: TemplateSyncRow) {
  const syncId = template.syncId || randomUUID();
  const syncUpdatedAt = new Date().toISOString();

  return db
    .update(templates)
    .set({ syncId, syncUpdatedAt, updatedAt: syncUpdatedAt })
    .where(eq(templates.id, template.id))
    .returning()
    .get();
}

export function syncTemplateToRegistry(template: TemplateSyncRow): boolean {
  const dir = ensureSyncDir();
  if (!dir || !template.syncId || !template.syncUpdatedAt) {
    return false;
  }

  const packageFileName = buildPackageFileName(template);
  const packagePath = path.join(dir, packageFileName);
  const recordPath = path.join(dir, `${template.syncId}.json`);

  const zip = new AdmZip();
  zip.addFile(
    TEMPLATE_MANIFEST_NAME,
    Buffer.from(JSON.stringify(buildTemplateManifest(template), null, 2), 'utf-8'),
  );
  zip.addLocalFolder(template.dirPath);
  zip.writeZip(packagePath);

  const record: TemplateSyncRecord = {
    format: 'site-factory-template-sync',
    version: 1,
    syncId: template.syncId,
    syncUpdatedAt: template.syncUpdatedAt,
    deleted: false,
    name: template.name,
    packageFileName,
  };

  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2), 'utf-8');
  return true;
}

export function markTemplateDeletedInRegistry(template: Pick<TemplateSyncRow, 'name' | 'syncId'>): boolean {
  if (!template.syncId) {
    return false;
  }

  const dir = ensureSyncDir();
  const recordPath = getRecordPath(template.syncId);
  if (!dir || !recordPath) {
    return false;
  }

  for (const file of fs.readdirSync(dir)) {
    if (file.startsWith(`${template.syncId}-`) && file.endsWith('.site-factory-template.zip')) {
      fs.rmSync(path.join(dir, file), { force: true });
    }
  }

  const record: TemplateSyncRecord = {
    format: 'site-factory-template-sync',
    version: 1,
    syncId: template.syncId,
    syncUpdatedAt: new Date().toISOString(),
    deleted: true,
    name: template.name,
  };

  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2), 'utf-8');
  return true;
}

function isRemoteNewer(localValue: string | null, remoteValue: string) {
  const localTime = localValue ? Date.parse(localValue) : 0;
  const remoteTime = Date.parse(remoteValue);
  if (Number.isNaN(remoteTime)) {
    return false;
  }
  return remoteTime > localTime;
}

function extractTemplatePackage(packagePath: string, templateDir: string): TemplatePackageManifest {
  if (fs.existsSync(templateDir)) {
    fs.rmSync(templateDir, { recursive: true, force: true });
  }

  fs.mkdirSync(templateDir, { recursive: true });
  const zip = new AdmZip(packagePath);
  zip.extractAllTo(templateDir, true);
  removeManifestFile(templateDir);
  flattenSingleRootDirectory(templateDir);

  const manifestEntry = zip
    .getEntries()
    .find((entry) => !entry.isDirectory && path.posix.basename(entry.entryName) === TEMPLATE_MANIFEST_NAME);

  if (!manifestEntry) {
    throw new Error('Template package manifest not found');
  }

  return JSON.parse(manifestEntry.getData().toString('utf-8')) as TemplatePackageManifest;
}

export function syncTemplatesFromRegistry(templatesDir: string) {
  const dir = ensureSyncDir();
  if (!dir) {
    return { enabled: false, imported: 0, updated: 0, deleted: 0, skipped: 0 };
  }

  const recordFiles = fs.readdirSync(dir).filter((file) => file.endsWith('.json'));
  let imported = 0;
  let updated = 0;
  let deleted = 0;
  let skipped = 0;

  for (const recordFile of recordFiles) {
    const recordPath = path.join(dir, recordFile);
    const record = JSON.parse(fs.readFileSync(recordPath, 'utf-8')) as TemplateSyncRecord;
    if (record.format !== 'site-factory-template-sync' || !record.syncId) {
      skipped += 1;
      continue;
    }

    const local = db.select().from(templates).where(eq(templates.syncId, record.syncId)).get();
    if (local && !isRemoteNewer(local.syncUpdatedAt, record.syncUpdatedAt)) {
      skipped += 1;
      continue;
    }

    if (record.deleted) {
      if (local) {
        if (fs.existsSync(local.dirPath)) {
          fs.rmSync(local.dirPath, { recursive: true, force: true });
        }
        db.delete(templates).where(eq(templates.id, local.id)).run();
        deleted += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    const packagePath = getPackagePath(record.syncId, record.packageFileName);
    if (!packagePath || !fs.existsSync(packagePath)) {
      skipped += 1;
      continue;
    }

    const templateDir = local?.dirPath ?? path.join(templatesDir, randomUUID());
    const manifest = extractTemplatePackage(packagePath, templateDir);

    const values = {
      name: manifest.name,
      description: manifest.description,
      languages: JSON.stringify(manifest.languages),
      originalBusinessName: manifest.originalBusinessName,
      originalDomain: manifest.originalDomain,
      dirPath: templateDir,
      syncId: record.syncId,
      syncUpdatedAt: record.syncUpdatedAt,
      updatedAt: record.syncUpdatedAt,
    };

    if (local) {
      db.update(templates).set(values).where(eq(templates.id, local.id)).run();
      updated += 1;
    } else {
      db.insert(templates).values(values).run();
      imported += 1;
    }
  }

  return { enabled: true, imported, updated, deleted, skipped };
}