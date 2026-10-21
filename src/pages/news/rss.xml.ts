/** RSS 2.0 feed of published articles. */
import type { APIRoute } from 'astro';
import { site } from '../../config/site';
import { ARTICLE_KIND_LABELS, getPublished, sortArticles } from '../../lib/content';
import { absoluteUrl, paths } from '../../lib/urls';

const xml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export const GET: APIRoute = async () => {
  const articles = sortArticles(await getPublished('articles')).slice(0, 30);
  const items = articles
    .map((a) => {
      const url = absoluteUrl(paths.article(a.id));
      return `    <item>
      <title>${xml(a.data.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${a.data.publishedAt.toUTCString()}</pubDate>
      <category>${xml(ARTICLE_KIND_LABELS[a.data.kind])}</category>
      <description>${xml(a.data.excerpt)}</description>
    </item>`;
    })
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xml(site.name)}: News and updates</title>
    <link>${absoluteUrl('/news/')}</link>
    <atom:link href="${absoluteUrl('/news/rss.xml')}" rel="self" type="application/rss+xml" />
    <description>${xml(site.description)}</description>
    <language>en-us</language>
${items}
  </channel>
</rss>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
