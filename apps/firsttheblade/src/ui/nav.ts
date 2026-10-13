/**
 * The site's links, in one place: the header, the phone menu and the footer
 * all draw these.
 */
import { CHANNEL } from '../site.ts';

export interface NavLink {
  readonly href: string;
  readonly label: string;
}

export const NAV: ReadonlyArray<NavLink> = [
  { href: '/#series', label: 'Series' },
  { href: '/about', label: 'About' },
];

/** The one action the site asks for while no film is out. */
export const SUBSCRIBE: NavLink = { href: CHANNEL.subscribe, label: 'Subscribe on YouTube' };

/** The footer's links, which a page without script reaches the menu through. */
export const FOOTER_NAV_ID = 'site-links';
