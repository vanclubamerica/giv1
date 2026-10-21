/**
 * FEATURED CAMPAIGN — the large photo section on the homepage (also featured
 * at the top of /take-action/).
 *
 * To launch the first real initiative:
 *   1. Replace src/assets/images/campaigns/featured-action.jpg with the
 *      campaign photo (landscape, at least 2400px wide). Keep the file name,
 *      or change `image.src` below.
 *   2. Write the article in src/content/articles/ and the petition in
 *      src/content/petitions/, and set both to `status: published`.
 *   3. Point `article` and `petition` below at those files (file name without
 *      ".md"), update the text, and set `status: 'published'`.
 *
 * The build stops with an explanation if a published campaign points at an
 * article or petition that is missing or not yet published.
 *
 * To hide the section entirely, set `enabled: false`.
 */

export interface FeaturedCampaignConfig {
  enabled: boolean;
  /** Stable identifier, useful for analytics or future campaigns. */
  id: string;
  /**
   * 'preview'   -> shown with a clear "Preview" label; the petition stays closed
   * 'published' -> shown as a live campaign
   */
  status: 'preview' | 'published';
  title: string;
  description: string;
  image: {
    /** Path inside src/assets/images/. */
    src: string;
    /** Describe the photo. Use '' only if it is purely decorative. */
    alt: string;
    /** Focal point for wide screens (CSS object-position). */
    position: string;
    /** Focal point for phones, where the photo is cropped taller. */
    positionMobile: string;
    /** Optional photo credit shown in small type. */
    credit?: string;
  };
  /** Article slug in src/content/articles/, or a full https:// URL. */
  article: string;
  /** Petition slug in src/content/petitions/, or a full https:// URL. */
  petition: string;
  /** Optional local Van date/times ("YYYY-MM-DDTHH:MM") to show/hide automatically. */
  startsAt?: string;
  endsAt?: string;
  /** Shown under the buttons while status is 'preview'. */
  previewNote: string;
}

export const featuredCampaign: FeaturedCampaignConfig = {
  enabled: true,
  id: 'first-initiative',
  status: 'preview',
  title: 'Our First Step Toward a More Involved Van',
  description:
    'Learn about our first community initiative, understand why it matters, and discover how you can make your voice heard.',
  image: {
    src: 'campaigns/featured-action.jpg',
    alt: '',
    position: '50% 50%',
    positionMobile: '50% 50%',
  },
  article: 'first-initiative',
  petition: 'first-initiative',
  previewNote:
    'Preview: this initiative hasn’t launched yet. The full article and the petition will open when it’s announced.',
};
