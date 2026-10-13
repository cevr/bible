// The Script page's styles (`view.tsx`): the film's beats on the panel's
// surface, each under a head line of its id, its start and its badge, its
// picture's brief in the secondary ink at the body size, its line at the
// reading size (`--fs-read`: text read aloud, as the prompter's), and its
// sources quiet under it; the beat under the frame edged in the playing ink
// (`--state-live`), the word playing lit by `::highlight(lab-live)` and the
// words selected by `lab-picked` (the Source view's own highlights,
// `source/style.ts`, which owns those rules). On a laptop the reader is a
// column beside the picture and its track, wider than the Source view's
// (`--script-w`); on a phone the page is the screen's height, the picture and
// its track over the reader, which scrolls in a box of its own above the
// docked transport. Read only through the tokens (`player/tokens.css`); what
// no token holds is named in `SCRIPT_TOKENS`.

import { PHONE, WIDE } from '../viewport.ts';

/** What no studio token holds: the laptop column's width, a reading measure that grows with the window. */
const SCRIPT_TOKENS = `
:root {
  --script-w: clamp(420px, 42vw, 640px);
}
`;

export const SCRIPT_CSS = `${SCRIPT_TOKENS}
.lab-script { display: flex; flex-direction: column; min-height: 0; min-width: 0; background: var(--surface-1); }
.lab-script-head { display: flex; align-items: center; gap: var(--s-2); min-height: var(--panel-head-h);
  padding: 0 var(--gutter); border-bottom: var(--border); font-size: var(--fs-2); line-height: var(--lh-2); color: var(--text-2); }
/* The count clips by the kit's one rule (\`lab-clamp\`). */
.lab-script-count { flex: 1; min-width: 0; }
.lab-script-head > .sh-btn, .lab-script-status > .sh-btn { flex: none; min-height: var(--hit); min-width: var(--hit); }
.lab-script-status { display: flex; align-items: center; gap: var(--s-2); padding: var(--s-1) var(--gutter); border-bottom: var(--border); }
.lab-script-note { flex: 1; min-width: 0; color: var(--text-2); font-size: var(--fs-3); line-height: var(--lh-3); }
.lab-script-scroll { flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain;
  overflow-anchor: none; /* the browser never moves the scroll by itself: the reader places it, layout clamps it, a hand moves it */ }
/* The kit's ring, inside the box: the column clips what stands outside it. */
.lab-script-scroll:focus-visible { outline: none; box-shadow: var(--focus-ring-inset); }
.lab-script-page { display: flex; flex-direction: column; padding-bottom: var(--s-8); overflow-wrap: anywhere;
  font-size: var(--body-fs); line-height: var(--body-lh); }
.lab-script-beat { display: flex; flex-direction: column; gap: var(--s-2); padding: var(--s-3) var(--gutter) var(--s-4);
  border-bottom: var(--border); }
/* The beat under the frame: its edge in the playing ink, as a playing cue's lane is lit. */
.lab-script-beat[data-live='true'] { box-shadow: inset 2px 0 var(--state-live); }
.lab-script-beat-head { display: flex; align-items: center; flex-wrap: wrap; gap: 0 var(--s-2);
  font-size: var(--fs-2); line-height: var(--lh-2); color: var(--text-3); }
/* The id and the start are one press: the beat's first frame. */
.lab-script-id { display: inline-flex; align-items: center; gap: var(--s-2); min-height: var(--hit); padding: 0; border: 0;
  background: none; font: inherit; color: var(--text-2); cursor: pointer; }
.lab-script-beat[data-live='true'] .lab-script-id { color: var(--text-1); }
@media (hover: hover) { .lab-script-id:hover, .lab-script-id:hover .lab-script-at { color: var(--text-1); } }
.lab-script-at { color: var(--text-3); }
.lab-script-picture { margin: 0; color: var(--text-2); }
.lab-script-line { margin: 0; font-size: var(--fs-read); line-height: var(--lh-read); color: var(--text-1); }
.lab-script-w { cursor: pointer; }
.lab-script-cite { display: flex; flex-wrap: wrap; gap: 0 var(--s-3); margin: 0; padding: 0; list-style: none;
  font-size: var(--fs-2); line-height: var(--lh-2); color: var(--text-3); }
@media ${WIDE} {
  body.lab:has(.lab-script) { grid-template-columns: minmax(0, 1fr) var(--script-w); }
  .lab-script { grid-column: 2; grid-row: 2 / span 2; overflow: hidden; border-left: var(--border); }
}
@media ${PHONE} {
  /* The screen's height, not a page that scrolls: the picture and its track stay over the words. */
  body.lab:has(.lab-script) { height: 100dvh; min-height: 0; grid-template-rows: auto auto auto minmax(0, 1fr); }
  .lab-script { grid-column: 1; grid-row: 4; border-top: var(--border); }
}
`;
