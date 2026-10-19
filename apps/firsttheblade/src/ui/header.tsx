/**
 * The header, laid over the top of the page: the lockup, the links and the
 * subscribe pill. On a phone the links fold into a menu (`./phone-menu.tsx`)
 * and the pill says only “Subscribe”; the page as served carries a link to
 * the footer's links in the menu's place, so the menu works before (and
 * without) the script that turns it into a dialog.
 */
import { For } from '@solidjs/web';

import { Lockup } from './brand.tsx';
import { FOOTER_NAV_ID, NAV, SUBSCRIBE } from './nav.ts';

/** The menu's three lines, shared by the served link and the dialog's button. */
export const MenuIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    aria-hidden="true"
  >
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

/** The id of the slot the phone menu's script mounts into. */
export const MENU_SLOT_ID = 'menu';

interface HeaderProps {
  /** The path of the page, to mark its link as the current one. */
  readonly path: string;
}

/** `aria-current` by whether a link is the page's own (`false` is ARIA's “not current”). */
const CURRENT = { true: 'page', false: 'false' } as const;

const current = (path: string, href: string) => CURRENT[`${path === href}`];

export const Header = (props: HeaderProps) => (
  <header class="site-header">
    <Lockup />
    <nav class="site-nav" aria-label="Main">
      <For each={NAV}>
        {(link) => (
          <a href={link.href} aria-current={current(props.path, link.href)}>
            {link.label}
          </a>
        )}
      </For>
      <a class="pill" href={SUBSCRIBE.href}>
        Subscribe<span class="pill-more"> on YouTube</span>
      </a>
    </nav>
    <div class="menu-slot" id={MENU_SLOT_ID}>
      <a class="menu-button" href={`#${FOOTER_NAV_ID}`} aria-label="Menu">
        <MenuIcon />
      </a>
    </div>
  </header>
);
