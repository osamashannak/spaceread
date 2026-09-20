import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const defaultOutputDir = fileURLToPath(new URL('../dist/', import.meta.url));
const files = [
  ['robots.txt', ['text/plain']],
  ['sitemap.xml', ['application/xml', 'text/xml']],
];
const normalize = (text) => text.replace(/\r\n/g, '\n').replace(/[\t ]+$/gm, '').trimEnd();
const routingHint = 'Check the main domain CloudFront origin path, SPA rewrite/fallback, and cached responses; these URLs must serve the files from this build.';

export async function verifyDiscovery({
  origin = 'https://spaceread.net',
  outputDir = defaultOutputDir,
  fetchImpl = fetch,
  attempts = 6,
  retryDelayMs = 10_000,
  timeoutMs = 15_000,
  logger = console,
} = {}) {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 12) {
    throw new Error('Discovery verification attempts must be an integer from 1 to 12.');
  }
  const expected = await Promise.all(files.map(async ([name, types]) => {
    const path = join(outputDir, name);
    try {
      return { name, types, text: normalize(await readFile(path, 'utf8')) };
    } catch (error) {
      throw new Error(`Cannot read expected build file ${path}. Build discovery files before verification.`, { cause: error });
    }
  }));

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const results = await Promise.allSettled(expected.map(async ({ name, types, text }) => {
      const url = new URL(`/${name}`, origin).href;
      try {
        const response = await fetchImpl(url, {
          redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(timeoutMs),
        });
        if (response.status !== 200 || response.redirected) {
          throw new Error(`expected HTTP 200 without redirects, received HTTP ${response.status}${response.redirected ? ' after a redirect' : ''}`);
        }
        const body = await response.text();
        if (/<!doctype\s+html|<html[\s>]/i.test(body)) {
          throw new Error('received HTML (likely the SPA fallback) instead of a discovery file');
        }
        const mediaType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (!types.includes(mediaType)) {
          throw new Error(`expected ${types.join(' or ')}, received ${mediaType || 'no Content-Type'}`);
        }
        if (normalize(body) !== text) {
          throw new Error('contents differ from the current build (stale cache, wrong origin, or incomplete upload)');
        }
      } catch (error) {
        throw new Error(`${url}: ${error.message}`, { cause: error });
      }
    }));
    const failures = results.filter((result) => result.status === 'rejected').map((result) => result.reason.message);
    if (!failures.length) {
      logger.log(`Verified robots.txt and sitemap.xml at ${new URL(origin).origin} against this build.`);
      return;
    }
    const diagnostic = failures.join('\n');
    if (attempt === attempts) {
      throw new Error(`Discovery verification failed after ${attempts} attempt(s):\n${diagnostic}\n${routingHint}`);
    }
    logger.warn(`Discovery verification attempt ${attempt}/${attempts} failed:\n${diagnostic}\nRetrying in ${retryDelayMs / 1000}s.`);
    await sleep(retryDelayMs);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const configuredAttempts = process.env.DISCOVERY_VERIFY_ATTEMPTS;
  const attempts = configuredAttempts === undefined ? 6 : /^\d+$/.test(configuredAttempts) ? Number(configuredAttempts) : NaN;
  verifyDiscovery({ origin: process.env.DISCOVERY_SITE_ORIGIN || 'https://spaceread.net', attempts }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
