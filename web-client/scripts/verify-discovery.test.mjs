import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyDiscovery } from './verify-discovery.mjs';

const robots = 'User-agent: *\nAllow: /\nSitemap: https://spaceread.net/sitemap.xml\n';
const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://spaceread.net/professor</loc></url></urlset>\n';
const silent = { log() {}, warn() {} };

async function fixture(t, overrides = {}) {
  const outputDir = await mkdtemp(join(tmpdir(), 'spaceread-discovery-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  await Promise.all([
    writeFile(join(outputDir, 'robots.txt'), robots),
    writeFile(join(outputDir, 'sitemap.xml'), sitemap),
  ]);
  return {
    outputDir, attempts: 1, logger: silent, origin: 'http://localhost:3456',
    fetchImpl: async (url, options) => {
      assert.equal(options.redirect, 'manual');
      assert.equal(options.credentials, 'omit');
      assert.ok(options.signal instanceof AbortSignal);
      const name = new URL(url).pathname;
      const replacement = overrides[name];
      if (replacement) return replacement();
      return new Response(name === '/robots.txt' ? robots : sitemap, {
        headers: { 'content-type': name === '/robots.txt' ? 'text/plain; charset=utf-8' : 'application/xml' },
      });
    },
  };
}

test('accepts expected files with CRLF and trailing whitespace differences', async (t) => {
  const options = await fixture(t, {
    '/robots.txt': () => new Response(robots.replace(/\n/g, '  \r\n') + '\r\n', { headers: { 'content-type': 'text/plain' } }),
    '/sitemap.xml': () => new Response(sitemap, { headers: { 'content-type': 'text/xml; charset=utf-8' } }),
  });
  await verifyDiscovery(options);
});

test('rejects a successful HTTP response containing the HTML app fallback', async (t) => {
  const options = await fixture(t, { '/robots.txt': () => new Response('<!doctype html><html><body>Loading...</body></html>') });
  await assert.rejects(verifyDiscovery(options), /robots\.txt: received HTML.*\nCheck the main domain CloudFront/s);
});

test('rejects valid XML that differs from the deployed build', async (t) => {
  const options = await fixture(t, {
    '/sitemap.xml': () => new Response(sitemap.replace('/professor', '/old-page'), { headers: { 'content-type': 'application/xml' } }),
  });
  await assert.rejects(verifyDiscovery(options), /sitemap\.xml: contents differ from the current build/);
});

test('rejects missing remote files and redirects', async (t) => {
  for (const status of [404, 403, 301]) {
    const options = await fixture(t, { '/sitemap.xml': () => new Response('', { status }) });
    await assert.rejects(verifyDiscovery(options), new RegExp(`received HTTP ${status}`));
  }
});

test('rejects correct content served under the wrong media type', async (t) => {
  const options = await fixture(t, { '/sitemap.xml': () => new Response(sitemap, { headers: { 'content-type': 'text/html' } }) });
  await assert.rejects(verifyDiscovery(options), /expected application\/xml or text\/xml, received text\/html/);
});

test('retries transient failures and then verifies the current build', async (t) => {
  let calls = 0;
  const options = await fixture(t, {
    '/sitemap.xml': () => ++calls === 1
      ? new Response('', { status: 503 })
      : new Response(sitemap, { headers: { 'content-type': 'application/xml' } }),
  });
  await verifyDiscovery({ ...options, attempts: 2, retryDelayMs: 0 });
  assert.equal(calls, 2);
});

test('fails before fetching when a local build file is missing', async (t) => {
  const options = await fixture(t);
  await rm(join(options.outputDir, 'sitemap.xml'));
  await assert.rejects(verifyDiscovery({ ...options, fetchImpl: () => assert.fail('must not fetch') }), /Cannot read expected build file.*sitemap\.xml/);
});

test('rejects unbounded or invalid retry counts', async () => {
  for (const attempts of [0, 13, 1.5, NaN]) {
    await assert.rejects(verifyDiscovery({ attempts }), /integer from 1 to 12/);
  }
});
