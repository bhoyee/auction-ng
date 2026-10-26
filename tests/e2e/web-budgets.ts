import { chromium, expect, type Page, type TestInfo } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { get } from 'node:http';
import { createServer } from 'node:net';
import { gzipSync } from 'node:zlib';

export const productionAudit = process.env.WEB_PERFORMANCE_CHECK === 'true';
const scriptTransfers = new WeakMap<Page, Set<string>>();
const encodedSizes = new Map<string, Promise<number>>();
function compressedBytes(url: string): Promise<number> {
  const previous = encodedSizes.get(url);
  if (previous) return previous;
  const result = new Promise<number>((resolve, reject) => {
    const request = get(
      url,
      { headers: { 'Accept-Encoding': 'gzip' } },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(
            new Error('A production script did not return a success response.'),
          );
          return;
        }
        let bytes = 0;
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
        });
        response.on('end', () => resolve(bytes));
        response.on('error', reject);
      },
    );
    request.setTimeout(10000, () =>
      request.destroy(new Error('Script measurement timed out.')),
    );
    request.on('error', reject);
  });
  encodedSizes.set(url, result);
  return result;
}
export function trackScriptTransfers(page: Page) {
  if (!productionAudit) return;
  let transfers = new Set<string>();
  scriptTransfers.set(page, transfers);
  page.on('request', (request) => {
    if (
      request.resourceType() !== 'document' ||
      request.frame() !== page.mainFrame()
    )
      return;
    transfers = new Set();
    scriptTransfers.set(page, transfers);
  });
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith('/_next/') && path.endsWith('.js')) transfers.add(path);
  });
}
export async function recordScriptBudget(
  page: Page,
  name: string,
  info: TestInfo,
) {
  if (!productionAudit) return;
  // Clock emulation replaces performance entries, and cached responses can have
  // invalid protocol sizes. Count actual loaded scripts plus the document's
  // script references, then measure their uncached gzip bodies over local HTTP.
  const paths = new Set(scriptTransfers.get(page));
  const sources = await page
    .locator('script[src]:not([nomodule])')
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('src')),
    );
  for (const source of sources) {
    if (!source) continue;
    const url = new URL(source, page.url());
    if (url.pathname.startsWith('/_next/') && url.pathname.endsWith('.js'))
      paths.add(url.pathname);
  }
  const scripts = await Promise.all(
    [...paths].map(async (path) => ({
      path,
      bytes: await compressedBytes(new URL(path, page.url()).href),
    })),
  );
  const inline = await page.locator('script:not([src])').allTextContents();
  const inlineBytes = inline.length ? gzipSync(inline.join('\n')).length : 0;
  const bytes = scripts.reduce(
    (total, script) => total + script.bytes,
    inlineBytes,
  );
  await writeFile(
    info.outputPath(`${name}-script-budget.json`),
    JSON.stringify(
      {
        route: new URL(page.url()).pathname,
        encodedScriptBytes: bytes,
        limit: 200000,
        scripts,
        inlineBytes,
      },
      null,
      2,
    ),
  );
  await info.attach(`${name}-script-budget`, {
    body: Buffer.from(
      JSON.stringify({
        route: new URL(page.url()).pathname,
        encodedScriptBytes: bytes,
        limit: 200000,
        scripts,
        inlineBytes,
      }),
    ),
    contentType: 'application/json',
  });
  expect(bytes, `${name}: initial compressed JavaScript`).toBeGreaterThan(0);
  expect(bytes, `${name}: initial compressed JavaScript`).toBeLessThan(200000);
}
export async function auditHome(url: string, info: TestInfo) {
  if (!productionAudit) return;
  const require = createRequire(resolve('package.json'));
  const cli = join(
    dirname(require.resolve('lighthouse/package.json')),
    'cli',
    'index.js',
  );
  const reportPath = info.outputPath('home-lighthouse.json');
  const inspector = createServer();
  await new Promise<void>((complete, reject) => {
    inspector.once('error', reject);
    inspector.listen(0, '127.0.0.1', complete);
  });
  const address = inspector.address();
  await new Promise<void>((complete, reject) =>
    inspector.close((error) => (error ? reject(error) : complete())),
  );
  if (!address || typeof address === 'string')
    throw new Error('No browser inspection port.');
  // Playwright manages Chromium consistently on Windows/Linux and closes it on
  // failure. Lighthouse still uses a fresh browser and its default mobile audit.
  const browser = await chromium.launch({
    headless: true,
    args: [`--remote-debugging-port=${address.port}`],
  });
  try {
    await new Promise<void>((complete, reject) => {
      const child = spawn(
        process.execPath,
        [
          cli,
          url,
          '--only-categories=performance',
          '--output=json',
          `--output-path=${reportPath}`,
          '--max-wait-for-load=30000',
          `--port=${address.port}`,
          '--hostname=127.0.0.1',
          '--quiet',
        ],
        {
          windowsHide: true,
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let diagnostic = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(
          new Error(
            `Lighthouse did not finish within two minutes: ${diagnostic}`,
          ),
        );
      }, 120000);
      child.stdout.on('data', () => {});
      child.stderr.on('data', (chunk) => {
        diagnostic = (diagnostic + String(chunk)).slice(-2000);
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) complete();
        else reject(new Error(`Lighthouse failed: ${diagnostic}`));
      });
    });
  } finally {
    await browser.close();
  }
  await info.attach('Mobile Lighthouse', {
    path: reportPath,
    contentType: 'application/json',
  });
  const report: unknown = JSON.parse(await readFile(reportPath, 'utf8'));
  if (
    !report ||
    typeof report !== 'object' ||
    !('audits' in report) ||
    !report.audits ||
    typeof report.audits !== 'object'
  )
    throw new Error('Lighthouse did not return audits.');
  const lcp = (report.audits as Record<string, unknown>)[
    'largest-contentful-paint'
  ];
  if (
    !lcp ||
    typeof lcp !== 'object' ||
    !('numericValue' in lcp) ||
    typeof lcp.numericValue !== 'number'
  )
    throw new Error('Lighthouse did not measure LCP.');
  console.log(`Production mobile LCP: ${Math.round(lcp.numericValue)} ms.`);
  expect(lcp.numericValue).toBeGreaterThan(0);
  expect(lcp.numericValue).toBeLessThan(2500);
}
