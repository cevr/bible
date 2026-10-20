/**
 * The browser's entry: the site's stylesheet, the phone menu, and the
 * confirm page's press. The pages are served whole (`./prerender.tsx`); the
 * menu mounts in place of the link the served page carries in its slot, and
 * on the confirm page the form is submitted as it opens, so a person who
 * opens the link in the letter is confirmed in that one step.
 */
import { render } from '@solidjs/web';

import { MENU_SLOT_ID } from './ui/header.tsx';
import { CONFIRM_FORM_ID } from './mail/paths.ts';
import { PhoneMenu } from './ui/phone-menu.tsx';
import './styles.css';

const slot = document.getElementById(MENU_SLOT_ID);
if (slot instanceof HTMLElement) {
  slot.replaceChildren();
  render(() => <PhoneMenu />, slot);
}

const confirmForm = document.getElementById(CONFIRM_FORM_ID);
if (confirmForm instanceof HTMLFormElement) confirmForm.requestSubmit();
