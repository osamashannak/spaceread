import assert from 'node:assert/strict';
import {mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {buildSitemap, generateSitemap, UNIVERSITIES} from './generate-sitemap.mjs';

const professors = [
    {email: 'z@example.edu', name: 'Z'},
    {email: 'o\'neil+math&science@example.edu', name: 'O\'Neil'},
    {email: 'z@example.edu', name: 'Z duplicate'},
    {email: 'jawadh@uaeu.ac.ae', name: 'Restricted'},
];
const courses = [{tag: 'CS/101 & "Intro"'}, {tag: 'CS/101 & "Intro"'}, {tag: 'ARAB \u0623'}];

test('builds deterministic, unique public URLs with encoded path segments', () => {
    const result = buildSitemap(professors, courses);
    assert.equal(result.xml, buildSitemap([...professors].reverse(), [...courses].reverse()).xml);
    assert.equal(result.urlCount, 6);
    assert.equal(result.xml, `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://spaceread.net/course</loc></url>
  <url><loc>https://spaceread.net/course/ARAB%20%D8%A3</loc></url>
  <url><loc>https://spaceread.net/course/CS%2F101%20%26%20%22Intro%22</loc></url>
  <url><loc>https://spaceread.net/professor</loc></url>
  <url><loc>https://spaceread.net/professor/o%27neil%2Bmath%26science%40example.edu</loc></url>
  <url><loc>https://spaceread.net/professor/z%40example.edu</loc></url>
</urlset>
`);
    assert.doesNotMatch(result.xml, /jawadh|lastmod|login|my-space|notifications|university/);
});

async function outputFixture(t) {
    const directory = await mkdtemp(join(tmpdir(), 'spaceread-sitemap-'));
    t.after(() => rm(directory, {recursive: true, force: true}));
    const outputPath = join(directory, 'sitemap.xml');
    await writeFile(outputPath, 'previous sitemap');
    return {directory, outputPath};
}

test('reads all five university lists including Zayed profiles and courses, then atomically replaces output', async t => {
    const {directory, outputPath} = await outputFixture(t);
    const requests = [];
    const zayedProfessor = {email: 'zu.faculty@zu.ac.ae', name: 'ZU Faculty'};
    const result = await generateSitemap({
        outputPath,
        professorApiOrigin: 'http://professors.test:4000',
        courseApiOrigin: 'http://courses.test:5000',
        fetchImpl: async (url, options) => {
            requests.push(new URL(url));
            assert.ok(options.signal instanceof AbortSignal);
            assert.equal(options.headers.Accept, 'application/json');
            assert.equal(options.credentials, undefined);
            if (url.pathname === '/professor/all') {
                assert.equal(url.origin, 'http://professors.test:4000');
                return Response.json(url.searchParams.get('university') === 'Zayed University'
                    ? [zayedProfessor] : professors);
            }
            assert.equal(url.href, 'http://courses.test:5000/course/list');
            return Response.json(courses);
        },
    });
    assert.equal(requests.length, 6);
    assert.deepEqual(requests.filter(url => url.pathname === '/professor/all')
        .map(url => url.searchParams.get('university')).sort(), [...UNIVERSITIES].sort());
    assert.equal(result.urlCount, 7);
    const generated = await readFile(outputPath, 'utf8');
    assert.equal(generated, buildSitemap([...professors, zayedProfessor], courses).xml);
    assert.match(generated, /https:\/\/spaceread\.net\/professor\/zu\.faculty%40zu\.ac\.ae/);
    assert.deepEqual(await readdir(directory), ['sitemap.xml']);
});

const failures = [
    ['HTTP failure', () => new Response('unavailable', {status: 503}), /HTTP 503/],
    ['HTML fallback', () => new Response('<html>Loading</html>', {
        headers: {'content-type': 'text/html'},
    }), /expected a JSON response/],
    ['broken JSON', () => new Response('{', {
        headers: {'content-type': 'application/json'},
    }), /invalid JSON response/],
    ['non-array JSON', () => Response.json({error: 'failed'}), /expected a catalog array/],
    ['missing identifier', () => Response.json([{name: 'Missing tag'}]), /invalid tag/],
    ['blank identifier', () => Response.json([{tag: ' '}]), /invalid tag/],
    ['invalid record', () => Response.json([null]), /invalid tag/],
];

for (const [name, response, expectedError] of failures) {
    test(`${name} leaves the existing sitemap untouched`, async t => {
        const {directory, outputPath} = await outputFixture(t);
        await assert.rejects(generateSitemap({
            outputPath,
            fetchImpl: async url => url.pathname === '/course/list'
                ? response() : Response.json(professors),
        }), expectedError);
        assert.equal(await readFile(outputPath, 'utf8'), 'previous sitemap');
        assert.deepEqual(await readdir(directory), ['sitemap.xml']);
    });
}

test('invalid professor catalog also prevents a partial sitemap', async t => {
    const {outputPath} = await outputFixture(t);
    await assert.rejects(generateSitemap({
        outputPath,
        fetchImpl: async url => url.pathname === '/professor/all'
            ? Response.json([{email: 123}]) : Response.json(courses),
    }), /invalid email/);
    assert.equal(await readFile(outputPath, 'utf8'), 'previous sitemap');
});

test('slow catalog requests are aborted without replacing the sitemap', async t => {
    const {outputPath} = await outputFixture(t);
    // Keep the event loop active because AbortSignal.timeout uses an unref'ed timer.
    const keepAlive = setInterval(() => {}, 1000);
    t.after(() => clearInterval(keepAlive));
    await assert.rejects(generateSitemap({
        outputPath,
        timeoutMs: 10,
        fetchImpl: async (_url, {signal}) => new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), {once: true});
        }),
    }), {name: 'TimeoutError'});
    assert.equal(await readFile(outputPath, 'utf8'), 'previous sitemap');
});
