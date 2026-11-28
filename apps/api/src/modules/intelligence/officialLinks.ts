/**
 * Official publishers shown as links. PortChimera does not read these automatically (no
 * official feed or API was found, see docs/INTELLIGENCE_SOURCES.md) and does not scrape them.
 */
export const OFFICIAL_SOURCE_LINKS = Object.freeze([
  {
    name: 'UKMTO recent incidents',
    url: 'https://www.ukmto.org/recent-incidents',
    note: 'Open the official page. Not read automatically.',
  },
  {
    name: 'MARAD U.S. maritime advisories',
    url: 'https://www.maritime.dot.gov/msci-advisories',
    note: 'Open the official page. Not read automatically.',
  },
  { name: 'IMO', url: 'https://www.imo.org/', note: 'International Maritime Organization.' },
]);
