/**
 * XML sitemap, generated on every build from the published content.
 * Drafts, previews, utility pages (newsletter confirm/unsubscribe, 404) and
 * data files are never included.
 */
import type { APIRoute } from 'astro';
import { getPublished } from '../lib/content';
import { plainDateIso } from '../lib/dates';
import { absoluteUrl, paths } from '../lib/urls';

interface Entry {
  path: string;
  lastmod?: string;
}

/** Fixed pages. `lastmod` is set only where a reliable date exists. */
const STATIC_PAGES: Entry[] = [
  { path: '/' },
  { path: '/about/' },
  { path: '/issues/' },
  { path: '/take-action/' },
  { path: '/petitions/' },
  { path: '/volunteer/' },
  { path: '/events/' },
  { path: '/news/' },
  { path: '/newsletter/' },
  { path: '/support/' },
  { path: '/resources/' },
  { path: '/contact/' },
  { path: '/privacy/', lastmod: '2026-10-21' },
  { path: '/terms/', lastmod: '2026-10-21' },
];

export const GET: APIRoute = async () => {
  const [articles, issues, petitions, events] = await Promise.all([
    getPublished('articles'),
    getPublished('issues'),
    getPublished('petitions'),
    getPublished('events'),
  ]);

  const entries: Entry[] = [
    ...STATIC_PAGES,
    ...issues.map((i) => ({ path: paths.issue(i.id), lastmod: plainDateIso(i.data.updatedAt ?? i.data.publishedAt) })),
    ...petitions.map((p) => ({ path: paths.petition(p.id), lastmod: plainDateIso(p.data.publishedAt) })),
    ...events.map((e) => ({ path: paths.event(e.id) })),
    ...articles.map((a) => ({ path: paths.article(a.id), lastmod: plainDateIso(a.data.updatedAt ?? a.data.publishedAt) })),
  ];

  const seen = new Set<string>();
  const urls = entries
    .filter((e) => (seen.has(e.path) ? false : (seen.add(e.path), true)))
    .map((e) => `  <url>\n    <loc>${absoluteUrl(e.path)}</loc>${e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : ''}\n  </url>`)
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
