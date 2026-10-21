/**
 * Resolves image references used in content and config files.
 *
 * Images live in src/assets/images/ and are referenced by their path inside
 * that folder, e.g. "campaigns/featured-action.jpg". Astro then produces
 * resized AVIF/WebP versions automatically. "images/…" and "/images/…"
 * prefixes are accepted too.
 */

import type { ImageMetadata } from 'astro';

const files = import.meta.glob<{ default: ImageMetadata }>('/src/assets/images/**/*.{jpg,jpeg,png,webp,avif,JPG,JPEG,PNG}', {
  eager: true,
});

export function normalizeImagePath(src: string): string {
  return src
    .trim()
    .replace(/^\/+/, '')
    .replace(/^src\/assets\//, '')
    .replace(/^images\//, '');
}

export function hasImage(src: string | null | undefined): boolean {
  return Boolean(src && files[`/src/assets/images/${normalizeImagePath(src)}`]);
}

export function resolveImage(src: string): ImageMetadata {
  const key = `/src/assets/images/${normalizeImagePath(src)}`;
  const file = files[key];
  if (!file) {
    throw new Error(
      `Image not found: "${src}". Put the file in src/assets/images/ and reference it relative to that folder, e.g. "articles/photo.jpg".`,
    );
  }
  return file.default;
}
