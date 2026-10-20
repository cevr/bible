/**
 * The phone menu: the header's links in @bible/ui's Dialog, opened by the
 * menu button. Its one piece of state, whether it is open, is local to it;
 * nothing else on the page reads it and the address does not carry it.
 * Focus moves into the dialog when it opens and back to the button when it
 * closes, Escape and a press outside close it, and the page behind it does
 * not scroll.
 */
import { Dialog } from '@bible/ui/dialog';
import { For } from '@solidjs/web';
import { createSignal } from 'solid-js';

import { Lockup } from './brand.tsx';
import { MenuIcon } from './header.tsx';
import { NAV, SUBSCRIBE } from './nav.ts';

const CloseIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    aria-hidden="true"
  >
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/** `aria-expanded`, as ARIA spells it. */
const EXPANDED = { true: 'true', false: 'false' } as const;

export const PhoneMenu = () => {
  const [open, setOpen] = createSignal(false, { ownedWrite: true });
  return (
    <>
      <button
        type="button"
        class="menu-button"
        aria-label="Menu"
        aria-haspopup="dialog"
        aria-expanded={EXPANDED[`${open()}`]}
        onClick={() => setOpen(true)}
      >
        <MenuIcon />
      </button>
      <Dialog.Root open={open()} onOpenChange={(next) => setOpen(next)}>
        <Dialog.Portal>
          <Dialog.Backdrop class="menu-backdrop" />
          <Dialog.Popup class="menu-popup">
            <div class="menu-top">
              <Lockup />
              <Dialog.Close class="menu-button" aria-label="Close menu">
                <CloseIcon />
              </Dialog.Close>
            </div>
            <Dialog.Title class="visually-hidden">Menu</Dialog.Title>
            <nav aria-label="Main">
              <ul class="menu-links">
                <For each={NAV}>
                  {(link) => (
                    <li>
                      <a href={link.href} onClick={() => setOpen(false)}>
                        {link.label}
                      </a>
                    </li>
                  )}
                </For>
                <li>
                  <a class="button" href={SUBSCRIBE.href}>
                    <span class="button-label">{SUBSCRIBE.label}</span>
                  </a>
                </li>
              </ul>
            </nav>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};
