/**
 * Civic resources listed on /resources/. These are OUTSIDE organizations.
 * Listing them does not imply affiliation or endorsement either way.
 *
 * Every link below was checked on `verified` (YYYY-MM-DD). When adding one,
 * open it, confirm it is the official source, and update the date.
 */

export interface Resource {
  name: string;
  url: string;
  description: string;
}

export interface ResourceGroup {
  heading: string;
  intro: string;
  items: Resource[];
}

export const resourcesVerified = '2026-10-21';

export const resourceGroups: ResourceGroup[] = [
  {
    heading: 'City of Van',
    intro: 'The city’s official website is the place to confirm meeting dates and read public notices.',
    items: [
      {
        name: 'City of Van official website',
        url: 'https://www.vantx.gov/',
        description: 'City departments, services, permits and contact directory.',
      },
      {
        name: 'Public notices',
        url: 'https://www.vantx.gov/2278/Public-Notices',
        description: 'Notices the city is required to publish, including meeting notices.',
      },
      {
        name: 'Open government and transparency',
        url: 'https://www.vantx.gov/2397/Open-Government-and-Transparency',
        description: 'Elected officials and transparency information published by the city.',
      },
      {
        name: 'City calendar',
        url: 'https://www.vantx.gov/calendar.aspx',
        description: 'Scheduled city meetings and events.',
      },
    ],
  },
  {
    heading: 'Schools and county',
    intro: 'School board and county decisions affect Van as much as city ones do.',
    items: [
      {
        name: 'Van Independent School District',
        url: 'https://www.vanisd.org/',
        description: 'The district’s official website, including school board information.',
      },
      {
        name: 'Van Zandt County',
        url: 'https://www.vanzandtcounty.org/',
        description: 'County offices, the Commissioners Court and county services.',
      },
      {
        name: 'East Texas Council of Governments',
        url: 'https://www.etcog.org/',
        description: 'Regional planning and services organization for East Texas local governments.',
      },
    ],
  },
  {
    heading: 'Voting and elections',
    intro: 'Check registration, find your polling place and read sample ballots before you vote.',
    items: [
      {
        name: 'Van Zandt County Elections',
        url: 'https://www.vanzandtcounty.org/page/vanzandt.Elections',
        description: 'Polling locations, early voting hours, sample ballots and results for Van Zandt County.',
      },
      {
        name: 'VoteTexas.gov',
        url: 'https://www.votetexas.gov/',
        description: 'The State of Texas voter information site: registration, ID requirements and voting options.',
      },
      {
        name: 'Texas Ethics Commission',
        url: 'https://www.ethics.state.tx.us/',
        description: 'Campaign finance and lobby reports filed with the state.',
      },
    ],
  },
  {
    heading: 'State government and your rights',
    intro: 'Find your representatives and learn how open meetings and public records work in Texas.',
    items: [
      {
        name: 'Who Represents Me?',
        url: 'https://wrm.capitol.texas.gov/',
        description: 'Look up your state and federal representatives by address.',
      },
      {
        name: 'Texas Legislature Online',
        url: 'https://capitol.texas.gov/',
        description: 'Bills, committee hearings and legislator information.',
      },
      {
        name: 'Texas Attorney General: Open Government',
        url: 'https://www.texasattorneygeneral.gov/open-government',
        description: 'Guidance on the Texas Open Meetings Act and the Public Information Act.',
      },
      {
        name: 'Texas Comptroller: Local Government Transparency',
        url: 'https://comptroller.texas.gov/transparency/local/',
        description: 'Debt, spending and financial transparency information for Texas local governments.',
      },
    ],
  },
];

/** Practical guidance shown alongside the links. Kept general on purpose. */
export const participationTips = [
  {
    title: 'Before a public meeting',
    text: 'Find the posted agenda on the governing body’s website. Texas law generally requires meeting notices to be posted in advance, and the agenda tells you which topics will be discussed.',
  },
  {
    title: 'Speaking during public comment',
    text: 'Many boards and councils set aside time for public comment and may ask you to sign up before the meeting starts. Check the body’s own rules for time limits and procedures.',
  },
  {
    title: 'Asking for public records',
    text: 'The Texas Public Information Act lets anyone request records held by a governmental body. The Attorney General’s open government pages explain how.',
  },
];
