import fs from 'fs';
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

function findBrowserExecutable(): string | null {
  if (process.env.SITE_PREVIEW_BROWSER_PATH && fs.existsSync(process.env.SITE_PREVIEW_BROWSER_PATH)) {
    return process.env.SITE_PREVIEW_BROWSER_PATH;
  }

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
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium',
      ];

  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

async function writePreviewFiles(siteId: number, meta: SitePreviewMeta, screenshotBuffer: Buffer) {
  fs.writeFileSync(getPreviewImagePath(siteId), screenshotBuffer);
  fs.writeFileSync(getPreviewMetaPath(siteId), JSON.stringify(meta, null, 2), 'utf-8');
}

export async function captureSitePreview(target: SitePreviewTarget): Promise<SitePreviewMeta> {
  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    throw new Error('Не найден локальный браузер для снятия превью. Укажите SITE_PREVIEW_BROWSER_PATH или установите Edge/Chrome.');
  }

  const browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
    args: ['--disable-dev-shm-usage', '--disable-gpu', '--ignore-certificate-errors', '--no-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();
  let statusCode: number | null = null;
  let errorMessage: string | null = null;
  let finalUrl = `https://${target.domain}`;

  try {
    let response = null;

    try {
      response = await page.goto(finalUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    } catch (httpsError: any) {
      errorMessage = httpsError?.message || 'HTTPS request failed';
      finalUrl = `http://${target.domain}`;
      try {
        response = await page.goto(finalUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
        errorMessage = null;
      } catch (httpError: any) {
        errorMessage = httpError?.message || errorMessage;
      }
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
    await context.close();
    await browser.close();
  }
}