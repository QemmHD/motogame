import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';

const MIME_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.m4a': 'audio/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
});

function browserCandidates() {
  const candidates = [];
  const add = (candidate, source) => {
    if (!candidate || candidates.some(item => item.path === candidate)) return;
    candidates.push({ path: candidate, source });
  };

  add(process.env.MOTORUSH_BROWSER, 'MOTORUSH_BROWSER');
  add(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, 'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH');
  add(process.env.CHROME_PATH, 'CHROME_PATH');
  add(process.env.CHROMIUM_PATH, 'CHROMIUM_PATH');

  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env.LOCALAPPDATA;
    add(path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'), 'Chrome system install');
    add(path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'), 'Chrome x86 install');
    if (localAppData) {
      add(path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'), 'Chrome user install');
      add(path.join(localAppData, 'Chromium', 'Application', 'chrome.exe'), 'Chromium user install');
    }
    add(path.join(programFiles, 'Chromium', 'Application', 'chrome.exe'), 'Chromium system install');
    add(path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), 'Edge system install');
    add(path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), 'Edge x86 install');
  } else if (process.platform === 'darwin') {
    add('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'Chrome application');
    add('/Applications/Chromium.app/Contents/MacOS/Chromium', 'Chromium application');
    add('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', 'Edge application');
  } else {
    add('/usr/bin/google-chrome-stable', 'Chrome stable');
    add('/usr/bin/google-chrome', 'Chrome');
    add('/usr/bin/chromium', 'Chromium');
    add('/usr/bin/chromium-browser', 'Chromium browser');
    add('/snap/bin/chromium', 'Chromium snap');
    add('/usr/bin/microsoft-edge-stable', 'Edge stable');
  }

  try { add(chromium.executablePath(), 'Playwright Chromium'); } catch {}
  return candidates;
}

/** Launch an installed Chromium-family browser without downloading anything. */
export async function launchInstalledBrowser(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Browser launch options must be an object');
  }
  const extraArgs = options.extraArgs ?? [];
  if (!Array.isArray(extraArgs)
      || extraArgs.some(argument => typeof argument !== 'string' || argument.length === 0)) {
    throw new TypeError('Browser launch extraArgs must be an array of non-empty strings');
  }
  const candidates = browserCandidates();
  const attempts = [];
  const args = [
    '--disable-background-networking',
    '--disable-component-update',
    '--mute-audio',
    ...extraArgs,
  ];
  if (process.platform === 'linux') args.push('--no-sandbox');

  for (const candidate of candidates) {
    if (!existsSync(candidate.path)) {
      attempts.push(`${candidate.source}: not found at ${candidate.path}`);
      continue;
    }
    try {
      const browser = await chromium.launch({
        executablePath: candidate.path,
        headless: true,
        args,
      });
      return { browser, executablePath: candidate.path, source: candidate.source };
    } catch (error) {
      attempts.push(`${candidate.source}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error([
    'No usable local Chromium-family browser was found.',
    'Install Chrome/Chromium, or set MOTORUSH_BROWSER to its executable path.',
    ...attempts.map(attempt => `- ${attempt}`),
  ].join('\n'));
}

function respond(response, status, body, headers = {}) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  response.end(body);
}

/** Start a loopback-only static server rooted at publicDir on an ephemeral port. */
export async function startStaticServer(publicDir) {
  const root = path.resolve(publicDir);
  const rootInfo = await stat(root).catch(() => null);
  if (!rootInfo?.isDirectory()) throw new Error(`public directory does not exist: ${root}`);

  const server = createServer((request, response) => {
    void (async () => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        respond(response, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
        return;
      }

      let pathname;
      try { pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname); }
      catch { respond(response, 400, 'Bad Request'); return; }
      if (pathname.includes('\0')) { respond(response, 400, 'Bad Request'); return; }

      const relative = pathname.replace(/^[/\\]+/, '') || 'index.html';
      let filename = path.resolve(root, relative);
      if (filename !== root && !filename.startsWith(`${root}${path.sep}`)) {
        respond(response, 403, 'Forbidden');
        return;
      }

      let info = await stat(filename).catch(() => null);
      if (info?.isDirectory()) {
        filename = path.join(filename, 'index.html');
        info = await stat(filename).catch(() => null);
      }
      if (!info?.isFile()) { respond(response, 404, 'Not Found'); return; }

      const body = request.method === 'HEAD' ? undefined : await readFile(filename);
      respond(response, 200, body, {
        'Content-Length': String(info.size),
        'Content-Type': MIME_TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream',
      });
    })().catch(error => {
      if (!response.headersSent) respond(response, 500, 'Internal Server Error');
      else response.destroy(error instanceof Error ? error : undefined);
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('static server did not expose a TCP port');

  let closed = false;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      if (closed) return;
      closed = true;
      server.closeAllConnections?.();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}

/** Open the game in an isolated context and wait for its test hook and assets. */
export async function openCleanGamePage(browser, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error instanceof Error ? error.message : String(error)));

  try {
    await page.goto(`${baseUrl}/index.html?dev&autoplay&capture`, {
      waitUntil: 'load',
      timeout: 15_000,
    });
    await page.waitForFunction(
      () => window.__moto && window.__moto.G?.state === 'menu'
        && Array.isArray(window.__moto.levels) && typeof window.__moto.runToEnd === 'function',
      undefined,
      { timeout: 15_000 },
    );
    if (pageErrors.length) throw new Error(`game page error: ${pageErrors.join(' | ')}`);
    return { context, page, pageErrors };
  } catch (error) {
    await context.close().catch(() => {});
    throw error;
  }
}

export function roundTime(value) {
  return Number(Number(value).toFixed(6));
}

export function formatFailure(error) {
  return error instanceof Error ? error.stack || error.message : String(error);
}
