// @ts-check
import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import { defineHastPlugin } from 'satteri';

// The canonical production origin. Every canonical URL, sitemap entry and
// social-sharing URL is built from this value.
const SITE = 'https://getinvolvedvan.com';

// Path prefix the site is served under. "/" for getinvolvedvan.com.
// Build with SITE_BASE=/giv1/ to serve from https://vanclubamerica.github.io/giv1/
// while the custom domain isn't live yet.
const BASE = process.env.SITE_BASE?.trim() || '/';
const PREFIX = BASE.replace(/\/+$/, '');

/**
 * Markdown plugin: prefixes root-relative links and images written in content
 * files (e.g. [Volunteer](/volunteer/)) with the base path, so they keep
 * working when the site is served from a sub-folder.
 */
const basePathLinks = defineHastPlugin({
  name: 'giv-base-path-links',
  element: {
    filter: ['a', 'img'],
    visit(node, ctx) {
      const attr = node.tagName === 'img' ? 'src' : 'href';
      const value = node.properties?.[attr];
      if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith(`${PREFIX}/`)) {
        ctx.setProperty(node, attr, `${PREFIX}${value}`);
      }
    },
  },
});

export default defineConfig({
  site: SITE,
  base: BASE,
  output: 'static',
  // Every page is written as /route/index.html so GitHub Pages can serve
  // nested routes directly (e.g. /petitions/some-slug/) and on refresh.
  build: { format: 'directory' },
  trailingSlash: 'ignore',
  devToolbar: { enabled: false },
  markdown: {
    processor: satteri({ hastPlugins: PREFIX ? [basePathLinks] : [] }),
  },
  image: {
    responsiveStyles: false,
  },
});
