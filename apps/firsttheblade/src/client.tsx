/**
 * The browser's entry: the site's stylesheet, and the phone menu. The pages
 * are served whole (`./prerender.tsx`); the menu is the one part that runs,
 * so it mounts in place of the link the served page carries in its slot.
 */
import { render } from '@solidjs/web';

import { MENU_SLOT_ID } from './ui/header.tsx';
import { PhoneMenu } from './ui/phone-menu.tsx';
import './styles.css';

const slot = document.getElementById(MENU_SLOT_ID);
if (slot instanceof HTMLElement) {
  slot.replaceChildren();
  render(() => <PhoneMenu />, slot);
}
