/**
 * Post-build checks for the static site in dist/. Runs in CI after every
 * build and fails the deployment if something important is wrong.
 *
 *   npm run build && npm run verify
 *
 * Checks: robots.txt, sitemap.xml (valid, absolute canonical URLs, no
 * duplicates, every URL built, no noindex/preview pages), per-page metadata
 * (title, description, canonical, Open Graph, lang, one <h1>, image alt),
 * internal links and assets resolve, draft content is absent, the forms
 * manifest only lists published content, CNAME, and the official palette.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = 'dist';
const ORIGIN = 'https://getinvolvedvan.com';
const BASE = (process.env.SITE_BASE?.trim() || '/').replace(/\/+$/, '');
const PALETTE = ['#0c5678', '#6d8196', '#9a1f27', '#ffffff'];

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

if (!existsSync(DIST)) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(DIST);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const toUrlPath = (file) => {
  const rel = relative(DIST, file).split(sep).join('/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return `/${rel.slice(0, -'index.html'.length)}`;
  return `/${rel}`;
};

/** Does a site path (without base) exist in dist? */
function existsInDist(path) {
  const clean = decodeURIComponent(path.split('#')[0].split('?')[0]);
  if (clean === '/' || clean === '') return existsSync(join(DIST, 'index.html'));
  const target = join(DIST, clean);
  if (existsSync(target) && statSync(target).isFile()) return true;
  return existsSync(join(target, 'index.html'));
}

// ---- robots.txt ----------------------------------------------------------
const robotsPath = join(DIST, 'robots.txt');
if (!existsSync(robotsPath)) fail('robots.txt is missing');
else {
  const robots = readFileSync(robotsPath, 'utf8');
  if (!/^User-agent: \*$/m.test(robots)) fail('robots.txt: missing "User-agent: *"');
  if (!/^Allow: \/$/m.test(robots)) fail('robots.txt: missing "Allow: /"');
  if (!robots.includes(`Sitemap: ${ORIGIN}/sitemap.xml`)) fail('robots.txt: missing sitemap reference');
}

// ---- CNAME -----------------------------------------------------------------
if (!existsSync(join(DIST, 'CNAME')) || readFileSync(join(DIST, 'CNAME'), 'utf8').trim() !== 'getinvolvedvan.com') {
  fail('CNAME missing or wrong');
}

// ---- Pages -------------------------------------------------------------------
const pages = new Map();
const descriptions = new Map();
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const path = toUrlPath(file);
  const noindex = /<meta name="robots" content="noindex/.test(html);
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1];
  const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1];
  const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1];
  pages.set(path, { noindex, html, file });

  if (!/<html lang="en"/.test(html)) fail(`${path}: missing <html lang="en">`);
  if (!title) fail(`${path}: missing <title>`);
  if (!description) fail(`${path}: missing meta description`);
  else if (!noindex && path !== '/404.html') {
    if (descriptions.has(description)) fail(`${path}: meta description duplicates ${descriptions.get(description)}`);
    descriptions.set(description, path);
  }
  if (!canonical?.startsWith(`${ORIGIN}/`)) fail(`${path}: canonical must start with ${ORIGIN}/ (got ${canonical})`);
  if (!/<meta property="og:image" content="https:\/\/getinvolvedvan\.com\//.test(html)) fail(`${path}: og:image must be absolute on ${ORIGIN}`);
  if (/github\.io/.test(canonical ?? '')) fail(`${path}: canonical points at github.io`);
  const h1s = html.match(/<h1[\s>]/g)?.length ?? 0;
  if (h1s !== 1) fail(`${path}: expected exactly one <h1>, found ${h1s}`);
  for (const img of html.match(/<img\b[^>]*>/g) ?? []) {
    // `alt` with no value is the same as alt="" (a decorative image).
    if (!/\salt(="|[\s>])/.test(img)) fail(`${path}: <img> without alt: ${img.slice(0, 120)}`);
  }
  if (!/<a class="skip-link" href="#main">/.test(html)) fail(`${path}: missing skip link`);

  // Internal links and assets
  for (const [, attr, raw] of html.matchAll(/\s(href|src|srcset)="([^"]+)"/g)) {
    const values = attr === 'srcset' ? raw.split(',').map((s) => s.trim().split(/\s+/)[0]) : [raw];
    for (const value of values) {
      if (!value.startsWith('/') || value.startsWith('//')) continue;
      let sitePath = value;
      if (BASE) {
        if (!value.startsWith(`${BASE}/`)) {
          fail(`${path}: link "${value}" is missing the base path ${BASE}`);
          continue;
        }
        sitePath = value.slice(BASE.length);
      }
      if (!existsInDist(sitePath)) fail(`${path}: broken internal ${attr} "${value}"`);
    }
  }
}
for (const required of ['/', '/about/', '/issues/', '/take-action/', '/petitions/', '/volunteer/', '/events/', '/news/', '/newsletter/', '/support/', '/resources/', '/contact/', '/privacy/', '/terms/', '/404.html']) {
  if (!pages.has(required)) fail(`required page missing: ${required}`);
}

// ---- Sitemap -------------------------------------------------------------------
const sitemapPath = join(DIST, 'sitemap.xml');
const sitemapUrls = [];
if (!existsSync(sitemapPath)) fail('sitemap.xml is missing');
else {
  const xml = readFileSync(sitemapPath, 'utf8');
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) fail('sitemap.xml: missing XML declaration');
  if (!xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')) fail('sitemap.xml: missing urlset namespace');
  const opens = (xml.match(/<url>/g) ?? []).length;
  const closes = (xml.match(/<\/url>/g) ?? []).length;
  if (opens !== closes) fail('sitemap.xml: unbalanced <url> tags');
  if (/&(?!amp;|lt;|gt;|quot;|apos;)/.test(xml)) fail('sitemap.xml: unescaped ampersand');
  for (const [, loc] of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) sitemapUrls.push(loc);
  for (const [, lastmod] of xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lastmod)) fail(`sitemap.xml: bad lastmod ${lastmod}`);
  }
  const seen = new Set();
  for (const loc of sitemapUrls) {
    if (!loc.startsWith(`${ORIGIN}/`)) fail(`sitemap.xml: URL not on ${ORIGIN}: ${loc}`);
    if (seen.has(loc)) fail(`sitemap.xml: duplicate ${loc}`);
    seen.add(loc);
    const path = loc.slice(ORIGIN.length) || '/';
    const page = pages.get(path);
    if (!page) fail(`sitemap.xml: ${loc} has no built page`);
    else if (page.noindex) fail(`sitemap.xml: ${loc} is a noindex page`);
  }
  // Every indexable page should be in the sitemap.
  for (const [path, page] of pages) {
    if (page.noindex || path === '/404.html') continue;
    if (!seen.has(`${ORIGIN}${path}`)) fail(`sitemap.xml: indexable page ${path} is missing`);
  }
}

// ---- Content publishing rules ------------------------------------------------------
function frontmatter(file) {
  const text = readFileSync(file, 'utf8');
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? '';
  const status = /^status:\s*(\w+)/m.exec(fm)?.[1] ?? 'draft';
  const title = /^title:\s*(.+)$/m.exec(fm)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
  return { status, title };
}
const routes = { articles: '/news/', issues: '/issues/', petitions: '/petitions/', events: '/events/' };
for (const [collection, prefix] of Object.entries(routes)) {
  const dir = join('src', 'content', collection);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.md') && !n.startsWith('_'))) {
    const slug = name.replace(/\.md$/, '');
    const { status, title } = frontmatter(join(dir, name));
    const path = `${prefix}${slug}/`;
    const page = pages.get(path);
    if (status === 'draft') {
      if (page) fail(`draft ${collection}/${name} was built at ${path}`);
      if (title) {
        for (const [p, other] of pages) if (other.html.includes(title)) fail(`draft title "${title}" appears on ${p}`);
      }
      if (sitemapUrls.includes(`${ORIGIN}${path}`)) fail(`draft ${path} is in the sitemap`);
    } else if (status === 'preview') {
      if (!page) fail(`preview ${collection}/${name} has no page at ${path}`);
      else if (!page.noindex) fail(`preview page ${path} is missing noindex`);
    } else if (status === 'published') {
      if (!page) fail(`published ${collection}/${name} has no page at ${path}`);
      else if (page.noindex) fail(`published page ${path} is marked noindex`);
    }
  }
}

// ---- Forms manifest -------------------------------------------------------------
const manifestPath = join(DIST, 'api', 'forms-manifest.json');
if (!existsSync(manifestPath)) fail('api/forms-manifest.json is missing');
else {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const p of manifest.petitions) {
    const file = join('src', 'content', 'petitions', `${p.slug}.md`);
    if (!existsSync(file) || frontmatter(file).status !== 'published') fail(`forms manifest lists unpublished petition ${p.slug}`);
  }
  if (/@|email/i.test(JSON.stringify(manifest).replace(/"emails?"/g, ''))) warn('forms manifest contains something that looks like an email address');
}

// ---- Palette ----------------------------------------------------------------------
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(f, 'utf8').toLowerCase()).join('\n');
for (const color of PALETTE) {
  // Minifiers may shorten #ffffff to #fff.
  const short = /^#(\w)\1(\w)\2(\w)\3$/.test(color) ? `#${color[1]}${color[3]}${color[5]}` : color;
  if (!css.includes(color) && !css.includes(short)) fail(`official palette color ${color} not found in built CSS`);
}

// ---- Report -------------------------------------------------------------------------
console.log(`Checked ${htmlFiles.length} HTML pages, ${sitemapUrls.length} sitemap URLs.`);
for (const w of warnings) console.warn(`warning: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  console.error(`\n${errors.length} problem(s) found.`);
  process.exit(1);
}
console.log('All build checks passed.');
