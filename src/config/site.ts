/**
 * Organization-wide settings: identity, contact details, partner, navigation,
 * footer and brand assets. Change values here, not inside components.
 */

export interface NavItem {
  label: string;
  href: string;
}

export interface SocialLink {
  /** Shown to screen readers and as the visible label, e.g. "Facebook". */
  label: string;
  url: string;
}

export const site = {
  name: 'Get Involved Van',
  /** Canonical production origin. Must match `site` in astro.config.mjs. */
  url: 'https://getinvolvedvan.com',
  locale: 'en-US',
  /** Used for every date and time shown on the site. Handles daylight saving. */
  timeZone: 'America/Chicago',

  /** Default meta description and footer summary. */
  description:
    'Get Involved Van is an independent, nonpartisan community organization helping people in Van, Texas follow local issues, show up, and take part in civic life.',
  footerSummary:
    'An independent, nonpartisan community organization for Van, Texas. We explain local issues in plain language and make it easier to show up, speak up and help out.',

  location: {
    city: 'Van',
    state: 'Texas',
    stateCode: 'TX',
    county: 'Van Zandt County',
  },

  /**
   * Public contact details. Leave as null until the organization chooses
   * them. Nothing is shown (and nothing is invented) while a value is null.
   */
  contact: {
    email: null as string | null,
    phone: null as string | null,
    mailingAddress: null as string | null,
  },

  /** Official social accounts. Add entries only for accounts that exist. */
  social: [] as SocialLink[],

  partner: {
    name: 'Club America Van Activism Hub',
    url: 'https://tpvan.com',
    relationship: 'Associated Partner',
  },

  /**
   * Brand assets live in /public/branding. Replace the files and keep the
   * names, or point these paths at new files. `width`/`height` describe the
   * file's proportions (used to prevent layout shift); update them if the new
   * logo has a different shape.
   */
  brand: {
    logo: { src: '/branding/logo.svg', width: 364, height: 40, alt: 'Get Involved Van' },
    logoLight: { src: '/branding/logo-light.svg', width: 364, height: 40, alt: 'Get Involved Van' },
    logoDark: { src: '/branding/logo-dark.svg', width: 364, height: 40, alt: 'Get Involved Van' },
    logoCompact: { src: '/branding/logo-compact.svg', width: 40, height: 40, alt: 'Get Involved Van' },
    mark: { src: '/branding/mark.svg', width: 64, height: 64, alt: '' },
    favicon: '/branding/favicon.svg',
    faviconPng: '/branding/favicon-32.png',
    appleTouchIcon: '/branding/apple-touch-icon.png',
    socialImage: { src: '/branding/social-preview.png', width: 1200, height: 630, alt: 'Get Involved Van, Van, Texas' },
    themeColor: '#0c5678',
  },

  /** Primary navigation (header). Keep it short. */
  nav: [
    { label: 'Home', href: '/' },
    { label: 'About', href: '/about/' },
    { label: 'Issues', href: '/issues/' },
    { label: 'Take Action', href: '/take-action/' },
    { label: 'Events', href: '/events/' },
    { label: 'News', href: '/news/' },
    { label: 'Contact', href: '/contact/' },
  ] satisfies NavItem[],

  headerCta: { label: 'Get Involved', href: '/take-action/' } satisfies NavItem,

  footer: {
    columns: [
      {
        heading: 'Participate',
        links: [
          { label: 'Take Action', href: '/take-action/' },
          { label: 'Petitions', href: '/petitions/' },
          { label: 'Volunteer', href: '/volunteer/' },
          { label: 'Events', href: '/events/' },
          { label: 'Newsletter', href: '/newsletter/' },
        ],
      },
      {
        heading: 'Learn',
        links: [
          { label: 'Issues', href: '/issues/' },
          { label: 'News', href: '/news/' },
          { label: 'Resources', href: '/resources/' },
          { label: 'About', href: '/about/' },
        ],
      },
      {
        heading: 'Organization',
        links: [
          { label: 'Contact', href: '/contact/' },
          { label: 'Support Our Work', href: '/support/' },
          { label: 'Privacy Policy', href: '/privacy/' },
          { label: 'Terms & Guidelines', href: '/terms/' },
        ],
      },
    ] satisfies Array<{ heading: string; links: NavItem[] }>,
  },
} as const;

export type Site = typeof site;
