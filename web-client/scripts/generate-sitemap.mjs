import {randomUUID} from 'node:crypto';
import {mkdir, rename, rm, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const UNIVERSITIES = [
    'United Arab Emirates University',
    'Khalifa University',
    'University of Sharjah',
    'American University of Sharjah',
];

const SITE_ORIGIN = 'https://spaceread.net';
const DEFAULT_OUTPUT = fileURLToPath(new URL('../dist/sitemap.xml', import.meta.url));
// This route displays a restriction notice rather than a public professor profile.
const RESTRICTED_PROFESSORS = new Set(['jawadh@uaeu.ac.ae']);

function validateCatalog(records, key, source) {
    if (!Array.isArray(records)) {
        throw new Error(`${source}: expected a catalog array`);
    }
    for (const [index, record] of records.entries()) {
        if (!record || typeof record !== 'object' || Array.isArray(record)
            || typeof record[key] !== 'string' || !record[key].trim()
            || record[key] !== record[key].trim() || /[\u0000-\u001f\u007f]/u.test(record[key])) {
            throw new Error(`${source}: invalid ${key} in catalog item ${index}`);
        }
    }
    return records;
}

function encodeSegment(value) {
    return encodeURIComponent(value).replace(/[!'()*]/g, character =>
        `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function escapeXml(value) {
    return value.replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
    })[character]);
}

export function buildSitemap(professors, courses) {
    validateCatalog(professors, 'email', 'Professors');
    validateCatalog(courses, 'tag', 'Courses');
    const urls = new Set([`${SITE_ORIGIN}/professor`, `${SITE_ORIGIN}/course`]);
    for (const {email} of professors) {
        if (!RESTRICTED_PROFESSORS.has(email.toLowerCase())) {
            urls.add(`${SITE_ORIGIN}/professor/${encodeSegment(email)}`);
        }
    }
    for (const {tag} of courses) {
        urls.add(`${SITE_ORIGIN}/course/${encodeSegment(tag)}`);
    }
    if (urls.size > 50_000) {
        throw new Error('Catalog exceeds the 50,000 URL sitemap limit; split it before publishing');
    }
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
        + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + [...urls].sort().map(url => `  <url><loc>${escapeXml(url)}</loc></url>`).join('\n')
        + '\n</urlset>\n';
    if (Buffer.byteLength(xml, 'utf8') > 50 * 1024 * 1024) {
        throw new Error('Catalog exceeds the 50 MB sitemap limit; split it before publishing');
    }
    return {xml, urlCount: urls.size};
}

async function fetchCatalog(url, key, fetchImpl, timeoutMs) {
    const response = await fetchImpl(url, {
        headers: {Accept: 'application/json'},
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
        throw new Error(`${url}: HTTP ${response.status}`);
    }
    if (!/^application\/(?:[\w.+-]+\+)?json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
        throw new Error(`${url}: expected a JSON response`);
    }
    let records;
    try {
        records = await response.json();
    } catch (error) {
        throw new Error(`${url}: invalid JSON response`, {cause: error});
    }
    return validateCatalog(records, key, url);
}

export async function generateSitemap({
    outputPath = DEFAULT_OUTPUT,
    professorApiOrigin = process.env.SITEMAP_PROFESSOR_API_ORIGIN ?? 'https://professor.api.spaceread.net',
    courseApiOrigin = process.env.SITEMAP_COURSE_API_ORIGIN ?? 'https://course.api.spaceread.net',
    fetchImpl = fetch,
    timeoutMs = 15_000,
} = {}) {
    const professorRequests = UNIVERSITIES.map(university => {
        const url = new URL('/professor/all', professorApiOrigin);
        url.searchParams.set('university', university);
        return fetchCatalog(url, 'email', fetchImpl, timeoutMs);
    });
    // These list endpoints expose only public catalog data and do not increment views.
    const [professorCatalogs, courses] = await Promise.all([
        Promise.all(professorRequests),
        fetchCatalog(new URL('/course/list', courseApiOrigin), 'tag', fetchImpl, timeoutMs),
    ]);
    const {xml, urlCount} = buildSitemap(professorCatalogs.flat(), courses);

    // Complete every fetch and validation before touching an existing sitemap.
    const destination = resolve(outputPath);
    const temporaryPath = `${destination}.${randomUUID()}.tmp`;
    await mkdir(dirname(destination), {recursive: true});
    try {
        await writeFile(temporaryPath, xml, {encoding: 'utf8', flag: 'wx'});
        await rename(temporaryPath, destination);
    } finally {
        await rm(temporaryPath, {force: true});
    }
    return {outputPath: destination, urlCount};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    generateSitemap().then(({outputPath, urlCount}) => {
        console.log(`Generated ${outputPath} with ${urlCount} public URLs`);
    }).catch(error => {
        console.error(`Sitemap generation failed: ${error.message}`);
        process.exitCode = 1;
    });
}
