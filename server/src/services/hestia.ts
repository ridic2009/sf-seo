import { ServerConnectionConfig, executeSSHCommand } from './deployer.js';

export interface HestiaDomainProbeResult {
  exists: boolean;
  diagnostics: string[];
}

interface WaitForHestiaDomainOptions {
  attempts?: number;
  delayMs?: number;
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `"'"'`)}'`;
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export async function probeHestiaDomain(
  conn: ServerConnectionConfig,
  panelUser: string,
  domain: string,
): Promise<HestiaDomainProbeResult> {
  const configPath = `/usr/local/hestia/data/users/${panelUser}/web/${domain}.conf`;
  const domainDir = `/home/${panelUser}/web/${domain}`;
  const command = [
    'if command -v v-list-web-domain >/dev/null 2>&1; then',
    `  v-list-web-domain ${shellEscape(panelUser)} ${shellEscape(domain)} 2>&1 || true`,
    'elif [ -x /usr/local/hestia/bin/v-list-web-domain ]; then',
    `  /usr/local/hestia/bin/v-list-web-domain ${shellEscape(panelUser)} ${shellEscape(domain)} 2>&1 || true`,
    'else',
    "  echo '__SF_HST_CMD_MISSING__'",
    'fi',
    `[ -f ${shellEscape(configPath)} ] && echo '__SF_HST_CONF__'`,
    `[ -d ${shellEscape(domainDir)} ] && echo '__SF_HST_WEB_DIR__'`,
  ].join('\n');

  const output = await executeSSHCommand(conn, command);
  const diagnostics = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const hasConfig = diagnostics.includes('__SF_HST_CONF__');
  const hasDomainDir = diagnostics.includes('__SF_HST_WEB_DIR__');
  const cliLines = diagnostics.filter((line) => !line.startsWith('__SF_HST_'));
  const cliFailed = cliLines.some((line) => line.startsWith('Error:'));
  const cliSucceeded = cliLines.length > 0 && !cliFailed;

  return {
    exists: hasConfig || hasDomainDir || cliSucceeded,
    diagnostics,
  };
}

export async function waitForHestiaDomain(
  conn: ServerConnectionConfig,
  panelUser: string,
  domain: string,
  options: WaitForHestiaDomainOptions = {},
): Promise<HestiaDomainProbeResult> {
  const attempts = Math.max(1, options.attempts ?? 5);
  const delayMs = Math.max(0, options.delayMs ?? 1500);
  let lastResult: HestiaDomainProbeResult | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    lastResult = await probeHestiaDomain(conn, panelUser, domain);
    if (lastResult.exists) {
      return lastResult;
    }

    if (attempt < attempts && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return lastResult ?? { exists: false, diagnostics: [] };
}