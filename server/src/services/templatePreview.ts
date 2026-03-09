import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PREVIEWS_DIR = path.resolve(__dirname, '../../data/previews/templates');

function ensurePreviewDir() {
  fs.mkdirSync(TEMPLATE_PREVIEWS_DIR, { recursive: true });
}

export function getTemplatePreviewImagePath(templateId: number) {
  ensurePreviewDir();
  return path.join(TEMPLATE_PREVIEWS_DIR, `${templateId}.png`);
}

export function invalidateTemplatePreview(templateId: number) {
  const filePath = getTemplatePreviewImagePath(templateId);
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
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

export async function captureTemplatePreview(templateId: number, templateDir: string): Promise<string> {
  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    throw new Error('Не найден локальный браузер для снятия превью шаблона.');
  }

  const indexCandidates = ['index.html', 'index.htm', 'index.php']
    .map((name) => path.join(templateDir, name))
    .filter((candidate) => fs.existsSync(candidate));

  if (indexCandidates.length === 0) {
    throw new Error('В шаблоне не найден index.html/index.htm/index.php для генерации превью.');
  }

  const browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
    args: ['--disable-dev-shm-usage', '--disable-gpu', '--ignore-certificate-errors', '--allow-file-access-from-files', '--no-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();

  try {
    const url = pathToFileURL(indexCandidates[0]).toString();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    try {
      await page.waitForLoadState('networkidle', { timeout: 5000 });
    } catch {
      // Best-effort only.
    }

    const screenshot = await page.screenshot({ type: 'png', fullPage: true });
    const filePath = getTemplatePreviewImagePath(templateId);
    fs.writeFileSync(filePath, screenshot);
    return filePath;
  } finally {
    await context.close();
    await browser.close();
  }
}