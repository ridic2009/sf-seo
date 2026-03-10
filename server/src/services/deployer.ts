import { Client as SSHClient } from 'ssh2';
import AdmZip from 'adm-zip';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { PassThrough } from 'stream';

export interface ServerConnectionConfig {
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'key';
  password?: string;
  privateKey?: string;
}

export interface DeployOptions {
  localDir: string;
  remoteDir: string;
  server: ServerConnectionConfig;
  onProgress?: (event: DeployProgressEvent) => void;
}

export interface DeployProgressEvent {
  phase: 'upload' | 'extract' | 'info';
  message: string;
  percent?: number;
  transferredBytes?: number;
  totalBytes?: number;
  processedEntries?: number;
  totalEntries?: number;
  method?: 'sftp-zip' | 'base64-zip' | 'tar' | 'base64-files';
}

interface LocalTransferStats {
  totalBytes: number;
  totalFiles: number;
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function executeSSHCommandWithConnection(
  conn: SSHClient,
  command: string,
  handlers?: {
    onStdoutLine?: (line: string) => void;
    onStdoutChunk?: (chunk: string) => void;
    onStderrChunk?: (chunk: string) => void;
  },
): Promise<string> {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }

      let output = '';
      let errorOutput = '';
      let stdoutBuffer = '';

      const flushStdoutLines = (force = false) => {
        const normalized = stdoutBuffer.replace(/\r/g, '\n');
        const lines = normalized.split('\n');
        stdoutBuffer = force ? '' : (lines.pop() ?? '');

        for (const line of force ? lines.filter((value, index) => !(index === lines.length - 1 && value === '')) : lines) {
          if (line.length > 0) {
            handlers?.onStdoutLine?.(line);
          }
        }
      };

      stream.on('data', (data: Buffer) => {
        const chunk = data.toString();
        output += chunk;
        stdoutBuffer += chunk;
        handlers?.onStdoutChunk?.(chunk);
        flushStdoutLines();
      });
      stream.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString();
        errorOutput += chunk;
        handlers?.onStderrChunk?.(chunk);
      });
      stream.on('close', (code: number | undefined) => {
        flushStdoutLines(true);
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

function buildRemoteZipExtractCommand(archivePath: string, remoteDir: string): string {
  const pythonExtractSnippet = [
    'import os',
    'import sys',
    'import zipfile',
    'archive_path = sys.argv[1]',
    'target_dir = sys.argv[2]',
    'os.makedirs(target_dir, exist_ok=True)',
    'with zipfile.ZipFile(archive_path) as archive:',
    '    entries = archive.infolist()',
    '    total = len(entries) or 1',
    '    for index, entry in enumerate(entries, 1):',
    '        archive.extract(entry, target_dir)',
    "        print(f'__SF_EXTRACT_PROGRESS__|{index}|{total}|{entry.filename}', flush=True)",
  ].join('\n');

  return [
    `trap 'rm -f ${shellEscape(archivePath)}' EXIT`,
    `mkdir -p ${shellEscape(remoteDir)}`,
    'if command -v python3 >/dev/null 2>&1; then',
    `python3 - ${shellEscape(archivePath)} ${shellEscape(remoteDir)} <<'__SF_PY__'`,
    pythonExtractSnippet,
    '__SF_PY__',
    'elif command -v python >/dev/null 2>&1; then',
    `python - ${shellEscape(archivePath)} ${shellEscape(remoteDir)} <<'__SF_PY__'`,
    pythonExtractSnippet,
    '__SF_PY__',
    'elif command -v unzip >/dev/null 2>&1; then',
    "echo '__SF_EXTRACT_PROGRESS__|0|1|start'",
    `unzip -oq ${shellEscape(archivePath)} -d ${shellEscape(remoteDir)}`,
    "echo '__SF_EXTRACT_PROGRESS__|1|1|done'",
    'else',
    "echo '__SF_ZIP_UNSUPPORTED__' >&2",
    'exit 127',
    'fi',
  ].join('\n');
}

function createTempZipArchive(localDir: string): string {
  const tempZipPath = path.join(os.tmpdir(), `site-factory-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
  const archive = new AdmZip();
  archive.addLocalFolder(localDir);
  archive.writeZip(tempZipPath);
  return tempZipPath;
}

function collectLocalTransferStats(localDir: string): LocalTransferStats {
  let totalBytes = 0;
  let totalFiles = 0;

  const walk = (dirPath: string) => {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      const stats = fs.statSync(fullPath);
      totalBytes += stats.size;
      totalFiles += 1;
    }
  };

  walk(localDir);

  return { totalBytes, totalFiles };
}

async function uploadSingleFileViaSftp(
  conn: SSHClient,
  localFilePath: string,
  remoteFilePath: string,
  progress?: (event: DeployProgressEvent) => void,
): Promise<void> {
  await executeSSHCommandWithConnection(conn, `mkdir -p ${shellEscape(path.posix.dirname(remoteFilePath))}`);

  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) {
        reject(err);
        return;
      }

      sftp.fastPut(localFilePath, remoteFilePath, {
        step: (transferred: number, _chunk: number, total: number) => {
          progress?.({
            phase: 'upload',
            message: 'Передача архива на сервер',
            percent: total > 0 ? Math.min(100, Math.round((transferred / total) * 100)) : undefined,
            transferredBytes: transferred,
            totalBytes: total,
            method: 'sftp-zip',
          });
        },
      }, (putErr) => {
        if (putErr) {
          reject(putErr);
          return;
        }

        resolve();
      });
    });
  });
}

function createRemoteTempArchivePath(): string {
  return `/tmp/.site-factory-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`;
}

async function uploadDirectoryViaZip(
  conn: SSHClient,
  localDir: string,
  remoteDir: string,
  progress?: (event: DeployProgressEvent) => void,
): Promise<void> {
  const localArchivePath = createTempZipArchive(localDir);
  const remoteArchivePath = createRemoteTempArchivePath();

  try {
    const archiveSize = fs.statSync(localArchivePath).size;
    progress?.({
      phase: 'info',
      message: `Архив собран локально (${archiveSize} байт), начинаю отправку`,
      method: 'sftp-zip',
    });
    await executeSSHCommandWithConnection(conn, `mkdir -p ${shellEscape(remoteDir)}`);
    await uploadSingleFileViaSftp(conn, localArchivePath, remoteArchivePath, progress);
    progress?.({
      phase: 'extract',
      message: 'Архив загружен, начинаю распаковку на сервере',
      percent: 0,
      processedEntries: 0,
      totalEntries: 1,
      method: 'sftp-zip',
    });
    await executeSSHCommandWithConnection(conn, buildRemoteZipExtractCommand(remoteArchivePath, remoteDir), {
      onStdoutLine: (line) => {
        if (!line.startsWith('__SF_EXTRACT_PROGRESS__|')) {
          return;
        }

        const [, processedRaw, totalRaw, entryName] = line.split('|');
        const processedEntries = Number(processedRaw);
        const totalEntries = Number(totalRaw);
        const percent = totalEntries > 0 ? Math.min(100, Math.round((processedEntries / totalEntries) * 100)) : undefined;

        progress?.({
          phase: 'extract',
          message: entryName ? `Распаковка: ${entryName}` : 'Распаковка архива',
          percent,
          processedEntries,
          totalEntries,
          method: 'sftp-zip',
        });
      },
    });
  } finally {
    fs.rmSync(localArchivePath, { force: true });
  }
}

async function uploadDirectoryViaTar(
  conn: SSHClient,
  localDir: string,
  remoteDir: string,
  progress?: (event: DeployProgressEvent) => void,
): Promise<void> {
  await executeSSHCommandWithConnection(conn, `mkdir -p ${shellEscape(remoteDir)}`);

  return new Promise((resolve, reject) => {
    conn.exec(`sh -lc ${shellEscape(`tar -xzf - -C ${remoteDir}; status=$?; echo __SF_TAR_DONE__:$status; exit $status`)}`, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }

      const tar = spawn('tar', ['-czf', '-', '-C', localDir, '.'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let localError = '';
      let remoteError = '';
      const { totalBytes, totalFiles } = collectLocalTransferStats(localDir);
      let transferredBytes = 0;
      let lastPercent = -10;
      const progressStream = new PassThrough();
      let stdoutBuffer = '';
      let localTarCompleted = false;
      let remoteCompleted = false;
      let settled = false;

      const rejectOnce = (error: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        reject(error);
      };

      const resolveIfCompleted = () => {
        if (settled || !localTarCompleted || !remoteCompleted) {
          return;
        }

        settled = true;
        resolve();
      };

      progress?.({
        phase: 'info',
        message: `Перехожу на tar-поток по SSH (${totalFiles} файлов)`,
        method: 'tar',
      });

      progressStream.on('data', (chunk: Buffer) => {
        transferredBytes += chunk.length;
        const percent = totalBytes > 0 ? Math.min(100, Math.round((transferredBytes / totalBytes) * 100)) : undefined;

        if (percent == null || percent >= 100 || percent - lastPercent >= 10) {
          if (percent != null) {
            lastPercent = percent;
          }

          progress?.({
            phase: 'upload',
            message: 'Передача файлов на сервер по tar-потоку',
            percent,
            transferredBytes,
            totalBytes,
            method: 'tar',
          });
        }
      });

      progressStream.on('end', () => {
        progress?.({
          phase: 'extract',
          message: 'Tar-поток полностью передан, завершаю распаковку на сервере',
          percent: 100,
          processedEntries: totalFiles,
          totalEntries: totalFiles,
          method: 'tar',
        });
      });

      tar.stdout.pipe(progressStream).pipe(stream);

      stream.on('data', (data: Buffer) => {
        stdoutBuffer += data.toString();

        let newlineIndex = stdoutBuffer.indexOf('\n');
        while (newlineIndex !== -1) {
          const line = stdoutBuffer.slice(0, newlineIndex).trim();
          stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);

          if (line.startsWith('__SF_TAR_DONE__:')) {
            const code = Number(line.split(':')[1]);
            progress?.({
              phase: 'info',
              message: `Диагностика tar: удалённая команда завершилась с кодом ${Number.isNaN(code) ? 'NaN' : code}`,
              method: 'tar',
            });

            if (Number.isNaN(code) || code !== 0) {
              rejectOnce(new Error(remoteError || `Remote tar extract failed with exit code ${line.split(':')[1]}`));
              return;
            }

            remoteCompleted = true;
            resolveIfCompleted();
          }

          newlineIndex = stdoutBuffer.indexOf('\n');
        }
      });

      tar.stderr.on('data', (data: Buffer) => {
        localError += data.toString();
      });
      tar.stdout.on('close', () => {
        progress?.({
          phase: 'info',
          message: 'Диагностика tar: локальный tar stdout закрыт',
          method: 'tar',
        });
      });
      stream.stderr.on('data', (data: Buffer) => {
        remoteError += data.toString();
      });
      stream.on('finish', () => {
        progress?.({
          phase: 'info',
          message: 'Диагностика tar: SSH-канал записи завершил отправку stdin',
          method: 'tar',
        });
      });

      tar.on('error', (spawnError) => {
        rejectOnce(new Error(`Failed to start tar: ${spawnError.message}`));
      });

      tar.on('close', (code: number | null) => {
        progress?.({
          phase: 'info',
          message: `Диагностика tar: локальный tar завершился с кодом ${code ?? 'null'}`,
          method: 'tar',
        });
        if (code && code !== 0) {
          rejectOnce(new Error(localError || `Local tar pack failed with exit code ${code}`));
          return;
        }

        localTarCompleted = true;
        resolveIfCompleted();
      });

      stream.on('exit', (code: number | undefined) => {
        progress?.({
          phase: 'info',
          message: `Диагностика tar: удалённый tar exit code ${code ?? 'undefined'}`,
          method: 'tar',
        });
        if (localError) {
          rejectOnce(new Error(localError));
          return;
        }
        if (code && code !== 0) {
          rejectOnce(new Error(remoteError || `Remote tar extract failed with exit code ${code}`));
          return;
        }
      });

      stream.on('close', () => {
        progress?.({
          phase: 'info',
          message: 'Диагностика tar: SSH-канал tar полностью закрыт',
          method: 'tar',
        });
        if (localError) {
          rejectOnce(new Error(localError));
          return;
        }
        if (!remoteCompleted && remoteError) {
          rejectOnce(new Error(remoteError));
          return;
        }
        resolveIfCompleted();
      });
    });
  });
}

async function uploadFileViaBase64(
  conn: SSHClient,
  localFilePath: string,
  remoteFilePath: string,
  progress?: (event: DeployProgressEvent) => void,
  method: 'base64-zip' | 'base64-files' = 'base64-zip',
): Promise<void> {
  const base64Content = fs.readFileSync(localFilePath).toString('base64');
  await executeSSHCommandWithConnection(conn, `mkdir -p ${shellEscape(path.posix.dirname(remoteFilePath))}`);

  return new Promise((resolve, reject) => {
    conn.exec(`base64 -d > ${shellEscape(remoteFilePath)}`, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }

      let errorOutput = '';
      let offset = 0;
      const chunkSize = 256 * 1024;
      let lastPercent = -10;

      const writeNextChunk = () => {
        while (offset < base64Content.length) {
          const nextOffset = Math.min(base64Content.length, offset + chunkSize);
          const chunk = base64Content.slice(offset, nextOffset);
          offset = nextOffset;

          const percent = base64Content.length > 0 ? Math.min(100, Math.round((offset / base64Content.length) * 100)) : undefined;
          if (percent == null || percent >= 100 || percent - lastPercent >= 10) {
            if (percent != null) {
              lastPercent = percent;
            }

            progress?.({
              phase: 'upload',
              message: method === 'base64-zip' ? 'Передача zip через base64' : 'Передача файлов через base64',
              percent,
              transferredBytes: offset,
              totalBytes: base64Content.length,
              method,
            });
          }

          if (!stream.write(chunk)) {
            return;
          }
        }

        stream.end();
      };

      stream.on('drain', writeNextChunk);
      stream.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });
      stream.on('close', (code: number | undefined) => {
        if (code && code !== 0) {
          reject(new Error(errorOutput || `Remote upload failed with exit code ${code}`));
          return;
        }
        if (errorOutput) {
          reject(new Error(errorOutput));
          return;
        }
        resolve();
      });

      writeNextChunk();
    });
  });
}

async function uploadDirectoryViaZipBase64(
  conn: SSHClient,
  localDir: string,
  remoteDir: string,
  progress?: (event: DeployProgressEvent) => void,
): Promise<void> {
  const localArchivePath = createTempZipArchive(localDir);
  const remoteArchivePath = createRemoteTempArchivePath();

  try {
    progress?.({
      phase: 'info',
      message: 'SFTP недоступен, перехожу на загрузку zip через base64',
      method: 'base64-zip',
    });
    await executeSSHCommandWithConnection(conn, `mkdir -p ${shellEscape(remoteDir)}`);
    await uploadFileViaBase64(conn, localArchivePath, remoteArchivePath, progress, 'base64-zip');
    progress?.({
      phase: 'extract',
      message: 'Zip через base64 загружен, начинаю распаковку на сервере',
      percent: 0,
      processedEntries: 0,
      totalEntries: 1,
      method: 'base64-zip',
    });
    await executeSSHCommandWithConnection(conn, buildRemoteZipExtractCommand(remoteArchivePath, remoteDir), {
      onStdoutLine: (line) => {
        if (!line.startsWith('__SF_EXTRACT_PROGRESS__|')) {
          return;
        }

        const [, processedRaw, totalRaw, entryName] = line.split('|');
        const processedEntries = Number(processedRaw);
        const totalEntries = Number(totalRaw);
        const percent = totalEntries > 0 ? Math.min(100, Math.round((processedEntries / totalEntries) * 100)) : undefined;

        progress?.({
          phase: 'extract',
          message: entryName ? `Распаковка: ${entryName}` : 'Распаковка архива',
          percent,
          processedEntries,
          totalEntries,
          method: 'base64-zip',
        });
      },
    });
  } finally {
    fs.rmSync(localArchivePath, { force: true });
  }
}

async function uploadDirectoryViaBase64(
  conn: SSHClient,
  localDir: string,
  remoteDir: string,
  progress?: (event: DeployProgressEvent) => void,
): Promise<void> {
  await executeSSHCommandWithConnection(conn, `mkdir -p ${shellEscape(remoteDir)}`);

  const entries = fs.readdirSync(localDir, { withFileTypes: true });
  for (const entry of entries) {
    const localFilePath = path.join(localDir, entry.name);
    const remoteFilePath = `${remoteDir}/${entry.name}`;

    if (entry.isDirectory()) {
      await uploadDirectoryViaBase64(conn, localFilePath, remoteFilePath, progress);
    } else {
      await uploadFileViaBase64(conn, localFilePath, remoteFilePath, progress, 'base64-files');
    }
  }
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

async function diagnoseSftpFailure(server: ServerConnectionConfig): Promise<string> {
  try {
    const output = await executeSSHCommand(
      server,
      [
        "grep -R '^Subsystem' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/* 2>/dev/null || true",
        "echo ---",
        "ls -l /usr/lib/openssh /usr/libexec/openssh /usr/lib/ssh 2>/dev/null || true",
      ].join('; '),
    );

    if (output.includes('internal-sftp-server')) {
      return 'В sshd_config указан некорректный Subsystem: internal-sftp-server. Для OpenSSH нужен internal-sftp. Исправьте строку Subsystem sftp internal-sftp и перезапустите sshd.';
    }

    if (output.includes('sftp-server') || output.toLowerCase().includes('internal-sftp')) {
      return 'SFTP subsystem announced by sshd, but session startup still fails. Частая причина: shell init-скрипты печатают текст при входе по SSH или завершаются с ошибкой.';
    }

    return 'SFTP subsystem недоступен или настроен некорректно в sshd_config. Проверьте Subsystem sftp и наличие sftp-server/internal-sftp на сервере.';
  } catch {
    return 'Не удалось диагностировать SFTP subsystem автоматически. Проверьте настройки sshd и shell init-скрипты пользователя.';
  }
}

export async function clearRemoteDirectory(
  server: ServerConnectionConfig,
  remoteDir: string,
): Promise<void> {
  const conn = await createSSHConnection(server);

  try {
    await executeSSHCommandWithConnection(
      conn,
      [
        `mkdir -p ${shellEscape(remoteDir)}`,
        `find ${shellEscape(remoteDir)} -mindepth 1 -maxdepth 1 ! -name '.well-known' -exec rm -rf -- {} +`,
      ].join(' && '),
    );
  } finally {
    conn.end();
  }
}

export async function syncRemoteOwnership(
  server: ServerConnectionConfig,
  remoteDir: string,
  owner: string,
): Promise<void> {
  const normalizedOwner = owner.trim();
  if (!normalizedOwner) {
    return;
  }

  const conn = await createSSHConnection(server);

  try {
    await executeSSHCommandWithConnection(
      conn,
      [
        `if [ -d ${shellEscape(remoteDir)} ]; then chown -R ${shellEscape(normalizedOwner)}:${shellEscape(normalizedOwner)} ${shellEscape(remoteDir)}; fi`,
      ].join(' && '),
    );
  } finally {
    conn.end();
  }
}

export async function executeSSHCommand(
  server: ServerConnectionConfig,
  command: string,
): Promise<string> {
  const conn = await createSSHConnection(server);
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) {
        conn.end();
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
      stream.on('close', () => {
        conn.end();
        if (errorOutput && !output) reject(new Error(errorOutput));
        else resolve(output);
      });
    });
  });
}

export async function uploadDirectory(options: DeployOptions): Promise<void> {
  const { localDir, remoteDir, server, onProgress } = options;
  const conn = await createSSHConnection(server);

  try {
    onProgress?.({ phase: 'info', message: 'Пробую основной способ загрузки: SFTP + zip', method: 'sftp-zip' });
    await uploadDirectoryViaZip(conn, localDir, remoteDir, onProgress);
    conn.end();
    return;
  } catch (zipError: any) {
    conn.end();

    const fallbackConn = await createSSHConnection(server).catch(async () => {
      const details = await diagnoseSftpFailure(server);
      throw new Error(`Не удалось открыть SSH-соединение для fallback загрузки. ${details}`);
    });

    try {
      try {
        onProgress?.({ phase: 'info', message: 'SFTP не поднялся, сразу пробую tar-поток по SSH', method: 'tar' });
        await uploadDirectoryViaTar(fallbackConn, localDir, remoteDir, onProgress);
        fallbackConn.end();
        return;
      } catch (tarError: any) {
        try {
          await uploadDirectoryViaZipBase64(fallbackConn, localDir, remoteDir, onProgress);
          fallbackConn.end();
          return;
        } catch (zipBase64Error: any) {
          try {
            onProgress?.({ phase: 'info', message: 'Tar-поток не удался, пробую пофайловую base64-загрузку', method: 'base64-files' });
            await uploadDirectoryViaBase64(fallbackConn, localDir, remoteDir, onProgress);
            fallbackConn.end();
            return;
          } catch (base64Error: any) {
            fallbackConn.end();
            const details = await diagnoseSftpFailure(server);
            throw new Error(
              `Zip deploy failed: ${zipError.message}. Tar fallback failed: ${tarError.message}. Zip base64 fallback failed: ${zipBase64Error.message}. Base64 fallback failed: ${base64Error.message}. ${details}`,
            );
          }
        }
      }
    } catch (error) {
      throw error;
    }
  }
}
