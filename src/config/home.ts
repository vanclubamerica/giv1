/**
 * Homepage copy. Sections that list issues, events and articles fill
 * themselves from src/content/; this file holds the fixed text around them.
 */

export const home = {
  seo: {
    title: 'Get Involved Van | Local issues and civic action in Van, Texas',
    description:
      'An independent, nonpartisan community organization in Van, Texas. Follow local issues, find public meetings, volunteer, and take part in community initiatives.',
  },

  hero: {
    /** Each sentence starts on its own line on wider screens. */
    headline: ['Know what’s happening in Van.', 'Help decide what’s next.'],
    lead: 'We explain local issues in plain language and point you to the meetings, petitions and volunteer work where your voice counts.',
    primary: { label: 'Get Involved', href: '/take-action/' },
    secondary: { label: 'Explore Local Issues', href: '/issues/' },
    /**
     * Optional wide photo of Van shown under the headline (path inside
     * src/assets/images/, landscape, at least 2400px wide). Use only real
     * photos of Van and its people. While null, the hero is text only.
     */
    image: null as null | { src: string; alt: string; position?: string; caption?: string; credit?: string },
  },

  intro: {
    heading: 'Getting involved doesn’t require a party, a title, or a lot of free time.',
    paragraphs: [
      'Get Involved Van is a community organization for people who live, work, study or run a business in Van. We keep track of what local boards and councils are working on, write it up with sources, and keep a running list of the ways residents can weigh in: a public meeting, a petition, a volunteer shift, a conversation with the people who represent us.',
      'Much of what shapes daily life here is decided close to home, by boards and councils that meet in public and answer to the people who show up. In a town the size of Van, a handful of informed neighbors can change the conversation.',
    ],
    points: [
      {
        title: 'Inform',
        text: 'Clear write-ups on local issues, with sources, so you can judge the facts for yourself.',
      },
      {
        title: 'Connect',
        text: 'Meetings, events and volunteer openings in one place, so it’s easy to know where to be.',
      },
      {
        title: 'Act',
        text: 'Focused initiatives and petitions on specific local questions, never on parties or candidates.',
      },
    ],
    link: { label: 'More about Get Involved Van', href: '/about/' },
  },

  ways: {
    heading: 'Ways to get involved',
    lead: 'Pick the one that fits your week. Every one of them counts.',
    items: [
      {
        title: 'Volunteer',
        text: 'Help at events, talk with neighbors, research public records, or lend a skill you already have.',
        href: '/volunteer/',
        cta: 'Sign up to volunteer',
      },
      {
        title: 'Show up',
        text: 'Attend a community event or a public meeting. Being in the room is the most direct form of participation there is.',
        href: '/events/',
        cta: 'See upcoming events',
      },
      {
        title: 'Sign a petition',
        text: 'Add your name to an active local petition and show decision-makers where residents stand.',
        href: '/petitions/',
        cta: 'View petitions',
      },
      {
        title: 'Learn the issues',
        text: 'Read plain-language background on the questions facing Van, with links to the original sources.',
        href: '/issues/',
        cta: 'Explore local issues',
      },
      {
        title: 'Stay informed',
        text: 'Get occasional email updates about new issues, upcoming meetings and ways to help.',
        href: '/newsletter/',
        cta: 'Join the newsletter',
      },
    ],
  },

  closing: {
    heading: 'Start with one thing.',
    text: 'Read one issue. Come to one meeting. Sign one petition you believe in. Local change usually starts with a few people deciding to pay attention, and it grows from there.',
    cta: { label: 'Find your way in', href: '/take-action/' },
  },
};
