// A picture's brief in the Script reader, clipped to three lines on a phone
// until More opens it: the film's reader fills it with its linked names
// (`tied.tsx`, `Picture`), a series draft's with its text (`review/draft.tsx`).

import { Show } from '@solidjs/web';
import { Boolean as Bool, Option } from 'effect';
import type { ParentProps } from 'solid-js';
import { createEffect, createSignal, createUniqueId } from 'solid-js';
import { pressed } from '../pressed.ts';
import { BRIEF_LINES } from './style.ts';

/**
 * A picture's brief, in a box that on a phone shows three lines, the line
 * read aloud under it in sight, until More opens it, or a key lands on a
 * link it hides. More is there only while the three lines hide some of it.
 * The film's reader fills it with its linked names (`Picture`), a series
 * draft's with its text (`review/draft.tsx`).
 */
export const BriefBox = (props: ParentProps) => {
  const [open, setOpen] = createSignal(false, { ownedWrite: true });
  const [clips, setClips] = createSignal(false, { ownedWrite: true });
  const id = createUniqueId();
  let brief = Option.none<HTMLElement>();
  // As the page lays it out, whether it runs past its lines on a phone, open or shut: the box shut keeps the whole
  // height it scrolls. The stylesheet says where it shuts (and so where More shows), the phone's width.
  createEffect(
    () => true,
    () =>
      Option.match(brief, {
        onNone: () => () => {},
        onSome: (el) => {
          const o = new ResizeObserver(() =>
            setClips(
              el.scrollHeight >
                BRIEF_LINES * (Number.parseFloat(getComputedStyle(el).lineHeight) || 0) + 1,
            ),
          );
          o.observe(el);
          return () => o.disconnect();
        },
      }),
  );
  return (
    <div class="lab-script-brief">
      <p
        class="lab-script-picture"
        id={id}
        data-open={pressed(open())}
        ref={(el: HTMLParagraphElement) => {
          brief = Option.some(el);
        }}
        onFocusIn={(e) => {
          // A key landing on a link the three lines hide opens it.
          const landed = e.target;
          if (
            landed instanceof HTMLElement &&
            Option.exists(
              brief,
              (el) => landed.getBoundingClientRect().bottom > el.getBoundingClientRect().bottom + 1,
            )
          )
            setOpen(true);
        }}
      >
        {props.children}
      </p>
      <Show when={clips()}>
        <button
          type="button"
          class="lab-script-more"
          data-act="more-brief"
          aria-expanded={pressed(open())}
          aria-controls={id}
          onClick={() => setOpen((on) => !on)}
        >
          {Bool.match(open(), { onTrue: () => 'Less', onFalse: () => 'More' })}
        </button>
      </Show>
    </div>
  );
};
