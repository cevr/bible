// The lab's one way to move the focus from script (`focusFor`), and the one
// reader of which input asked for the move: the studio's ring
// (`:focus-visible`, `page-shell-style.ts`) shows where the keyboard asked,
// and never where a pointer did. The input comes from whoever asked: a
// command's (`Invocation.input`, ⌘K's row chosen with Enter or a click), a
// step through the history's (`Hub.traversed`), a handler's own event, or
// the input the viewer last used (`Hub.input`).
// Left to itself, Chromium shows the ring on a script's focus whenever no
// mouse has focused anything yet (a page fresh from a link or a reload), so
// a pointer path rang as a keyboard's would; and a focus on an element that
// already has it changes nothing, so a ring the keyboard drew stayed through
// a click. Three exceptions stand:
// - a text field rings whatever focused it, a click too: that is the
//   browser's rule, and a field's caret is where the typing goes;
// - the kit's menus (`@bible/ui`) move the focus to the item under the
//   pointer, so after a keyboard opens one, the ring follows the mouse;
// - the kit's own initial focus (a sheet's, the lightbox's, ⌘K's) is a
//   plain focus, so Chromium's heuristic draws its ring; its return focus
//   rings iff a key closed the popup, its owner's own close (⌘K's chosen
//   row) by the input used last inside it, as `focusFor` would.
// `film/focus-through-focus-for` refuses any other focus move in the lab.

import type { Input } from '../browser/keys.ts';

/** A text field: the browser shows the ring on it whatever focused it. */
const TEXT_FIELD =
  'input:not([type=button],[type=checkbox],[type=radio],[type=range],[type=submit],[type=reset],[type=color],[type=file],[type=image]), textarea, [contenteditable]:not([contenteditable=false])';

/**
 * Put the focus on `el`, asked for by `input`: the ring shows iff a key asked,
 * or `el` is a text field. An element that already has the focus with the
 * other look (the keyboard's ring, then a click on the studio) lets it go
 * first, since a focus it already has changes nothing.
 */
export const focusFor = (
  el: HTMLElement,
  input: Input,
  options: { readonly preventScroll?: boolean } = {},
): void => {
  const shows = input === 'key' || el.matches(TEXT_FIELD);
  if (el === document.activeElement && el.matches(':focus-visible') !== shows) el.blur();
  // oxlint-disable-next-line film/focus-through-focus-for -- the one focus move the rule sends the lab through
  el.focus({ ...options, focusVisible: shows });
};
