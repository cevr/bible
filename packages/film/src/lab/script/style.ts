// A script's styles as it is read aloud (`words/film-script.tsx` in the
// studio's Words section, a series draft in the review, an ask's script):
// each beat under a head line of its id and badge, its picture's brief in the
// secondary ink at the body size (on a phone three lines of it until More
// opens it), its line at the reading size (`--fs-read`: text read aloud, as
// the prompter's) with how it is said, its staging take and its pace, the
// delivery of the words selected and its sources quiet under that. Read only
// through the tokens (`player/tokens.css`). The pages that read a script put
// these in their head while they are mounted: no page's first paint waits
// for them.

import { PHONE, WIDE } from '../viewport.ts';

/** How many lines of a picture's brief a phone shows until More opens it (`tied.tsx` asks whether it runs past them). */
export const BRIEF_LINES = 3;

/**
 * A script read aloud, wherever its beats come from (a film's reader here, a
 * series draft's in the review, `review/draft.tsx`): each beat under its head
 * line, its brief, its line at the reading size with its delivery marks, its
 * staging take and its pace, the day's spend, the delivery of the words
 * selected in a raised box under the line, and its sources.
 */
export const SCRIPT_READ_CSS = `
.lab-script-beat { display: flex; flex-direction: column; gap: var(--s-2); padding: var(--s-3) var(--gutter) var(--s-4);
  border-bottom: var(--border); }
.lab-script-beat-head { display: flex; align-items: center; flex-wrap: wrap; gap: 0 var(--s-2);
  font-size: var(--fs-2); line-height: var(--lh-2); color: var(--text-3); }
.lab-script-picture { margin: 0; color: var(--text-2); }
.lab-script-line { margin: 0; font-size: var(--fs-read); line-height: var(--lh-read); color: var(--text-1); }
.lab-script-w { cursor: pointer; }
/* How a line is said: a stressed word heavier in the line's own ink (an underline here is a link's, a note's or a
   selection's); a pause a glyph in its gap in the secondary ink, a hold with its seconds, kept clear of a mark's chip
   after it and never in a text selection (the words are what is copied). */
.lab-script-w[data-stress='true'] { font-weight: var(--w-3); }
.lab-script-gap { margin-inline-end: var(--s-2); color: var(--text-2); font-size: var(--fs-2); line-height: var(--lh-2);
  white-space: nowrap; user-select: none; -webkit-user-select: none; }
/* A beat's staging take in its head: ▶ a press of the pointer's size, its pace quiet in the band and named slow or
   fast in the warning's ink out of it; voicing or refused, quiet words. */
.lab-script-hear { display: inline-flex; align-items: center; justify-content: center; min-width: var(--hit);
  min-height: var(--hit); padding: 0; border: 0; background: none; font: inherit; color: var(--text-2); cursor: pointer; }
.lab-script-hear[aria-pressed='true'] { color: var(--state-live); }
@media (hover: hover) { .lab-script-hear:hover { color: var(--text-1); } }
.lab-script-pace { color: var(--text-3); font-variant-numeric: tabular-nums; }
.lab-script-pace:not([data-band='in']) { color: var(--state-warning); }
.lab-script-voicing { color: var(--text-3); }
.lab-script-voicing[data-refused='true'] { color: var(--state-warning); }
/* The day's staging spend: one quiet line atop the beats, scrolled away with them. */
.lab-script-spend { margin: 0; padding: var(--s-2) var(--gutter) 0; color: var(--text-3);
  font-size: var(--fs-1); line-height: var(--lh-1); font-variant-numeric: tabular-nums; }
/* The delivery of the words selected: rows of choices in the box under the line, each a press of the pointer's size. */
.lab-script-delivery { display: flex; flex-direction: column; gap: var(--s-2); padding: var(--s-2) var(--s-3); }
.lab-script-delivery-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2); }
.lab-script-delivery .sh-btn, .lab-script-delivery .sh-seg > * { min-height: var(--hit); }
.lab-script-holds { align-self: flex-start; }
.lab-script-delivery-note { margin: 0; color: var(--text-2); font-size: var(--fs-2); line-height: var(--lh-2); }
/* What the selection ties to: a raised box under the line, its head and a row to a cue. */
.lab-script-ties { display: flex; flex-direction: column; border: var(--border); border-radius: var(--r-2); background: var(--surface-2); }
.lab-script-ties-head { display: flex; align-items: center; gap: var(--s-2); padding: var(--s-1) var(--s-1) 0 var(--s-3); }
.lab-script-ties-what { flex: 1; min-width: 0; color: var(--text-1); }
.lab-script-ties-head > .sh-btn { flex: none; min-height: var(--hit); }
.lab-script-cite { display: flex; flex-wrap: wrap; gap: 0 var(--s-3); margin: 0; padding: 0; list-style: none;
  font-size: var(--fs-2); line-height: var(--lh-2); color: var(--text-3); }
.lab-script-brief { display: flex; flex-direction: column; min-width: 0; }
/* Under a brief its three lines clip on a phone: what opens it all, the size of a press, quiet as the brief. */
.lab-script-more { align-self: flex-start; min-height: var(--hit); min-width: var(--hit); padding: 0; border: 0;
  background: none; font: inherit; font-size: var(--fs-2); line-height: var(--lh-2); color: var(--text-2);
  text-align: start; cursor: pointer; }
@media (hover: hover) { .lab-script-more:hover { color: var(--text-1); } }
@media ${PHONE} {
  /* A brief shows three lines until More opens it: the reader opens on the words read aloud, not on what the picture does.
     It clips the rest, never scrolls it: a key landing on a link it hides finds the link below its lines, and opens it
     (a box that scrolls would scroll the link up into its three lines instead). The margin is the focus ring's. */
  .lab-script-picture:not([data-open='true']) { display: -webkit-box; -webkit-box-orient: vertical;
    -webkit-line-clamp: ${BRIEF_LINES}; line-clamp: ${BRIEF_LINES}; overflow: clip; overflow-clip-margin: 2px; }
}
@media ${WIDE} {
  /* A laptop's column shows a brief whole: nothing for More to open. */
  .lab-script-more { display: none; }
}
`;
