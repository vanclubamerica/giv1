/**
 * Resolves the featured campaign config into links and an image, and checks
 * that a published campaign only points at published content.
 */

import { getEntry } from 'astro:content';
import type { ImageMetadata } from 'astro';
import { featuredCampaign, type FeaturedCampaignConfig } from '../config/campaign';
import { localToDate } from './dates';
import { hasImage, resolveImage } from './images';
import { links } from './urls';

export interface ResolvedCampaign extends FeaturedCampaignConfig {
  isPreview: boolean;
  articleHref: string;
  petitionHref: string;
  imageMeta: ImageMetadata | null;
}

const isUrl = (value: string) => /^https?:\/\//i.test(value);

async function resolveLink(kind: 'articles' | 'petitions', ref: string, campaignPublished: boolean): Promise<string> {
  if (isUrl(ref)) return ref;
  const entry = await getEntry(kind, ref);
  const label = kind === 'articles' ? 'article' : 'petition';
  if (!entry) {
    throw new Error(`Featured campaign: no ${label} named "${ref}" in src/content/${kind}/. Check src/config/campaign.ts.`);
  }
  if (entry.data.status === 'draft' && !import.meta.env.DEV) {
    throw new Error(`Featured campaign: the ${label} "${ref}" is a draft, so its page isn't built. Set it to preview or published.`);
  }
  if (campaignPublished && entry.data.status !== 'published') {
    throw new Error(
      `Featured campaign is published, but the ${label} "${ref}" has status "${entry.data.status}". Publish it first, or set the campaign status to 'preview'.`,
    );
  }
  return kind === 'articles' ? links.article(ref) : links.petition(ref);
}

export async function getFeaturedCampaign(now = new Date()): Promise<ResolvedCampaign | null> {
  const c = featuredCampaign;
  if (!c.enabled) return null;
  if (c.startsAt && now < localToDate(c.startsAt)) return null;
  if (c.endsAt && now > localToDate(c.endsAt)) return null;

  const published = c.status === 'published';
  return {
    ...c,
    isPreview: !published,
    articleHref: await resolveLink('articles', c.article, published),
    petitionHref: await resolveLink('petitions', c.petition, published),
    imageMeta: hasImage(c.image.src) ? resolveImage(c.image.src) : null,
  };
}
