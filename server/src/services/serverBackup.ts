import { Client as SSHClient } from 'ssh2';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ServerConnectionConfig } from './deployer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUPS_DIR = path.resolve(__dirname, '../../data/backups');
const DEFAULT_BACKUP_RETENTION_DAYS = Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS || 31));

export interface ServerBackupSite {
  domain: string;
  remoteDir: string;
  source?: 'managed' | 'discovered';
}

export type ServerBackupMode = 'managed' | 'all';
export type ServerBackupStatus = 'running' | 'completed' | 'error';

export interface DiscoverAllServerSitesOptions {
  panelType: string;
  username: string;
  panelUser?: string | null;
  webRootPattern: string;
  server: ServerConnectionConfig;
}

export interface CreateServerBackupOptions {
  serverId: number;
  serverName: string;
  server: ServerConnectionConfig;
  sites: ServerBackupSite[];
  mode: ServerBackupMode;
}

export interface CreatedServerBackup {
  success: true;
  fileName: string;
  filePath: string;
  downloadPath: string;
  siteCount: number;
  sizeBytes: number;
  createdAt: string;
  mode: ServerBackupMode;
  serverId: number;
  serverName: string;
  sites: string[];
  status: ServerBackupStatus;
  stage: string;
  errorMessage?: string | null;
}

export interface StoredServerBackup extends CreatedServerBackup {}

interface RemoteStreamDownloadResult {
  method: 'sftp' | 'ssh-stream';
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function sanitizeFileSegment(value: string): string {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitized || 'server';
}

function getServerBackupDir(serverId: number): string {
  return path.join(BACKUPS_DIR, String(serverId));
}

function getServerBackupMetaPath(serverId: number, fileName: string): string {
  return path.join(getServerBackupDir(serverId), `${fileName}.json`);
}

function createSSHConnection(server: ServerConnectionConfig): Promise<SSHClient> {
  return new Promise((resolve, reject) => {
    const conn = new SSHClient();
    const config: Record<string, any> = {
      host: server.host,
      port: server.port,
      username: server.username,
      readyTimeout: 30000,
    };

    if (server.authType === 'key' && server.privateKey) {
      config.privateKey = server.privateKey;
    } else if (server.password) {
      config.password = server.password;
    }

    conn.on('ready', () => resolve(conn));
    conn.on('error', (err) => reject(err));
    conn.connect(config);
  });
}

function executeSSHCommandWithConnection(conn: SSHClient, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }

      let output = '';
      let errorOutput = '';

      stream.on('data', (data: Buffer) => {
        output += data.toString();
      });
      stream.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });
      stream.on('close', (code: number | undefined) => {
        if (code && code !== 0) {
          reject(new Error(errorOutput || `Remote command failed with exit code ${code}`));
          return;
        }

        if (errorOutput && !output) {
          reject(new Error(errorOutput));
          return;
        }

        resolve(output);
      });
    });
  });
}

function downloadFileViaSftp(conn: SSHClient, remoteFilePath: string, localFilePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) {
        reject(err);
        return;
      }

      sftp.fastGet(remoteFilePath, localFilePath, (downloadErr) => {
        if (downloadErr) {
          reject(downloadErr);
          return;
        }

        resolve();
      });
    });
  });
}

function downloadFileViaSshStream(conn: SSHClient, remoteFilePath: string, localFilePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tempFilePath = `${localFilePath}.part`;
    const output = fs.createWriteStream(tempFilePath);
    let settled = false;
    let stderr = '';

    const fail = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      output.destroy();
      fs.rmSync(tempFilePath, { force: true });
      reject(error);
    };

    conn.exec(`cat ${shellEscape(remoteFilePath)}`, (err, stream) => {
      if (err) {
        fail(err);
        return;
      }

      stream.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      output.on('error', (writeError) => {
        stream.destroy();
        fail(writeError);
      });

      stream.on('error', (streamError: Error) => {
        fail(streamError);
      });

      stream.pipe(output);

      stream.on('close', (code: number | undefined) => {
        if (settled) {
          return;
        }

        output.end(async () => {
          if (code && code !== 0) {
            fail(new Error(stderr || `Remote download failed with exit code ${code}`));
            return;
          }

          try {
            fs.renameSync(tempFilePath, localFilePath);
            settled = true;
            resolve();
          } catch (renameError) {
            fail(renameError as Error);
          }
        });
      });
    });
  });
}

async function downloadRemoteArchive(conn: SSHClient, remoteFilePath: string, localFilePath: string): Promise<RemoteStreamDownloadResult> {
  try {
    await downloadFileViaSftp(conn, remoteFilePath, localFilePath);
    return { method: 'sftp' };
  } catch (error) {
    fs.rmSync(localFilePath, { force: true });
    await downloadFileViaSshStream(conn, remoteFilePath, localFilePath);
    return { method: 'ssh-stream' };
  }
}

function parseTabSeparatedSites(output: string): ServerBackupSite[] {
  const parsed = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [domain, remoteDir] = line.split('\t');
      return domain && remoteDir
        ? { domain, remoteDir, source: 'discovered' as const }
        : null;
    });

  return parsed.filter((value): value is NonNullable<typeof value> => value !== null);
}

function uniqueSites(sites: ServerBackupSite[]): ServerBackupSite[] {
  const seen = new Map<string, ServerBackupSite>();

  for (const site of sites) {
    const key = `${site.domain}::${site.remoteDir}`;
    if (!seen.has(key)) {
      seen.set(key, site);
    }
  }

  return Array.from(seen.values()).sort((left, right) => left.domain.localeCompare(right.domain));
}

function buildPatternDiscoveryCommand(webRootPattern: string): string {
  if (!webRootPattern.includes('{{DOMAIN}}')) {
    throw new Error('Шаблон webRootPattern не содержит {{DOMAIN}}, автоматическое обнаружение всех сайтов недоступно');
  }

  const [prefix, suffix] = webRootPattern.split('{{DOMAIN}}');

  return [
    `prefix=${shellEscape(prefix)}`,
    `suffix=${shellEscape(suffix)}`,
    'for dir in "${prefix}"*"${suffix}"; do [ -d "$dir" ] || continue; name="${dir#"$prefix"}"; name="${name%"$suffix"}"; printf "%s\\t%s\\n" "$name" "$dir"; done',
  ].join('; ');
}

function collectCpanelSitesFromUnknown(value: unknown, result: ServerBackupSite[]) {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectCpanelSitesFromUnknown(item, result);
    }
    return;
  }

  const record = value as Record<string, unknown>;
  const domain = typeof record.domain === 'string'
    ? record.domain
    : typeof record.serveralias === 'string'
      ? record.serveralias
      : null;
  const remoteDir = typeof record.documentroot === 'string'
    ? record.documentroot
    : typeof record.docroot === 'string'
      ? record.docroot
      : null;

  if (domain && remoteDir) {
    result.push({ domain, remoteDir, source: 'discovered' });
  }

  for (const child of Object.values(record)) {
    collectCpanelSitesFromUnknown(child, result);
  }
}

async function discoverCpanelSites(conn: SSHClient, username: string): Promise<ServerBackupSite[]> {
  const escapedUsername = shellEscape(username);
  const output = await executeSSHCommandWithConnection(
    conn,
    `uapi --user=${escapedUsername} DomainInfo domains_data format=json --output=json`,
  ).catch(async () => executeSSHCommandWithConnection(
    conn,
    `uapi --user=${escapedUsername} DomainInfo domains_data format=json`,
  ));

  const sites: ServerBackupSite[] = [];

  try {
    collectCpanelSitesFromUnknown(JSON.parse(output), sites);
  } catch {
    // ignore parse failure and fall back below
  }

  if (sites.length > 0) {
    return uniqueSites(sites);
  }

  const fallbackOutput = await executeSSHCommandWithConnection(
    conn,
    [
      `user_name=${escapedUsername}`,
      'main_dir="/home/${user_name}/public_html"',
      '[ -d "$main_dir" ] && printf "%s\\t%s\\n" "main-site" "$main_dir"',
      'for dir in "/home/${user_name}/public_html"/*; do [ -d "$dir" ] || continue; name="${dir##*/}"; printf "%s\\t%s\\n" "$name" "$dir"; done',
    ].join('; '),
  );

  return uniqueSites(parseTabSeparatedSites(fallbackOutput));
}

export async function discoverAllServerSites(options: DiscoverAllServerSitesOptions): Promise<ServerBackupSite[]> {
  const resolvedUser = options.panelUser || options.username;
  const resolvedPattern = options.webRootPattern.replace('{{USER}}', resolvedUser);
  const conn = await createSSHConnection(options.server);

  try {
    if (options.panelType === 'cpanel') {
      return await discoverCpanelSites(conn, resolvedUser);
    }

    return uniqueSites(
      parseTabSeparatedSites(
        await executeSSHCommandWithConnection(conn, buildPatternDiscoveryCommand(resolvedPattern)),
      ),
    );
  } finally {
    conn.end();
  }
}

function buildRemoteBackupCommand(remoteArchivePath: string, remoteStageDir: string, sites: ServerBackupSite[]): string {
  const symlinkCommands = sites.flatMap((site) => [
    `if [ ! -d ${shellEscape(site.remoteDir)} ]; then echo ${shellEscape(`Каталог сайта не найден: ${site.domain} -> ${site.remoteDir}`)} >&2; exit 1; fi`,
    `ln -s ${shellEscape(site.remoteDir)} ${shellEscape(path.posix.join(remoteStageDir, site.domain))}`,
  ]);

  const archiveEntries = sites.map((site) => shellEscape(site.domain)).join(' ');

  return [
    `rm -rf ${shellEscape(remoteStageDir)}`,
    `mkdir -p ${shellEscape(remoteStageDir)}`,
    ...symlinkCommands,
    `tar -hczf ${shellEscape(remoteArchivePath)} -C ${shellEscape(remoteStageDir)} ${archiveEntries}`,
  ].join('; ');
}

export function getServerBackupPath(serverId: number, fileName: string): string {
  return path.join(getServerBackupDir(serverId), fileName);
}

function persistBackupMetadata(backup: StoredServerBackup) {
  fs.writeFileSync(
    getServerBackupMetaPath(backup.serverId, backup.fileName),
    JSON.stringify(backup, null, 2),
    'utf-8',
  );
}

function updateBackupMetadata(backup: StoredServerBackup, patch: Partial<StoredServerBackup>): StoredServerBackup {
  const nextBackup = {
    ...backup,
    ...patch,
  };

  persistBackupMetadata(nextBackup);
  return nextBackup;
}

export function listServerBackups(serverId?: number): StoredServerBackup[] {
  if (!fs.existsSync(BACKUPS_DIR)) {
    return [];
  }

  const serverDirs = serverId
    ? [getServerBackupDir(serverId)]
    : fs.readdirSync(BACKUPS_DIR)
      .map((name) => path.join(BACKUPS_DIR, name))
      .filter((dirPath) => fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory());

  const backups: StoredServerBackup[] = [];

  for (const dirPath of serverDirs) {
    if (!fs.existsSync(dirPath)) {
      continue;
    }

    for (const entry of fs.readdirSync(dirPath)) {
      if (!entry.endsWith('.json')) {
        continue;
      }

      const metaPath = path.join(dirPath, entry);

      try {
        const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as StoredServerBackup;
        const archivePath = getServerBackupPath(parsed.serverId, parsed.fileName);
        const archiveExists = fs.existsSync(archivePath);

        if (!archiveExists && parsed.status === 'completed') {
          continue;
        }

        backups.push({
          ...parsed,
          sizeBytes: archiveExists ? fs.statSync(archivePath).size : parsed.sizeBytes,
          filePath: archiveExists ? archivePath : parsed.filePath,
        });
      } catch {
        // ignore broken metadata
      }
    }
  }

  return backups.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function hasRunningServerBackup(serverId: number): boolean {
  return listServerBackups(serverId).some((backup) => backup.status === 'running');
}

export function deleteServerBackup(serverId: number, fileName: string) {
  const archivePath = getServerBackupPath(serverId, fileName);
  const metaPath = getServerBackupMetaPath(serverId, fileName);

  if (fs.existsSync(archivePath)) {
    fs.rmSync(archivePath, { force: true });
  }

  if (fs.existsSync(metaPath)) {
    fs.rmSync(metaPath, { force: true });
  }
}

export function purgeExpiredServerBackups(retentionDays = DEFAULT_BACKUP_RETENTION_DAYS): number {
  if (!fs.existsSync(BACKUPS_DIR)) {
    return 0;
  }

  const cutoffTime = Date.now() - Math.max(1, retentionDays) * 24 * 60 * 60 * 1000;
  let deletedCount = 0;

  for (const serverDirEntry of fs.readdirSync(BACKUPS_DIR)) {
    const serverDirPath = path.join(BACKUPS_DIR, serverDirEntry);
    if (!fs.existsSync(serverDirPath) || !fs.statSync(serverDirPath).isDirectory()) {
      continue;
    }

    for (const entry of fs.readdirSync(serverDirPath)) {
      if (!entry.endsWith('.json')) {
        continue;
      }

      const metaPath = path.join(serverDirPath, entry);

      try {
        const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as StoredServerBackup;
        const createdAtTime = Date.parse(parsed.createdAt);
        if (!Number.isFinite(createdAtTime) || createdAtTime > cutoffTime) {
          continue;
        }

        deleteServerBackup(parsed.serverId, parsed.fileName);
        deletedCount += 1;
      } catch {
        // ignore broken metadata files during retention cleanup
      }
    }
  }

  return deletedCount;
}

export function initializeServerBackup(options: CreateServerBackupOptions): StoredServerBackup {
  const { serverId, serverName, sites, mode } = options;
  const createdAt = new Date().toISOString();
  const timestamp = createdAt.replace(/[:.]/g, '-');
  const safeServerName = sanitizeFileSegment(serverName);
  const fileName = `${safeServerName}-${mode}-${timestamp}.tar.gz`;
  const localDir = getServerBackupDir(serverId);
  const localFilePath = path.join(localDir, fileName);

  fs.mkdirSync(localDir, { recursive: true });

  const backup: StoredServerBackup = {
    success: true,
    fileName,
    filePath: localFilePath,
    downloadPath: `/api/servers/${serverId}/backups/${encodeURIComponent(fileName)}`,
    siteCount: sites.length,
    sizeBytes: 0,
    createdAt,
    mode,
    serverId,
    serverName,
    sites: sites.map((site) => site.domain),
    status: 'running',
    stage: 'Подготовка',
    errorMessage: null,
  };

  persistBackupMetadata(backup);
  return backup;
}

export async function createServerBackup(backup: StoredServerBackup, options: CreateServerBackupOptions): Promise<CreatedServerBackup> {
  const { serverId, server, sites } = options;

  if (sites.length === 0) {
    throw new Error('На сервере нет сайтов для архивации');
  }

  const localFilePath = backup.filePath;
  const remoteArchivePath = `/tmp/site-factory-backup-${serverId}-${Date.now()}.tar.gz`;
  const remoteStageDir = `/tmp/site-factory-backup-stage-${serverId}-${Date.now()}`;

  const conn = await createSSHConnection(server);

  try {
    backup = updateBackupMetadata(backup, {
      status: 'running',
      stage: 'Сбор файлов на сервере',
      errorMessage: null,
    });
    await executeSSHCommandWithConnection(conn, buildRemoteBackupCommand(remoteArchivePath, remoteStageDir, sites));

    backup = updateBackupMetadata(backup, {
      status: 'running',
      stage: 'Скачивание архива',
      errorMessage: null,
    });
    const downloadResult = await downloadRemoteArchive(conn, remoteArchivePath, localFilePath);

    if (downloadResult.method === 'ssh-stream') {
      backup = updateBackupMetadata(backup, {
        status: 'running',
        stage: 'Архив скачан по SSH без SFTP',
        errorMessage: null,
      });
    }
  } finally {
    try {
      await executeSSHCommandWithConnection(
        conn,
        `rm -rf ${shellEscape(remoteStageDir)}; rm -f ${shellEscape(remoteArchivePath)}`,
      );
    } catch {
      // ignore cleanup failures on remote host
    }
    conn.end();
  }

  const stat = fs.statSync(localFilePath);

  return updateBackupMetadata(backup, {
    status: 'completed',
    stage: 'Готово',
    sizeBytes: stat.size,
    errorMessage: null,
  });
}

export function markServerBackupError(backup: StoredServerBackup, errorMessage: string): StoredServerBackup {
  return updateBackupMetadata(backup, {
    status: 'error',
    stage: 'Ошибка',
    errorMessage,
  });
}
