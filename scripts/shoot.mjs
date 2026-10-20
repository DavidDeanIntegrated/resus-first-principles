/**
 * Local proof shots for the annotated primer.
 * Serves dist/ and writes screenshots plus a measurement report.
 *
 *   npm run build
 *   node scripts/shoot.mjs
 *
 * Uses playwright-core with the system Chrome. Not part of CI.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const distDir = join(repoRoot, 'dist');
const outDir = join(repoRoot, 'screenshots');

const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.woff2', 'font/woff2'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

function startServer() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const filePath = normalize(join(distDir, pathname));
    if (!filePath.startsWith(distDir)) {
      response.writeHead(403);
      response.end();
      return;
    }
    try {
      const body = await readFile(filePath);
      response.writeHead(200, { 'content-type': types.get(extname(filePath)) ?? 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('server did not bind');
      resolve({ server, port: address.port });
    });
  });
}

const { server, port } = await startServer();
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const report = [];

try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: width === 390 ? 844 : 900 },
      deviceScaleFactor: 1,
    });
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto(`http://127.0.0.1:${port}/cases/adult-cardiac-arrest/`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);

    const metrics = await page.evaluate(() => {
      const box = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      };
      const visible = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return style.visibility !== 'hidden' && rect.width > 8 && rect.height > 8;
      };
      return {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        summary: box('.q summary'),
        option: box('.option'),
        chip: box('.chip'),
        nav: box('.site-nav a'),
        correctVisible: visible('.q:has(details[open]) .correct-label'),
        closedCorrectVisible: visible('.q:not(:has(details[open])) .correct-label'),
        sideDisplay: document.querySelector('.side')
          ? getComputedStyle(document.querySelector('.side')).display
          : 'absent',
        bodyFont: getComputedStyle(document.body).fontFamily,
        bodySize: getComputedStyle(document.body).fontSize,
        h1Font: getComputedStyle(document.querySelector('h1')).fontFamily,
        h1Size: getComputedStyle(document.querySelector('h1')).fontSize,
        measure: getComputedStyle(document.querySelector('.lede')).maxWidth,
      };
    });

    const thirdParty = requests.filter((url) => {
      const host = new URL(url).host;
      return host !== '127.0.0.1' && host !== `127.0.0.1:${port}`;
    });

    await page.screenshot({
      path: join(outDir, `case-${width}.png`),
      fullPage: true,
    });

    report.push({ width, metrics, thirdParty, requests: requests.length });
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

console.log(JSON.stringify(report, null, 2));
