import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

let cachedChromiumPath: string | null | undefined = undefined;

export function findChromiumExecutable(): string | null {
  if (cachedChromiumPath !== undefined) return cachedChromiumPath;

  const candidates: string[] = [];
  if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH);
  if (process.env.PUPPETEER_EXECUTABLE_PATH) candidates.push(process.env.PUPPETEER_EXECUTABLE_PATH);

  // Scan /ms-playwright if available
  const msPlaywrightDir = '/ms-playwright';
  if (fs.existsSync(msPlaywrightDir)) {
    try {
      const entries = fs.readdirSync(msPlaywrightDir);
      for (const entry of entries) {
        if (entry.startsWith('chromium_headless_shell')) {
          candidates.push(path.join(msPlaywrightDir, entry, 'chrome-headless-shell-linux64', 'chrome-headless-shell'));
        } else if (entry.startsWith('chromium')) {
          candidates.push(path.join(msPlaywrightDir, entry, 'chrome-linux', 'chrome'));
          candidates.push(path.join(msPlaywrightDir, entry, 'chrome-linux64', 'chrome'));
        }
      }
    } catch {
      // ignore scan error
    }
  }

  candidates.push(
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/local/bin/chromium'
  );

  for (const cand of candidates) {
    if (cand && fs.existsSync(cand)) {
      cachedChromiumPath = cand;
      return cand;
    }
  }

  cachedChromiumPath = null;
  return null;
}

export interface PdfExportOptions {
  htmlDocument: string;
  mode: 'StudentPaper' | 'TeacherAnswerKey';
  orientation?: 'portrait' | 'landscape';
  title?: string;
  serverPort?: number;
}

/**
 * Defense-in-depth sanitizer ensuring Student Paper PDF exports never accidentally include
 * teacher answer key boxes if any slipped into serialized HTML.
 */
function stripAnswerKeyElementsIfStudent(html: string): string {
  // Remove any blocks explicitly tagged data-answer-key="true"
  let cleaned = html.replace(/<([a-z0-9]+)([^>]*data-answer-key=["']true["'][^>]*)>[\s\S]*?<\/\1>/gi, '');
  // Remove teacher-answer-key highlighted answer style marker if present
  cleaned = cleaned.replace(/data-is-correct-answer=["']true["']/gi, '');
  return cleaned;
}

function rewriteLocalUrls(html: string, serverPort: number): string {
  const origin = `http://127.0.0.1:${serverPort}`;
  return html
    .replace(/src=(["'])\/(assets|favicon)/gi, `src=$1${origin}/$2`)
    .replace(/href=(["'])\/(assets|favicon)/gi, `href=$1${origin}/$2`)
    .replace(/url\((["']?)\/(assets|favicon)/gi, `url($1${origin}/$2`);
}

export async function exportExamHtmlToPdf(options: PdfExportOptions): Promise<Buffer> {
  const chromePath = findChromiumExecutable();
  if (!chromePath) {
    throw new Error('CHROMIUM_UNAVAILABLE');
  }

  const port = options.serverPort || Number(process.env.PORT) || 3000;
  let safeHtml = rewriteLocalUrls(options.htmlDocument, port);
  if (options.mode === 'StudentPaper') {
    safeHtml = stripAnswerKeyElementsIfStudent(safeHtml);
  }

  const tempId = `qaflah-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const tmpHtmlPath = path.join(os.tmpdir(), `${tempId}.html`);
  const tmpPdfPath = path.join(os.tmpdir(), `${tempId}.pdf`);
  const tmpProfileDir = path.join(os.tmpdir(), `${tempId}-profile`);

  try {
    fs.writeFileSync(tmpHtmlPath, safeHtml, 'utf-8');

    const args = [
      '--headless',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=none',
      `--user-data-dir=${tmpProfileDir}`,
      '--print-to-pdf-no-header',
      '--no-pdf-header-footer',
      '--run-all-compositor-stages-before-draw',
      '--virtual-time-budget=2500',
      `--print-to-pdf=${tmpPdfPath}`,
      `file://${tmpHtmlPath}`,
    ];

    await execFileAsync(chromePath, args, {
      timeout: 25000,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (!fs.existsSync(tmpPdfPath)) {
      throw new Error('PDF output file was not created');
    }

    const buffer = fs.readFileSync(tmpPdfPath);
    if (buffer.length < 300 || buffer.subarray(0, 5).toString() !== '%PDF-') {
      throw new Error('Generated PDF header is invalid');
    }

    return buffer;
  } finally {
    try {
      if (fs.existsSync(tmpHtmlPath)) fs.unlinkSync(tmpHtmlPath);
    } catch {
      // ignore cleanup
    }
    try {
      if (fs.existsSync(tmpPdfPath)) fs.unlinkSync(tmpPdfPath);
    } catch {
      // ignore cleanup
    }
    try {
      if (fs.existsSync(tmpProfileDir)) fs.rmSync(tmpProfileDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup
    }
  }
}
