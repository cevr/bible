/**
 * The browser's entry: the site's stylesheet, the phone menu, and the
 * confirm page's press. The pages are served whole (`./prerender.tsx`); the
 * menu mounts in place of the link the served page carries in its slot, and
 * on the confirm page, which already shows the confirmed notice, the form is
 * posted as it opens and its answer drawn in place, so a person who opens the
 * link in the letter is confirmed in that one step and sees one page. The
 * field and the night move for a reader who has not asked for less motion.
 */
import { render } from '@solidjs/web';
import { Effect } from 'effect';

import { MENU_SLOT_ID } from './ui/header.tsx';
import { CONFIRM_FORM_ID } from './mail/paths.ts';
import { LESS_MOTION } from './motion/query.ts';
import { PhoneMenu } from './ui/phone-menu.tsx';
import './styles.css';

const slot = document.getElementById(MENU_SLOT_ID);
if (slot instanceof HTMLElement) {
  slot.replaceChildren();
  render(() => <PhoneMenu />, slot);
}

/** The confirm page's script, loaded only there (`./confirm.ts`). */
const loadConfirm = () => import('./confirm.ts');

const confirmForm = document.getElementById(CONFIRM_FORM_ID);
if (confirmForm instanceof HTMLFormElement) {
  void loadConfirm().then(({ confirmInPlace }) => Effect.runFork(confirmInPlace(confirmForm)));
}

/** The stills' motion (`./motion/scene.ts`), loaded only for a reader who has not asked for less. */
const loadMotion = () => import('./motion/scene.ts');

const less = matchMedia(LESS_MOTION);
if (!less.matches && document.querySelector('img.field-art, img.night-art')) {
  void loadMotion().then(({ moveTheStills }) => Effect.runFork(moveTheStills(less)));
}
