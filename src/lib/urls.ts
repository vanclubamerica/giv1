import { site } from '../config/site';

/**
 * Base path the site is served from. "/" in production (getinvolvedvan.com).
 * Set SITE_BASE=/giv1/ at build time to serve from
 * https://vanclubamerica.github.io/giv1/ before the custom domain is live.
 */
const BASE = `/${(import.meta.env.BASE_URL ?? '/').replace(/^\/+|\/+$/g, '')}`.replace(/\/$/, '');

/** Canonical paths (no base prefix): used for canonical URLs and the sitemap. */
export const paths = {
  article: (id: string) => `/news/${id}/`,
  issue: (id: string) => `/issues/${id}/`,
  petition: (id: string) => `/petitions/${id}/`,
  event: (id: string) => `/events/${id}/`,
};

/** Adds the base path to a site-relative URL. Leaves external links, anchors and mailto: alone. */
export function withBase(href: string): string {
  if (!BASE || !href.startsWith('/') || href.startsWith('//')) return href;
  if (href === BASE || href.startsWith(`${BASE}/`)) return href;
  return `${BASE}${href}`;
}

/** Removes the base path from a pathname. */
export function stripBase(pathname: string): string {
  if (!BASE) return pathname;
  if (pathname === BASE) return '/';
  return pathname.startsWith(`${BASE}/`) ? pathname.slice(BASE.length) : pathname;
}

/** Links for use in markup (base-aware). */
export const links = {
  article: (id: string) => withBase(paths.article(id)),
  issue: (id: string) => withBase(paths.issue(id)),
  petition: (id: string) => withBase(paths.petition(id)),
  event: (id: string) => withBase(paths.event(id)),
};

/** Absolute URL on the canonical production origin. */
export function absoluteUrl(path: string): string {
  return new URL(stripBase(path), site.url).href;
}

/** Normalizes a pathname to the trailing-slash form GitHub Pages serves. */
export function canonicalPath(pathname: string): string {
  const path = stripBase(pathname);
  if (path === '' || path === '/') return '/';
  const clean = path.replace(/index\.html$/, '').replace(/\/{2,}/g, '/');
  if (/\.[a-z0-9]+$/i.test(clean)) return clean;
  return clean.endsWith('/') ? clean : `${clean}/`;
}

export function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href) && !href.startsWith(site.url);
}

/** True when `current` is `href` or inside it (for active navigation). */
export function isActivePath(current: string, href: string): boolean {
  const c = canonicalPath(current);
  const h = canonicalPath(href);
  if (h === '/') return c === '/';
  if (h === '/take-action/') {
    return ['/take-action/', '/petitions/', '/volunteer/', '/newsletter/', '/support/'].some((p) => c.startsWith(p));
  }
  return c.startsWith(h);
}
