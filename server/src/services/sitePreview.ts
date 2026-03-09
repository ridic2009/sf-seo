import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_PREVIEWS_DIR = path.resolve(__dirname, '../../data/previews/sites');

export interface SitePreviewTarget {
  id: number;
  domain: string;
}

export interface SitePreviewMeta {
  statusCode: number | null;
  capturedAt: string;
  finalUrl: string;
  errorMessage: string | null;
}

interface SiteProbeResult {
  statusCode: number | null;
  finalUrl: string;
  errorMessage: string | null;
}

interface BrowserLaunchDetails {
  executablePath: string;
  env: Record<string, string | undefined>;
  userDataDir: string;
}

function ensurePreviewDir() {
  fs.mkdirSync(SITE_PREVIEWS_DIR, { recursive: true });
}

function getPreviewImagePath(siteId: number) {
  ensurePreviewDir();
  return path.join(SITE_PREVIEWS_DIR, `${siteId}.png`);
}

function getPreviewMetaPath(siteId: number) {
  ensurePreviewDir();
  return path.join(SITE_PREVIEWS_DIR, `${siteId}.json`);
}

export function getSitePreviewImagePath(siteId: number) {
  return getPreviewImagePath(siteId);
}

export function readSitePreviewMeta(siteId: number): SitePreviewMeta | null {
  const metaPath = getPreviewMetaPath(siteId);
  if (!fs.existsSync(metaPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as SitePreviewMeta;
  } catch {
    return null;
  }
}

function getBrowserExecutableCandidates(): string[] {
  const candidates = process.platform === 'win32'
    ? [
        path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(process.env.PROGRAMFILES || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ]
    : [
        '/usr/bin/microsoft-edge',
        '/usr/bin/microsoft-edge-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/opt/google/chrome/chrome',
        '/opt/microsoft/msedge/msedge',
        '/snap/chromium/current/usr/lib/chromium-browser/chrome',
        '/var/lib/snapd/snap/chromium/current/usr/lib/chromium-browser/chrome',
        '/usr/lib/chromium/chromium',
        '/usr/lib/chromium/chrome',
        '/usr/lib/chromium-browser/chromium-browser',
        '/usr/lib/chromium-browser/chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium',
      ];

  const configuredPath = process.env.SITE_PREVIEW_BROWSER_PATH;
  const orderedCandidates = configuredPath ? [configuredPath, ...candidates] : candidates;
  return orderedCandidates.filter((candidate, index, list) => candidate && fs.existsSync(candidate) && list.indexOf(candidate) === index);
}

function ensureDirectory(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function resolveRuntimeDir() {
  const runtimeDirFromEnv = process.env.XDG_RUNTIME_DIR;
  if (runtimeDirFromEnv && fs.existsSync(runtimeDirFromEnv)) {
    return runtimeDirFromEnv;
  }

  if (typeof process.getuid === 'function') {
    const systemRuntimeDir = `/run/user/${process.getuid()}`;
    if (fs.existsSync(systemRuntimeDir)) {
      return systemRuntimeDir;
    }
  }

  const fallbackRuntimeDir = path.join(os.tmpdir(), `site-factory-runtime-${process.pid}`);
  ensureDirectory(fallbackRuntimeDir);
  fs.chmodSync(fallbackRuntimeDir, 0o700);
  return fallbackRuntimeDir;
}

function createBrowserLaunchDetails(executablePath: string): BrowserLaunchDetails {
  const homeDir = process.env.HOME || os.homedir();
  const cacheDir = ensureDirectory(process.env.XDG_CACHE_HOME || path.join(homeDir, '.cache'));
  const configDir = ensureDirectory(process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config'));
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-factory-preview-browser-'));

  return {
    executablePath,
    env: {
      ...process.env,
      HOME: homeDir,
      XDG_CACHE_HOME: cacheDir,
      XDG_CONFIG_HOME: configDir,
      XDG_RUNTIME_DIR: resolveRuntimeDir(),
    },
    userDataDir,
  };
}

function withPreviewMeta(error: Error, previewMeta: SitePreviewMeta) {
  Object.assign(error, { previewMeta });
  return error;
}

async function requestSite(url: string) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });

  return {
    statusCode: response.status,
    finalUrl: response.url || url,
    errorMessage: null,
  } satisfies SiteProbeResult;
}

export async function probeSitePreviewTarget(domain: string): Promise<SiteProbeResult> {
  const httpsUrl = `https://${domain}`;

  try {
    return await requestSite(httpsUrl);
  } catch (httpsError: any) {
    const httpUrl = `http://${domain}`;
    try {
      return await requestSite(httpUrl);
    } catch (httpError: any) {
      return {
        statusCode: null,
        finalUrl: httpUrl,
        errorMessage: httpError?.message || httpsError?.message || 'Unknown error',
      };
    }
  }
}

async function writePreviewFiles(siteId: number, meta: SitePreviewMeta, screenshotBuffer: Buffer) {
  fs.writeFileSync(getPreviewImagePath(siteId), screenshotBuffer);
  fs.writeFileSync(getPreviewMetaPath(siteId), JSON.stringify(meta, null, 2), 'utf-8');
}

export async function captureSitePreview(target: SitePreviewTarget): Promise<SitePreviewMeta> {
  const probe = await probeSitePreviewTarget(target.domain);
  const baseMeta: SitePreviewMeta = {
    statusCode: probe.statusCode,
    capturedAt: new Date().toISOString(),
    finalUrl: probe.finalUrl,
    errorMessage: probe.errorMessage,
  };

  const browserCandidates = getBrowserExecutableCandidates();
  if (browserCandidates.length === 0) {
    throw withPreviewMeta(
      new Error('Не найден локальный браузер для снятия превью. Укажите SITE_PREVIEW_BROWSER_PATH или установите Edge/Chrome.'),
      baseMeta,
    );
  }

  let browser: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | null = null;
  let launchDetails: BrowserLaunchDetails | null = null;
  const launchErrors: string[] = [];

  for (const browserPath of browserCandidates) {
    const currentLaunchDetails = createBrowserLaunchDetails(browserPath);

    try {
      browser = await chromium.launchPersistentContext(currentLaunchDetails.userDataDir, {
        executablePath: browserPath,
        headless: true,
        env: currentLaunchDetails.env,
        viewport: { width: 1440, height: 900 },
        ignoreHTTPSErrors: true,
        deviceScaleFactor: 1,
        args: [
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--ignore-certificate-errors',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--no-zygote',
        ],
      });
      launchDetails = currentLaunchDetails;
      break;
    } catch (error: any) {
      launchErrors.push(`${browserPath}: ${error?.message || 'launch failed'}`);
      fs.rmSync(currentLaunchDetails.userDataDir, { recursive: true, force: true });
    }
  }

  if (!browser || !launchDetails) {
    throw withPreviewMeta(
      new Error(`Не удалось запустить браузер для генерации превью. Проверены пути: ${launchErrors.join(' | ')}`),
      baseMeta,
    );
  }

  const page = browser.pages()[0] || await browser.newPage();
  let statusCode: number | null = baseMeta.statusCode;
  let errorMessage: string | null = baseMeta.errorMessage;
  let finalUrl = baseMeta.finalUrl;

  try {
    let response = null;

    try {
      response = await page.goto(finalUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    } catch (navigationError: any) {
      errorMessage = navigationError?.message || errorMessage || 'Navigation failed';
    }

    if (response) {
      statusCode = response.status();
      finalUrl = page.url();
      try {
        await page.waitForLoadState('networkidle', { timeout: 5000 });
      } catch {
        // Best-effort wait only.
      }
    } else {
      await page.setContent(
        `<html><body style="margin:0;font-family:Segoe UI,Arial,sans-serif;background:#0f172a;color:#e5e7eb;display:flex;align-items:center;justify-content:center;height:100vh;"><div style="max-width:760px;padding:32px;border:1px solid rgba(148,163,184,.25);border-radius:20px;background:rgba(15,23,42,.88)"><div style="font-size:14px;color:#94a3b8;text-transform:uppercase;letter-spacing:.18em">Site Preview</div><h1 style="margin:12px 0 8px;font-size:34px">${target.domain}</h1><p style="margin:0 0 16px;color:#cbd5e1">Не удалось получить ответ от сайта во время автоматической проверки.</p><pre style="white-space:pre-wrap;color:#fca5a5;font-size:14px">${errorMessage || 'Unknown error'}</pre></div></body></html>`,
        { waitUntil: 'domcontentloaded' },
      );
    }

    const screenshotBuffer = await page.screenshot({ type: 'png', fullPage: true });
    const meta: SitePreviewMeta = {
      statusCode,
      capturedAt: new Date().toISOString(),
      finalUrl,
      errorMessage,
    };

    await writePreviewFiles(target.id, meta, screenshotBuffer);
    return meta;
  } finally {
    await browser.close();
    if (launchDetails) {
      fs.rmSync(launchDetails.userDataDir, { recursive: true, force: true });
    }
  }
}